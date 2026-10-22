# SFDPP by Soulflame — Premium OS (preview)

This is the approved premium product-passport OS interface, added **non-destructively** under `/sfdpp`.

- Landing page: `/sfdpp` (redirect/rewrite), source `sfdpp/index.html`
- Styles: `sfdpp/assets/os.css`
- Behavior: `sfdpp/assets/os.js`
- Assets are embedded as data: images in CSS and logo within HTML.
- Preserves strict existing Vercel CSP: no inline script, inline CSS, or style attributes.
- Battery module links to the existing canonical production route `/battery-master`; no battery API/migration changes.
- Company and Worker/Admin interfaces in this marketing UI are **demos**; no protected information is exposed.
- **No promotion, main merge, production deployment, database migrations, or release gate changes.**
- Review mobile/desktop behavior, menu keyboard accessibility, search, modal dialogs, and contrast.
- The stage-gate and compliance status are not upgraded by this UI change.

Proposed promotion later: maintain `/battery-master` and historical dashboard route, then change the root page only after owner approval and production smoke tests.
