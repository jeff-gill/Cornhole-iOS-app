using UnityEngine;
#if UNITY_6000_0_OR_NEWER
using PhysMat = UnityEngine.PhysicsMaterial;
using PhysCombine = UnityEngine.PhysicsMaterialCombine;
#else
using PhysMat = UnityEngine.PhysicMaterial;
using PhysCombine = UnityEngine.PhysicMaterialCombine;
#endif

namespace CornholeThrowdown
{
    // Small helpers for building the court from code: materials, boxes, physics surfaces.
    public static class Kit
    {
        static Shader litShader;

        // The shader Unity puts on its own cubes. Using it means the game works in whichever
        // render pipeline the project ends up on, and the shader is always included in builds.
        static Shader Lit
        {
            get
            {
                if (litShader == null)
                {
                    var probe = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    litShader = probe.GetComponent<Renderer>().sharedMaterial.shader;
                    Object.DestroyImmediate(probe);
                }
                return litShader;
            }
        }

        public static Material Mat(Color color, string texture = null, float tileX = 1f, float tileY = 1f, float smooth = 0.08f)
        {
            var m = new Material(Lit) { color = color };
            if (texture != null)
            {
                var tex = Resources.Load<Texture2D>("Tex/" + texture + "_diff_1k");
                if (tex != null)
                {
                    m.mainTexture = tex;
                    m.mainTextureScale = new Vector2(tileX, tileY);
                }
            }
            m.SetFloat("_Glossiness", smooth);
            m.SetFloat("_Smoothness", smooth);
            return m;
        }

        public static GameObject Shape(PrimitiveType type, string name, Transform parent, Vector3 localPos, Vector3 size,
            Material mat, bool collide = false, Vector3? euler = null)
        {
            var g = GameObject.CreatePrimitive(type);
            g.name = name;
            if (parent != null) g.transform.SetParent(parent, false);
            g.transform.localPosition = localPos;
            g.transform.localRotation = Quaternion.Euler(euler ?? Vector3.zero);
            g.transform.localScale = size;
            g.GetComponent<Renderer>().sharedMaterial = mat;
            if (!collide) Object.DestroyImmediate(g.GetComponent<Collider>());
            return g;
        }

        public static GameObject Box(string name, Transform parent, Vector3 localPos, Vector3 size, Material mat,
            bool collide = false, Vector3? euler = null)
            => Shape(PrimitiveType.Cube, name, parent, localPos, size, mat, collide, euler);

        public static Vector3 Velocity(Rigidbody rb)
        {
#if UNITY_6000_0_OR_NEWER
            return rb.linearVelocity;
#else
            return rb.velocity;
#endif
        }

        public static void SetVelocity(Rigidbody rb, Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearVelocity = v;
#else
            rb.velocity = v;
#endif
        }

        public static void SetAngularDamping(Rigidbody rb, float d)
        {
#if UNITY_6000_0_OR_NEWER
            rb.angularDamping = d;
#else
            rb.angularDrag = d;
#endif
        }
    }

    // A physics surface (friction, no bounce) that can be put on colliders.
    public class Surface
    {
        readonly PhysMat mat;

        public Surface(string name, float dynamicFriction, float staticFriction, bool useHighest = false)
        {
            mat = new PhysMat(name)
            {
                dynamicFriction = dynamicFriction,
                staticFriction = staticFriction,
                bounciness = 0f,
                frictionCombine = useHighest ? PhysCombine.Maximum : PhysCombine.Average,
                bounceCombine = PhysCombine.Minimum,
            };
        }

        public void Apply(Collider c) => c.sharedMaterial = mat;
    }
}
