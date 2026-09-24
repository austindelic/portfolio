async page => {
  await page.goto('http://127.0.0.1:4321/');
  const result = await page.evaluate(async () => {
    await document.fonts.load('9px "Departure Mono"');
    const {createGlyphAtlasConfig, createGlyphAtlasRaster, DEFAULT_SHADER_CONTROLS} = await import('/src/components/BlackHoleCore.ts');
    const {rankGlyphs} = await import('/src/lib/ascii-analysis.ts');
    const config = createGlyphAtlasConfig(DEFAULT_SHADER_CONTROLS);
    const raster = createGlyphAtlasRaster(config);
    // Obtain the original glyph order's coverages with the same single-glyph raster routine.
    const glyphs = Array.from(config.glyphs);
    const coverage = glyphs.map(glyph => {
      const r = createGlyphAtlasRaster({...config, glyphs:glyph,glyphCount:1});
      const pixels = r.canvas.getContext('2d').getImageData(0,0,r.canvas.width,r.canvas.height).data;
      let sum=0;for(let i=3;i<pixels.length;i+=4)sum+=pixels[i];return sum/(255*r.canvas.width*r.canvas.height);
    });
    return {glyphs:rankGlyphs(coverage).map(x=>glyphs[x.index]).join(''),metrics:Array.from(raster.metricsCanvas.getContext('2d').getImageData(0,0,config.glyphCount,1).data),font:config.fontFamily,textSize:config.textSize};
  });
  return result;
}
