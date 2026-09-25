// NPGS-style bloom generation and separable blur adapted for WebGL2 fragment passes.

vec3 ColorFetch(vec2 coord)
{
	if (coord.x < 0.00001 || coord.x > 0.99999 || coord.y < 0.00001 || coord.y > 0.99999)
	{
		return vec3(0.0);
	}

	return texture(iChannel0, coord).rgb;
}

vec3 Grab1(vec2 coord, float octave, vec2 offset)
{
	float scale = exp2(octave);

	coord += offset;
	coord *= scale;

	if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0)
	{
		return vec3(0.0);
	}

	return ColorFetch(coord);
}

vec3 SampleBloomFootprint(vec2 coord, float scale)
{
	vec2 radius = scale / iResolution.xy;
	vec3 color = ColorFetch(coord) * 0.25;

	color += ColorFetch(coord + radius * vec2(1.0, 0.0)) * 0.10;
	color += ColorFetch(coord + radius * vec2(-1.0, 0.0)) * 0.10;
	color += ColorFetch(coord + radius * vec2(0.0, 1.0)) * 0.10;
	color += ColorFetch(coord + radius * vec2(0.0, -1.0)) * 0.10;
	color += ColorFetch(coord + radius * vec2(0.7, 0.7)) * 0.0875;
	color += ColorFetch(coord + radius * vec2(-0.7, 0.7)) * 0.0875;
	color += ColorFetch(coord + radius * vec2(0.7, -0.7)) * 0.0875;
	color += ColorFetch(coord + radius * vec2(-0.7, -0.7)) * 0.0875;

	return color;
}

vec3 GrabBloomLevel(vec2 coord, float octave, vec2 offset)
{
	float scale = exp2(octave);

	coord += offset;
	coord *= scale;

	if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0)
	{
		return vec3(0.0);
	}

	return SampleBloomFootprint(coord, scale);
}

vec2 CalcOffset(float octave)
{
	vec2 offset = vec2(0.0);
	vec2 padding = vec2(10.0) / iResolution.xy;

	offset.x = -min(1.0, floor(octave / 3.0)) * (0.25 + padding.x);
	offset.y = -(1.0 - (1.0 / exp2(octave))) - padding.y * octave;
	offset.y += min(1.0, floor(octave / 3.0)) * 0.35;

	return offset;
}

vec3 GetMipmapTree(vec2 uv)
{
	vec3 color = vec3(0.0);

	color += Grab1(uv, 1.0, vec2(0.0, 0.0));
	color += GrabBloomLevel(uv, 2.0, vec2(CalcOffset(1.0)));
	color += GrabBloomLevel(uv, 3.0, vec2(CalcOffset(2.0)));
	color += GrabBloomLevel(uv, 4.0, vec2(CalcOffset(3.0)));
	color += GrabBloomLevel(uv, 5.0, vec2(CalcOffset(4.0)));
	color += GrabBloomLevel(uv, 6.0, vec2(CalcOffset(5.0)));
	color += GrabBloomLevel(uv, 7.0, vec2(CalcOffset(6.0)));
	color += GrabBloomLevel(uv, 8.0, vec2(CalcOffset(7.0)));

	return color;
}

vec3 GaussBlur(vec2 uv, bool horizontal)
{
	float weights[5];
	float offsets[5];

	weights[0] = 0.19638062;
	weights[1] = 0.29675293;
	weights[2] = 0.09442139;
	weights[3] = 0.01037598;
	weights[4] = 0.00025940;

	offsets[0] = 0.00000000;
	offsets[1] = 1.41176471;
	offsets[2] = 3.29411765;
	offsets[3] = 5.17647059;
	offsets[4] = 7.05882353;

	vec3 color = vec3(0.0);
	float weightSum = 0.0;
	vec2 stepDir = horizontal ? vec2(0.5, 0.0) : vec2(0.0, 0.5);

	if (uv.x < 0.52)
	{
		color += ColorFetch(uv) * weights[0];
		weightSum += weights[0];

		for (int i = 1; i < 5; i++)
		{
			vec2 offset = vec2(offsets[i]) / iResolution.xy;
			color += ColorFetch(uv + offset * stepDir) * weights[i];
			color += ColorFetch(uv - offset * stepDir) * weights[i];
			weightSum += weights[i] * 2.0;
		}

		color /= max(weightSum, 0.0001);
	}

	return color;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
	vec2 uv = fragCoord.xy / iResolution.xy;

	if (uBloomMode == 0)
	{
		fragColor = vec4(GetMipmapTree(uv), 1.0);
	}
	else
	{
		fragColor = vec4(GaussBlur(uv, uBloomMode == 1), 1.0);
	}
}
