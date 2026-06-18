// Colored ASCII post-process based on Three.js AsciiEffect brightness and ramp behavior.
// Reference: https://github.com/mrdoob/three.js/blob/r167/examples/jsm/effects/AsciiEffect.js

vec3 PaletteColor(float brightness)
{
	if (brightness < 0.5)
	{
		return mix(uShadowColor, uMidColor, brightness * 2.0);
	}

	return mix(uMidColor, uHighlightColor, (brightness - 0.5) * 2.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
	vec2 uv = fragCoord.xy / iResolution.xy;
	vec3 originalColor = texture(iChannel0, uv).rgb;

	vec2 cellSize = max(uAsciiCellSize, vec2(2.0));
	vec2 cellOrigin = floor(fragCoord.xy / cellSize) * cellSize;
	vec2 cellUv = (fragCoord.xy - cellOrigin) / cellSize;
	vec2 sampleUv = (cellOrigin + cellSize * 0.5) / iResolution.xy;
	vec3 cellColor = texture(iChannel0, sampleUv).rgb;

	float brightness = clamp(dot(cellColor, vec3(0.3, 0.59, 0.11)), 0.0, 1.0);
	brightness = clamp((brightness - 0.5) * max(uAsciiContrast, 0.01) + 0.5 + uAsciiBrightness, 0.0, 1.0);

	float glyphCount = max(float(uGlyphCount), 1.0);
	int glyphIndex = int(clamp(floor(brightness * (glyphCount - 1.0) + 0.5), 0.0, glyphCount - 1.0));
	vec2 atlasUv = vec2((float(glyphIndex) + cellUv.x) / glyphCount, cellUv.y);
	float glyph = texture(iChannel1, atlasUv).a;

	vec3 baseColor = uPaletteMode == 1 ? PaletteColor(brightness) : cellColor;
	vec3 asciiColor = clamp(baseColor * (0.07 + glyph * 1.65), 0.0, 1.0);

	fragColor = vec4(mix(originalColor, asciiColor, clamp(uAsciiMix, 0.0, 1.0)), 1.0);
}
