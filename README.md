# Kerberos — veterinary clinic website

A static, responsive Romanian-language website. **`index.html` at the repository root is the homepage.** Everything required to run it is included locally: CSS, JavaScript, fonts, and images. No framework, dependency installation, backend, or build is required for GitHub Pages.

## Publish on GitHub Pages

1. Upload this project to your GitHub repository. Include `index.html`, `styles.css`, `fonts.css`, `app.js`, the entire `assets/` folder, and `.nojekyll` at the repository root.
2. Open **Settings → Pages** in that repository.
3. Choose **Deploy from a branch**, select the branch containing the files (usually `main` or `master`), select **`/ (root)`**, and save.
4. Open the website URL that GitHub displays after deployment finishes.

All asset paths are relative, so both `username.github.io` and `username.github.io/repository-name/` work. `.nojekyll` tells Pages to serve the static files directly. Do not upload the contents inside another enclosing folder.

Official instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Preview and edit

With Node.js installed, run `npm run dev`, then open http://127.0.0.1:4173. Edit the root files directly and refresh the browser. To emulate a GitHub project subpath, run `node server.mjs --base=/kerberos/` and open http://127.0.0.1:4173/kerberos/.

`npm run check` checks JavaScript syntax. `npm run build` optionally copies the public site into `dist/` for other static hosts. Generated `dist/` output and local QA artifacts are excluded from Git; GitHub Pages does not need them. `.openai/hosting.json` retains the previous Sites identity but is not needed for GitHub Pages.

## Design and behavior

- Editorial teal-and-orange design with responsive typography and original hero photography.
- Telephone appointment panel with opening hours, directions, native focus management, Escape dismissal, and working phone-link fallbacks without JavaScript.
- Expandable services, touch/keyboard team carousel with position indicator, active section navigation, and reading progress.
- Mobile appointment action hides when contact details are in view. Reduced-motion settings are respected.
- Self-hosted fonts and optimized imagery; no analytics or cookie-dependent widgets.

The old `original.html` was a captured reference of the previous website. It has been moved to the ignored `qa/` folder, and the redesigned homepage is now the root `index.html`.

## Content

Clinic details and staff/community photos come from https://kerberos-vet.com/. The hero was generated for this redesign. The Hungarian-language, community-project, and terms links lead to the original website. Appointment links call the clinic; there is no online booking backend. Keep the clinic details current before launch.
