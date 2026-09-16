import { readFile, writeFile } from 'node:fs/promises';
let script = await readFile('app.js', 'utf8');
script = script.replace("  dialog.addEventListener('close', updateScroll);", `  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href], button:not([disabled])')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener('close', updateScroll);`);
await writeFile('app.js', script);
