// Core rendering logic is in Buffer A.
// Buffer B/C/D and Image are adapted from sonicether's "Gargantua With HDR Bloom".

vec3 saturate(vec3 x)
{
	return clamp(x, vec3(0.0), vec3(1.0));
}

vec4 cubic(float x)
{
	float x2 = x * x;
	float x3 = x2 * x;
	vec4 w;
	w.x = -x3 + 3.0 * x2 - 3.0 * x + 1.0;
	w.y = 3.0 * x3 - 6.0 * x2 + 4.0;
	w.z = -3.0 * x3 + 3.0 * x2 + 3.0 * x + 1.0;
	w.w = x3;
	return w / 6.0;
}

vec4 BicubicTexture(in sampler2D tex, in vec2 coord)
{
	vec2 resolution = vec2(textureSize(tex, 0));

	coord *= resolution;

	float fx = fract(coord.x);
	float fy = fract(coord.y);
	coord.x -= fx;
	coord.y -= fy;

	fx -= 0.5;
	fy -= 0.5;

	vec4 xcubic = cubic(fx);
	vec4 ycubic = cubic(fy);

	vec4 c = vec4(coord.x - 0.5, coord.x + 1.5, coord.y - 0.5, coord.y + 1.5);
	vec4 s = vec4(xcubic.x + xcubic.y, xcubic.z + xcubic.w, ycubic.x + ycubic.y, ycubic.z + ycubic.w);
	vec4 offset = c + vec4(xcubic.y, xcubic.w, ycubic.y, ycubic.w) / s;

	vec4 sample0 = texture(tex, vec2(offset.x, offset.z) / resolution);
	vec4 sample1 = texture(tex, vec2(offset.y, offset.z) / resolution);
	vec4 sample2 = texture(tex, vec2(offset.x, offset.w) / resolution);
	vec4 sample3 = texture(tex, vec2(offset.y, offset.w) / resolution);

	float sx = s.x / (s.x + s.y);
	float sy = s.z / (s.z + s.w);

	return mix(mix(sample3, sample2, sx), mix(sample1, sample0, sx), sy);
}

vec3 ColorFetch(vec2 coord)
{
	return texture(iChannel0, coord).rgb;
}

vec3 BloomFetch(vec2 coord)
{
	return BicubicTexture(iChannel3, coord).rgb;
}

vec3 Grab(vec2 coord, const float octave, const vec2 offset)
{
	float scale = exp2(octave);

	coord /= scale;
	coord -= offset;

	return BloomFetch(coord);
}

vec2 CalcOffset(float octave)
{
	vec2 offset = vec2(0.0);

	vec2 padding = vec2(10.0) / vec2(textureSize(iChannel3, 0));

	offset.x = -min(1.0, floor(octave / 3.0)) * (0.25 + padding.x);

	offset.y = -(1.0 - (1.0 / exp2(octave))) - padding.y * octave;

	offset.y += min(1.0, floor(octave / 3.0)) * 0.35;

	return offset;
}

vec3 GetBloom(vec2 coord)
{
	vec3 bloom = vec3(0.0);

	bloom += Grab(coord, 1.0, vec2(CalcOffset(0.0))) * 1.0;
	bloom += Grab(coord, 2.0, vec2(CalcOffset(1.0))) * 0.7;
	bloom += Grab(coord, 3.0, vec2(CalcOffset(2.0))) * 1.0;
	bloom += Grab(coord, 4.0, vec2(CalcOffset(3.0))) * 0.7;
	bloom += Grab(coord, 5.0, vec2(CalcOffset(4.0))) * 0.2;
	bloom += Grab(coord, 6.0, vec2(CalcOffset(5.0))) * 0.08;
	bloom += Grab(coord, 7.0, vec2(CalcOffset(6.0))) * 0.03;
	bloom += Grab(coord, 8.0, vec2(CalcOffset(7.0))) * 0.01;

	return bloom;
}

vec3 DisplayColor(vec3 color)
{
    color = pow(max(color, vec3(0.0)), vec3(1.5));
    color = color / (1.0 + color);
    color = pow(color, vec3(1.0 / 1.5));
    color = color * color * (3.0 - 2.0 * color);
    color = pow(color, vec3(1.3, 1.20, 1.0));
    return pow(saturate(color * 1.01), vec3(0.7 / 2.2));
}

vec3 CompositeGlow(vec3 base, vec2 uv, vec3 sourceColor)
{
    if (uBloomStrength <= 0.0) return base;
    // Restrict spill to a soft halo. Source color comes from the blurred emission.
    vec3 glow = DisplayColor(GetBloom(uv) * 0.018 * uBloomStrength * uExposure);
    float sourcePeak = max(max(sourceColor.r, sourceColor.g), sourceColor.b);
    glow *= mix(0.035, 1.0, smoothstep(0.04, 0.45, sourcePeak));
    return base + (1.0 - base) * glow;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec3 color = DisplayColor(ColorFetch(uv) * uExposure);
    // ASCII composes glow after the glyph mask, exactly once.
    if (uAsciiMix <= 0.001) color = CompositeGlow(color, uv, color);
    fragColor = vec4(color, 1.0);
}
