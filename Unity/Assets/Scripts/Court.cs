using UnityEngine;

namespace CornholeThrowdown
{
    // Court 1, Backyard BBQ: a sunny fenced yard, built all the way around (360°).
    // Boards face each other 27 ft apart (front edge to front edge), along +z.
    public class Court
    {
        public const float BoardGap = 8.23f;
        public Board near, far;
        public Surface bagSurface;

        public static Court BuildBackyard()
        {
            var court = new Court();
            var root = new GameObject("Backyard BBQ").transform;

            // Replace the default scene light with a warm afternoon sun.
            foreach (var old in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) Object.Destroy(old.gameObject);
            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.96f, 0.88f);
            sun.intensity = 1.15f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.75f;
            sun.transform.rotation = Quaternion.Euler(48f, -35f, 0f);
            RenderSettings.sun = sun;
            QualitySettings.shadowDistance = 45f;

            var boardSurface = new Surface("Board", 0.32f, 0.40f);
            var grassSurface = new Surface("Grass", 1.2f, 1.4f, true);
            court.bagSurface = new Surface("Bag", 0.5f, 0.6f);

            // Lawn.
            var ground = Kit.Shape(PrimitiveType.Plane, "Ground", root, new Vector3(0f, 0f, 4f), new Vector3(9f, 1f, 9f),
                Kit.Mat(new Color(0.78f, 0.92f, 0.62f), "sparse_grass", 30f, 30f), true);
            grassSurface.Apply(ground.GetComponent<Collider>());

            // Boards: the player's at the near end (facing away), the target 27 ft away facing back.
            var wood = Kit.Mat(new Color(1f, 0.93f, 0.82f), "plywood");
            court.near = Board.Build("Near board", Vector3.zero, 180f, wood, Kit.Mat(new Color(0.75f, 0.16f, 0.14f)), boardSurface);
            court.far = Board.Build("Target board", new Vector3(0f, 0f, BoardGap), 0f, wood, Kit.Mat(new Color(0.16f, 0.32f, 0.72f)), boardSurface);

            BuildFence(root);
            BuildHouses(root);
            BuildPatio(root);
            BuildTrees(root);
            return court;
        }

        static void BuildFence(Transform root)
        {
            var planks = Kit.Mat(new Color(0.95f, 0.85f, 0.72f), "weathered_brown_planks", 6f, 1f);
            var post = Kit.Mat(new Color(0.42f, 0.30f, 0.20f));
            const float half = 15f, cz = 4f, h = 1.8f;
            var fence = new GameObject("Fence").transform;
            fence.SetParent(root, false);
            for (int side = 0; side < 4; side++)
            {
                var s = new GameObject("Side").transform;
                s.SetParent(fence, false);
                s.localPosition = new Vector3(0f, 0f, cz);
                s.localRotation = Quaternion.Euler(0f, side * 90f, 0f);
                Kit.Box("Panel", s, new Vector3(0f, h / 2f, half), new Vector3(half * 2f, h, 0.05f), planks, true);
                for (float x = -half; x <= half + 0.01f; x += 2.5f)
                    Kit.Box("Post", s, new Vector3(x, h / 2f + 0.05f, half - 0.06f), new Vector3(0.1f, h + 0.1f, 0.1f), post);
            }
        }

        static void BuildHouses(Transform root)
        {
            var stucco = Kit.Mat(new Color(0.98f, 0.95f, 0.88f), "white_stucco", 3f, 2f);
            var stuccoBlue = Kit.Mat(new Color(0.72f, 0.84f, 0.95f), "white_stucco", 3f, 2f);
            var brick = Kit.Mat(Color.white, "red_brick_03", 4f, 2f);
            var roof = Kit.Mat(new Color(0.36f, 0.24f, 0.2f));
            var roofGrey = Kit.Mat(new Color(0.32f, 0.34f, 0.38f));
            var glass = Kit.Mat(new Color(0.35f, 0.5f, 0.65f), null, 1f, 1f, 0.7f);
            var trim = Kit.Mat(Color.white);

            // The family home behind the target board, and neighbours all around.
            House(root, new Vector3(0f, 0f, 25f), 0f, new Vector3(16f, 5.5f, 9f), stucco, roof, glass, trim);
            House(root, new Vector3(-26f, 0f, 6f), -90f, new Vector3(14f, 5f, 9f), brick, roofGrey, glass, trim);
            House(root, new Vector3(26f, 0f, 2f), 90f, new Vector3(12f, 5f, 9f), stuccoBlue, roof, glass, trim);
            House(root, new Vector3(-4f, 0f, -22f), 180f, new Vector3(15f, 5.5f, 9f), brick, roof, glass, trim);
            House(root, new Vector3(20f, 0f, -20f), 140f, new Vector3(10f, 4.5f, 8f), stucco, roofGrey, glass, trim);
        }

        // A simple house; its front faces the yard (local -z).
        static void House(Transform root, Vector3 pos, float yaw, Vector3 size, Material walls, Material roofMat, Material glass, Material trim)
        {
            var h = new GameObject("House").transform;
            h.SetParent(root, false);
            h.localPosition = pos;
            h.localRotation = Quaternion.Euler(0f, yaw, 0f);
            Kit.Box("Walls", h, new Vector3(0f, size.y / 2f, 0f), size, walls);
            float pitch = 30f, halfD = size.z / 2f + 0.5f, slope = halfD / Mathf.Cos(pitch * Mathf.Deg2Rad);
            float rise = halfD * Mathf.Tan(pitch * Mathf.Deg2Rad);
            foreach (float side in new[] { -1f, 1f })
                Kit.Box("Roof", h, new Vector3(0f, size.y + rise / 2f, side * halfD / 2f),
                    new Vector3(size.x + 1f, 0.18f, slope), roofMat, false, new Vector3(side * pitch, 0f, 0f));
            Kit.Box("Gable", h, new Vector3(0f, size.y + rise * 0.3f, 0f), new Vector3(size.x - 0.05f, rise * 0.6f, size.z * 0.55f), walls);
            float front = size.z / 2f + 0.02f;
            for (float x = -size.x / 2f + 2f; x < size.x / 2f - 1f; x += 3.2f)
            {
                if (Mathf.Abs(x) < 1.2f) continue;
                Kit.Box("WindowFrame", h, new Vector3(x, size.y * 0.55f, -front), new Vector3(1.5f, 1.4f, 0.04f), trim);
                Kit.Box("Window", h, new Vector3(x, size.y * 0.55f, -front - 0.02f), new Vector3(1.3f, 1.2f, 0.04f), glass);
            }
            Kit.Box("Door", h, new Vector3(0f, 1.05f, -front), new Vector3(1.1f, 2.1f, 0.06f), Kit.Mat(new Color(0.55f, 0.18f, 0.14f)));
        }

        static void BuildPatio(Transform root)
        {
            var patio = new GameObject("Patio").transform;
            patio.SetParent(root, false);
            patio.localPosition = new Vector3(-8f, 0f, 14f);
            Kit.Box("Bricks", patio, new Vector3(0f, 0.01f, 0f), new Vector3(8f, 0.02f, 6f), Kit.Mat(Color.white, "herringbone_brick", 4f, 3f));

            // Picnic table and benches.
            var tableWood = Kit.Mat(new Color(0.62f, 0.42f, 0.26f), "weathered_brown_planks", 1f, 1f);
            Kit.Box("Table", patio, new Vector3(0f, 0.75f, 0f), new Vector3(1.9f, 0.06f, 0.8f), tableWood);
            foreach (float s in new[] { -1f, 1f })
            {
                Kit.Box("Bench", patio, new Vector3(0f, 0.45f, s * 0.7f), new Vector3(1.9f, 0.05f, 0.28f), tableWood);
                Kit.Box("Legs", patio, new Vector3(s * 0.75f, 0.37f, 0f), new Vector3(0.06f, 0.74f, 1.6f), tableWood);
            }

            // The BBQ grill.
            var black = Kit.Mat(new Color(0.08f, 0.08f, 0.09f), null, 1f, 1f, 0.45f);
            var grill = new GameObject("Grill").transform;
            grill.SetParent(patio, false);
            grill.localPosition = new Vector3(2.8f, 0f, -1.5f);
            Kit.Shape(PrimitiveType.Sphere, "Bowl", grill, new Vector3(0f, 0.9f, 0f), new Vector3(0.6f, 0.45f, 0.6f), black);
            Kit.Shape(PrimitiveType.Cylinder, "Handle", grill, new Vector3(0f, 1.13f, 0f), new Vector3(0.05f, 0.02f, 0.05f), black);
            for (int i = 0; i < 3; i++)
            {
                float a = i * 120f * Mathf.Deg2Rad;
                Kit.Shape(PrimitiveType.Cylinder, "Leg", grill, new Vector3(Mathf.Cos(a) * 0.2f, 0.36f, Mathf.Sin(a) * 0.2f),
                    new Vector3(0.03f, 0.36f, 0.03f), black, false, new Vector3(Mathf.Sin(a) * 10f, 0f, -Mathf.Cos(a) * 10f));
            }

            // Lawn chairs by the court.
            var chair = Kit.Mat(new Color(0.15f, 0.55f, 0.65f));
            foreach (var p in new[] { new Vector3(3.2f, 0f, 1.5f), new Vector3(-3.2f, 0f, 6.5f), new Vector3(3.4f, 0f, 9.5f) })
            {
                var c = new GameObject("Chair").transform;
                c.SetParent(root, false);
                c.localPosition = p;
                c.localRotation = Quaternion.Euler(0f, p.x > 0f ? 90f : -90f, 0f);
                Kit.Box("Seat", c, new Vector3(0f, 0.4f, 0f), new Vector3(0.55f, 0.05f, 0.5f), chair);
                Kit.Box("Back", c, new Vector3(0f, 0.68f, 0.25f), new Vector3(0.55f, 0.55f, 0.05f), chair, false, new Vector3(-12f, 0f, 0f));
                Kit.Box("Frame", c, new Vector3(0f, 0.2f, 0f), new Vector3(0.5f, 0.4f, 0.45f), Kit.Mat(new Color(0.85f, 0.85f, 0.85f)));
            }
        }

        static void BuildTrees(Transform root)
        {
            var bark = Kit.Mat(new Color(0.38f, 0.27f, 0.18f));
            var leaves = new[]
            {
                Kit.Mat(new Color(0.24f, 0.52f, 0.2f)), Kit.Mat(new Color(0.3f, 0.6f, 0.22f)), Kit.Mat(new Color(0.2f, 0.45f, 0.24f)),
            };
            var rng = new System.Random(7);
            float R(float a, float b) => a + (float)rng.NextDouble() * (b - a);

            // A ring of trees all the way around the yard, plus a couple inside it.
            for (int i = 0; i < 22; i++)
            {
                float ang = i / 22f * Mathf.PI * 2f + R(-0.1f, 0.1f), dist = R(18f, 24f);
                var p = new Vector3(Mathf.Sin(ang) * dist, 0f, 4f + Mathf.Cos(ang) * dist);
                if (Mathf.Abs(p.x) < 9f && p.z > 19f) continue;   // keep the home's front clear
                Tree(root, p, R(4.5f, 7.5f), leaves[i % 3], bark, rng);
            }
            Tree(root, new Vector3(-10f, 0f, -6f), 6.5f, leaves[0], bark, rng);
            Tree(root, new Vector3(11f, 0f, 15f), 7f, leaves[1], bark, rng);

            var shrub = Kit.Mat(new Color(0.26f, 0.5f, 0.22f));
            for (float x = -13f; x <= 13f; x += 3.3f)
                Kit.Shape(PrimitiveType.Sphere, "Shrub", root, new Vector3(x, 0.45f, 18.3f), new Vector3(1.4f, 1f, 1.1f), shrub);
        }

        static void Tree(Transform root, Vector3 pos, float height, Material leaf, Material bark, System.Random rng)
        {
            var t = new GameObject("Tree").transform;
            t.SetParent(root, false);
            t.localPosition = pos;
            float trunk = height * 0.45f;
            Kit.Shape(PrimitiveType.Cylinder, "Trunk", t, new Vector3(0f, trunk / 2f, 0f), new Vector3(0.35f, trunk / 2f, 0.35f), bark);
            for (int i = 0; i < 4; i++)
            {
                float s = height * (0.45f + (float)rng.NextDouble() * 0.2f);
                var off = new Vector3(((float)rng.NextDouble() - 0.5f) * height * 0.3f, trunk + height * 0.18f + i * height * 0.08f,
                    ((float)rng.NextDouble() - 0.5f) * height * 0.3f);
                Kit.Shape(PrimitiveType.Sphere, "Leaves", t, off, new Vector3(s, s * 0.85f, s), leaf);
            }
        }
    }
}
