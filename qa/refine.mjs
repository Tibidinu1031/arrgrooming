import { readFile, writeFile } from 'node:fs/promises';
let html = await readFile('index.html', 'utf8');
html = html.replace('<meta property="og:image"', '<meta name="color-scheme" content="light"><meta property="og:title" content="Kerberos — Medicină serioasă. Oameni calzi."><meta property="og:description" content="Îngrijire veterinară în Brașov, din 2007. Pentru ei. Alături de tine."><meta property="og:type" content="website"><meta property="og:locale" content="ro_RO"><meta property="og:image"');
html = html.replace('<div class="love-stamp"><span>FAMILIE</span><strong>100%</strong><span>DIN TOATĂ INIMA</span></div>', '<div class="love-stamp"><span>ÎMPREUNĂ DIN</span><strong>2007</strong><span>CU GRIJĂ, ÎN BRAȘOV</span></div>');
html = html.replace('class="button compact" href=', 'class="button compact" data-appointment href=');
html = html.replace('class="button" href="tel:+40268427981"', 'class="button" data-appointment href="tel:+40268427981"');
html = html.replace('class="mobile-call"', 'class="mobile-call" data-appointment');
html = html.replace('<div class="team-controls">', '<div class="team-controls"><span class="team-position" id="team-position" aria-live="polite" aria-atomic="true">01 — 03 / 05</span>');
html = html.replace('id="team-track" tabindex="0"', 'id="team-track" role="region" aria-roledescription="carusel" tabindex="0"');
html = html.replace('<div class="service-list">', '<div class="service-list" aria-label="Servicii veterinare — selectează pentru detalii">');
html = html.replace('</header>', '<div class="reading-progress" aria-hidden="true"></div></header>');
html = html.replace('<span>Din 2007, în Brașov</span></div>', '<a href="#contact">Ne găsești în Brașov <span aria-hidden="true">↗</span></a></div>');
html = html.replace('</body>', `
<dialog id="appointment-dialog" aria-labelledby="appointment-title" aria-describedby="appointment-description">
  <button class="dialog-close round-link" type="button" aria-label="Închide fereastra de programare">×</button>
  <div class="dialog-intro"><span class="eyebrow">PRIMUL PAS, ÎMPREUNĂ</span><h2 id="appointment-title">Hai să stabilim<br><em>o vizită.</em></h2><p id="appointment-description">Programările se fac telefonic. Spune-ne ce îl aduce pe prietenul tău la noi și găsim împreună un moment potrivit.</p></div>
  <a class="dialog-phone" href="tel:+40268427981"><span><small>SUNĂ PENTRU PROGRAMARE</small><strong>0268 427 981</strong></span><span aria-hidden="true">↗</span></a>
  <div class="dialog-hours"><span>Luni – Vineri <strong>09:00 – 18:00</strong></span><span>Sâmbătă <strong>09:00 – 12:00</strong></span><span>Duminică <strong>Închis</strong></span></div>
  <div class="dialog-address"><span>Str. Codrii Cosminului 80, Brașov</span><a href="https://www.google.com/maps/search/?api=1&query=Kerberos+Vet+Strada+Codrii+Cosminului+80+Brasov" target="_blank" rel="noopener">Vezi traseul ↗</a></div>
  <a class="dialog-emergency" href="tel:+40757541120"><span>Ai o urgență?</span><strong>0757 541 120 ↗</strong></a>
</dialog>
</body>`);
// Keep the editable source readable without requiring a build tool.
html = html.replace(/></g, '>\n<');
await writeFile('index.html', html);
let css = await readFile('styles.css', 'utf8');
css = css.replace(/font-size:([^;}]+)/g, (_, value) => 'font-size:' + value.replace(/([\d.]+)px/g, (_, size) => `${Number(size) / 16}rem`));
await writeFile('styles.css', css);
