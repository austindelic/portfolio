vec3 PaletteColor(float brightness) {
    return brightness < 0.5 ? mix(uShadowColor, uMidColor, brightness * 2.0)
        : mix(uMidColor, uHighlightColor, (brightness - 0.5) * 2.0);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 originalColor = texture(iChannel0, uv).rgb;
    vec2 size = max(uAsciiCellSize, vec2(2.0));
    ivec2 cell = ivec2(floor(fragCoord / size));
    vec2 cellUv = fract(fragCoord / size);
    vec4 analysis = texelFetch(uAsciiAnalysisColor, cell, 0);
    vec4 state = texelFetch(uAsciiAnalysisState, cell, 0);
    int index = int(round(state.r * 255.0));
    float count = max(float(uGlyphCount), 1.0);
    float glyph = texture(iChannel1, vec2((float(index) + cellUv.x) / count, cellUv.y)).a;
    float coverage = max(texelFetch(iChannel2, ivec2(index, 0), 0).r, 0.035);
    float ink = min(glyph / coverage, 2.0);
    float mean = dot(analysis.rgb, vec3(0.3, 0.59, 0.11));
    float local = dot(originalColor, vec3(0.3, 0.59, 0.11));
    // Restrict ink only at measured transitions, following source occupancy.
    // No shadow-distance mask or synthetic outline is involved.
    float occupied = smoothstep(mean * 0.15, max(0.015, mean * 0.65), local);
    float boundary = mix(1.0, occupied, state.g * smoothstep(0.0, 0.25, 1.0 - state.b));
    vec3 base = uPaletteMode == 1 ? PaletteColor(analysis.a) : analysis.rgb;
    vec3 ascii = clamp(base * ink * boundary * state.a, 0.0, 1.0);
    fragColor = vec4(CompositeGlow(mix(originalColor, ascii, clamp(uAsciiMix, 0.0, 1.0)), uv, originalColor), 1.0);
}
