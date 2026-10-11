async (page) => {
  const errors = [], failures = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.setViewportSize({width: 900, height: 460});
  await page.goto('http://127.0.0.1:8123/preview.html');
  const image = page.locator('#email-preview img');
  await image.evaluate(i => i.decode());
  const dimensions = await image.evaluate(i => ({natural: [i.naturalWidth, i.naturalHeight], displayed: [i.width, i.height]}));
  if (JSON.stringify(dimensions) !== JSON.stringify({natural:[1760,640],displayed:[440,160]})) throw Error('Wrong image size');
  if (await page.locator('#email-preview img').count() !== 1) throw Error('Signature must be one image');
  if (await page.locator('#email-preview').innerText() !== 'Thanks,') throw Error('Extra signature text outside image');
  if (await page.locator('#email-preview a').getAttribute('href') !== 'mailto:austin@thenextsomething.co') throw Error('Incorrect email link');
  const alt = await image.getAttribute('alt');
  for (const expected of ['Austin Delic','austin@thenextsomething.co','LinkedIn: austindelic','the next something']) {
    if (!alt.includes(expected)) throw Error('Incomplete alt text');
  }
  await page.locator('#email-preview').screenshot({path:'assets/email-signature/austin-delic/image-signature/preview-email.png'});
  const mobile = [];
  for (const width of [375,320]) {
    await page.setViewportSize({width, height:400});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw Error(`Horizontal overflow at ${width}`);
    mobile.push({width, overflow:false});
  }
  await page.locator('#email-preview').screenshot({path:'assets/email-signature/austin-delic/image-signature/preview-mobile.png'});
  if (errors.length || failures.length) throw Error(JSON.stringify({errors,failures}));
  return {dimensions, singleImage:true, separateGreeting:'Thanks,', emailLink:'mailto:austin@thenextsomething.co',
    descriptiveAltText:true, mobile, errors, failedRequests:failures, inboxRendering:'Not verified'};
}
