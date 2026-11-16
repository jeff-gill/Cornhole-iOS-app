using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // The throw, as in the web game: press anywhere and pull down for power. The arrow on the
    // ground swings side to side, faster the harder you pull. Let go with the power in the gold
    // band and the arrow straight. Pulling past the top (overdrive) makes the throw wild.
    public class ThrowController : MonoBehaviour
    {
        enum State { Ready, Pulling, Flying, RoundOver }

        const int BagsPerRound = 4;
        const float LaunchAngle = 35f;      // degrees above level
        const float MaxSwing = 6f;          // degrees either side
        const float GoldCenter = 0.78f, GoldHalf = 0.035f, Overdrive = 1.2f;
        const float SlideAllowance = 0.42f; // a perfect throw lands this far short of the hole and slides in

        Court court;
        Camera cam;
        State state;
        readonly Vector3 release = new Vector3(0.75f, 1.0f, -0.15f);
        float baseYaw, maxSpeed, phase, pull, swing;
        Vector2 pressAt;
        Transform arrow;
        Renderer[] arrowParts;
        Material arrowMat;
        GameObject heldBag;
        Material bagMat;
        readonly List<Bag> bags = new List<Bag>();
        readonly List<int> points = new List<int>();
        string toast;
        float toastUntil, waitUntil;

        public void Init(Court c)
        {
            court = c;

            cam = Camera.main;
            if (cam == null)
            {
                cam = new GameObject("Main Camera").AddComponent<Camera>();
                cam.tag = "MainCamera";
            }
            cam.fieldOfView = 50f;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 300f;
            cam.transform.position = new Vector3(0.45f, 1.75f, -2.6f);
            cam.transform.LookAt(new Vector3(0f, 0.2f, 6.2f));

            var hole = court.far.HoleWorld;
            baseYaw = Mathf.Atan2(hole.x - release.x, hole.z - release.z) * Mathf.Rad2Deg;
            float ideal = SpeedToReach(court.far.AlongTop(Board.HoleZ - SlideAllowance));
            maxSpeed = ideal / GoldCenter;

            bagMat = Kit.Mat(new Color(0.85f, 0.12f, 0.12f), null, 1f, 1f, 0.05f);
            BuildArrow();
            heldBag = Kit.Box("Bag in hand", null, release, new Vector3(Bag.Size, Bag.Thick, Bag.Size), bagMat);
            heldBag.transform.rotation = Quaternion.Euler(0f, baseYaw, 0f);
        }

        // Launch speed at LaunchAngle that carries the bag from the release point to a target point.
        float SpeedToReach(Vector3 target)
        {
            float d = new Vector2(target.x - release.x, target.z - release.z).magnitude;
            float h = target.y - release.y;
            float a = LaunchAngle * Mathf.Deg2Rad, cos = Mathf.Cos(a);
            float g = -Physics.gravity.y;
            return Mathf.Sqrt(g * d * d / (2f * cos * cos * (d * Mathf.Tan(a) - h)));
        }

        void BuildArrow()
        {
            arrow = new GameObject("Aim arrow").transform;
            arrow.position = new Vector3(release.x, 0.03f, release.z + 0.1f);
            arrowMat = Kit.Mat(Color.white, null, 1f, 1f, 0f);
            var shaft = Kit.Box("Shaft", arrow, new Vector3(0f, 0f, 1.6f), new Vector3(0.07f, 0.01f, 2.6f), arrowMat);
            var head = Kit.Box("Head", arrow, new Vector3(0f, 0f, 2.95f), new Vector3(0.24f, 0.01f, 0.24f), arrowMat, false, new Vector3(0f, 45f, 0f));
            arrowParts = new[] { shaft.GetComponent<Renderer>(), head.GetComponent<Renderer>() };
        }

        void Update()
        {
            switch (state)
            {
                case State.Ready:
                    phase += Time.deltaTime * 1.5f;
                    if (Input.GetMouseButtonDown(0))
                    {
                        pressAt = Input.mousePosition;
                        pull = 0f;
                        state = State.Pulling;
                    }
                    break;

                case State.Pulling:
                    pull = Mathf.Clamp((pressAt.y - Input.mousePosition.y) / (Screen.height * 0.3f), 0f, Overdrive);
                    phase += Time.deltaTime * (1.5f + 7f * pull);
                    if (Input.GetMouseButtonUp(0))
                    {
                        if (pull < 0.08f) state = State.Ready;   // just a tap: cancel
                        else Throw();
                    }
                    break;

                case State.Flying:
                    var bag = bags[bags.Count - 1];
                    if (bag.Settled && Time.time > waitUntil)
                    {
                        int p = bag.Points;
                        points.Add(p);
                        toast = p == 3 ? "CORNHOLE!  +3" : p == 1 ? "On the board  +1" : "Miss";
                        toastUntil = Time.time + 1.6f;
                        state = points.Count >= BagsPerRound ? State.RoundOver : State.Ready;
                    }
                    break;
            }

            swing = MaxSwing * Mathf.Sin(phase);
            bool aiming = state == State.Ready || state == State.Pulling;
            arrow.gameObject.SetActive(aiming);
            heldBag.SetActive(aiming);
            arrow.rotation = Quaternion.Euler(0f, baseYaw + swing, 0f);
            arrowMat.color = Mathf.Abs(swing) < 0.6f ? new Color(1f, 0.82f, 0.2f) : Color.white;
        }

        void Throw()
        {
            float speed = pull * maxSpeed, yaw = baseYaw + swing;
            if (pull > 1f)
            {
                // Overdrive: too much arm, the throw goes wild.
                speed *= Random.Range(0.92f, 1.08f);
                yaw += Random.Range(-5f, 5f);
            }
            var dir = Quaternion.Euler(-LaunchAngle, yaw, 0f) * Vector3.forward;
            var bag = Bag.Spawn(release, yaw, bagMat, court.bagSurface, court.far);
            bag.Launch(dir * speed, Random.Range(-3f, 3f));
            bags.Add(bag);
            pull = 0f;
            waitUntil = Time.time + 0.6f;
            state = State.Flying;
        }

        void NewRound()
        {
            foreach (var b in bags) Destroy(b.gameObject);
            bags.Clear();
            points.Clear();
            state = State.Ready;
        }

        // ---- On-screen display (simple for now; the full game screens come later) ----

        GUIStyle text;

        void OnGUI()
        {
            float W = Screen.width, H = Screen.height, u = Mathf.Min(W, H) / 100f;
            if (text == null) text = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            text.fontSize = Mathf.RoundToInt(u * 4.5f);

            int total = 0;
            foreach (var p in points) total += p;
            Label(new Rect(0, u * 3, W, u * 6), "BACKYARD BBQ", Color.white);
            text.fontSize = Mathf.RoundToInt(u * 3.8f);
            Label(new Rect(0, u * 9, W, u * 5), "Score " + total, new Color(1f, 0.85f, 0.3f));

            // Bags left this round.
            for (int i = 0; i < BagsPerRound; i++)
            {
                var r = new Rect(W / 2f - u * 13f + i * u * 7f, u * 15f, u * 5f, u * 5f);
                var c = i < points.Count ? new Color(0.4f, 0.4f, 0.4f, 0.7f) : new Color(0.85f, 0.12f, 0.12f);
                Fill(r, c);
                if (i < points.Count) Label(r, points[i].ToString(), Color.white);
            }

            // Power meter with the gold band and the overdrive zone.
            var m = new Rect(W - u * 10f, H * 0.3f, u * 5f, H * 0.42f);
            Fill(m, new Color(0f, 0f, 0f, 0.45f));
            float Y(float v) => m.yMax - m.height * v / Overdrive;
            Fill(Rect.MinMaxRect(m.xMin, Y(Overdrive), m.xMax, Y(1f)), new Color(0.85f, 0.15f, 0.15f, 0.6f));
            Fill(Rect.MinMaxRect(m.xMin, Y(GoldCenter + GoldHalf), m.xMax, Y(GoldCenter - GoldHalf)), new Color(1f, 0.78f, 0.15f, 0.95f));
            if (state == State.Pulling)
            {
                Color pc = pull > 1f ? new Color(1f, 0.3f, 0.3f) : Mathf.Abs(pull - GoldCenter) <= GoldHalf ? new Color(1f, 0.9f, 0.4f) : Color.white;
                Fill(new Rect(m.xMin - u, Y(pull) - u * 0.5f, m.width + 2f * u, u), pc);
            }

            text.fontSize = Mathf.RoundToInt(u * 3.4f);
            if (state == State.Ready) Label(new Rect(0, H - u * 14f, W, u * 6f), "Press and pull down to throw", Color.white);
            if (state == State.Pulling) Label(new Rect(0, H - u * 14f, W, u * 6f), "Let go in the gold band with the arrow straight", Color.white);

            if (Time.time < toastUntil)
            {
                text.fontSize = Mathf.RoundToInt(u * 7f);
                Label(new Rect(0, H * 0.38f, W, u * 10f), toast, toast == "Miss" ? Color.white : new Color(1f, 0.85f, 0.3f));
            }

            if (state == State.RoundOver && Time.time >= toastUntil)
            {
                text.fontSize = Mathf.RoundToInt(u * 6f);
                Label(new Rect(0, H * 0.36f, W, u * 9f), "Round over: " + total + (total == 1 ? " point" : " points"), Color.white);
                var b = new Rect(W / 2f - u * 22f, H * 0.36f + u * 12f, u * 44f, u * 11f);
                var bs = new GUIStyle(GUI.skin.button) { fontSize = Mathf.RoundToInt(u * 4.5f), fontStyle = FontStyle.Bold };
                if (GUI.Button(b, "THROW AGAIN", bs)) NewRound();
            }
        }

        void Label(Rect r, string s, Color c)
        {
            text.normal.textColor = new Color(0f, 0f, 0f, 0.6f);
            GUI.Label(new Rect(r.x + 2f, r.y + 2f, r.width, r.height), s, text);
            text.normal.textColor = c;
            GUI.Label(r, s, text);
        }

        static void Fill(Rect r, Color c) => GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, false, 0f, c, 0f, 0f);
    }

    public static class Bootstrap
    {
        // Runs when Play is pressed in any scene, so no scene file is needed yet.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartGame()
        {
            if (Object.FindFirstObjectByType<ThrowController>() != null) return;
            Time.fixedDeltaTime = 1f / 120f;
            Application.targetFrameRate = 60;
            var court = Court.BuildBackyard();
            new GameObject("Game").AddComponent<ThrowController>().Init(court);
        }
    }
}
