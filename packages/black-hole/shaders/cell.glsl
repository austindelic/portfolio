// Original ASCII-cell trace, sharing the full physical raymarch and camera math.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    mat4 inverseCamRot;
    vec3 mapCamDir;
    TraceResult result = TraceFromCamera(uv, max(uCanvasResolution, vec2(1.0)), 0.5, inverseCamRot, mapCamDir);
    fragColor = FinalizeTrace(result, uv, inverseCamRot, mapCamDir);
}
