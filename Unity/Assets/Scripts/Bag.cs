using UnityEngine;

namespace CornholeThrowdown
{
    // A 6" x 6" bean bag. Beanbags don't bounce, so the first hit soaks up most of the speed
    // and the bag slides a little. A bag whose middle reaches the hole drops in.
    public class Bag : MonoBehaviour
    {
        public const float Size = 0.152f, Thick = 0.032f, Mass = 0.45f;
        const float Thud = 0.35f;   // share of sliding speed kept on landing

        public Board target;
        public bool InHole { get; private set; }
        public bool Settled { get; private set; }

        Rigidbody rb;
        Collider col;
        float age, stillFor;
        bool touchingTarget, touchingOther, onTarget, offTarget;

        public static Bag Spawn(Vector3 pos, float yaw, Material mat, Surface surface, Board target)
        {
            var g = Kit.Box("Bag", null, pos, new Vector3(Size, Thick, Size), mat, true, new Vector3(0f, yaw, 0f));
            surface.Apply(g.GetComponent<Collider>());
            var rb = g.AddComponent<Rigidbody>();
            rb.mass = Mass;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            Kit.SetAngularDamping(rb, 1.5f);
            var bag = g.AddComponent<Bag>();
            bag.target = target;
            return bag;
        }

        void Awake()
        {
            rb = GetComponent<Rigidbody>();
            col = GetComponent<Collider>();
        }

        public void Launch(Vector3 velocity, float spin)
        {
            Kit.SetVelocity(rb, velocity);
            rb.angularVelocity = new Vector3(0f, spin, 0f);
        }

        // 3 in the hole, 1 resting on the target board without touching the ground, else 0.
        public int Points => InHole ? 3 : (onTarget && !offTarget ? 1 : 0);

        void FixedUpdate()
        {
            onTarget = touchingTarget;
            offTarget = touchingOther;
            touchingTarget = touchingOther = false;

            age += Time.fixedDeltaTime;
            if (!InHole && target.OverHole(transform.position))
            {
                InHole = true;
                Physics.IgnoreCollision(col, target.topCollider, true);
            }

            bool still = Kit.Velocity(rb).magnitude < 0.03f && rb.angularVelocity.magnitude < 0.3f;
            stillFor = still ? stillFor + Time.fixedDeltaTime : 0f;
            if ((stillFor > 0.35f && age > 0.5f) || age > 9f || transform.position.y < -2f) Settled = true;
        }

        void OnCollisionEnter(Collision c)
        {
            if (c.rigidbody != null || c.contactCount == 0) return;   // other bags push normally
            var n = c.GetContact(0).normal;
            var v = Kit.Velocity(rb);
            var slide = v - Vector3.Project(v, n);
            Kit.SetVelocity(rb, slide * Thud);
            rb.angularVelocity *= 0.3f;
        }

        void OnCollisionStay(Collision c)
        {
            if (c.rigidbody != null)
            {
                // Resting on a bag that's on the board counts as on the board.
                var other = c.rigidbody.GetComponent<Bag>();
                if (other != null && !other.InHole && other.Points > 0) touchingTarget = true;
                return;
            }
            if (c.collider.GetComponentInParent<Board>() == target) touchingTarget = true;
            else touchingOther = true;
        }
    }
}
