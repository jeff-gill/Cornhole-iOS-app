using System;
using System.Collections.Generic;

// A line-for-line C# port of the web game's physics engine (web/src/engine.js), so the Unity version
// throws, lands, slides, pushes and drops bags exactly like the original.
// Court units are feet. x = lateral (right +), y = down-range, z = height.
namespace CornholeThrowdown
{
    public struct V2
    {
        public double x, y;
        public V2(double x, double y) { this.x = x; this.y = y; }
    }

    public struct V3
    {
        public double x, y, z;
        public V3(double x, double y, double z) { this.x = x; this.y = y; this.z = z; }
    }

    public class Throw
    {
        public V3 o;
        public double speed, el, az, spin, spinMul = 1, slideMul = 1;
        public V2 wind;
        public Throw Clone() => (Throw)MemberwiseClone();
    }

    public class Contact
    {
        public double time;
        public V3 p, v;
        public string kind;   // "hole", "board", "ground"
    }

    public class BagSim
    {
        public int id, owner;
        public string state;  // flying, sliding, resting, inHole, ground
        public double x, y, z, vx, vy, angle, spin, curve, ft;
        public Throw t;
        public Contact c;
        public BagSim Copy() => (BagSim)MemberwiseClone();
    }

    public class EngineEvent
    {
        public string type;   // swish, drop, land, ground, off, hit
        public BagSim a, b;
    }

    public class SimResult
    {
        public List<V3> flight = new List<V3>();
        public List<V2> slide = new List<V2>();
        public List<V2> pushPath = new List<V2>();
        public string outcome, pushOutcome;
        public V2 end;
        public V2? pushEnd;
        public BagSim hit, own;
    }

    public class Level
    {
        public double freq, zone, powZone, wobble, cpu, scatter;
    }

    public static class Eng
    {
        public const double G = 32.17;
        public static double FY = 27, BY = 31, HW = 1, FH = 0.25, BH = 1;
        public static V2 HOLE = new V2(0, 30.25);
        public const double BAG = 0.5, BR = 0.25;
        public static double HR = 0.25;
        public static double REL_H = 3, REL_Y = 0.5, REL_X = 1.8;
        public static readonly int[] SIDES = { -1, 1 };
        public static double SLOPE = Math.Atan2(BH - FH, BY - FY), SS = Math.Sin(SLOPE), SC = Math.Cos(SLOPE);

        // Tuning (same names and values as engine.js's T).
        public static double mu = 0.35;
        public const double rBase = 0.75, rSteep = 0.6, rest = 0.35, luckSpeed = 0.08, luckDir = 0.07, grab = 0.08, stop = 0.08,
            dt = 1.0 / 240, carry = 1;
        public static readonly double minEl = Rad(10), maxEl = Rad(65), defEl = Rad(32);

        // Gear for the throw being planned.
        public static double spinMul = 1, slideMul = 1;

        public static readonly double SPIN_KICK = Rad(9), SPIN_CURVE = 0.05;

        public static double Rad(double d) => d * Math.PI / 180;
        public static double Deg(double r) => r * 180 / Math.PI;
        public static double Clamp(double v, double a, double b) => Math.Min(Math.Max(v, a), b);
        public static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);
        public static double Dist(V2 a, V2 b) => Hypot(a.x - b.x, a.y - b.y);
        public static double Dist(BagSim a, V2 b) => Hypot(a.x - b.x, a.y - b.y);
        public static double Dist(BagSim a, V3 b) => Hypot(a.x - b.x, a.y - b.y);
        public static bool OnBoard(double x, double y) => Math.Abs(x) <= HW && y >= FY && y <= BY;
        public static bool OnBoard(V2 p) => OnBoard(p.x, p.y);
        public static bool OnBoard(BagSim b) => OnBoard(b.x, b.y);
        public static double Plane(double y) => FH + (y - FY) * (BH - FH) / (BY - FY);
        public static double Surf(V2 p) => OnBoard(p) ? Plane(p.y) : 0;
        public static bool OverHole(V2 p) => Dist(p, HOLE) < HR;

        const int COVER_N = 12;
        // How much of a bag (a BAG-wide square, turned by its angle) is over the hole, 0..1.
        public static double HoleCover(BagSim b)
        {
            double dx = b.x - HOLE.x, dy = b.y - HOLE.y;
            if (Hypot(dx, dy) > HR + BAG * 0.71) return 0;
            double c = Math.Cos(b.angle), s = Math.Sin(b.angle);
            int n = 0;
            for (int i = 0; i < COVER_N; i++)
                for (int j = 0; j < COVER_N; j++)
                {
                    double u = ((i + 0.5) / COVER_N - 0.5) * BAG, v = ((j + 0.5) / COVER_N - 0.5) * BAG;
                    double x = dx + u * c - v * s, y = dy + u * s + v * c;
                    if (x * x + y * y < HR * HR) n++;
                }
            return (double)n / (COVER_N * COVER_N);
        }

        public static V3 Release(int pl) => new V3(SIDES[pl] * REL_X, REL_Y, REL_H);

        // ── Flight
        static V3 V0(Throw t)
        {
            double h = t.speed * Math.Cos(t.el);
            return new V3(h * Math.Sin(t.az), h * Math.Cos(t.az), t.speed * Math.Sin(t.el));
        }

        public static V3 PosAt(Throw t, double tt)
        {
            var v = V0(t); var w = t.wind;
            return new V3(t.o.x + v.x * tt + 0.5 * w.x * tt * tt, t.o.y + v.y * tt + 0.5 * w.y * tt * tt, t.o.z + v.z * tt - 0.5 * G * tt * tt);
        }

        public static V3 VelAt(Throw t, double tt)
        {
            var v = V0(t); var w = t.wind;
            return new V3(v.x + w.x * tt, v.y + w.y * tt, v.z - G * tt);
        }

        static double Clearance(Throw t, double tt)
        {
            var p = PosAt(t, tt);
            return p.z - Surf(new V2(p.x, p.y));
        }

        public static Contact ContactOf(Throw t, bool ignoreHole = false)
        {
            double prev = 0, tm = dt;
            while (tm < 12)
            {
                if (Clearance(t, tm) <= 0)
                {
                    double lo = prev, hi = tm;
                    for (int i = 0; i < 48; i++) { double m = (lo + hi) / 2; if (Clearance(t, m) > 0) lo = m; else hi = m; }
                    return Classify(t, hi, ignoreHole);
                }
                prev = tm; tm += dt;
            }
            return Classify(t, tm, ignoreHole);
        }

        static Contact Classify(Throw t, double tm, bool ignoreHole)
        {
            var p = PosAt(t, tm); var v = VelAt(t, tm);
            var p2 = new V2(p.x, p.y);
            if (OnBoard(p2) && p.z >= Plane(p.y) - 0.03)
            {
                p.z = Plane(p.y);
                return new Contact { time = tm, p = p, v = v, kind = (!ignoreHole && OverHole(p2)) ? "hole" : "board" };
            }
            var g = new V3(p.x, p.y, 0);
            if (OnBoard(g.x, g.y))
            {   // clipped the board's front or side face
                if (g.y - FY <= HW - Math.Abs(g.x)) g.y = FY - BR;
                else g.x = (g.x == 0 ? 1 : Math.Sign(g.x)) * (HW + BR);
            }
            return new Contact { time = tm, p = g, v = v, kind = "ground" };
        }

        static V2 LandingVel(V3 v, double slide = 1)
        {
            double nx = 0, ny = -SS, nz = SC;
            double vn = v.x * nx + v.y * ny + v.z * nz;
            double sp = Math.Max(Math.Sqrt(v.x * v.x + v.y * v.y + v.z * v.z), 1e-6);
            double steep = Clamp(-vn / sp, 0, 1);
            double r = Math.Max(0, rBase * slide - rSteep * steep);
            return new V2((v.x - nx * vn) * r, (v.y - ny * vn) * r);
        }

        public static V2 Rot(V2 v, double a)
        {
            double c = Math.Cos(a), s = Math.Sin(a);
            return new V2(v.x * c + v.y * s, -v.x * s + v.y * c);
        }

        public static double Heading(V2 v) => Math.Atan2(v.x, v.y);
        public static double Wrap(double a) => Math.Atan2(Math.Sin(a), Math.Cos(a));

        class Slider { public double x, y, vx, vy, curve; }

        static bool SlideStep(Slider b, double step)
        {
            double sp = Hypot(b.vx, b.vy);
            if (sp < stop) { b.vx = b.vy = 0; return false; }
            double f = mu * G * SC / sp;
            double nvx = b.vx - b.vx * f * step, nvy = b.vy - b.vy * f * step - G * SS * SC * step;
            if (nvx * b.vx + nvy * b.vy <= 0) { b.vx = b.vy = 0; return false; }
            b.vx = nvx; b.vy = nvy;
            if (b.curve != 0) { var v = Rot(new V2(nvx, nvy), b.curve * Hypot(nvx, nvy) * step); b.vx = v.x; b.vy = v.y; }
            b.x += b.vx * step; b.y += b.vy * step;
            return true;
        }

        static bool SlideStep(BagSim b, double step)
        {
            var s = new Slider { x = b.x, y = b.y, vx = b.vx, vy = b.vy, curve = b.curve };
            bool moving = SlideStep(s, step);
            b.x = s.x; b.y = s.y; b.vx = s.vx; b.vy = s.vy;
            return moving;
        }

        public static double GaussRand(Func<double> r)
        {
            double u = Math.Max(1e-9, r()), v = r();
            return Math.Sqrt(-2 * Math.Log(u)) * Math.Cos(2 * Math.PI * v);
        }

        public static bool OnSurface(BagSim b) => b.state == "sliding" || b.state == "resting";

        public static int BagPoints(BagSim b)
        {
            if (b.state == "inHole") return 3;
            if (OnSurface(b) && OnBoard(b)) return 1;
            return 0;
        }

        // ── World
        public class World
        {
            public List<BagSim> bags = new List<BagSim>();
            public List<EngineEvent> events = new List<EngineEvent>();
            public int nextId;
            public bool random;
            public Func<double> rand;
            static readonly Random shared = new Random();

            public World(bool random = true)
            {
                this.random = random;
                rand = () => shared.NextDouble();
            }

            public void Clear() { bags.Clear(); events.Clear(); }

            public bool Settled
            {
                get { foreach (var b in bags) if (b.state == "flying" || b.state == "sliding") return false; return true; }
            }

            public int Launch(Throw t, int owner)
            {
                var b = new BagSim
                {
                    id = nextId++, owner = owner, state = "flying", x = t.o.x, y = t.o.y, z = t.o.z, angle = t.az,
                    spin = t.spin * 7 + (random ? rand() * 2 - 1 : 0), t = t, c = ContactOf(t),
                };
                bags.Add(b);
                return b.id;
            }

            public void Step(double step)
            {
                for (int i = 0; i < bags.Count; i++)
                {
                    var b = bags[i];
                    if (b.state == "flying") Fly(b, step);
                    else if (b.state == "sliding") Slide(b, step);
                }
                Collide();
            }

            void Fly(BagSim b, double step)
            {
                b.ft += step; b.angle += b.spin * step;
                if (b.ft >= b.c.time) { Land(b, b.c); return; }
                var p = PosAt(b.t, b.ft);
                b.x = p.x; b.y = p.y; b.z = p.z;
                if (OnBoard(p.x, p.y) && p.z - Plane(p.y) < 0.18)
                {
                    BagSim other = null;
                    foreach (var o in bags) if (o != b && OnSurface(o) && Dist(o, p) < BAG * 0.9) { other = o; break; }
                    if (other != null)
                    {
                        Land(b, new Contact { time = b.ft, p = new V3(p.x, p.y, Plane(p.y)), v = VelAt(b.t, b.ft), kind = "board" });
                        events.Add(new EngineEvent { type = "hit", a = b, b = other });
                    }
                }
            }

            void Land(BagSim b, Contact c)
            {
                b.x = c.p.x; b.y = c.p.y; b.z = c.p.z;
                if (c.kind == "hole")
                {
                    b.state = "inHole"; b.vx = b.vy = 0;
                    events.Add(new EngineEvent { type = "swish", a = b });
                    Brush(c.v);
                }
                else if (c.kind == "ground")
                {
                    b.state = "ground"; b.z = 0; b.vx = b.vy = 0; b.spin = 0;
                    events.Add(new EngineEvent { type = "ground", a = b });
                }
                else
                {
                    double sm = b.t.spinMul;
                    var lv = Rot(LandingVel(c.v, b.t.slideMul), b.t.spin * SPIN_KICK * sm);
                    if (random)
                    {   // real bags: a little luck in every landing, and now and then one grabs the wood
                        double k = Math.Max(0.2, 1 + GaussRand(rand) * luckSpeed) * (rand() < grab ? 0.35 : 1);
                        lv = Rot(new V2(lv.x * k, lv.y * k), GaussRand(rand) * luckDir);
                    }
                    b.state = "sliding"; b.vx = lv.x; b.vy = lv.y;
                    b.curve = b.t.spin * SPIN_CURVE * sm; b.spin *= 0.6;
                    events.Add(new EngineEvent { type = "land", a = b });
                    Bounds(b);
                }
            }

            // A bag dropping through the hole brushes any bag hanging over its edge.
            void Brush(V3 v)
            {
                double sp = Hypot(v.x, v.y); if (sp == 0) sp = 1;
                double hx = v.x / sp, hy = v.y / sp;
                foreach (var o in bags)
                {
                    if (!OnSurface(o)) continue;
                    double cov = HoleCover(o); if (cov <= 0) continue;
                    double tx = HOLE.x - o.x, ty = HOLE.y - o.y, td = Hypot(tx, ty); if (td == 0) td = 1;
                    double k = 1.1 + cov * 2.2 + (random ? rand() * 0.6 : 0.3);
                    o.vx = hx * k + (tx / td) * k * 0.45; o.vy = hy * k + (ty / td) * k * 0.45;
                    o.state = "sliding"; o.spin += (random ? rand() * 2 - 1 : 0.5) * 2;
                    events.Add(new EngineEvent { type = "hit", a = o, b = o });
                }
            }

            void Slide(BagSim b, double step)
            {
                bool moving = SlideStep(b, step);
                b.z = Plane(b.y); b.angle += b.spin * step; b.spin *= Math.Max(0, 1 - 2.5 * step);
                if (!moving) { b.state = "resting"; b.spin = 0; }
                Bounds(b);
            }

            void Bounds(BagSim b)
            {
                if (!OnSurface(b)) return;
                if (HoleCover(b) > 0.5)
                {
                    b.state = "inHole"; b.vx = b.vy = 0; b.spin = 0;
                    events.Add(new EngineEvent { type = "drop", a = b });
                }
                else if (!OnBoard(b))
                {
                    if (b.y > BY) b.y += BR;
                    if (b.y < FY) b.y -= BR;
                    if (Math.Abs(b.x) > HW) b.x += Math.Sign(b.x) * BR;
                    b.state = "ground"; b.z = 0; b.vx = b.vy = 0; b.spin = 0;
                    events.Add(new EngineEvent { type = "off", a = b });
                }
            }

            void Collide()
            {
                var a = bags.FindAll(OnSurface);
                double md = 2 * BR;
                for (int i = 0; i < a.Count; i++)
                    for (int j = i + 1; j < a.Count; j++)
                    {
                        var p = a[i]; var q = a[j];
                        if (!OnSurface(p) || !OnSurface(q)) continue;
                        double dx = q.x - p.x, dy = q.y - p.y, d = Hypot(dx, dy);
                        if (d >= md) continue;
                        if (d < 1e-6) { dx = 0.01; dy = 0; d = 0.01; }
                        double nx = dx / d, ny = dy / d;
                        // Flat bags don't glance off like balls: a sliding bag carries a resting one along its own line.
                        double ex = nx, ey = ny; bool carried = false;
                        double pm = Hypot(p.vx, p.vy), qm = Hypot(q.vx, q.vy), vm = Math.Max(pm, qm);
                        if (vm > 0.3 && Math.Min(pm, qm) < 0.35 * vm)
                        {
                            var mv = pm >= qm ? p : q; double sg = mv == p ? 1 : -1, hx = sg * mv.vx / vm, hy = sg * mv.vy / vm;
                            if (hx * nx + hy * ny > 0)
                            {
                                double k = carry; ex = k * hx + (1 - k) * nx; ey = k * hy + (1 - k) * ny;
                                double el = Hypot(ex, ey); ex /= el; ey /= el; carried = true;
                            }
                        }
                        double closing = (q.vx - p.vx) * ex + (q.vy - p.vy) * ey;
                        if (closing < 0)
                        {
                            double imp = -(1 + rest) * closing / 2;
                            p.vx -= ex * imp; p.vy -= ey * imp; q.vx += ex * imp; q.vy += ey * imp; p.curve = q.curve = 0;
                            if (closing < -0.5)
                            {
                                double tw = random ? rand() * 6 - 3 : 1.5; p.spin += tw; q.spin -= tw;
                                events.Add(new EngineEvent { type = "hit", a = p, b = q });
                            }
                        }
                        double push = (md - d) / 2;
                        if (carried)
                        {
                            double f = push / Math.Max(ex * nx + ey * ny, 0.35);
                            p.x -= ex * f; p.y -= ey * f; q.x += ex * f; q.y += ey * f;
                        }
                        else { p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push; }
                        foreach (var k in new[] { p, q })
                        {
                            if (Hypot(k.vx, k.vy) > stop) k.state = "sliding";
                            Bounds(k);
                        }
                    }
            }
        }

        // ── Solver: landing + finish spots → perfect release
        public static Throw ThrowFor(V3 o, V2 L, double el)
        {
            double dx = L.x - o.x, dy = L.y - o.y, D = Hypot(dx, dy);
            if (D < 1) return null;
            double c = Math.Cos(el), den = 2 * c * c * (D * Math.Tan(el) + o.z - Surf(L));
            if (den <= 0) return null;
            return new Throw { o = o, speed = Math.Sqrt(G * D * D / den), el = el, az = Math.Atan2(dx, dy), spin = 0, spinMul = spinMul, slideMul = slideMul };
        }

        static V2 FreeSlideEnd(Throw t)
        {
            var c = ContactOf(t, true);
            if (c.kind != "board") return new V2(c.p.x, c.p.y);
            double s = t.spin, sm = t.spinMul;
            var lv = Rot(LandingVel(c.v, t.slideMul), s * SPIN_KICK * sm);
            var b = new Slider { x = c.p.x, y = c.p.y, vx = lv.x, vy = lv.y, curve = s * SPIN_CURVE * sm };
            for (int i = 0; i < 4800 && SlideStep(b, dt); i++) { }
            return new V2(b.x, b.y);
        }

        // Arc (elevation) so the bag travels D feet toward unit direction u after landing at L, with spin s.
        static Throw SolveEl(V3 o, V2 L, V2 u, double D, double s)
        {
            Throw Mk(double el) { var t = ThrowFor(o, L, el); if (t != null) t.spin = s; return t; }
            double? SlideLen(double el) { var t = Mk(el); if (t == null) return null; var e = FreeSlideEnd(t); return (e.x - L.x) * u.x + (e.y - L.y) * u.y; }
            double lo = minEl, hi = maxEl;
            var sLo = SlideLen(lo); var sHi = SlideLen(hi);
            if (sLo == null || sHi == null) return Mk(defEl);
            if (D >= sLo.Value) return Mk(lo);
            if (D <= sHi.Value) return Mk(hi);
            for (int i = 0; i < 32; i++)
            {
                double m = (lo + hi) / 2; var v = SlideLen(m);
                if (v == null) break;
                if (v.Value > D) lo = m; else hi = m;
            }
            return Mk((lo + hi) / 2);
        }

        // Perfect release that lands on L and finishes on E: arc sets the distance, spin bends the slide toward E.
        static Throw SolveSpin(V3 o, V2 L, V2 E)
        {
            double D = Dist(L, E); var bas = ThrowFor(o, L, maxEl);
            if (bas == null) return null;
            if (D < 0.08) return bas;
            var u = new V2((E.x - L.x) / D, (E.y - L.y) / D);
            double gain = (SPIN_KICK + SPIN_CURVE * D * 0.5) * spinMul;
            double s = Clamp(Wrap(Heading(u) - bas.az) / gain, -1, 1);
            for (int k = 0; k < 6; k++)
            {
                var t = SolveEl(o, L, u, D, s); if (t == null) return null;
                var e = FreeSlideEnd(t);
                double err = Wrap(Heading(u) - Heading(new V2(e.x - L.x, e.y - L.y)));
                if (Math.Abs(err) < 2e-4) return t;
                s = Clamp(s + err / gain, -1, 1);
            }
            return SolveEl(o, L, u, D, s);
        }

        // Plays a throw out against the bags already on the board, without touching the real game.
        public static SimResult Simulate(Throw t, int pl, List<BagSim> current, bool track = true)
        {
            var w = new World(false);
            foreach (var b in current)
                if (OnSurface(b)) { var c = b.Copy(); c.vx = c.vy = 0; c.state = "resting"; c.spin = 0; c.curve = 0; w.bags.Add(c); }
            w.nextId = 1000000; w.Launch(t, pl);
            var me = w.bags[w.bags.Count - 1];
            var r = new SimResult();
            r.flight.Add(t.o);
            BagSim hit = null;
            for (int k = 1; k < 6000 && !w.Settled; k++)
            {
                w.Step(dt);
                if (hit == null)
                    foreach (var e in w.events)
                        if (e.type == "hit" && (e.a == me || e.b == me)) { hit = e.a == me ? e.b : e.a; break; }
                w.events.Clear();
                if (track && (k % 3 == 0 || w.Settled))
                {
                    if (me.state == "flying") r.flight.Add(new V3(me.x, me.y, me.z));
                    else if (OnSurface(me)) r.slide.Add(new V2(me.x, me.y));
                    if (hit != null && (OnSurface(hit) || r.pushPath.Count == 0)) r.pushPath.Add(new V2(hit.x, hit.y));
                }
            }
            r.flight.Add(me.c.p);
            if (r.slide.Count > 0) r.slide.Insert(0, new V2(me.c.p.x, me.c.p.y));
            if (hit != null && hit.state == "inHole") r.pushPath.Add(HOLE);
            r.outcome = me.state; r.end = new V2(me.x, me.y); r.hit = hit;
            r.own = hit != null && hit.owner == pl ? hit : null;
            r.pushOutcome = hit?.state;
            if (hit != null) r.pushEnd = hit.state == "inHole" ? HOLE : new V2(hit.x, hit.y);
            return r;
        }

        // Push shot: one of your own bags is in the way, so throw harder until it is pushed onto the finish spot.
        public static Throw SolvePush(Throw bas, V2 L, V2 E, int pl, BagSim own, List<BagSim> current)
        {
            double D = Dist(L, E); if (D < 0.05) return null;
            var u = new V2((E.x - L.x) / D, (E.y - L.y) / D);
            bool Sunk(SimResult r) => r.pushOutcome == "inHole" && Dist(E, HOLE) < HR;
            Throw Mk(double el) { var t = ThrowFor(bas.o, L, el); if (t != null) t.spin = bas.spin; return t; }
            SimResult Run(double el) { var t = Mk(el); if (t == null) return null; var r = Simulate(t, pl, current, false); return r.hit != null && r.hit.id == own.id ? r : null; }
            double Reach(SimResult r) => Sunk(r) ? D + 0.01 : (r.pushEnd.Value.x - L.x) * u.x + (r.pushEnd.Value.y - L.y) * u.y;
            double lo = minEl, hi = bas.el;
            var rLo = Run(lo); if (rLo == null) return null;
            if (Reach(rLo) <= D) return Mk(lo);
            var best = Mk(lo);
            for (int k = 0; k < 20; k++)
            {
                double m = (lo + hi) / 2; var r = Run(m);
                if (r == null || Reach(r) < D) hi = m; else { lo = m; best = Mk(m); }
            }
            return best;
        }

        // ── Aiming: finish spot + landing distance along the throwing line
        public class AimLine { public V3 o; public double R; public V2 dir; }

        static AimLine Line(int pl, V2 E)
        {
            var o = Release(pl); double R = Hypot(E.x - o.x, E.y - o.y);
            return new AimLine { o = o, R = R, dir = new V2((E.x - o.x) / R, (E.y - o.y) / R) };
        }

        static V2 Along(AimLine g, double d) => new V2(g.o.x + g.dir.x * d, g.o.y + g.dir.y * d);

        static double SlideAt(AimLine g, double d, double el)
        {
            var L = Along(g, d); var t = ThrowFor(g.o, L, el);
            if (t == null) return 0;
            var e = FreeSlideEnd(t);
            return (e.x - L.x) * g.dir.x + (e.y - L.y) * g.dir.y;
        }

        static (double min, double max) LandingRange(AimLine g)
        {
            double max = g.R - Math.Max(0, SlideAt(g, g.R, maxEl));
            double onBoardFrom = g.dir.y > 0 ? (FY + 0.05 - g.o.y) / g.dir.y : g.R;
            double lo = Math.Min(onBoardFrom, max), hi = max;
            if (SlideAt(g, lo, minEl) >= g.R - lo) return (lo, max);
            for (int i = 0; i < 28; i++) { double m = (lo + hi) / 2; if (SlideAt(g, m, minEl) >= g.R - m) hi = m; else lo = m; }
            return (hi, max);
        }

        public static double MaxPhi(double D) => 0.85 * (SPIN_KICK + SPIN_CURVE * D * 0.5) * spinMul;

        public class Zone { public AimLine g; public V2 back; public double Dmin, Dmax; }

        public static Zone AimZone(int pl, V2 E)
        {
            var g = Line(pl, E); var r = LandingRange(g);
            return new Zone { g = g, back = new V2(-g.dir.x, -g.dir.y), Dmin = Math.Max(0, g.R - r.max), Dmax = Math.Max(0, g.R - r.min) };
        }

        public static V2 LandingFrom(Zone z, V2 E, double D, double phi)
        {
            var v = Rot(z.back, phi);
            return new V2(E.x + v.x * D, E.y + v.y * D);
        }

        public class Plan { public Zone z; public double D, phi; public V2 landing; public Throw ideal; }

        public static Plan PlanThrow(int pl, V2 E, double D, double phi)
        {
            var z = AimZone(pl, E);
            D = Clamp(D, z.Dmin, z.Dmax); phi = Clamp(phi, -MaxPhi(D), MaxPhi(D));
            var L = LandingFrom(z, E, D, phi);
            for (int i = 0; i < 80 && !OnBoard(L) && D > z.Dmin; i++)
            {   // keep the landing on the wood
                if (Math.Abs(phi) > 0.005) phi *= 0.85; else D = Math.Max(z.Dmin, D - 0.05);
                L = LandingFrom(z, E, D, phi);
            }
            var t = SolveSpin(z.g.o, L, E);
            return t != null ? new Plan { z = z, D = D, phi = phi, landing = L, ideal = t } : null;
        }

        // ── Throw errors
        public static readonly double MAX_DIR = Rad(6), MAX_POW = 0.14, MAX_HT = Rad(9);
        static readonly double SCATTER_AZ = 0.39 * Math.PI / 180, SCATTER_SPEED = 0.0035;
        static readonly Random errRand = new Random();
        static double R01() => errRand.NextDouble();

        public static double Eff(double e, Level lv) => Math.Abs(e) <= lv.zone ? 0 : Clamp(e, -1, 1);

        public static Throw ApplyErrors(double dir, double pow, double ht, Throw ideal, Level lv)
        {
            double sc = lv.scatter, ga = GaussRand(R01) * SCATTER_AZ * sc, gs = GaussRand(R01) * SCATTER_SPEED * sc;
            var t = ideal.Clone();
            t.az = ideal.az + Eff(dir, lv) * MAX_DIR + ga;
            t.speed = ideal.speed * (1 + Eff(pow, lv) * MAX_POW + gs);
            t.spin = Clamp(ideal.spin + Eff(dir, lv) * 0.35, -1, 1);
            t.el = Clamp(ideal.el + Eff(ht, lv) * MAX_HT, Rad(4), Rad(78));
            return t;
        }

        public static string Grade(double e, string lo, string hi, Level lv)
        {
            double x = Eff(e, lv); if (x == 0) return "Perfect";
            string side = x < 0 ? lo : hi; double a = Math.Abs(x);
            return a < 0.2 ? "Slightly " + side.ToLower() : a < 0.5 ? side : "Way " + side.ToLower();
        }

        // ── CPU
        static double SegDist(BagSim p, V2 a, V2 b)
        {
            double abx = b.x - a.x, aby = b.y - a.y, l2 = Math.Max(abx * abx + aby * aby, 1e-9);
            double t = Clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / l2, 0, 1);
            return Hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
        }

        public class CpuPlan { public V2 landing, end; public string label; }

        public static CpuPlan PlanCpu(int pl, List<BagSim> bags)
        {
            var o = Release(pl); double D = Hypot(HOLE.x - o.x, HOLE.y - o.y);
            var dir = new V2((HOLE.x - o.x) / D, (HOLE.y - o.y) / D);
            var landing = new V2(HOLE.x - dir.x * 1.7, HOLE.y - dir.y * 1.7);
            var end = new V2(HOLE.x + dir.x * 0.1, HOLE.y + dir.y * 0.1);
            BagSim blocker = null;
            foreach (var b in bags) if (OnSurface(b) && SegDist(b, landing, HOLE) < 0.42) { blocker = b; break; }
            if (blocker == null) return new CpuPlan { landing = landing, end = end, label = "Slide it in" };
            if (blocker.owner == pl && Dist(blocker, HOLE) < 1.6 && Dist(blocker, landing) > 0.5)
                return new CpuPlan { landing = landing, end = HOLE, label = "Push it in" };
            if (blocker.owner != pl && Dist(blocker, HOLE) < 0.9 && R01() < 0.5)
                return new CpuPlan
                {
                    landing = new V2(blocker.x - dir.x * 0.9, blocker.y - dir.y * 0.9),
                    end = new V2(HOLE.x + dir.x * 0.4, HOLE.y + dir.y * 0.4), label = "Push through",
                };
            return new CpuPlan { landing = HOLE, end = HOLE, label = "Airmail" };
        }

        public static double Gauss(double s)
        {
            double u = Math.Max(1e-9, R01()), v = R01();
            return Clamp(Math.Sqrt(-2 * Math.Log(u)) * Math.Cos(2 * Math.PI * v) * s, -1, 1);
        }
    }
}
