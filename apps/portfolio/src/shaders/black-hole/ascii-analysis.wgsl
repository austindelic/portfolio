@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var previous_state: texture_2d<f32>;
@group(0) @binding(2) var metrics: texture_2d<f32>;
@group(0) @binding(3) var previous_color: texture_2d<f32>;
@group(0) @binding(4) var color_out: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(5) var state_out: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(6) var<uniform> params: Params;
// Keep clipping confidence at its original 0.15–0.35 thresholds.
const LUMA = vec3<f32>(0.3, 0.59, 0.11);
fn candidate_score(index: i32, luminance: f32, tangent: vec2<f32>, edge: f32, previous: i32, history: bool) -> f32 {
    let metric = textureLoad(metrics, vec2<i32>(index, 0), 0);
    let direction = i32(round(metric.b * 255.0));
    if (direction > 0 && (edge <= 0.28 || dot(tangent, tangent) < 0.5)) { return 1000.0; }
    var orientation_error = 0.5;
    if (direction > 0) {
        let angle = f32(direction - 1) * 0.7853981634;
        let axis = vec2<f32>(cos(angle), sin(angle));
        orientation_error = acos(clamp(abs(dot(tangent, axis)), 0.0, 1.0)) / 1.5707963268;
    }
    return abs(metric.g - luminance) + 0.10 * smoothstep(0.28, 0.50, edge) * orientation_error
        + select(0.0, 0.05, history && index != previous);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let cell = vec2<i32>(id.xy);
    if (any(id.xy >= textureDimensions(color_out))) { return; }
    let size = max(params.cell_size.xy, vec2<f32>(2.0));
    let origin = vec2<f32>(id.xy) * size;
    let extent = min(size, params.canvas_dims.xy - origin);
    let side = select(4, 2, params.time_exposure_quality_glyph.z < 0.7);
    var values: array<f32, 16>;
    var mean_color = vec3<f32>(0.0);
    var mean = 0.0; var square = 0.0; var peak = 0.0; var minimum = 1.0;
    var halves = vec2<f32>(0.0);
    for (var y = 0; y < 4; y++) { for (var x = 0; x < 4; x++) {
        if (x >= side || y >= side) { continue; }
        let offset = (vec2<f32>(f32(x), f32(y)) + 0.5) / f32(side);
        let uv = (origin + offset * extent) / params.canvas_dims.xy;
        let coords = clamp(vec2<i32>(uv * vec2<f32>(textureDimensions(source))), vec2<i32>(0), vec2<i32>(textureDimensions(source)) - 1);
        let raw = textureLoad(source, coords, 0).rgb;
        let color = pow(raw / (vec3<f32>(1.0) + raw), vec3<f32>(0.72));
        let lum = dot(color, LUMA);
        values[y * side + x] = lum;
        mean_color += color; mean += lum; square += lum * lum;
        peak = max(peak, lum); minimum = min(minimum, lum);
        halves += lum * vec2<f32>(select(1.0, -1.0, x < side / 2), select(1.0, -1.0, y < side / 2));
    }}
    let count = f32(side * side);
    mean_color /= count; mean /= count;
    let range = peak - minimum;
    let variance = max(0.0, square / count - mean * mean);
    let variance_normalized = clamp(4.0 * variance / max(range * range, 0.0001), 0.0, 1.0);
    let threshold = mean + 0.5 * (peak - mean);
    var occupancy = 0.0;
    for (var i = 0; i < side * side; i++) { if (values[i] > threshold) { occupancy += 1.0 / count; } }
    var luminance = mean + 0.12 * smoothstep(0.05, 0.25, variance_normalized)
        * smoothstep(0.20, 0.60, occupancy) * (peak - mean);
    luminance = clamp((luminance - 0.5) * max(params.canvas_dims.w, 0.01) + 0.5 + params.canvas_dims.z, 0.0, 1.0);
    let gradient = (halves * 2.0 / count) / max(extent * 0.5, vec2<f32>(0.5));
    let edge = clamp(length(gradient) * min(extent.x, extent.y) / max(range, 0.05), 0.0, 1.0);
    // Sobel orientation uses continuous source samples, not selected glyphs.
    var sobel = vec2<f32>(0.0);
    let spacing = size * 0.5;
    let center = origin + extent * 0.5;
    for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
        let uv = (center + vec2<f32>(f32(x), f32(y)) * spacing) / params.canvas_dims.xy;
        let coords = clamp(vec2<i32>(uv * vec2<f32>(textureDimensions(source))), vec2<i32>(0), vec2<i32>(textureDimensions(source)) - 1);
        let raw = textureLoad(source, coords, 0).rgb;
        let lum = dot(pow(raw / (vec3<f32>(1.0) + raw), vec3<f32>(0.72)), LUMA);
        sobel += lum * vec2<f32>(f32(x) * select(1.0, 2.0, y == 0), f32(y) * select(1.0, 2.0, x == 0));
    }}
    sobel /= 8.0 * spacing;
    let coherence = length(sobel) * min(size.x, size.y) / max(range, 0.05);
    var tangent = vec2<f32>(0.0);
    if (coherence > 0.02) { tangent = normalize(vec2<f32>(-sobel.y, sobel.x)); }
    let old_state = textureLoad(previous_state, cell, 0);
    let old_luminance = textureLoad(previous_color, cell, 0).a;
    let previous = i32(round(old_state.r * 255.0));
    var history = params.source_dims.w > 0.5 && previous < i32(params.time_exposure_quality_glyph.w) && abs(luminance - old_luminance) <= 0.12;
    let old_score = candidate_score(previous, luminance, tangent, edge, previous, false);
    history = history && old_score < 999.0;
    var best = 0; var best_score = 1000.0;
    for (var i = 0; i < i32(params.time_exposure_quality_glyph.w); i++) {
        let score = candidate_score(i, luminance, tangent, edge, previous, history);
        if (score < best_score) { best = i; best_score = score; }
    }
    if (history && (old_score - best_score < 0.005 || old_score - best_score < old_score * 0.08)) { best = previous; }
    if (peak < 0.02) { best = 0; }
    textureStore(color_out, cell, vec4<f32>(mean_color, luminance));
    textureStore(state_out, cell, vec4<f32>(f32(best) / 255.0, smoothstep(0.15, 0.35, edge), occupancy, select(1.0, 0.0, peak < 0.02)));
}
