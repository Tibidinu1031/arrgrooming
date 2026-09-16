const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'msedge' });
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
 const errors = [], failed = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('response', r => { if (r.status() >= 400) failed.push(r.url()); });
 await page.goto('http://127.0.0.1:4173/kerberos/');
 await page.evaluate(() => document.fonts.ready);
 await page.locator('header [data-appointment]').click();
 assert(await page.locator('#appointment-dialog').evaluate(el => el.open));
 assert.equal(await page.locator('#appointment-dialog .dialog-phone').getAttribute('href'), 'tel:+40268427981');
 for(let i=0;i<9;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)));}
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#appointment-dialog').evaluate(el => el.open), false);
 assert(await page.locator('header [data-appointment]').evaluate(el => el === document.activeElement));
 await page.getByText('Stomatologie', { exact: true }).click();
 assert.equal(await page.locator('details[open] h3').textContent(), 'Stomatologie');
 await page.locator('#team-next').click();
 assert(await page.locator('#team-track').evaluate(el => el.scrollLeft) > 0);
 for(const width of [320,390,640,768,900,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth), false, 'overflow '+width);
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 console.log('200% text overflow:',await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth));
 await page.screenshot({path:'qa/text-zoom.png'});
 await page.evaluate(()=>document.documentElement.style.fontSize='');
 for(let y=0;y<await page.evaluate(()=>document.body.scrollHeight);y+=600){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(80);}
 assert(await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)));
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
 await page.screenshot({path:'qa/v2-desktop.png',fullPage:true});
 await page.locator('header [data-appointment]').click();
 await page.screenshot({path:'qa/v2-dialog.png'});
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>scrollTo(0,0));
 await page.getByRole('button',{name:'Deschide meniul'}).click();
 assert(await page.locator('#navigation').isVisible());await page.keyboard.press('Escape');assert(await page.locator('#navigation').isHidden());
 await page.screenshot({path:'qa/v2-mobile.png',fullPage:true});
 await page.locator('#contact').scrollIntoViewIfNeeded();await page.waitForTimeout(100);
 assert.equal(await page.locator('.mobile-call').isVisible(),false);
 console.log(JSON.stringify({errors,failed,allImagesLoaded:true,appointmentFocusAndEscape:true,carousel:true,accordion:true,mobileMenu:true,repositorySubpath:true}));
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto('http://127.0.0.1:4173/kerberos/');assert.equal(await nojs.locator('[data-appointment]').first().getAttribute('href'),'tel:+40268427981');
 await browser.close();
})();
