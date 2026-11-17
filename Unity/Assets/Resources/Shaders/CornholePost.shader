// The finishing pass on the whole picture: soft glow around bright things (bloom), film-style colour
// (the same ACES curve as the web game), a touch more colour, and gently darker corners.
Shader "Hidden/Cornhole/Post"
{
    Properties { _MainTex ("", 2D) = "white" {} }

    CGINCLUDE
    #include "UnityCG.cginc"

    sampler2D _MainTex, _SourceTex;
    float4 _MainTex_TexelSize;
    float _Threshold, _Knee, _BloomIntensity, _Exposure, _Saturation, _Vignette;
    half4 _Tint;

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

    float3 ACES(float3 color)
    {
        const float3x3 inMat = float3x3(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
        const float3x3 outMat = float3x3(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
        color *= _Exposure / 0.6;
        color = mul(inMat, color);
        float3 a = color * (color + 0.0245786) - 0.000090537;
        float3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
        color = mul(outMat, a / b);
        return saturate(color);
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
                c *= _Tint.rgb;
                c = ACES(c);
                half l = dot(c, half3(0.2126, 0.7152, 0.0722));
                c = lerp(l.xxx, c, _Saturation);
                float2 v = i.uv - 0.5;
                c *= 1 - _Vignette * smoothstep(0.25, 0.85, dot(v, v) * 2.2);
                // The curve's output is linear; in a linear project Unity encodes it for the screen.
                #ifdef UNITY_COLORSPACE_GAMMA
                return half4(LinearToGammaSpace(saturate(c)), 1);
                #else
                return half4(saturate(c), 1);
                #endif
            }
            ENDCG
        }
    }
}
