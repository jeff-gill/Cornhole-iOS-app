using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // A cornhole board built to the engine's measurements (2 ft wide, 4 ft deep, front 3" and back 12" high,
    // 6" hole 9" from the back), as in the web game's makeBoard(): a plywood top with a real hole, and the
    // Blender-made frame and splayed legs (web/tools/blender/board.py). Visual only: the engine does the physics.
    public static class Board
    {
        public const float M = 0.3048f;   // feet → metres
        static readonly Color FrameColor = new Color(0.12f, 0.23f, 0.43f);

        static float Width => (float)(Eng.HW * 2);
        static float Depth => (float)(Eng.BY - Eng.FY);
        static float HoleZ => (float)(Eng.HOLE.y - Eng.FY);
        static float Height(float z) => (float)(Eng.FH + z * (Eng.BH - Eng.FH) / (Eng.BY - Eng.FY));

        static Material topMat, frameMat, legMat, holeMat;

        // frontCenter in metres; yaw 0 = the top rises away from the thrower (+z). Inside, units are feet.
        public static Transform Build(string name, Vector3 frontCenter, float yawDeg)
        {
            if (topMat == null)
            {
                topMat = Kit.Mat(new Color(1f, 0.93f, 0.82f), "plywood", 0.5f, 1f, 0.25f);
                frameMat = ModelLib.LitMat(FrameColor, null, 0.3f);
                legMat = ModelLib.LitMat(new Color(0.61f, 0.44f, 0.24f), null, 0.15f);
                holeMat = Kit.Unlit(new Color(0.03f, 0.02f, 0.015f));
            }
            var root = new GameObject(name).transform;
            root.SetPositionAndRotation(frontCenter, Quaternion.Euler(0f, yawDeg, 0f));
            root.localScale = Vector3.one * M;

            var top = new GameObject("Top");
            top.transform.SetParent(root, false);
            top.AddComponent<MeshFilter>().sharedMesh = PlateMesh();
            top.AddComponent<MeshRenderer>().sharedMaterial = topMat;

            // The tilted frame (as the web game's "tilt" group): top surface at the board's slope.
            float slope = (float)Eng.Deg(Eng.SLOPE);
            var tilt = new GameObject("Tilt").transform;
            tilt.SetParent(root, false);
            tilt.localPosition = new Vector3(0f, (float)Eng.FH - 0.06f, 0f);
            tilt.localRotation = Quaternion.Euler(-slope, 0f, 0f);
            tilt.localScale = new Vector3(1f, 1f, 1f / (float)Eng.SC);

            var frame = Model(tilt, "board_frame", frameMat);
            var legs = Model(root, "board_legs", legMat);
            if (frame == null || legs == null)
            {   // models missing: simple 2x4s instead
                float L = Depth;
                foreach (float sx in new[] { -1f, 1f })
                    Kit.Box("Rail", tilt, new Vector3(sx * ((float)Eng.HW - 0.04f), -0.15f, L / 2f), new Vector3(0.08f, 0.3f, L), frameMat);
                Kit.Box("FrontRail", tilt, new Vector3(0f, -0.15f, 0.04f), new Vector3(Width, 0.3f, 0.08f), frameMat);
                Kit.Box("BackRail", tilt, new Vector3(0f, -0.15f, L - 0.04f), new Vector3(Width, 0.3f, 0.08f), frameMat);
                foreach (float sx in new[] { -1f, 1f })
                    Kit.Box("Leg", root, new Vector3(sx * ((float)Eng.HW - 0.12f), ((float)Eng.BH - 0.2f) / 2f, L - 0.4f), new Vector3(0.12f, (float)Eng.BH - 0.2f, 0.28f), legMat);
            }

            // The dark inside of the hole, just below the top.
            Kit.Shape(PrimitiveType.Cylinder, "Hole", tilt, new Vector3(0f, -0.17f, HoleZ), new Vector3((float)Eng.HR * 2f, 0.15f, (float)Eng.HR * 2f * (float)Eng.SC), holeMat);
            return root;
        }

        static Transform Model(Transform parent, string name, Material mat)
        {
            var p = ModelLib.Get(name);
            if (p == null) return null;
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = p.mesh;
            var mats = new Material[p.mats.Length];
            for (int i = 0; i < mats.Length; i++) mats[i] = mat;
            go.AddComponent<MeshRenderer>().sharedMaterials = mats;
            return go.transform;
        }

        // The top: a rectangle with a round hole, as a fan of quads from the hole's edge out to the board's edge.
        // Vertices sit on the sloped plane (in feet); the hole is round seen from above, as in the engine.
        static Mesh plate;
        static Mesh PlateMesh()
        {
            if (plate != null) return plate;
            float hr = (float)Eng.HR, W = Width, D = Depth, hz = HoleZ;
            var angles = new List<float>();
            const int steps = 64;
            for (int i = 0; i < steps; i++) angles.Add(i * Mathf.PI * 2f / steps);
            foreach (var c in new[] { new Vector2(-W / 2f, 0f), new Vector2(W / 2f, 0f), new Vector2(-W / 2f, D), new Vector2(W / 2f, D) })
            {
                float a = Mathf.Atan2(c.y - hz, c.x);
                if (a < 0f) a += Mathf.PI * 2f;
                angles.Add(a);
            }
            angles.Sort();

            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            foreach (float a in angles)
            {
                var d = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                float t = float.MaxValue;
                if (Mathf.Abs(d.x) > 1e-5f) t = Mathf.Min(t, (d.x > 0f ? W / 2f : -W / 2f) / d.x);
                if (Mathf.Abs(d.y) > 1e-5f) t = Mathf.Min(t, (d.y > 0f ? D - hz : -hz) / d.y);
                foreach (var p in new[] { d * hr, d * t })
                {
                    float z = p.y + hz;
                    verts.Add(new Vector3(p.x, Height(z), z));
                    uvs.Add(new Vector2(p.x / W + 0.5f, z / D));
                }
            }

            var tris = new List<int>();
            int n = angles.Count;
            for (int i = 0; i < n; i++)
            {
                int j = (i + 1) % n;
                AddTri(tris, verts, i * 2, j * 2, j * 2 + 1);
                AddTri(tris, verts, i * 2, j * 2 + 1, i * 2 + 1);
            }

            plate = new Mesh { name = "BoardTop" };
            plate.SetVertices(verts);
            plate.SetUVs(0, uvs);
            plate.SetTriangles(tris, 0);
            plate.RecalculateNormals();
            plate.RecalculateBounds();
            return plate;
        }

        static void AddTri(List<int> tris, List<Vector3> v, int a, int b, int c)
        {
            var normal = Vector3.Cross(v[b] - v[a], v[c] - v[a]);
            if (normal.sqrMagnitude < 1e-14f) return;
            if (normal.y < 0f) (b, c) = (c, b);
            tris.Add(a); tris.Add(b); tris.Add(c);
        }
    }
}
