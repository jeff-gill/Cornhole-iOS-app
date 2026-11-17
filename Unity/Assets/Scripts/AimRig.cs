using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // The throw's arrow and power ring lying on the lane in front of the thrower (web/src/g3b_aim.js).
    // The ring reads like a clock seen from behind the thrower: 12 o'clock points at the board and it fills
    // clockwise. White blends to bright green up to the sweet spot, which ends at 6 o'clock between two lines;
    // past it the ring goes yellow, orange, then red (overdrive). The arrow swings with the aim and turns the
    // ring's colour; the green wedge is the straight zone.
    public partial class Match
    {
        const float AIM_VIS = 16f;   // on-screen swing (degrees) for a full-scale direction miss
        const int RING_N = 180;
        static readonly float[][] RingBands =
        {
            new[] { 0.93f, 1.0f, 0f }, new[] { 1.0f, 1.08f, 1f }, new[] { 1.08f, 1.42f, 2f }, new[] { 1.42f, 1.5f, 1f }, new[] { 1.5f, 1.57f, 0f },
        };   // inner radius, outer radius, kind (0 dark edge, 1 white rim, 2 power)
        static readonly Color Navy = new Color(0.04f, 0.08f, 0.15f);

        Transform aimRig, aimBase, aimSwing;
        Mesh ringMesh;
        Color[] ringColors;
        MeshFilter[] arrowLayers;
        Material[] arrowMats;
        float arrowLen = -1f, aimFireT;

        void BuildAimRig()
        {
            aimRig = new GameObject("Aim rig").transform;
            aimRig.localScale = Vector3.one * Board.M;   // everything inside is in feet
            aimBase = new GameObject("Base").transform; aimBase.SetParent(aimRig, false);
            aimSwing = new GameObject("Swing").transform; aimSwing.SetParent(aimBase, false);

            // Straight zone wedge (doesn't swing).
            float za = Mathf.Max(0.006f, (float)L.zone * AIM_VIS * Mathf.Deg2Rad);
            var wv = new List<Vector3> { Vector3.zero }; var wt = new List<int>();
            for (int i = 0; i <= 12; i++) { float a = -za + 2f * za * i / 12f; wv.Add(new Vector3(Mathf.Sin(a) * 19f, 0f, Mathf.Cos(a) * 19f)); if (i < 12) wt.AddRange(new[] { 0, i + 1, i + 2 }); }
            var wm = new Mesh(); wm.SetVertices(wv); wm.SetTriangles(wt, 0);
            MeshObject("Straight zone", wm, Kit.Unlit(new Color(Go.r, Go.g, Go.b, 0.16f))).SetParent(aimBase, false);

            // Power ring.
            var verts = new List<Vector3>(); var tris = new List<int>();
            foreach (var band in RingBands)
                for (int i = 0; i < RING_N; i++)
                {
                    float a0 = i * Mathf.PI * 2f / RING_N, a1 = (i + 1) * Mathf.PI * 2f / RING_N;
                    int b = verts.Count;
                    verts.Add(new Vector3(Mathf.Sin(a0) * band[0], 0f, Mathf.Cos(a0) * band[0]));
                    verts.Add(new Vector3(Mathf.Sin(a1) * band[0], 0f, Mathf.Cos(a1) * band[0]));
                    verts.Add(new Vector3(Mathf.Sin(a1) * band[1], 0f, Mathf.Cos(a1) * band[1]));
                    verts.Add(new Vector3(Mathf.Sin(a0) * band[1], 0f, Mathf.Cos(a0) * band[1]));
                    tris.AddRange(new[] { b, b + 2, b + 1, b, b + 3, b + 2 });
                }
            ringMesh = new Mesh { name = "PowerRing" };
            ringMesh.SetVertices(verts); ringMesh.SetTriangles(tris, 0); ringMesh.RecalculateBounds();
            ringColors = new Color[verts.Count];
            var ring = MeshObject("Power ring", ringMesh, Kit.Unlit(Color.white));
            ring.SetParent(aimBase, false);
            ring.localPosition = new Vector3(0f, 0.04f, 0f);

            // Arrow: dark outline, white edge, coloured middle, stacked a hair apart.
            var layerCols = new[] { new Color(Navy.r, Navy.g, Navy.b, 0.6f), Color.white, Color.white };
            arrowLayers = new MeshFilter[3]; arrowMats = new Material[3];
            for (int k = 0; k < 3; k++)
            {
                arrowMats[k] = Kit.Unlit(layerCols[k]);
                var t = MeshObject("Arrow layer", new Mesh(), arrowMats[k]);
                t.SetParent(aimSwing, false);
                t.localPosition = new Vector3(0f, 0.06f + k * 0.02f, 0f);
                arrowLayers[k] = t.GetComponent<MeshFilter>();
            }
            aimRig.gameObject.SetActive(false);
        }

        // A flat arrow pointing down-range (+z): shaft half-width w, head half-width hw and length hl.
        static void ArrowShape(Mesh m, float len, float w, float hw, float hl, float y0)
        {
            m.Clear();
            m.SetVertices(new List<Vector3>
            {
                new Vector3(-w, 0f, y0), new Vector3(w, 0f, y0), new Vector3(w, 0f, len), new Vector3(hw, 0f, len),
                new Vector3(0f, 0f, len + hl), new Vector3(-hw, 0f, len), new Vector3(-w, 0f, len),
            });
            m.SetTriangles(new[] { 0, 6, 2, 0, 2, 1, 5, 4, 3 }, 0);
            m.RecalculateBounds();
        }

        void SetArrowLength(float len)
        {
            if (Mathf.Abs(len - arrowLen) < 0.03f) return;
            arrowLen = len;
            float[] pads = { 0.24f, 0.14f, 0f };
            for (int k = 0; k < 3; k++)
            {
                float p = pads[k];
                ArrowShape(arrowLayers[k].sharedMesh, len, 0.36f + p, 0.95f + p * 1.6f, 1.35f + p * 1.3f, -p);
            }
        }

        static Color Ramp(float a)
        {
            Color white = Color.white, green = new Color(0.55f, 0.92f, 0.55f), bright = new Color(0.1f, 1f, 0.35f);
            Color lemon = new Color(1f, 0.96f, 0.55f), orange = new Color(1f, 0.58f, 0.12f), red = new Color(1f, 0.13f, 0.1f);
            if (a < 0.5f) return a < 0.25f ? Color.Lerp(white, green, a / 0.25f) : Color.Lerp(green, bright, (a - 0.25f) / 0.25f);
            return a < 0.75f ? Color.Lerp(lemon, orange, (a - 0.5f) / 0.25f) : Color.Lerp(orange, red, (a - 0.75f) / 0.25f);
        }

        // Fill → fraction of the circle. The sweet spot (target ± band) ends exactly at 6 o'clock (0.5).
        static float RingFrac(double f, double band)
        {
            double top = POWER_TARGET + band;
            return (float)(f <= top ? 0.5 * f / top : 0.5 + 0.5 * (f - top) / (FILL_MAX - top));
        }

        void FireAim() => aimFireT = 0.4f;

        void UpdateAimRig(float dt)
        {
            bool throwing = phase == Phase.Throw && ideal != null;
            if (!throwing && aimFireT <= 0f) { aimRig.gameObject.SetActive(false); return; }
            aimRig.gameObject.SetActive(true);
            double band = L.powZone * 0.5, shown = throwing ? fill : System.Math.Max(fill, 0.2);

            // A few feet in front of the hand, on the line toward the landing spot.
            var rel = Eng.Release(player); var to = plan != null ? plan.landing : Eng.HOLE;
            double d = Eng.Hypot(to.x - rel.x, to.y - rel.y);
            var dir = new V2((to.x - rel.x) / d, (to.y - rel.y) / d);
            aimRig.position = Court.U(rel.x + dir.x * 4.2, rel.y + dir.y * 4.2, 0.06);
            aimBase.localRotation = Quaternion.Euler(0f, (float)Eng.Deg(System.Math.Atan2(dir.x, dir.y)), 0f);

            float frac = RingFrac(System.Math.Min(shown, FILL_MAX), band);
            float len = 2f + (float)System.Math.Min(shown, FILL_MAX) * 12f, alpha = pullActive || !throwing ? 1f : 0.7f;
            if (!throwing)
            {   // launch: the arrow shoots out and fades
                float k = 1f - aimFireT / 0.4f;
                len *= 1f + k * 1.6f; alpha = 1f - k;
                aimFireT -= dt;
            }
            var col = Ramp(frac); col.a = alpha;
            arrowMats[2].color = col;
            arrowMats[1].color = new Color(1f, 1f, 1f, alpha);
            arrowMats[0].color = new Color(Navy.r, Navy.g, Navy.b, 0.6f * alpha);
            aimSwing.localRotation = Quaternion.Euler(0f, Mathf.Clamp((float)swing, -1.3f, 1.3f) * AIM_VIS, 0f);
            SetArrowLength(len);

            // Ring colours.
            float uFill = shown > 0.005 ? frac : 0f, uB0 = RingFrac(POWER_TARGET - band, band), uB1 = 0.5f, uOD = RingFrac(1, band);
            int v = 0;
            foreach (var bandDef in RingBands)
                for (int i = 0; i < RING_N; i++)
                {
                    float s0 = (float)i / RING_N, s1 = (float)(i + 1) / RING_N, a = (s0 + s1) / 2f;
                    Color c;
                    if (bandDef[2] == 0f) c = new Color(Navy.r, Navy.g, Navy.b, 0.6f * alpha);
                    else if (bandDef[2] == 1f) c = new Color(1f, 1f, 1f, alpha);
                    else
                    {
                        bool lit = a <= uFill;
                        c = Ramp(a);
                        if (!lit) c = Color.Lerp(c, Navy, 0.35f);
                        if (lit && a > uOD) c *= 0.85f + 0.15f * Mathf.Sin(time * 20f);   // overdrive throbs
                        c.a = (lit ? 0.97f : 0.3f) * alpha;
                        bool line = (uB0 >= s0 && uB0 < s1) || (uB1 >= s0 && uB1 < s1);
                        bool tick = uFill > 0.001f && uFill >= s0 && uFill < s1;
                        if (line || tick) c = new Color(1f, 1f, 1f, alpha);
                    }
                    ringColors[v] = ringColors[v + 1] = ringColors[v + 2] = ringColors[v + 3] = c;
                    v += 4;
                }
            ringMesh.colors = ringColors;
        }
    }
}
