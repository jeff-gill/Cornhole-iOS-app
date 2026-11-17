using System;
using System.Collections.Generic;
using UnityEngine;

namespace CornholeThrowdown
{
    // The match screen: score cards, inning and throw clock, banners, the coach line, the THROW button,
    // the release feedback, and the inning and match cards. Simple shapes for now; the styled screens come later.
    public partial class Match
    {
        class Button { public Rect r; public string label; public Color color; public Action action; public bool enabled = true; }
        readonly List<Button> buttons = new List<Button>();
        float U => Mathf.Min(Screen.width, Screen.height) / 100f;

        // Works out where this frame's buttons are (used for both clicks and drawing).
        void Layout()
        {
            buttons.Clear();
            float W = Screen.width, H = Screen.height, u = U;
            float bw = u * 34f, bh = u * 11f, by = H - bh - u * 5f;
            if (phase == Phase.Aiming && CanEdit)
            {
                buttons.Add(new Button { r = new Rect(W / 2f - bw / 2f, by, bw, bh), label = "THROW", color = Go, action = BeginThrow, enabled = ideal != null });
                buttons.Add(new Button
                {
                    r = new Rect(u * 4f, by + bh * 0.2f, u * 20f, bh * 0.8f), label = "STICK", color = Gold, enabled = end.HasValue,
                    action = () => { if (end.HasValue) { landD = 0; landPhi = 0; tutDragged = true; RefreshPlan(); } },
                });
            }
            else if (phase == Phase.Throw && !pullActive)
                buttons.Add(new Button { r = new Rect(u * 4f, by + bh * 0.2f, u * 20f, bh * 0.8f), label = "BACK", color = new Color(0.6f, 0.65f, 0.75f), action = () => phase = Phase.Aiming });
            else if (phase == Phase.Inning)
                buttons.Add(new Button { r = new Rect(W / 2f - bw / 2f, H * 0.62f, bw, bh), label = "NEXT INNING", color = Go, action = NextInning });
            else if (phase == Phase.Over)
                buttons.Add(new Button { r = new Rect(W / 2f - bw / 2f, H * 0.62f, bw, bh), label = "PLAY AGAIN", color = Go, action = NewMatch });
        }

        bool ButtonAt(Vector2 gui, out Action action)
        {
            foreach (var b in buttons)
                if (b.enabled && b.r.Contains(gui)) { action = b.action; return true; }
            action = null;
            return false;
        }

        string CoachText()
        {
            if (phase == Phase.Aiming && CanEdit && !end.HasValue) return "Tap the board where you want your bag to finish.";
            if (phase == Phase.Aiming && CanEdit && !tutDragged) return "Drag the yellow ring to pick where it lands first. Close to the green spot sticks, farther back slides.";
            if (phase == Phase.Aiming && CanEdit) return "Happy with it? Tap THROW.";
            if (phase == Phase.Throw && !pullActive) return "Pull down anywhere and watch the ring fill.";
            if (phase == Phase.Throw) return "Let go when the ring reaches the green line and the arrow points straight. Red is OVERDRIVE!";
            if (phase == Phase.Cpu) return names[1] + " is lining up a throw…";
            return null;
        }

        GUIStyle style;

        void Text(Rect r, string s, float size, Color c, TextAnchor align = TextAnchor.MiddleCenter, bool wrap = false)
        {
            if (style == null) style = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold };
            style.fontSize = Mathf.Max(8, Mathf.RoundToInt(size));
            style.alignment = align;
            style.wordWrap = wrap;
            style.normal.textColor = new Color(0f, 0f, 0f, 0.55f * c.a);
            float o = Mathf.Max(1f, size * 0.07f);
            GUI.Label(new Rect(r.x + o, r.y + o, r.width, r.height), s, style);
            style.normal.textColor = c;
            GUI.Label(r, s, style);
        }

        static void Fill(Rect r, Color c, float radius = 0f) =>
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0f, c, 0f, radius);

        static void Outline(Rect r, Color c, float width, float radius) =>
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0f, c, width, radius);

        void OnGUI()
        {
            float W = Screen.width, H = Screen.height, u = U;

            // Score cards.
            float cw = Mathf.Min(W * 0.4f, u * 46f), ch = u * 17f, top = u * 3f;
            for (int p = 0; p < 2; p++)
            {
                var r = new Rect(p == 0 ? u * 3f : W - cw - u * 3f, top, cw, ch);
                var c = TeamColor[p];
                Fill(r, new Color(c.r * 0.75f, c.g * 0.75f, c.b * 0.75f, 0.92f), u * 2.5f);
                if ((phase == Phase.Aiming || phase == Phase.Throw || phase == Phase.Cpu) && player == p) Outline(r, Color.white, u * 0.7f, u * 2.5f);
                Text(new Rect(r.x + u * 2f, r.y + u * 1f, cw * 0.65f, u * 6f), names[p], u * 3.6f, Color.white, TextAnchor.MiddleLeft);
                Text(new Rect(r.xMax - u * 16f, r.y, u * 14f, ch), scores[p].ToString(), u * 9f, Color.white, TextAnchor.MiddleRight);
                for (int i = 0; i < 4; i++)
                {
                    var pip = new Rect(r.x + u * 2f + i * u * 5.5f, r.y + u * 9f, u * 4.5f, u * 4.5f);
                    bool used = i < thrown[p];
                    Fill(pip, used ? new Color(0f, 0f, 0f, 0.25f) : c, u * 1f);
                    if (lost[p].Contains(i)) Text(pip, "✕", u * 4f, new Color(1f, 0.3f, 0.3f));
                }
            }
            Text(new Rect(0, top, W, u * 6f), "INNING " + inning, u * 3.2f, Color.white);
            if (clock.HasValue && (phase == Phase.Aiming || phase == Phase.Throw))
            {
                int secs = Mathf.CeilToInt(Mathf.Max(0f, clock.Value));
                Text(new Rect(0, top + u * 6f, W, u * 7f), "0:" + secs.ToString("00"), u * 5f, secs <= 5 ? new Color(1f, 0.35f, 0.3f) : Color.white);
            }

            // Banner.
            if (banner != null)
            {
                float a = Mathf.Clamp01(bannerT / 0.3f);
                var bc = TeamColor[bannerPl];
                var br = new Rect(W * 0.08f, H * 0.3f, W * 0.84f, u * 14f);
                Fill(br, new Color(bc.r * 0.6f, bc.g * 0.6f, bc.b * 0.6f, 0.75f * a), u * 3f);
                Text(br, banner, u * 7.5f, new Color(1f, 0.92f, 0.5f, a));
            }

            // Release feedback while the bag flies.
            if (phase == Phase.Flight && feedback.Count > 0 && lastId >= 0)
            {
                float fw = Mathf.Min(W * 0.28f, u * 30f), fx = W / 2f - fw * feedback.Count / 2f;
                for (int i = 0; i < feedback.Count; i++)
                {
                    var r = new Rect(fx + i * fw + u, H - u * 20f, fw - u * 2f, u * 14f);
                    Fill(r, new Color(0.04f, 0.08f, 0.15f, 0.75f), u * 2f);
                    Text(new Rect(r.x, r.y + u, r.width, u * 5f), feedback[i].title, u * 3f, new Color(1f, 1f, 1f, 0.75f));
                    Text(new Rect(r.x, r.y + u * 6f, r.width, u * 7f), feedback[i].text, u * 4f, feedback[i].text == "Perfect" ? Go : Color.white);
                }
            }

            // Coach line.
            var coach = CoachText();
            if (coach != null)
            {
                var r = new Rect(u * 4f, H - u * 35f, W - u * 8f, u * 13f);
                Fill(r, new Color(0.04f, 0.08f, 0.15f, 0.7f), u * 2.5f);
                Text(new Rect(r.x + u * 2f, r.y, r.width - u * 4f, r.height), coach, u * 3.4f, Color.white, TextAnchor.MiddleCenter, true);
            }

            // Inning and match cards.
            if (phase == Phase.Inning || phase == Phase.Over)
            {
                var card = new Rect(W * 0.07f, H * 0.2f, W * 0.86f, H * 0.56f);
                Fill(card, new Color(0.04f, 0.08f, 0.15f, 0.9f), u * 4f);
                var li = lastInning;
                string title = phase == Phase.Over ? (winner == 0 ? "YOU WIN!" : names[1] + " WINS") : "INNING " + inning;
                Text(new Rect(card.x, card.y + u * 3f, card.width, u * 10f), title, u * 8f, phase == Phase.Over && winner == 0 ? Gold : Color.white);
                for (int p = 0; p < 2; p++)
                {
                    string line = names[p] + ":  " + li.hole[p] + " in × 3  +  " + li.on[p] + " on  =  " + li.raw[p];
                    Text(new Rect(card.x, card.y + u * (16f + p * 7f), card.width, u * 6f), line, u * 3.6f, TeamColor[p] * 1.3f);
                }
                string result = li.winner < 0 ? "Wash: no points this inning" : names[li.winner] + " score" + (li.winner == 0 ? "" : "s") + " +" + li.awarded;
                Text(new Rect(card.x, card.y + u * 32f, card.width, u * 7f), result, u * 4.4f, Color.white);
                Text(new Rect(card.x, card.y + u * 41f, card.width, u * 8f), scores[0] + "  –  " + scores[1], u * 7f, Gold);
                if (phase == Phase.Inning)
                    Text(new Rect(card.x, card.yMax - u * 8f, card.width, u * 6f), "Next inning in " + Mathf.CeilToInt(INNING_CARD_SECS - innT), u * 3f, new Color(1f, 1f, 1f, 0.6f));
            }

            // Buttons.
            foreach (var b in buttons)
            {
                var c = b.enabled ? b.color : new Color(0.4f, 0.4f, 0.45f, 0.8f);
                Fill(new Rect(b.r.x, b.r.y + u * 0.8f, b.r.width, b.r.height), new Color(c.r * 0.55f, c.g * 0.55f, c.b * 0.55f, c.a), u * 3f);
                Fill(b.r, c, u * 3f);
                Text(b.r, b.label, b.r.height * 0.42f, Color.white);
            }
        }
    }
}
