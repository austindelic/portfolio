// One invocation per character. Byte MRT works without float render support.
layout(location=0) out vec4 cellColor;
layout(location=1) out vec4 cellState;
// Directional thresholds are independent of the clipping confidence stored in state.g.
const vec3 LUMA = vec3(0.3, 0.59, 0.11);
float candidateScore(int index, float luminance, vec2 tangent, float edge, int previous, bool history) {
    vec4 metric = texelFetch(iChannel2, ivec2(index, 0), 0);
    int direction = int(round(metric.b * 255.0));
    if (direction > 0 && (edge <= 0.28 || dot(tangent, tangent) < 0.5)) return 1000.0;
    float orientationError = 0.5;
    if (direction > 0) {
        float angle = float(direction - 1) * 0.7853981634;
        vec2 axis = vec2(cos(angle), sin(angle));
        orientationError = acos(clamp(abs(dot(tangent, axis)), 0.0, 1.0)) / 1.5707963268;
    }
    return abs(metric.g - luminance) + 0.10 * smoothstep(0.28, 0.50, edge) * orientationError
        + (history && index != previous ? 0.05 : 0.0);
}
void main() {
    ivec2 cell = ivec2(gl_FragCoord.xy);
    vec2 size = max(uAsciiCellSize, vec2(2.0));
    vec2 origin = vec2(cell) * size;
    vec2 extent = min(size, uCanvasResolution - origin);
    int side = uQuality < 0.7 ? 2 : 4;
    float values[16];
    vec3 meanColor = vec3(0.0);
    float mean = 0.0, square = 0.0, peak = 0.0, minimum = 1.0;
    vec2 halves = vec2(0.0);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
        if (x >= side || y >= side) continue;
        vec2 offset = (vec2(x, y) + 0.5) / float(side);
        vec3 color = texture(iChannel0, (origin + offset * extent) / uCanvasResolution).rgb;
        float lum = dot(color, LUMA);
        values[y * side + x] = lum;
        meanColor += color; mean += lum; square += lum * lum;
        peak = max(peak, lum); minimum = min(minimum, lum);
        halves += lum * vec2(x < side / 2 ? -1.0 : 1.0, y < side / 2 ? -1.0 : 1.0);
    }
    float count = float(side * side);
    meanColor /= count; mean /= count;
    float range = peak - minimum;
    float variance = max(0.0, square / count - mean * mean);
    float varianceNormalized = clamp(4.0 * variance / max(range * range, 0.0001), 0.0, 1.0);
    float threshold = mean + 0.5 * (peak - mean);
    float occupancy = 0.0;
    for (int i = 0; i < 16; i++) if (i < side * side && values[i] > threshold) occupancy += 1.0 / count;
    float luminance = mean + 0.12 * smoothstep(0.05, 0.25, varianceNormalized)
        * smoothstep(0.20, 0.60, occupancy) * (peak - mean);
    luminance = clamp((luminance - 0.5) * max(uAsciiContrast, 0.01) + 0.5 + uAsciiBrightness, 0.0, 1.0);
    vec2 gradient = (halves * 2.0 / count) / max(extent * 0.5, vec2(0.5));
    float edge = clamp(length(gradient) * min(extent.x, extent.y) / max(range, 0.05), 0.0, 1.0);
    // A wider source-space Sobel estimate follows contours across cells.
    vec2 sobel = vec2(0.0);
    vec2 spacing = size * 0.5;
    vec2 center = origin + extent * 0.5;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 uv = clamp((center + vec2(x, y) * spacing) / uCanvasResolution, vec2(0.0), vec2(1.0));
        float lum = dot(texture(iChannel0, uv).rgb, LUMA);
        sobel += lum * vec2(float(x) * (y == 0 ? 2.0 : 1.0), float(y) * (x == 0 ? 2.0 : 1.0));
    }
    sobel /= 8.0 * spacing;
    float coherence = length(sobel) * min(size.x, size.y) / max(range, 0.05);
    vec2 tangent = coherence > 0.02 ? normalize(vec2(-sobel.y, sobel.x)) : vec2(0.0);
    vec4 previousState = texelFetch(iChannel1, cell, 0);
    float previousLuminance = texelFetch(iChannel3, cell, 0).a;
    int previous = int(round(previousState.r * 255.0));
    bool history = iFrame > 0 && previous < uGlyphCount && abs(luminance - previousLuminance) <= 0.12;
    float oldScore = candidateScore(previous, luminance, tangent, edge, previous, false);
    history = history && oldScore < 999.0;
    int best = 0; float bestScore = 1000.0;
    for (int i = 0; i < 96; i++) {
        if (i >= uGlyphCount) break;
        float score = candidateScore(i, luminance, tangent, edge, previous, history);
        if (score < bestScore) { best = i; bestScore = score; }
    }
    if (history && (oldScore - bestScore < 0.005 || oldScore - bestScore < oldScore * 0.08)) best = previous;
    // The sorted atlas starts with the least-covered supplied glyph. Compositing
    // suppresses genuinely dark cells even when a custom set has no blank.
    if (peak < 0.02) best = 0;
    cellColor = vec4(meanColor, luminance);
    cellState = vec4(float(best) / 255.0, smoothstep(0.15, 0.35, edge), occupancy, peak < 0.02 ? 0.0 : 1.0);
}
