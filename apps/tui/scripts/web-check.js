async page => {
 const errors=[], failed=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('http://127.0.0.1:4321/');
 await page.getByRole('heading',{name:'Austin Delic.'}).waitFor();
 const projects=await page.locator('.project-row .row-title').allTextContents();
 if(projects.join('|')!=='Tactify|Still|Production systems')throw Error('Project parity failed');
 await page.locator('a#blog').click();await page.getByRole('heading',{name:'Blog posts'}).waitFor();
 const posts=await page.locator('#main .ruled-list li').count();if(posts!==3)throw Error('Published posts mismatch');
 await page.locator('#main .ruled-list a').first().click();await page.locator('article').waitFor();
 await page.locator('a#socials').click();await page.locator('.social-row').first().waitFor();
 const socials=await page.locator('.social-row').count();if(socials!==7)throw Error('Socials mismatch');
 await page.locator('a#home').click();await page.locator('[data-explore-trigger]').click();
 await page.locator('#black-hole-explore:not([hidden])').waitFor();
 await page.keyboard.press('Escape');await page.locator('#black-hole-explore[hidden]').waitFor({state:'attached'});
 await page.screenshot({path:'/tmp/austindelic-smoke/website-home.png'});
 return {projects,posts,socials,errors,failed};
}
