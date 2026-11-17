using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // A career match at the Backyard BBQ against a computer opponent, following the web game's rules
    // (web/src/g1_flow.js): tap where the bag should finish, drag the landing ring, tap THROW, then pull down
    // and let go with the ring in the sweet spot and the arrow straight. Cancellation scoring to 21.
    public partial class Match : MonoBehaviour
    {
        enum Phase { Aiming, Throw, Cpu, Flight, Inning, Over }

        // Backyard BBQ with the starter bags (VENUES[0] and BAGS[0] in the web game).
        static readonly Level L = new Level { freq = 0.55, zone = 2 * 0.06, powZone = 2 * 0.06, wobble = 0.012, scatter = 1 };
        const double POWER_TARGET = 0.75, FILL_MAX = 1.25, DEFAULT_SLIDE = 1.5;
        const float THROW_TIME = 25f, INNING_CARD_SECS = 6f;
        static readonly string[] CpuNames = { "SliderSam22", "BagQueenB", "Airmail_Al", "CornKing77", "DropShotDee", "TossBoss_T" };

        Phase phase;
        Eng.World world = new Eng.World();
        readonly int[] scores = new int[2], thrown = new int[2];
        readonly List<int>[] lost = { new List<int>(), new List<int>() };
        readonly bool[] fourBagger = new bool[2];
        int inning = 1, player, leader, winner = -1;
        readonly string[] names = new string[2];
        double cpuSkill;

        // Aiming
        V2? end; double? landD; double landPhi;
        Eng.Plan plan; Throw ideal; SimResult prev; int planVersion;
        readonly (V2? end, double? landD, double phi)[] saved = new (V2?, double?, double)[2];
        string dragging; V2? pendingDrag;

        // Pull
        bool pullActive; float pullStartY; double fill, raw, pullPhase, swing;

        // Throw result and flight
        bool overdrive, perfect;
        readonly List<(string title, string text)> feedback = new List<(string, string)>();
        int lastId = -1;
        double acc; float settleT, cpuT, time, innT;
        Eng.CpuPlan cpuPlan;
        float? clock;
        (int[] hole, int[] on, int[] raw, int winner, int awarded) lastInning;

        string banner; int bannerPl; float bannerT;
        Camera cam;

        bool CanEdit => phase == Phase.Aiming && player == 0;
        bool IsCpu(int p) => p == 1;

        public static void StartNew()
        {
            Court.BuildBackyard();
            new GameObject("Match").AddComponent<Match>();
        }

        void Start()
        {
            cam = Camera.main;
            if (cam == null)
            {
                cam = new GameObject("Main Camera").AddComponent<Camera>();
                cam.tag = "MainCamera";
            }
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 400f;
            BuildGuides();
            BuildAimRig();
            NewMatch();
            SnapCamera();
        }

        void NewMatch()
        {
            Eng.mu = 0.35;
            world = new Eng.World();
            ClearBagViews();
            cpuSkill = Random.Range(0.13f, 0.22f);
            names[0] = "You";
            names[1] = CpuNames[Random.Range(0, CpuNames.Length)];
            int flip = Random.value < 0.5f ? 1 : -1;   // coin flip for pitcher's boxes
            Eng.SIDES[0] = -flip; Eng.SIDES[1] = flip;
            scores[0] = scores[1] = 0;
            inning = 1; winner = -1;
            thrown[0] = thrown[1] = 0; lost[0].Clear(); lost[1].Clear();
            fourBagger[0] = fourBagger[1] = false;
            saved[0] = saved[1] = (null, null, 0);
            leader = player = Random.value < 0.5f ? 0 : 1;
            feedback.Clear();
            ShowBanner(leader == 0 ? "You throw first" : names[1] + " throws first", leader);
            string side = Eng.SIDES[0] < 0 ? "LEFT" : "RIGHT";
            pendingBanner = ("You're in the " + side + " box", 0, 1.7f);
            BeginTurn();
        }

        (string text, int pl, float at)? pendingBanner;

        static void SetGear()
        {
            Eng.spinMul = 0.8;   // 0.8 + 0.15 * (spin - 1) with the starter bags' spin of 1
            Eng.slideMul = 1;    // neutral feel
        }

        void BeginTurn()
        {
            cpuPlan = null;
            SetGear();
            clock = IsCpu(player) ? (float?)null : THROW_TIME;
            if (IsCpu(player))
            {
                end = null; landD = null; landPhi = 0; plan = null; ideal = null; prev = null; planVersion++;
                cpuT = 0; phase = Phase.Cpu;
            }
            else
            {
                var s = saved[player]; end = s.end; landD = s.landD; landPhi = s.phi;
                phase = Phase.Aiming; RefreshPlan();
            }
        }

        void RefreshPlan()
        {
            SetGear();
            plan = end.HasValue ? Eng.PlanThrow(player, end.Value, landD ?? DEFAULT_SLIDE, landPhi) : null;
            planVersion++;
            if (plan == null) { ideal = null; prev = null; return; }
            landD = plan.D; landPhi = plan.phi;
            ideal = plan.ideal;
            prev = Eng.Simulate(ideal, player, world.bags);
            if (prev.own != null && landD > 0.1)
            {   // push shot: throw harder so your own bag is shoved onto the finish spot
                var t = Eng.SolvePush(ideal, plan.landing, end.Value, player, prev.own, world.bags);
                if (t != null) { ideal = t; prev = Eng.Simulate(t, player, world.bags); }
            }
        }

        void MoveMarker(string kind, V2 p)
        {
            if (!CanEdit) return;
            if (kind == "end")
                end = new V2(Eng.Clamp(p.x, -Eng.HW - 0.8, Eng.HW + 0.8), Eng.Clamp(p.y, Eng.FY + 0.2, Eng.BY + 0.25));
            else if (plan != null)
            {
                var v = new V2(p.x - end.Value.x, p.y - end.Value.y);
                landD = Eng.Hypot(v.x, v.y);
                landPhi = Eng.Wrap(Eng.Heading(v) - Eng.Heading(plan.z.back));
                tutDragged = true;
            }
            RefreshPlan();
        }

        bool GrabsLanding(V2 p)
        {
            if (plan == null || !end.HasValue || Eng.Dist(p, end.Value) <= 0.3) return false;
            if (Eng.Dist(p, plan.landing) < 0.55) return true;
            var z = plan.z; var v = new V2(p.x - end.Value.x, p.y - end.Value.y); double D = Eng.Hypot(v.x, v.y);
            return D >= z.Dmin - 0.25 && D <= z.Dmax + 0.3 && System.Math.Abs(Eng.Wrap(Eng.Heading(v) - Eng.Heading(z.back))) <= Eng.MaxPhi(D) + 0.12;
        }

        bool tutDragged;

        void BeginThrow()
        {
            if (!CanEdit || ideal == null) return;
            saved[player] = (end, landD, landPhi);
            pullActive = false; fill = raw = pullPhase = swing = 0;
            phase = Phase.Throw;
        }

        // One move: the pull sets the power, the swinging arrow sets the direction; overdrive makes both wild.
        void UpdatePull(float dt)
        {
            if (!pullActive) return;
            fill = Eng.Clamp(raw + Mathf.Sin(time * 11f) * L.wobble * System.Math.Min(1, raw * 4), 0, FILL_MAX);
            bool over = fill > 1;
            double speed = (0.35 + 0.65 * System.Math.Min(fill / POWER_TARGET, 1.6)) * (over ? 1.9 : 1);
            pullPhase += dt * L.freq * speed;
            double ph = pullPhase % 1;   // triangle wave: steady sweep left and right
            swing = ph < 0.25 ? ph * 4 : ph < 0.75 ? 2 - ph * 4 : ph * 4 - 4;
            if (over) swing *= 1.3;
        }

        void ReleasePull()
        {
            pullActive = false;
            if (fill < 0.1) return;   // a tap, not a pull
            bool over = fill > 1;
            double pow = Eng.Clamp((fill - POWER_TARGET) / 0.5, -1, 1);
            double dir = Eng.Clamp(swing, -1.3, 1.3);
            pow = System.Math.Abs(pow) <= L.powZone ? 0 : pow;
            double ht = over ? Random.Range(-0.9f, 0.9f) : 0;
            overdrive = over;
            FireAim();
            ReleaseBag(dir, pow, ht);
        }

        void ReleaseBag(double dir, double pow, double ht)
        {
            if (ideal == null) return;
            SetGear();
            var actual = Eng.ApplyErrors(dir, pow, ht, ideal, L);
            if (overdrive) actual.az += (dir - Eng.Clamp(dir, -1, 1)) * Eng.MAX_DIR;   // overdrive can swing past the normal limit
            feedback.Clear();
            feedback.Add(("Direction", Eng.Grade(dir, "Left", "Right", L)));
            feedback.Add(("Strength", Eng.Grade(pow, "Short", "Long", L)));
            if (overdrive) feedback.Add(("Overdrive", "Wild!"));
            perfect = !overdrive && feedback.TrueForAll(f => f.text == "Perfect");
            clock = null;
            lastId = world.Launch(actual, player);
            thrown[player]++; settleT = 0; acc = 0; phase = Phase.Flight;
            if (overdrive) ShowBanner("OVERDRIVE!", player);
            else if (perfect) ShowBanner("PERFECT!", player);
        }

        // Out of time: that bag is lost.
        void TimeUp()
        {
            clock = null; pullActive = false; feedback.Clear();
            lost[player].Add(thrown[player]);
            thrown[player]++; settleT = -1.7f; acc = 0; phase = Phase.Flight; lastId = -1;
            ShowBanner("Time's up! Bag lost", player);
        }

        void CpuTurn()
        {
            cpuPlan = Eng.PlanCpu(player, world.bags);
            end = cpuPlan.end;
            landD = Eng.Dist(cpuPlan.landing, cpuPlan.end); landPhi = 0;
            RefreshPlan();
        }

        void EndTurn()
        {
            if (thrown[0] >= 4 && thrown[1] >= 4) { FinishInning(); return; }
            int other = 1 - player;
            if (thrown[other] < 4) player = other;
            BeginTurn();
        }

        void FinishInning()
        {
            int[] hole = new int[2], on = new int[2];
            foreach (var b in world.bags)
            {
                int p = Eng.BagPoints(b);
                if (p == 3) hole[b.owner]++; else if (p == 1) on[b.owner]++;
            }
            int[] r = { hole[0] * 3 + on[0], hole[1] * 3 + on[1] };
            int w = r[0] == r[1] ? -1 : (r[0] > r[1] ? 0 : 1);
            int awarded = System.Math.Abs(r[0] - r[1]);
            lastInning = (hole, on, r, w, awarded);
            if (w >= 0) { scores[w] += awarded; leader = w; }
            int best = scores[0] >= scores[1] ? 0 : 1;
            innT = 0;
            if (scores[best] >= 21) { winner = best; phase = Phase.Over; }
            else phase = Phase.Inning;
        }

        void NextInning()
        {
            world.Clear(); ClearBagViews();
            inning++; thrown[0] = thrown[1] = 0; lost[0].Clear(); lost[1].Clear();
            player = leader; feedback.Clear(); fourBagger[0] = fourBagger[1] = false;
            BeginTurn();
        }

        void ShowBanner(string text, int pl) { banner = text; bannerPl = pl; bannerT = 1.7f; }

        void HandleEvents(List<EngineEvent> evts)
        {
            bool sunk = false;
            foreach (var e in evts)
            {
                if (e.type == "swish" || e.type == "drop")
                {
                    int p = e.a.owner, n = world.bags.FindAll(b => b.owner == p && b.state == "inHole").Count;
                    string name = n == 2 ? "2-BAGGER!" : n == 3 ? "3-BAGGER!" : e.type == "swish" ? "SWISH!" : e.a.id == lastId ? "CORNHOLE!" : "KNOCKED IN!";
                    if (n < 4) ShowBanner(name, p);
                    sunk = true;
                }
                else if (e.type == "ground" && e.a.id == lastId) ShowBanner("Off the board", e.a.owner);
                else if (e.type == "off") ShowBanner(e.a.id == lastId ? "Slid off" : "Knocked off!", e.a.owner);
            }
            if (!sunk) return;
            for (int p = 0; p < 2; p++)
            {
                if (fourBagger[p]) continue;
                if (world.bags.FindAll(b => b.owner == p && b.state == "inHole").Count >= 4) { fourBagger[p] = true; ShowBanner("4-BAGGER!!", p); }
            }
        }

        void Update()
        {
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            time += dt;
            if (banner != null) { bannerT -= dt; if (bannerT <= 0) banner = null; }
            if (pendingBanner.HasValue && time >= pendingBanner.Value.at && banner == null)
            {
                ShowBanner(pendingBanner.Value.text, pendingBanner.Value.pl);
                pendingBanner = null;
            }

            Layout();
            HandleInput();

            if ((phase == Phase.Aiming || phase == Phase.Throw) && clock.HasValue)
            {
                clock -= dt;
                if (clock <= 0) TimeUp();
            }

            if (phase == Phase.Throw) UpdatePull(dt);
            else if (phase == Phase.Cpu)
            {
                cpuT += dt;
                if (cpuPlan == null && cpuT > 0.6f) CpuTurn();
                if (cpuT > 2.6f && ideal == null && cpuT > 4f)
                {   // couldn't plan a slide: just airmail it
                    ideal = Eng.ThrowFor(Eng.Release(player), Eng.HOLE, Eng.defEl);
                }
                if (cpuT > 2.6f && ideal != null)
                {
                    overdrive = false;
                    ReleaseBag(Eng.Gauss(cpuSkill), Eng.Gauss(cpuSkill), 0);
                }
            }
            else if (phase == Phase.Flight)
            {
                acc += dt;
                while (acc >= Eng.dt) { world.Step(Eng.dt); acc -= Eng.dt; }
                var ev = new List<EngineEvent>(world.events); world.events.Clear();
                HandleEvents(ev);
                if (world.Settled) { settleT += dt; if (settleT > 1.3f) EndTurn(); }
            }
            else if (phase == Phase.Inning)
            {
                innT += dt;
                if (innT >= INNING_CARD_SECS) NextInning();
            }

            UpdateGuides();
            UpdateAimRig(dt);
            UpdateBagViews(dt);
            UpdateCamera(dt);
        }

        // ── Input (a touch on a phone works like the mouse here)

        void HandleInput()
        {
            var mp = Input.mousePosition;
            var gui = new Vector2(mp.x, Screen.height - mp.y);

            if (Input.GetMouseButtonDown(0))
            {
                if (ButtonAt(gui, out var action)) { action(); return; }
                if (phase == Phase.Aiming && CanEdit)
                {
                    var p = CourtPoint(mp); if (!p.HasValue) return;
                    dragging = GrabsLanding(p.Value) ? "landing" : "end";
                    MoveMarker(dragging, p.Value);
                }
                else if (phase == Phase.Throw)
                {
                    pullActive = true; pullStartY = mp.y; fill = raw = pullPhase = swing = 0;
                }
                return;
            }

            if (Input.GetMouseButton(0))
            {
                if (dragging != null) { var p = CourtPoint(mp); if (p.HasValue) pendingDrag = p; }
                else if (phase == Phase.Throw && pullActive) raw = Mathf.Max(0f, (pullStartY - mp.y) / PullScale);
            }

            if (dragging != null && pendingDrag.HasValue) { MoveMarker(dragging, pendingDrag.Value); pendingDrag = null; }

            if (Input.GetMouseButtonUp(0))
            {
                if (dragging != null) dragging = null;
                else if (phase == Phase.Throw && pullActive) ReleasePull();
            }
        }

        static float PullScale => Mathf.Max(170f, Screen.height * 0.5f);

        // Where a screen point hits the (extended) board plane, in court feet.
        V2? CourtPoint(Vector3 screen)
        {
            var ray = cam.ScreenPointToRay(screen);
            float M = Board.M;
            float k = (float)((Eng.BH - Eng.FH) / (Eng.BY - Eng.FY));
            float denom = ray.direction.y - k * ray.direction.z;
            if (Mathf.Abs(denom) < 1e-6f) return null;
            float t = ((float)Eng.FH * M - k * (float)Eng.FY * M + k * ray.origin.z - ray.origin.y) / denom;
            if (t <= 0f) return null;
            var p = ray.origin + ray.direction * t;
            return new V2(p.x / M, p.z / M);
        }

        // ── Camera (the web game's match cameras; court feet converted to metres)

        Vector3 camPos, camLook, tPos, tLook;
        float tFov = 50f;

        void SnapCamera()
        {
            UpdateCamera(0f);
            camPos = tPos; camLook = tLook;
            cam.fieldOfView = tFov;
            cam.transform.position = camPos;
            cam.transform.LookAt(camLook);
        }

        string CamMode()
        {
            if (phase == Phase.Aiming) return "aim";
            if (phase == Phase.Throw) return "throw";
            if (phase == Phase.Cpu) return cpuT < 0.6f ? "aim" : "throw";
            if (phase == Phase.Flight)
            {
                var b = world.bags.Find(x => x.id == lastId);
                if (b != null && b.state == "flying" && b.y < Eng.FY - 7) return "follow";
            }
            return "watch";
        }

        void UpdateCamera(float dt)
        {
            var rel = Eng.Release(player);
            bool narrow = cam.aspect < 0.7f;
            float k = 3f, fov = narrow ? 50f : 42f;
            string mode = CamMode();
            if (mode == "aim")
            {
                tPos = Court.U(rel.x * 0.25, Eng.FY - (narrow ? 3.0 : 3.6), narrow ? 7.4 : 6.6);
                tLook = Court.U(0, Eng.FY + 2.15, 0.3);
            }
            else if (mode == "throw")
            {   // behind the thrower's hand in their pitcher's box, looking down their line to the board
                tPos = Court.U(rel.x * 1.1, -5.2, 6.2);
                tLook = Court.U(rel.x * 0.15, 14, 0);
                fov = narrow ? 46f : 40f;
            }
            else if (mode == "follow")
            {
                var b = world.bags.Find(x => x.id == lastId);
                tPos = Court.U(Mathf.Lerp((float)rel.x, (float)b.x, 0.6f), b.y - 7.5, System.Math.Max(3.2, b.z * 0.7 + 2.6));
                tLook = Court.U(b.x * 0.5, b.y + 6, b.z * 0.4);
                k = 5f;
            }
            else
            {
                tPos = Court.U(rel.x * 0.4, Eng.FY - (narrow ? 3.8 : 4.4), narrow ? 6.3 : 5.6);
                tLook = Court.U(0, Eng.FY + 2.0, 0.3);
            }
            tFov = fov;
            float t = 1f - Mathf.Exp(-dt * k);
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, fov, t);
            camPos = Vector3.Lerp(camPos, tPos, t);
            camLook = Vector3.Lerp(camLook, tLook, t);
            cam.transform.position = camPos;
            cam.transform.LookAt(camLook);
        }
    }

    public static class Bootstrap
    {
        // Runs when Play is pressed in any scene, so no scene file is needed yet.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartGame()
        {
            if (Object.FindFirstObjectByType<Match>() != null) return;
            Application.targetFrameRate = 60;
            Match.StartNew();
        }
    }
}
