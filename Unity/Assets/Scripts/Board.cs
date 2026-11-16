using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // A regulation cornhole board: 2 ft x 4 ft top, front edge about 4" high, back 12" high,
    // a 6" hole 9" from the back. Built from code; the top is a real mesh with a round hole.
    public class Board : MonoBehaviour
    {
        public const float Width = 0.61f, Length = 1.22f;    // along the sloped top
        public const float FrontHeight = 0.10f, BackHeight = 0.305f;
        public const float HoleRadius = 0.0762f, HoleFromBack = 0.229f, Thickness = 0.018f;

        public static float SlopeDeg => Mathf.Asin((BackHeight - FrontHeight) / Length) * Mathf.Rad2Deg;
        public static float HoleZ => Length - HoleFromBack;  // distance from the front edge, along the top

        public Transform top;       // origin at the middle of the front edge, +z up the slope, +y out of the top
        public Collider topCollider;

        public Vector3 HoleWorld => top.TransformPoint(0f, 0f, HoleZ);
        public Vector3 AlongTop(float z) => top.TransformPoint(0f, 0f, z);

        public bool OverHole(Vector3 world)
        {
            var p = top.InverseTransformPoint(world);
            return p.y > -0.04f && p.y < 0.06f && new Vector2(p.x, p.z - HoleZ).magnitude < HoleRadius;
        }

        public static Board Build(string name, Vector3 frontCenter, float yawDeg, Material topMat, Material frameMat,
            Surface surface)
        {
            var root = new GameObject(name);
            root.transform.SetPositionAndRotation(frontCenter, Quaternion.Euler(0f, yawDeg, 0f));
            var board = root.AddComponent<Board>();

            var top = new GameObject("Top");
            top.transform.SetParent(root.transform, false);
            top.transform.localPosition = new Vector3(0f, FrontHeight, 0f);
            top.transform.localRotation = Quaternion.Euler(-SlopeDeg, 0f, 0f);
            board.top = top.transform;

            var topMesh = PlateMesh(0f, true);
            top.AddComponent<MeshFilter>().sharedMesh = topMesh;
            top.AddComponent<MeshRenderer>().sharedMaterial = topMat;
            var mc = top.AddComponent<MeshCollider>();
            mc.sharedMesh = topMesh;
            surface.Apply(mc);
            board.topCollider = mc;

            var under = new GameObject("Underside");
            under.transform.SetParent(top.transform, false);
            under.AddComponent<MeshFilter>().sharedMesh = PlateMesh(-Thickness, false);
            under.AddComponent<MeshRenderer>().sharedMaterial = topMat;

            // Frame: 2x4 rails under the edges of the top, tilted with it.
            float railH = 0.09f, railT = 0.04f, railY = -0.002f - railH / 2f;
            foreach (float side in new[] { -1f, 1f })
            {
                var rail = Kit.Box("Rail", top.transform, new Vector3(side * (Width / 2f - railT / 2f), railY, Length / 2f),
                    new Vector3(railT, railH, Length), frameMat, true);
                surface.Apply(rail.GetComponent<Collider>());
            }
            surface.Apply(Kit.Box("FrontRail", top.transform, new Vector3(0f, railY, railT / 2f),
                new Vector3(Width, railH, railT), frameMat, true).GetComponent<Collider>());
            surface.Apply(Kit.Box("BackRail", top.transform, new Vector3(0f, railY, Length - railT / 2f),
                new Vector3(Width, railH, railT), frameMat, true).GetComponent<Collider>());

            // Dark inside, so the hole looks like a hole. No collider: a sunk bag drops past it.
            Kit.Box("Inside", top.transform, new Vector3(0f, -0.075f, Length / 2f),
                new Vector3(Width - 2f * railT, 0.004f, Length - 2f * railT), Kit.Mat(new Color(0.08f, 0.06f, 0.05f)));

            // Back legs.
            float run = Length * Mathf.Cos(SlopeDeg * Mathf.Deg2Rad);
            float legH = BackHeight - 0.07f;
            foreach (float side in new[] { -1f, 1f })
                Kit.Box("Leg", root.transform, new Vector3(side * (Width / 2f - 0.06f), legH / 2f, run - 0.07f),
                    new Vector3(0.04f, legH, 0.06f), frameMat);
            return board;
        }

        // The top (or underside) of the board: a rectangle with a round hole, as a fan of quads
        // from the hole's edge out to the board's edge.
        static Mesh PlateMesh(float y, bool faceUp)
        {
            var angles = new List<float>();
            const int steps = 48;
            for (int i = 0; i < steps; i++) angles.Add(i * Mathf.PI * 2f / steps);
            foreach (var c in new[] { new Vector2(-Width / 2f, 0f), new Vector2(Width / 2f, 0f), new Vector2(-Width / 2f, Length), new Vector2(Width / 2f, Length) })
            {
                float a = Mathf.Atan2(c.y - HoleZ, c.x);
                if (a < 0f) a += Mathf.PI * 2f;
                angles.Add(a);
            }
            angles.Sort();

            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            foreach (float a in angles)
            {
                var d = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                var inner = d * HoleRadius;
                float t = float.MaxValue;
                if (Mathf.Abs(d.x) > 1e-5f) t = Mathf.Min(t, (d.x > 0f ? Width / 2f : -Width / 2f) / d.x);
                if (Mathf.Abs(d.y) > 1e-5f) t = Mathf.Min(t, (d.y > 0f ? Length - HoleZ : -HoleZ) / d.y);
                var outer = d * t;
                foreach (var p in new[] { inner, outer })
                {
                    verts.Add(new Vector3(p.x, y, p.y + HoleZ));
                    uvs.Add(new Vector2(p.x / Width + 0.5f, (p.y + HoleZ) / Length));
                }
            }

            var tris = new List<int>();
            int n = angles.Count;
            for (int i = 0; i < n; i++)
            {
                int j = (i + 1) % n;
                int a = i * 2, b = j * 2, c = j * 2 + 1, d = i * 2 + 1;
                AddTri(tris, verts, a, b, c, faceUp);
                AddTri(tris, verts, a, c, d, faceUp);
            }

            var mesh = new Mesh { name = faceUp ? "BoardTop" : "BoardUnderside" };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static void AddTri(List<int> tris, List<Vector3> v, int a, int b, int c, bool faceUp)
        {
            var normal = Vector3.Cross(v[b] - v[a], v[c] - v[a]);
            if (normal.sqrMagnitude < 1e-12f) return;
            if ((normal.y > 0f) != faceUp) (b, c) = (c, b);
            tris.Add(a); tris.Add(b); tris.Add(c);
        }
    }
}
