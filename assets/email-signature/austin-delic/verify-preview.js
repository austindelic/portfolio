async (page) => {
  const errors = [];
  const failed = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.setViewportSize({ width: 900, height: 920 });
  await page.goto('http://127.0.0.1:8123/preview.html');
  await page.locator('img').evaluate(image => image.decode());
  const images = await page.locator('img').evaluateAll(items => items.map(i => ({
    width: i.naturalWidth, height: i.naturalHeight, displayed: [i.width, i.height], complete: i.complete
  })));
  if (images.length !== 1 || images[0].width !== 568 || images[0].height !== 54) throw Error('Logo failed to load');
  const links = await page.locator('#primary-preview a').evaluateAll(items => items.map(a => a.getAttribute('href')));
  if (JSON.stringify(links) !== JSON.stringify(['mailto:austin@thenextsomething.co', 'https://linkedin.com/in/austindelic'])) throw Error('Incorrect contact links');
  await page.locator('#primary-preview').screenshot({ path: 'assets/email-signature/austin-delic/preview-signature.png' });
  await page.screenshot({ path: 'assets/email-signature/austin-delic/preview-comparison.png', fullPage: true });
  const widths = [];
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 940 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw Error(`Horizontal overflow at ${width}px`);
    widths.push({ width, horizontalOverflow: false });
  }
  await page.screenshot({ path: 'assets/email-signature/austin-delic/preview-mobile.png', fullPage: true });
  // Verify that the image-free alternative remains readable on a dark canvas.
  await page.goto('http://127.0.0.1:8123/signature-text-only.html');
  const text = await page.locator('body').innerText();
  if (!text.includes('Austin Delic') || !text.includes('[TNS job title]') || !text.includes('the next {something}')) throw Error('Missing fallback text');
  await page.evaluate(() => { document.body.style.background = '#121212'; });
  const tableWidth = await page.locator('table').evaluate(t => t.getBoundingClientRect().width);
  if (tableWidth > 304) throw Error('Text fallback too wide');
  const background = await page.locator('table').evaluate(t => getComputedStyle(t).backgroundColor);
  if (background !== 'rgb(255, 255, 255)') throw Error('Missing light signature background');
  await page.locator('table').screenshot({ path: 'assets/email-signature/austin-delic/preview-text-only.png' });
  if (errors.length || failed.length) throw Error(JSON.stringify({ errors, failed }));
  return { images, links, mobile: widths, browserErrors: errors, failedRequests: failed,
    originalLogo: 'passed', titlePlaceholderVisible: true, imageFreeAlternative: 'passed',
    inboxClients: 'Not verified; browser inspection only' };
}
