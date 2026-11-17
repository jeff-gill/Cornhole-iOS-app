// Standard lighting plus vertex colours (the models' baked shading and flat colours), optional cut-out
// leaves, and two-sided faces when _Cull is 0. Used for the converted models and the lawn.
Shader "Cornhole/Lit"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _MainTex ("Albedo", 2D) = "white" {}
        _Glossiness ("Smoothness", Range(0,1)) = 0.15
        _Metallic ("Metallic", Range(0,1)) = 0
        _Cutoff ("Alpha cutoff", Range(0,1)) = 0.5
        _Cull ("Cull", Float) = 2
        _EmissionColor ("Emission", Color) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Cull [_Cull]
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma multi_compile_local __ _ALPHATEST_ON
        #pragma multi_compile_instancing
        #pragma target 3.0

        sampler2D _MainTex;
        fixed4 _Color;
        half _Glossiness, _Metallic, _Cutoff;
        half4 _EmissionColor;

        struct Input
        {
            float2 uv_MainTex;
            float4 color : COLOR;
        };

        void surf (Input IN, inout SurfaceOutputStandard o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color * IN.color;
            #ifdef _ALPHATEST_ON
            clip(c.a - _Cutoff);
            #endif
            o.Albedo = c.rgb;
            o.Metallic = _Metallic;
            o.Smoothness = _Glossiness;
            o.Emission = _EmissionColor.rgb;
            o.Alpha = c.a;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
