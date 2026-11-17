using UnityEngine;
using UnityEngine.Rendering;

namespace CornholeThrowdown
{
    // Lighting and picture settings for a court: the sun with soft high-resolution shadows, sky-and-ground
    // ambient light, the game's gradient sky, distance haze, smoother edges, and the finishing pass (PostFX).
    // The Backyard values come from the web game's VENUE_LOOK.backyard.
    public static class Look
    {
        public static void Backyard(Camera cam)
        {
            foreach (var old in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) Object.Destroy(old.gameObject);

            // Sun: warm, from behind the thrower's left (web: sun at (-26, 20, -18)).
            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.89f, 0.72f);
            sun.intensity = 1.35f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.82f;
            sun.shadowBias = 0.03f;
            sun.shadowNormalBias = 0.25f;
            var toSun = new Vector3(-26f, 20f, 18f).normalized;
            sun.transform.rotation = Quaternion.LookRotation(-toSun);
            RenderSettings.sun = sun;

            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
            QualitySettings.shadowDistance = 70f;
            QualitySettings.shadowCascades = 4;
            QualitySettings.antiAliasing = 4;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.ForceEnable;
            QualitySettings.pixelLightCount = 4;

            // Sky light from above, grass-green bounce from below (web: hemisphere 0xd6ecff / 0x557a2c).
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.72f, 0.82f, 0.95f);
            RenderSettings.ambientEquatorColor = new Color(0.62f, 0.68f, 0.6f);
            RenderSettings.ambientGroundColor = new Color(0.3f, 0.4f, 0.17f);
            RenderSettings.ambientIntensity = 1f;

            var skyShader = Resources.Load<Shader>("Shaders/CornholeSky");
            if (skyShader != null)
            {
                var sky = new Material(skyShader);
                sky.SetVector("_SunDir", toSun);
                RenderSettings.skybox = sky;
            }

            // Warm haze far off (web: fog 0xf2cfa0 from 90 to 260 ft).
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.95f, 0.81f, 0.63f);
            RenderSettings.fogStartDistance = 90f * Board.M;
            RenderSettings.fogEndDistance = 260f * Board.M;

            cam.allowHDR = true;
            cam.allowMSAA = true;
            cam.clearFlags = CameraClearFlags.Skybox;
            if (cam.GetComponent<PostFX>() == null) cam.gameObject.AddComponent<PostFX>().exposure = 1.08f;
        }
    }

    // The finishing pass: glow around bright things (bloom), the ACES film curve, a little extra colour and
    // softly darker corners. If the shader can't run on a device, the picture is left as it is.
    [RequireComponent(typeof(Camera))]
    public class PostFX : MonoBehaviour
    {
        public float exposure = 1.08f, bloomThreshold = 1.0f, bloomKnee = 0.5f, bloomIntensity = 0.35f;
        public float saturation = 1.12f, vignette = 0.28f;
        public Color tint = new Color(1.02f, 1f, 0.97f);

        Material mat;
        readonly RenderTexture[] levels = new RenderTexture[6];

        void Awake()
        {
            var sh = Resources.Load<Shader>("Shaders/CornholePost");
            if (sh != null && sh.isSupported) mat = new Material(sh) { hideFlags = HideFlags.HideAndDontSave };
            else enabled = false;
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null) { Graphics.Blit(src, dst); return; }
            mat.SetFloat("_Threshold", bloomThreshold);
            mat.SetFloat("_Knee", bloomKnee);
            mat.SetFloat("_BloomIntensity", bloomIntensity);
            mat.SetFloat("_Exposure", exposure);
            mat.SetFloat("_Saturation", saturation);
            mat.SetFloat("_Vignette", vignette);
            mat.SetColor("_Tint", tint);

            var fmt = src.format == RenderTextureFormat.Default ? RenderTextureFormat.DefaultHDR : src.format;
            int w = src.width / 2, h = src.height / 2, n = 0;
            RenderTexture cur = src;
            for (; n < levels.Length && w >= 8 && h >= 8; n++, w /= 2, h /= 2)
            {
                levels[n] = RenderTexture.GetTemporary(w, h, 0, fmt);
                Graphics.Blit(cur, levels[n], mat, n == 0 ? 0 : 1);
                cur = levels[n];
            }
            for (int i = n - 2; i >= 0; i--)
            {
                Graphics.Blit(cur, levels[i], mat, 2);
                cur = levels[i];
            }
            mat.SetTexture("_SourceTex", src);
            Graphics.Blit(cur, dst, mat, 3);
            for (int i = 0; i < n; i++) { RenderTexture.ReleaseTemporary(levels[i]); levels[i] = null; }
        }
    }
}
