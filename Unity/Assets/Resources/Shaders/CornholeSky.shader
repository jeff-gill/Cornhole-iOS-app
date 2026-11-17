// A bright cartoon sky: horizon, middle and top colours with a glow around the sun.
Shader "Cornhole/Sky"
{
    Properties
    {
        _Top ("Top", Color) = (0.13, 0.47, 0.95, 1)
        _Mid ("Middle", Color) = (0.42, 0.74, 1.0, 1)
        _Horizon ("Horizon", Color) = (0.86, 0.95, 1.0, 1)
        _SunDir ("Sun direction", Vector) = (-0.6, 0.45, 0.4, 0)
        _SunGlow ("Sun glow", Float) = 1
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" }
        Cull Off ZWrite Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            half4 _Top, _Mid, _Horizon;
            float4 _SunDir;
            float _SunGlow;

            struct v2f { float4 pos : SV_POSITION; float3 dir : TEXCOORD0; };

            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.dir = v.vertex.xyz;
                return o;
            }

            half4 frag (v2f i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float h = d.y;
                float3 col = lerp(_Horizon.rgb, _Mid.rgb, smoothstep(-0.02, 0.22, h));
                col = lerp(col, _Top.rgb, smoothstep(0.22, 0.85, h));
                float s = max(dot(d, normalize(_SunDir.xyz)), 0.0);
                col += _SunGlow * (float3(1.0, 0.75, 0.45) * pow(s, 8.0) * 0.35 + float3(1.0, 0.95, 0.8) * pow(s, 300.0) * 1.5);
                #ifndef UNITY_COLORSPACE_GAMMA
                col = GammaToLinearSpace(col);
                #endif
                return half4(col, 1);
            }
            ENDCG
        }
    }
}
