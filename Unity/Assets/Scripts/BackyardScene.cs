using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // Court 1, the Backyard BBQ, rebuilt from the web game's styledBackyard() (web/src/g2_world.js), in the same
    // three.js feet coordinates (ModelLib.W converts them). Unity additions: a much thicker lawn of grass tufts and
    // flowers (GPU instanced), the scanned Poly Haven picnic table and chairs, glowing string-light bulbs and coals,
    // and real smoke from the grill and smoker.
    public static class BackyardScene
    {
        static System.Random rng;
        static float R() => (float)rng.NextDouble();
        static Vector3 W(float x, float y, float z) => ModelLib.W(x, y, z);
        const float M = Board.M;

        public static Color Hex(int hex) => new Color(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f);
        static Material Lam(int hex) => Kit.Mat(Hex(hex), null, 1f, 1f, 0.05f);
        static Material Std(int hex, float roughness = 0.8f, float metal = 0f)
        {
            var m = Kit.Mat(Hex(hex), null, 1f, 1f, (1f - roughness) * 0.8f);
            m.SetFloat("_Metallic", metal);
            return m;
        }

        static Transform Box(Transform p, float w, float h, float d, Material m, float x, float y, float z, float rotY = 0f) =>
            Kit.Box("Box", p, W(x, y, z), new Vector3(w, h, d) * M, m, false, new Vector3(0f, -rotY * Mathf.Rad2Deg, 0f)).transform;

        static Transform Cyl(Transform p, float r, float h, Material m, float x, float y, float z) =>
            Kit.Shape(PrimitiveType.Cylinder, "Cylinder", p, W(x, y, z), new Vector3(2f * r, h / 2f, 2f * r) * M, m).transform;

        static Transform Ball(Transform p, float r, Material m, float x, float y, float z) =>
            Kit.Shape(PrimitiveType.Sphere, "Sphere", p, W(x, y, z), Vector3.one * 2f * r * M, m).transform;

        static Transform Group(Transform parent, string name, float x, float z, float rotY)
        {
            var g = new GameObject(name).transform;
            g.SetParent(parent, false);
            g.localPosition = W(x, 0f, z);
            g.localRotation = ModelLib.Yaw(rotY);
            return g;
        }

        static Material Glow(Color c, float strength)
        {
            var m = Kit.Mat(c, null, 1f, 1f, 0.3f);
            m.SetColor("_EmissionColor", c * strength);
            return m;
        }

        public static void Build()
        {
            rng = new System.Random(91);
            var g = new GameObject("Backyard BBQ").transform;
            var scatter = g.gameObject.AddComponent<Scatter>();

            Lawn(g, 700f);
            Fence(g);
            BackOfHouse(g, 2f, 66f);

            // Trees all the way round: a mix of leafy, birch and pine, bigger the further out.
            string[] leafy = { "commontree_1", "commontree_2", "commontree_3", "commontree_4", "commontree_5" };
            string[] others = { "birchtree_1", "birchtree_3", "pinetree_1", "pinetree_3", "pinetree_5" };
            for (int i = 0; i < 70; i++)
            {
                float a = R() * Mathf.PI * 2f, d = 55f + R() * 140f, x = Mathf.Sin(a) * d, z = -15f + Mathf.Cos(a) * d;
                if (z > 40f && Mathf.Abs(x) < 50f) continue;   // the house
                string kind = R() < 0.6f ? leafy[(int)(R() * leafy.Length)] : others[(int)(R() * others.Length)];
                ModelLib.Place(g, kind, x, z, R() * 6.28f, 3.2f + R() * 1.6f);
            }
            foreach (var (x, z) in new[] { (-21f, -40f), (21f, -38f), (-22f, 4f) }) ModelLib.Place(g, leafy[(int)(R() * 5)], x, z, R() * 6.28f, 3.4f);

            // Shrubs and flowers along the fence.
            for (float x = -24f; x <= 24f; x += 3f + R() * 2.5f)
                ModelLib.Place(g, R() < 0.35f ? "flowers" : R() < 0.6f ? "bushberries_1" : "bush_1", x, -44.3f, R() * 6.28f, 1.0f + R() * 0.4f);
            for (float z = -40f; z <= 6f; z += 4f + R() * 3f)
                foreach (float sx in new[] { -1f, 1f })
                    ModelLib.Place(g, R() < 0.3f ? "flowers" : R() < 0.6f ? "bush_2" : "plant_3", sx * 24.2f, z, R() * 6.28f, 1.0f + R() * 0.4f);

            // A thick lawn: hundreds of grass tufts and some flowers, kept off the lane between the boards.
            for (int i = 0; i < 500; i++)
            {
                float x = (R() - 0.5f) * 50f, z = -46f + R() * 60f;
                if (Mathf.Abs(x) < 5.5f && z > -33f && z < 3f) continue;
                scatter.Add(R() < 0.75f ? "grass_short" : "grass", W(x, 0f, z), R() * 360f, 0.35f + R() * 0.35f);
            }
            for (int i = 0; i < 40; i++)
            {
                float x = (R() < 0.5f ? -1f : 1f) * (9f + R() * 14f), z = -44f + R() * 50f;
                scatter.Add("flowers", W(x, 0f, z), R() * 360f, 0.6f + R() * 0.4f);
            }
            ModelLib.Place(g, "rock_1", -18f, -20f, 0.5f, 1.6f);
            ModelLib.Place(g, "rock_moss_2", 19f, -28f, 2f, 1.4f);
            ModelLib.Place(g, "treestump", -20f, 18f, 1f, 2f);

            // The cookout.
            Grill(g, 15f, 4f, -0.5f);
            Smoker(g, 19.5f, 9f, -0.6f);
            DeckTable(g, -15f, -4f, 41); DeckTable(g, 18f, -10f, 43); DeckTable(g, -17f, 24f, 45);
            ModelLib.Place(g, "wooden_picnic_table", -15f, 14f, 0.3f + Mathf.PI / 2f, 1f);
            ModelLib.Place(g, "plastic_monobloc_chair_01", -7.5f, -36f, 0.35f, 1f);
            ModelLib.Place(g, "plastic_monobloc_chair_01", 7.8f, -37f, -0.35f, 1f);
            Clouds(g);
            StringLights(g, new[] { (-9f, -38f), (9f, -38f), (-9f, -14f), (9f, -14f) },
                new[] { ((-9f, -38f), (9f, -38f)), ((-9f, -38f), (-9f, -14f)), ((9f, -38f), (9f, -14f)), ((-9f, -14f), (9f, -26f)), ((9f, -14f), (-9f, -26f)) },
                10.6f, 2);
        }

        // Big puffy cartoon clouds all around the sky.
        static void Clouds(Transform g)
        {
            var white = Kit.Mat(Color.white, null, 1f, 1f, 0f);
            white.SetColor("_EmissionColor", new Color(0.35f, 0.37f, 0.42f));
            white.SetColor("_ShadeColor", new Color(0.72f, 0.78f, 0.92f));
            var sky = new GameObject("Clouds").transform; sky.SetParent(g, false);
            for (int i = 0; i < 14; i++)
            {
                float a = i / 14f * Mathf.PI * 2f + R() * 0.3f, d = 420f + R() * 260f;
                var c = Group(sky, "Cloud", Mathf.Sin(a) * d, -15f + Mathf.Cos(a) * d, R() * 6.28f);
                c.localPosition += Vector3.up * (110f + R() * 70f) * M;
                int puffs = 4 + (int)(R() * 4);
                for (int k = 0; k < puffs; k++)
                {
                    float r = 18f + R() * 16f, x = (k - puffs / 2f) * 20f + R() * 8f;
                    Ball(c, r, white, x, R() * 8f, R() * 14f - 7f).localScale = new Vector3(2f * r, 1.5f * r, 2f * r) * M;
                }
                foreach (var t in c.GetComponentsInChildren<Renderer>()) t.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
        }

        // Grass with soft light and dark patches (web: stylizedLawn), as vertex colours.
        static void Lawn(Transform g, float size)
        {
            const int N = 60;
            var verts = new List<Vector3>(); var cols = new List<Color>(); var tris = new List<int>();
            Color a = Hex(0x84e05a), b = Hex(0x5cc23f);   // bright cartoon greens
            for (int j = 0; j <= N; j++)
                for (int i = 0; i <= N; i++)
                {
                    float x = -size / 2f + size * i / N, z = -30f - size / 2f + size * j / N;
                    float k = 0.5f + 0.5f * Mathf.Sin(x * 0.07f + Mathf.Sin(z * 0.05f) * 2f) * Mathf.Cos(z * 0.06f);
                    verts.Add(W(x, 0f, z));
                    cols.Add(Color.Lerp(a, b, k * 0.8f + R() * 0.15f).linear);
                    if (i < N && j < N) { int v = j * (N + 1) + i; tris.AddRange(new[] { v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2 }); }
                }
            var mesh = new Mesh { name = "Lawn" };
            mesh.SetVertices(verts); mesh.SetColors(cols); mesh.SetTriangles(tris, 0);
            for (int t = 0; t < tris.Count; t += 3)
            {   // keep every triangle facing up
                var n = Vector3.Cross(verts[tris[t + 1]] - verts[tris[t]], verts[tris[t + 2]] - verts[tris[t]]);
                if (n.y < 0f) (tris[t + 1], tris[t + 2]) = (tris[t + 2], tris[t + 1]);
            }
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            var go = new GameObject("Lawn");
            go.transform.SetParent(g, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = ModelLib.LitMat(Color.white, null, 0.05f);
        }

        // Painted wooden fence: posts, rails and boards in two warm tones.
        static void Fence(Transform g)
        {
            var fence = new GameObject("Fence").transform; fence.SetParent(g, false);
            Material board = Lam(0xb98a5a), post = Lam(0x8a6038);
            void Run(float x0, float z0, float x1, float z1)
            {
                float len = Mathf.Sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0)), rot = Mathf.Atan2(x1 - x0, z1 - z0);
                int n = Mathf.RoundToInt(len / 0.75f);
                for (int i = 0; i <= n; i++)
                {
                    float t = (float)i / n;
                    Box(fence, 0.62f, 5.2f + (i % 2) * 0.15f, 0.18f, i % 9 != 0 ? board : post, Mathf.Lerp(x0, x1, t), 2.6f, Mathf.Lerp(z0, z1, t), rot + Mathf.PI / 2f);
                }
                int m = Mathf.RoundToInt(len / 8f);
                for (int i = 0; i <= m; i++) { float t = (float)i / m; Box(fence, 0.5f, 6f, 0.5f, post, Mathf.Lerp(x0, x1, t), 3f, Mathf.Lerp(z0, z1, t)); }
            }
            Run(-26f, -46f, 26f, -46f); Run(-26f, -46f, -26f, 10f); Run(26f, -46f, 26f, 10f);
        }

        // The back of the family home, behind the thrower, with sliding doors and a stone patio.
        static void BackOfHouse(Transform g, float x, float z)
        {
            var h = Group(g, "House", x, z, 0f);
            float Wd = 64f, D = 34f, H = 22f;
            Material wall = Std(0xf2e6d0, 0.9f), trim = Lam(0xffffff), glass = Std(0x2c4660, 0.12f, 0.3f), siding = Lam(0xd8ccb4);
            Box(h, Wd, H, D, wall, 0f, H / 2f, 0f);
            for (float y = 1.5f; y < H; y += 1.1f) Box(h, Wd + 0.05f, 0.08f, D + 0.05f, siding, 0f, y, 0f);
            Roof(h, Wd + 3f, D * 0.66f, H, Std(0x4a4f58, 0.9f));
            Box(h, 4f, 10f, 4f, Lam(0x8a4a3a), Wd * 0.3f, H + 8f, 4f);   // brick chimney
            float back = -D / 2f - 0.05f;   // the side facing the yard
            Box(h, 14f, 8f, 0.3f, glass, -6f, 4.4f, back); Box(h, 14.8f, 0.6f, 0.4f, trim, -6f, 8.6f, back);   // sliding doors
            Box(h, 4f, 7.5f, 0.3f, Lam(0x2f4a6a), 14f, 3.9f, back);   // back door
            Box(h, 7f, 0.4f, 4f, trim, 14f, 8.6f, back - 2f);
            foreach (float wx in new[] { -24f, 24f }) Box(h, 6f, 5f, 0.3f, glass, wx, 5f, back);
            for (float wx = -24f; wx <= 24f; wx += 12f)
            {
                Box(h, 5f, 5f, 0.3f, glass, wx, 15.5f, back);
                foreach (float sx in new[] { -1f, 1f }) Box(h, 1.2f, 5.4f, 0.25f, Lam(0x3a4f6a), wx + sx * 3.2f, 15.5f, back - 0.1f);
            }
            Box(h, 36f, 0.08f, 14f, Lam(0xb8aea0), -2f, 0.04f, -D / 2f - 7f);   // stone patio
            for (float k = -16f; k <= 16f; k += 4f) Box(h, 0.15f, 0.02f, 14f, Lam(0x9a9080), k - 2f, 0.09f, -D / 2f - 7f);
            DeckTable(g, x - 8f, z - D / 2f - 7f, 77);
        }

        // A triangular roof along x: eaves at height y0, overhanging the walls (web: a 3-sided cylinder).
        static void Roof(Transform h, float length, float r, float y0, Material mat)
        {
            float half = length / 2f, apex = y0 + 0.75f * r, hw = 0.866f * r;
            Vector3 A(float x) => W(x, apex, 0f);
            Vector3 Lf(float x) => W(x, y0, hw);
            Vector3 Rt(float x) => W(x, y0, -hw);
            var v = new List<Vector3>(); var t = new List<int>();
            void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d)
            {
                int i = v.Count; v.AddRange(new[] { a, b, c, d });
                var n = Vector3.Cross(b - a, c - a);
                bool up = Vector3.Dot(n, (a + c) / 2f - W(0f, y0 + 0.25f * r, 0f)) > 0f;
                t.AddRange(up ? new[] { i, i + 1, i + 2, i, i + 2, i + 3 } : new[] { i, i + 2, i + 1, i, i + 3, i + 2 });
            }
            Quad(A(-half), A(half), Lf(half), Lf(-half));
            Quad(A(-half), Rt(-half), Rt(half), A(half));
            Quad(Lf(-half), Lf(half), Rt(half), Rt(-half));
            foreach (float x in new[] { -half, half })
            {
                int i = v.Count; v.AddRange(new[] { A(x), Lf(x), Rt(x) });
                bool outward = Vector3.Dot(Vector3.Cross(v[i + 1] - v[i], v[i + 2] - v[i]), Vector3.right * x) > 0f;
                t.AddRange(outward ? new[] { i, i + 1, i + 2 } : new[] { i, i + 2, i + 1 });
            }
            var mesh = new Mesh { name = "Roof" };
            mesh.SetVertices(v); mesh.SetTriangles(t, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
            var go = new GameObject("Roof"); go.transform.SetParent(h, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        }

        // A round table with four chairs.
        static void DeckTable(Transform g, float x, float z, int seed)
        {
            var r = new System.Random(seed);
            Material wood = Std(0x8a5a34, 0.8f), dark = Std(0x3a2a1c);
            var t = Group(g, "Table", x, z, 0f);
            Cyl(t, 1.7f, 0.2f, wood, 0f, 2.9f, 0f);
            Cyl(t, 0.25f, 2.8f, dark, 0f, 1.5f, 0f);
            for (int k = 0; k < 4; k++)
            {
                float a = k * Mathf.PI / 2f + 0.3f;
                var ch = Group(g, "Chair", x + Mathf.Sin(a) * 2.7f, z + Mathf.Cos(a) * 2.7f, a + Mathf.PI);
                Box(ch, 1.4f, 0.2f, 1.4f, wood, 0f, 1.5f, 0f);
                Box(ch, 1.4f, 1.8f, 0.2f, wood, 0f, 2.4f, -0.65f);
                foreach (var (lx, lz) in new[] { (-0.6f, -0.6f), (0.6f, -0.6f), (-0.6f, 0.6f), (0.6f, 0.6f) }) Box(ch, 0.15f, 1.5f, 0.15f, dark, lx, 0.75f, lz);
            }
            if (r.NextDouble() < 0.6) Cyl(t, 0.22f, 0.5f, Lam(0xffffff), 0.4f, 3.25f, -0.3f);   // a mug of cocoa
        }

        // Half a sphere (the grill's kettle and lid).
        static Mesh Dome(float radius, bool lower)
        {
            var v = new List<Vector3>(); var t = new List<int>();
            const int seg = 20, rings = 8;
            for (int j = 0; j <= rings; j++)
                for (int i = 0; i <= seg; i++)
                {
                    float phi = (lower ? -1f : 1f) * Mathf.PI / 2f * j / rings, th = Mathf.PI * 2f * i / seg;
                    v.Add(new Vector3(Mathf.Cos(phi) * Mathf.Sin(th), Mathf.Sin(phi), Mathf.Cos(phi) * Mathf.Cos(th)) * radius);
                    if (i < seg && j < rings) { int a = j * (seg + 1) + i; t.AddRange(lower ? new[] { a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2 } : new[] { a, a + 1, a + seg + 1, a + 1, a + seg + 2, a + seg + 1 }); }
                }
            var m = new Mesh(); m.SetVertices(v); m.SetTriangles(t, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }

        static Transform MeshAt(Transform p, Mesh mesh, Material mat, Vector3 localPos)
        {
            var go = new GameObject(mesh.name); go.transform.SetParent(p, false); go.transform.localPosition = localPos;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        static void Grill(Transform g, float x, float z, float rotY)
        {
            var k = Group(g, "Grill", x, z, rotY);
            var black = Std(0x1c1c1e, 0.4f, 0.6f);
            MeshAt(k, Dome(1.1f * M, true), black, W(0f, 3f, 0f));
            var lid = MeshAt(k, Dome(1.1f * M, false), black, W(0f, 3.45f, -0.9f));
            lid.localRotation = Quaternion.Euler(63f, 0f, 0f);   // propped open
            var coals = Cyl(k, 1.0f, 0.04f, Glow(new Color(1f, 0.42f, 0.1f), 2.5f), 0f, 2.95f, 0f);
            for (int i = 0; i < 3; i++)
            {
                float a = i * 2.1f;
                var leg = Cyl(k, 0.05f, 2.6f, Std(0x777777, 0.4f, 0.7f), Mathf.Cos(a) * 0.65f, 1.3f, Mathf.Sin(a) * 0.65f);
                leg.localRotation = Quaternion.Euler(Mathf.Sin(a) * 10f, 0f, Mathf.Cos(a) * 10f);
            }
            for (int i = 0; i < 5; i++)
            {
                var dog = Kit.Shape(PrimitiveType.Capsule, "Hot dog", k, W(-0.5f + i * 0.25f, 3.08f, (i % 2) * 0.3f - 0.15f), new Vector3(0.24f, 0.35f, 0.24f) * M, Lam(0x8a3a1a));
                dog.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
            }
            Smoke(k, W(0f, 3.4f, 0f), 4.5f, 3f);
        }

        static void Smoker(Transform g, float x, float z, float rotY)
        {
            var k = Group(g, "Smoker", x, z, rotY);
            Material black = Std(0x1e1e20, 0.45f, 0.6f), steel = Std(0x8a8f99, 0.4f, 0.7f);
            var body = Cyl(k, 1.1f, 4.2f, black, 0f, 3f, 0f); body.localRotation = Quaternion.Euler(0f, 0f, 90f);
            Box(k, 1.8f, 1.8f, 1.8f, black, 2.9f, 2.6f, 0f);
            Cyl(k, 0.25f, 3f, black, -1.8f, 4.9f, 0f);
            foreach (float sx in new[] { -1.6f, 1.6f }) foreach (float sz in new[] { -0.7f, 0.7f }) Cyl(k, 0.07f, 2.2f, steel, sx, 1.1f, sz);
            foreach (float sx in new[] { -1.6f, 1.6f }) { var w = Cyl(k, 0.4f, 0.2f, black, sx, 0.4f, 0.8f); w.localRotation = Quaternion.Euler(90f, 0f, 0f); }
            Box(k, 4f, 0.1f, 1.2f, steel, 0f, 1.9f, 0f);
            Smoke(k, W(-1.8f, 6.3f, 0f), 5f, 2f);
        }

        // Soft grey puffs that rise, spread and fade.
        static void Smoke(Transform parent, Vector3 localPos, float life, float rate)
        {
            var go = new GameObject("Smoke"); go.transform.SetParent(parent, false); go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.duration = 5f; main.loop = true;
            main.startLifetime = life; main.startSpeed = 0.35f; main.startSize = 0.45f;
            main.startColor = new Color(0.92f, 0.92f, 0.92f, 0.35f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 60;
            var em = ps.emission; em.rateOverTime = rate;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Cone; shape.angle = 8f; shape.radius = 0.1f;
            var vel = ps.velocityOverLifetime; vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World;
            vel.x = new ParticleSystem.MinMaxCurve(0.15f, 0.35f); vel.y = new ParticleSystem.MinMaxCurve(0.2f, 0.35f); vel.z = new ParticleSystem.MinMaxCurve(-0.1f, 0.1f);
            var size = ps.sizeOverLifetime; size.enabled = true; size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.6f, 1f, 3.5f));
            var col = ps.colorOverLifetime; col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, 0.15f), new GradientAlphaKey(0f, 1f) });
            col.color = grad;
            var r = go.GetComponent<ParticleSystemRenderer>();
            var mat = Kit.Unlit(Color.white);
            mat.mainTexture = SoftDot();
            r.sharedMaterial = mat;
            ps.Play();
        }

        static Texture2D softDot;
        static Texture2D SoftDot()
        {
            if (softDot != null) return softDot;
            const int n = 64;
            softDot = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(n / 2f, n / 2f)) / (n / 2f);
                    float a = Mathf.Clamp01(1f - d); a = a * a * (3f - 2f * a);
                    softDot.SetPixel(x, y, new Color(1f, 1f, 1f, a));
                }
            softDot.Apply();
            return softDot;
        }

        // Poles with sagging wires of warm bulbs that glow.
        static void StringLights(Transform g, (float, float)[] poles, ((float, float), (float, float))[] spans, float height, int density)
        {
            var lights = new GameObject("String lights").transform; lights.SetParent(g, false);
            var poleMat = Lam(0x3b2a1c);
            foreach (var (x, z) in poles) Cyl(lights, 0.14f, height + 0.4f, poleMat, x, (height + 0.4f) / 2f, z);
            var bulb = Glow(new Color(1f, 0.93f, 0.72f), 4f);
            var wireMat = Kit.Unlit(Hex(0x2a2018));
            foreach (var ((ax, az), (bx, bz)) in spans)
            {
                var pts = new Vector3[25];
                for (int k = 0; k <= 24; k++)
                {
                    float t = k / 24f;
                    pts[k] = W(Mathf.Lerp(ax, bx, t), height - 1.6f * 4f * t * (1f - t), Mathf.Lerp(az, bz, t));
                }
                var lr = new GameObject("Wire").AddComponent<LineRenderer>();
                lr.transform.SetParent(lights, false);
                lr.sharedMaterial = wireMat; lr.widthMultiplier = 0.012f; lr.positionCount = pts.Length; lr.SetPositions(pts);
                lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                for (int k = 2; k < 24; k += density)
                    Kit.Shape(PrimitiveType.Sphere, "Bulb", lights, pts[k] + Vector3.down * 0.25f * M, Vector3.one * 0.32f * M, bulb);
            }
        }
    }
}
