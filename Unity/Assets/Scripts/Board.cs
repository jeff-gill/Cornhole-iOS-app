using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // A cornhole board built to the engine's measurements (Eng: 2 ft wide, 4 ft deep, front 3" and back 12" high,
    // 6" hole 9" from the back). Visual only: the engine does the physics.
    public static class Board
    {
        public const float M = 0.3048f;   // feet → metres

        static float Width => (float)(Eng.HW * 2);
        static float Depth => (float)(Eng.BY - Eng.FY);
        static float HoleZ => (float)(Eng.HOLE.y - Eng.FY);
        static float Height(float z) => (float)(Eng.FH + z * (Eng.BH - Eng.FH) / (Eng.BY - Eng.FY));

        // frontCenter in metres; yaw 0 = the top rises away from the thrower (+z).
        public static Transform Build(string name, Vector3 frontCenter, float yawDeg, Material topMat, Material frameMat, Material insideMat)
        {
            var root = new GameObject(name).transform;
            root.SetPositionAndRotation(frontCenter, Quaternion.Euler(0f, yawDeg, 0f));

            var top = new GameObject("Top");
            top.transform.SetParent(root, false);
            top.AddComponent<MeshFilter>().sharedMesh = PlateMesh();
            top.AddComponent<MeshRenderer>().sharedMaterial = topMat;

            float slope = Mathf.Atan2((float)(Eng.BH - Eng.FH), Depth) * Mathf.Rad2Deg;
            float slopeLen = Mathf.Sqrt(Depth * Depth + Mathf.Pow((float)(Eng.BH - Eng.FH), 2f));
            float midH = Height(Depth / 2f);
            float railH = 0.3f, railT = 0.15f;   // 2x4 rails, in feet

            // Frame rails under the edges of the top, tilted with it.
            var frame = new GameObject("Frame").transform;
            frame.SetParent(root, false);
            frame.localPosition = new Vector3(0f, (midH - railH / 2f - 0.005f) * M, Depth / 2f * M);
            frame.localRotation = Quaternion.Euler(-slope, 0f, 0f);
            foreach (float side in new[] { -1f, 1f })
                Kit.Box("Rail", frame, new Vector3(side * (Width / 2f - railT / 2f), 0f, 0f) * M, new Vector3(railT, railH, slopeLen) * M, frameMat);
            Kit.Box("FrontRail", frame, new Vector3(0f, 0f, -slopeLen / 2f + railT / 2f) * M, new Vector3(Width, railH, railT) * M, frameMat);
            Kit.Box("BackRail", frame, new Vector3(0f, 0f, slopeLen / 2f - railT / 2f) * M, new Vector3(Width, railH, railT) * M, frameMat);
            Kit.Box("Inside", frame, new Vector3(0f, -railH * 0.3f, 0f) * M, new Vector3(Width - 2f * railT, 0.02f, slopeLen - 2f * railT) * M, insideMat);

            // Back legs.
            float legH = (float)Eng.BH - railH;
            foreach (float side in new[] { -1f, 1f })
                Kit.Box("Leg", root, new Vector3(side * (Width / 2f - 0.25f), legH / 2f, Depth - 0.25f) * M, new Vector3(0.15f, legH, 0.3f) * M, frameMat);
            return root;
        }

        // The top: a rectangle with a round hole, as a fan of quads from the hole's edge out to the board's edge.
        // Vertices sit on the sloped plane; the hole is round seen from above, as in the engine.
        static Mesh PlateMesh()
        {
            float hr = (float)Eng.HR, W = Width, D = Depth, hz = HoleZ;
            var angles = new List<float>();
            const int steps = 48;
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
                    verts.Add(new Vector3(p.x, Height(z), z) * M);
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

            var mesh = new Mesh { name = "BoardTop" };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
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
