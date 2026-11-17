using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Rendering;

namespace CornholeThrowdown
{
    // Loads the models converted by Tools/convert_models.py (Resources/Models/<name>.bytes) and places copies.
    // Positions given to Place() are the web game's three.js coordinates in feet (see W()).
    public static class ModelLib
    {
        public class Part { public Mesh mesh; public Material[] mats; }
        static readonly Dictionary<string, Part> cache = new Dictionary<string, Part>();
        static Shader lit;

        // three.js feet (x, y up, z toward the thrower) → Unity metres (x, y up, z down-range).
        public static Vector3 W(float x, float y, float z) => new Vector3(x, y, -z) * Board.M;
        // A three.js rotation about y (radians) as a Unity yaw.
        public static Quaternion Yaw(float rotY) => Quaternion.Euler(0f, -rotY * Mathf.Rad2Deg, 0f);

        public static Shader LitShader
        {
            get
            {
                if (lit == null) lit = Resources.Load<Shader>("Shaders/CornholeLit");
                return lit;
            }
        }

        public static Material LitMat(Color color, Texture tex = null, float smooth = 0.15f, float metal = 0f)
        {
            var sh = LitShader;
            if (sh == null) return Kit.Mat(color);
            var m = new Material(sh) { color = color, enableInstancing = true };
            if (tex != null) m.mainTexture = tex;
            m.SetFloat("_Glossiness", smooth);
            m.SetFloat("_Metallic", metal);
            return m;
        }

        public static Part Get(string name)
        {
            if (cache.TryGetValue(name, out var p)) return p;
            var asset = Resources.Load<TextAsset>("Models/" + name);
            p = asset != null ? Parse(asset.bytes, name) : null;
            cache[name] = p;
            return p;
        }

        static Part Parse(byte[] bytes, string name)
        {
            using var r = new BinaryReader(new MemoryStream(bytes));
            if (Encoding.ASCII.GetString(r.ReadBytes(4)) != "CHM1") return null;
            int subs = r.ReadInt32();
            var verts = new List<Vector3>(); var nrms = new List<Vector3>(); var cols = new List<Color>(); var uvs = new List<Vector2>();
            var tris = new List<List<int>>(); var mats = new List<Material>();
            for (int s = 0; s < subs; s++)
            {
                var color = new Color(r.ReadSingle(), r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                float metal = r.ReadSingle(), rough = r.ReadSingle();
                int alphaMode = r.ReadInt32(); float cutoff = r.ReadSingle(); bool twoSided = r.ReadInt32() != 0;
                string texName = Encoding.UTF8.GetString(r.ReadBytes(r.ReadInt32()));
                int nv = r.ReadInt32(), b0 = verts.Count;
                for (int i = 0; i < nv; i++) verts.Add(new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle()));
                for (int i = 0; i < nv; i++) nrms.Add(new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle()));
                for (int i = 0; i < nv; i++) cols.Add(new Color(r.ReadSingle(), r.ReadSingle(), r.ReadSingle(), r.ReadSingle()));
                for (int i = 0; i < nv; i++) uvs.Add(new Vector2(r.ReadSingle(), r.ReadSingle()));
                int ni = r.ReadInt32(); var idx = new List<int>(ni);
                for (int i = 0; i < ni; i++) idx.Add(b0 + r.ReadInt32());
                tris.Add(idx);

                Texture2D tex = texName.Length > 0 ? Resources.Load<Texture2D>("Models/Tex/" + texName) : null;
                // glTF colours are linear; Unity material colours are given in display (gamma) space.
                var m = LitMat(color.gamma, tex, Mathf.Clamp01(1f - rough) * 0.6f, metal * 0.3f);
                if (alphaMode == 1) { m.EnableKeyword("_ALPHATEST_ON"); m.SetFloat("_Cutoff", cutoff); }
                if (twoSided || name.Contains("tree") || name.Contains("bush") || name.Contains("grass") || name.Contains("flower") || name.Contains("plant"))
                    m.SetFloat("_Cull", 0f);
                mats.Add(m);
            }
            var mesh = new Mesh { name = name };
            if (verts.Count > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(verts); mesh.SetNormals(nrms); mesh.SetColors(cols); mesh.SetUVs(0, uvs);
            mesh.subMeshCount = tris.Count;
            for (int s = 0; s < tris.Count; s++) mesh.SetTriangles(tris[s], s);
            mesh.RecalculateBounds();
            return new Part { mesh = mesh, mats = mats.ToArray() };
        }

        // A copy of a model. x, z in three.js feet; scale converts the model's own units (most are metres).
        public static Transform Place(Transform parent, string name, float x, float z, float rotY, float scale, float y = 0f)
        {
            var p = Get(name);
            if (p == null) return null;
            var g = new GameObject(name);
            g.transform.SetParent(parent, false);
            g.transform.localPosition = W(x, y, z);
            g.transform.localRotation = Yaw(rotY);
            g.transform.localScale = Vector3.one * scale;
            g.AddComponent<MeshFilter>().sharedMesh = p.mesh;
            var mr = g.AddComponent<MeshRenderer>();
            mr.sharedMaterials = p.mats;
            mr.shadowCastingMode = ShadowCastingMode.On;
            return g.transform;
        }
    }

    // Draws many copies of small models (grass tufts, flowers) cheaply with GPU instancing.
    public class Scatter : MonoBehaviour
    {
        readonly Dictionary<string, List<Matrix4x4>> sets = new Dictionary<string, List<Matrix4x4>>();

        public void Add(string name, Vector3 pos, float yawDeg, float scale)
        {
            if (!sets.TryGetValue(name, out var list)) sets[name] = list = new List<Matrix4x4>();
            list.Add(Matrix4x4.TRS(pos, Quaternion.Euler(0f, yawDeg, 0f), Vector3.one * scale));
        }

        void LateUpdate()
        {
            foreach (var kv in sets)
            {
                var p = ModelLib.Get(kv.Key);
                if (p == null) continue;
                for (int s = 0; s < p.mats.Length; s++)
                {
                    var rp = new RenderParams(p.mats[s]) { shadowCastingMode = ShadowCastingMode.On, receiveShadows = true };
                    for (int i = 0; i < kv.Value.Count; i += 1023)
                        Graphics.RenderMeshInstanced(rp, p.mesh, s, kv.Value, Mathf.Min(1023, kv.Value.Count - i), i);
                }
            }
        }
    }
}
