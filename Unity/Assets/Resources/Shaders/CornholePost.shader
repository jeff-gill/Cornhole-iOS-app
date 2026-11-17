// The finishing pass on the whole picture, for a cartoon look: ink outlines found from depth and surface
// direction (fading out in the distance), a soft glow around bright things (bloom), punchier colour and
// contrast, and lightly darker corners.
Shader "Hidden/Cornhole/Post"
{
    Properties { _MainTex ("", 2D) = "white" {} }

    CGINCLUDE
    #include "UnityCG.cginc"

    sampler2D _MainTex, _SourceTex, _CameraDepthNormalsTexture;
    float4 _MainTex_TexelSize, _CameraDepthNormalsTexture_TexelSize;
    float _Threshold, _Knee, _BloomIntensity, _Exposure, _Saturation, _Contrast, _Vignette;
    float _EdgeWidth, _EdgeStrength, _EdgeDepth, _EdgeNormal, _EdgeFadeStart, _EdgeFadeEnd;
    half4 _Tint, _EdgeColor;

    half3 Box4(float2 uv, float d)
    {
        float4 o = _MainTex_TexelSize.xyxy * float4(-d, -d, d, d);
        half3 s = tex2D(_MainTex, uv + o.xy).rgb + tex2D(_MainTex, uv + o.zy).rgb
                + tex2D(_MainTex, uv + o.xw).rgb + tex2D(_MainTex, uv + o.zw).rgb;
        return s * 0.25;
    }

    half3 Prefilter(half3 c)
    {
        half b = max(c.r, max(c.g, c.b));
        half soft = clamp(b - _Threshold + _Knee, 0, 2 * _Knee);
        soft = soft * soft / (4 * _Knee + 0.00001);
        half w = max(soft, b - _Threshold) / max(b, 0.00001);
        return c * w;
    }

    // How strongly this pixel sits on an outline: a jump in depth or a sharp change in surface direction.
    float Edge(float2 uv)
    {
        float d0; float3 n0;
        DecodeDepthNormal(tex2D(_CameraDepthNormalsTexture, uv), d0, n0);
        if (d0 >= 0.999) return 0;   // sky
        float2 t = _CameraDepthNormalsTexture_TexelSize.xy * _EdgeWidth;
        float e = 0;
        float2 offs[4] = { float2(t.x, 0), float2(-t.x, 0), float2(0, t.y), float2(0, -t.y) };
        for (int k = 0; k < 4; k++)
        {
            float d; float3 n;
            DecodeDepthNormal(tex2D(_CameraDepthNormalsTexture, uv + offs[k]), d, n);
            float dz = (d - d0) / max(d0, 0.0001);   // only the nearer side of a depth jump gets the line
            e = max(e, saturate((dz - _EdgeDepth) * 12));
            e = max(e, saturate((1 - dot(n, n0) - _EdgeNormal) * 3));
        }
        return e * (1 - smoothstep(_EdgeFadeStart, _EdgeFadeEnd, d0));
    }
    ENDCG

    SubShader
    {
        Cull Off ZWrite Off ZTest Always

        Pass // 0: prefilter + downsample
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            half4 frag (v2f_img i) : SV_Target
            {
                half3 c = Box4(i.uv, 1);
                #ifdef UNITY_COLORSPACE_GAMMA
                c = GammaToLinearSpace(c);
                #endif
                return half4(Prefilter(c), 1);
            }
            ENDCG
        }

        Pass // 1: downsample
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            half4 frag (v2f_img i) : SV_Target { return half4(Box4(i.uv, 1), 1); }
            ENDCG
        }

        Pass // 2: upsample, added onto the bigger level
        {
            Blend One One
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            half4 frag (v2f_img i) : SV_Target { return half4(Box4(i.uv, 0.5), 1); }
            ENDCG
        }

        Pass // 3: final picture
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            half4 frag (v2f_img i) : SV_Target
            {
                half3 c = tex2D(_SourceTex, i.uv).rgb;
                #ifdef UNITY_COLORSPACE_GAMMA
                c = GammaToLinearSpace(c);
                #endif
                c += Box4(i.uv, 0.5) * _BloomIntensity;
                c = saturate(c * _Exposure * _Tint.rgb);
                c = LinearToGammaSpace(c);   // grade in display space
                half l = dot(c, half3(0.2126, 0.7152, 0.0722));
                c = lerp(l.xxx, c, _Saturation);
                c = saturate((c - 0.5) * _Contrast + 0.5);
                c = lerp(c, _EdgeColor.rgb, Edge(i.uv) * _EdgeStrength);
                float2 v = i.uv - 0.5;
                c *= 1 - _Vignette * smoothstep(0.25, 0.85, dot(v, v) * 2.2);
                #ifdef UNITY_COLORSPACE_GAMMA
                return half4(c, 1);
                #else
                return half4(GammaToLinearSpace(c), 1);
                #endif
            }
            ENDCG
        }
    }
}
