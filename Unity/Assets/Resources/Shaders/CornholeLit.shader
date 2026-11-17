// Cartoon shading for everything in the court: two flat tones (lit and shaded, with a soft edge between
// them), shadows that fall in the same shaded tone, a small crisp highlight and a light rim around the edges.
// Vertex colours (the models' baked shading and flat colours) are used when _UseVertexColor is 1.
// Optional cut-out leaves (_ALPHATEST_ON) and two-sided faces (_Cull 0).
Shader "Cornhole/Lit"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _MainTex ("Albedo", 2D) = "white" {}
        _Glossiness ("Shine", Range(0,1)) = 0.15
        _Metallic ("Metallic (unused)", Range(0,1)) = 0
        _Cutoff ("Alpha cutoff", Range(0,1)) = 0.5
        _Cull ("Cull", Float) = 2
        _UseVertexColor ("Use vertex colour", Float) = 1
        _EmissionColor ("Emission", Color) = (0,0,0,0)
        _ShadeColor ("Shaded tone", Color) = (0.42, 0.45, 0.62, 1)
        _RimColor ("Rim", Color) = (1, 0.97, 0.9, 1)
        _RimPower ("Rim power", Float) = 3.5
        _RimStrength ("Rim strength", Float) = 0.22
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Cull [_Cull]
        CGPROGRAM
        #pragma surface surf Toon fullforwardshadows addshadow
        #pragma multi_compile_local __ _ALPHATEST_ON
        #pragma multi_compile_instancing
        #pragma target 3.0

        sampler2D _MainTex;
        fixed4 _Color, _ShadeColor, _RimColor;
        half _Glossiness, _Cutoff, _UseVertexColor, _RimPower, _RimStrength;
        half4 _EmissionColor;

        struct Input
        {
            float2 uv_MainTex;
            float4 color : COLOR;
            float3 viewDir;
        };

        half4 LightingToon (SurfaceOutput s, half3 lightDir, half3 viewDir, half atten)
        {
            half ndl = dot(s.Normal, lightDir);
            half lit = smoothstep(0.0, 0.08, ndl) * smoothstep(0.3, 0.6, atten);
            half3 tone = lerp(_ShadeColor.rgb, half3(1, 1, 1), lit);
            half3 h = normalize(lightDir + viewDir);
            half spec = smoothstep(0.92, 0.95, dot(s.Normal, h)) * s.Gloss * lit;
            half3 c = s.Albedo * _LightColor0.rgb * tone + _LightColor0.rgb * spec * 0.5;
            return half4(c, s.Alpha);
        }

        void surf (Input IN, inout SurfaceOutput o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color;
            c *= lerp(fixed4(1, 1, 1, 1), IN.color, _UseVertexColor);
            #ifdef _ALPHATEST_ON
            clip(c.a - _Cutoff);
            #endif
            o.Albedo = c.rgb;
            o.Gloss = _Glossiness;
            o.Specular = 0.5;
            half rim = pow(1.0 - saturate(dot(normalize(IN.viewDir), o.Normal)), _RimPower);
            o.Emission = _EmissionColor.rgb + _RimColor.rgb * rim * _RimStrength * c.rgb;
            o.Alpha = c.a;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
