using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // What's drawn for the match: the bags, and the aiming guides (finish spot, landing ring, landing zone,
    // and the predicted flight, slide and push), as in web/src/g3_objects.js.
    public partial class Match
    {
        public static readonly Color[] TeamColor = { new Color(1f, 0.294f, 0.227f), new Color(0.184f, 0.525f, 1f) };
        static readonly Color Gold = new Color(1f, 0.79f, 0.23f), Go = new Color(0.24f, 0.88f, 0.48f);

        // ── Bags

        class BagView { public Transform t; public float sink; }
        readonly Dictionary<int, BagView> bagViews = new Dictionary<int, BagView>();
        Material[] bagMats;

        void ClearBagViews()
        {
            foreach (var v in bagViews.Values) if (v.t != null) Destroy(v.t.gameObject);
            bagViews.Clear();
        }

        static Mesh pillow;

        // A filled 6" cloth bag: puffed up in the middle, pinched flat at the seams (in feet).
        static Mesh Pillow()
        {
            if (pillow != null) return pillow;
            const int n = 12;
            float half = (float)Eng.BAG / 2f;
            var v = new List<Vector3>(); var t = new List<int>();
            for (int side = 0; side < 2; side++)
            {
                int b0 = v.Count;
                for (int j = 0; j <= n; j++)
                    for (int i = 0; i <= n; i++)
                    {
                        float u = -1f + 2f * i / n, w = -1f + 2f * j / n;
                        float puff = Mathf.Sqrt(Mathf.Max(0f, (1f - Mathf.Pow(Mathf.Abs(u), 4f)) * (1f - Mathf.Pow(Mathf.Abs(w), 4f))));
                        float y = side == 0 ? 0.035f + 0.075f * puff : 0.035f - 0.03f * puff;
                        v.Add(new Vector3(u * half * (1f - 0.04f * puff), y, w * half * (1f - 0.04f * puff)));
                        if (i < n && j < n)
                        {
                            int a = b0 + j * (n + 1) + i;
                            t.AddRange(side == 0 ? new[] { a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2 } : new[] { a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1 });
                        }
                    }
            }
            pillow = new Mesh { name = "Bag" };
            pillow.SetVertices(v); pillow.SetTriangles(t, 0); pillow.RecalculateNormals(); pillow.RecalculateBounds();
            return pillow;
        }

        Transform MakeBag(int owner)
        {
            if (bagMats == null)
                bagMats = new[] { Kit.Mat(TeamColor[0], null, 1f, 1f, 0.08f), Kit.Mat(TeamColor[1], null, 1f, 1f, 0.08f) };
            var root = new GameObject("Bag").transform;
            var body = new GameObject("Cloth").transform;
            body.SetParent(root, false);
            body.localScale = Vector3.one * Board.M;
            body.gameObject.AddComponent<MeshFilter>().sharedMesh = Pillow();
            body.gameObject.AddComponent<MeshRenderer>().sharedMaterial = bagMats[owner];
            return root;
        }

        void UpdateBagViews(float dt)
        {
            float slope = Mathf.Atan2((float)(Eng.BH - Eng.FH), (float)(Eng.BY - Eng.FY)) * Mathf.Rad2Deg;
            foreach (var b in world.bags)
            {
                if (!bagViews.TryGetValue(b.id, out var v)) { v = new BagView { t = MakeBag(b.owner) }; bagViews[b.id] = v; }
                var yaw = Quaternion.Euler(0f, (float)Eng.Deg(b.angle), 0f);
                switch (b.state)
                {
                    case "flying":
                        v.t.position = Court.U(b.x, b.y, b.z);
                        v.t.rotation = yaw;
                        break;
                    case "inHole":
                        v.sink += dt;
                        v.t.position = Court.U(b.x, b.y, Eng.Plane(b.y) - Mathf.Min(1f, v.sink / 0.25f) * 0.6f);
                        v.t.rotation = Quaternion.AngleAxis(-slope, Vector3.right) * yaw;
                        if (v.sink > 0.3f) v.t.gameObject.SetActive(false);
                        break;
                    case "ground":
                        v.t.position = Court.U(b.x, b.y, 0);
                        v.t.rotation = yaw;
                        break;
                    default:   // sliding or resting on the board
                        v.t.position = Court.U(b.x, b.y, Eng.Plane(b.y));
                        v.t.rotation = Quaternion.AngleAxis(-slope, Vector3.right) * yaw;
                        break;
                }
            }
        }

        // ── Aiming guides

        Transform finishMarker, landingMarker;
        LineRenderer arcLine, slideLine, pushLine, zoneLine, ghostA, ghostB;
        MeshFilter zoneMesh;
        int shownPlan = -1; Phase shownPhase;

        LineRenderer MakeLine(string name, Color c, float widthFt)
        {
            var lr = new GameObject(name).AddComponent<LineRenderer>();
            lr.sharedMaterial = Kit.Unlit(c);
            lr.widthMultiplier = widthFt * Board.M;
            lr.numCapVertices = 4;
            lr.numCornerVertices = 2;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lr.receiveShadows = false;
            lr.positionCount = 0;
            return lr;
        }

        static Mesh RingMesh(float r0, float r1, int n = 48)
        {
            var verts = new List<Vector3>(); var tris = new List<int>();
            for (int i = 0; i <= n; i++)
            {
                float a = i * Mathf.PI * 2f / n;
                verts.Add(new Vector3(Mathf.Sin(a) * r0, 0f, Mathf.Cos(a) * r0));
                verts.Add(new Vector3(Mathf.Sin(a) * r1, 0f, Mathf.Cos(a) * r1));
                if (i < n) { int b = i * 2; tris.AddRange(new[] { b, b + 2, b + 1, b + 1, b + 2, b + 3 }); }
            }
            var m = new Mesh(); m.SetVertices(verts); m.SetTriangles(tris, 0); m.RecalculateBounds();
            return m;
        }

        Transform MeshObject(string name, Mesh mesh, Material mat)
        {
            var g = new GameObject(name);
            g.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = g.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return g.transform;
        }

        void BuildGuides()
        {
            float M = Board.M;
            // Finish spot: a green dot with a white edge. Landing spot: a gold ring.
            finishMarker = new GameObject("Finish spot").transform;
            var edge = MeshObject("Edge", RingMesh(0.15f * M, 0.21f * M), Kit.Unlit(Color.white));
            edge.SetParent(finishMarker, false);
            var dot = MeshObject("Dot", RingMesh(0f, 0.16f * M), Kit.Unlit(Go));
            dot.SetParent(finishMarker, false);
            dot.localPosition = new Vector3(0f, 0.002f, 0f);
            landingMarker = MeshObject("Landing ring", RingMesh(0.2f * M, 0.3f * M), Kit.Unlit(Gold));

            var zoneMat = Kit.Unlit(new Color(Gold.r, Gold.g, Gold.b, 0.3f));
            zoneMesh = MeshObject("Landing zone", new Mesh(), zoneMat).GetComponent<MeshFilter>();
            zoneLine = MakeLine("Landing zone edge", Gold, 0.03f);
            arcLine = MakeLine("Flight path", new Color(1f, 1f, 1f, 0.85f), 0.05f);
            slideLine = MakeLine("Slide path", Color.white, 0.06f);
            pushLine = MakeLine("Push path", Gold, 0.06f);
            ghostA = MakeLine("Bag finish", Color.white, 0.03f);
            ghostB = MakeLine("Pushed bag finish", Gold, 0.03f);
            foreach (var g in new[] { ghostA, ghostB }) g.loop = true;
        }

        static Vector3 OnSurface(V2 p, double lift) => Court.U(p.x, p.y, Eng.Surf(p) + lift);

        static Quaternion SurfaceTilt(V2 p)
        {
            if (!Eng.OnBoard(p)) return Quaternion.identity;
            float slope = Mathf.Atan2((float)(Eng.BH - Eng.FH), (float)(Eng.BY - Eng.FY)) * Mathf.Rad2Deg;
            return Quaternion.AngleAxis(-slope, Vector3.right);
        }

        void SetLine(LineRenderer lr, List<Vector3> pts)
        {
            lr.positionCount = pts.Count;
            lr.SetPositions(pts.ToArray());
        }

        void Square(LineRenderer lr, V2 c)
        {
            double h = Eng.BAG / 2;
            var pts = new List<Vector3>();
            foreach (var (dx, dy) in new[] { (-h, -h), (h, -h), (h, h), (-h, h) })
            {
                var p = new V2(c.x + dx, c.y + dy);
                pts.Add(Court.U(p.x, p.y, Eng.Surf(c) + 0.03));
            }
            SetLine(lr, pts);
        }

        void UpdateGuides()
        {
            if (planVersion != shownPlan || phase != shownPhase) RebuildGuides();
            if (finishMarker.gameObject.activeSelf)
                finishMarker.localScale = Vector3.one * (1f + 0.08f * Mathf.Sin(time * 4f));
        }

        void RebuildGuides()
        {
            shownPlan = planVersion; shownPhase = phase;
            foreach (var lr in new[] { arcLine, slideLine, pushLine, zoneLine, ghostA, ghostB }) lr.positionCount = 0;
            zoneMesh.sharedMesh.Clear();
            bool visible = plan != null && (phase == Phase.Aiming || phase == Phase.Throw || phase == Phase.Cpu);
            finishMarker.gameObject.SetActive(visible && end.HasValue);
            landingMarker.gameObject.SetActive(visible && plan != null);
            if (!visible) return;

            finishMarker.position = OnSurface(end.Value, 0.03);
            finishMarker.rotation = SurfaceTilt(end.Value);
            landingMarker.position = OnSurface(plan.landing, 0.03);
            landingMarker.rotation = SurfaceTilt(plan.landing);

            SetGear();
            var z = plan.z; var E = end.Value;
            if (CanEdit && z.Dmax - z.Dmin > 0.02)
            {   // the landing zone: a fan behind the finish spot
                const int N = 18;
                var verts = new List<Vector3>(); var idx = new List<int>();
                var left = new List<Vector3>(); var right = new List<Vector3>();
                for (int i = 0; i <= N; i++)
                {
                    double D = z.Dmin + (z.Dmax - z.Dmin) * i / N, a = Eng.MaxPhi(D);
                    foreach (int s in new[] { -1, 1 })
                    {
                        var q = Eng.LandingFrom(z, E, D, s * a);
                        var w = OnSurface(q, 0.015);
                        verts.Add(w);
                        (s < 0 ? left : right).Add(w);
                    }
                    if (i < N) { int b = i * 2; idx.AddRange(new[] { b, b + 1, b + 2, b + 1, b + 3, b + 2 }); }
                }
                var mesh = zoneMesh.sharedMesh;
                mesh.SetVertices(verts); mesh.SetTriangles(idx, 0); mesh.RecalculateBounds();
                right.Reverse(); left.AddRange(right); left.Add(left[0]);
                SetLine(zoneLine, left);
            }

            if (prev == null) return;
            var arc = new List<Vector3>();
            foreach (var p in prev.flight) arc.Add(Court.U(p.x, p.y, p.z + 0.05));
            SetLine(arcLine, arc);
            if (prev.slide.Count > 1)
            {
                var pts = new List<Vector3>();
                foreach (var p in prev.slide) pts.Add(OnSurface(p, 0.04));
                SetLine(slideLine, pts);
                if (prev.outcome != "inHole") Square(ghostA, prev.end);
            }
            if (prev.pushPath.Count > 1)
            {
                var pts = new List<Vector3>();
                foreach (var p in prev.pushPath) pts.Add(OnSurface(p, 0.04));
                SetLine(pushLine, pts);
                if (prev.pushOutcome != "inHole" && prev.pushEnd.HasValue) Square(ghostB, prev.pushEnd.Value);
            }
        }
    }
}
