# Prelegal
AI assisted legal documentation generator for business scope applications.

## Project Status

This project is in progress. Development is expected to take approximately 1 week.

The template dataset is in place, and a prototype of the Mutual NDA creator is available in [`frontend/`](frontend/README.md). The other templates aren't available in the app yet.

## Mutual NDA Creator

Fill in a form, see the Mutual NDA update as you type, and download it as a PDF. Everything runs in the browser, so what you enter isn't sent anywhere or saved.

```bash
cd frontend
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). See the [frontend README](frontend/README.md) for tests and other commands.

## Legal Templates

The `templates/` directory contains the markdown agreement templates that Prelegal will modify for users, and `catalog.json` in the project root lists them.

| Template | File |
| --- | --- |
| Mutual Non-Disclosure Agreement Cover Page | `Mutual-NDA-coverpage.md` |
| Mutual Non-Disclosure Agreement Standard Terms | `Mutual-NDA.md` |
| Cloud Service Agreement | `CSA.md` |
| Service Level Agreement | `sla.md` |
| Data Processing Agreement | `DPA.md` |
| Design Partner Agreement | `design-partner-agreement.md` |
| Professional Services Agreement | `psa.md` |
| Partnership Agreement | `Partnership-Agreement.md` |
| Business Associate Agreement | `BAA.md` |
| Software License Agreement | `Software-License-Agreement.md` |
| Pilot Agreement | `Pilot-Agreement.md` |
| AI Addendum | `AI-Addendum.md` |

### Catalog

`catalog.json` is an array with one entry per template. `filename` is relative to `templates/`.

```json
{
  "name": "AI Addendum",
  "description": "Addendum supplementing an existing agreement with terms for AI services...",
  "filename": "AI-Addendum.md"
}
```

### Working with the templates

- **Markup:** the templates contain Common Paper's HTML, such as `<span class="coverpage_link">`, which marks variable fields. Code that displays or fills in a template needs to handle it.
- **Standard terms only:** the Mutual NDA is the only agreement with a cover page in this dataset. The other templates contain standard terms and don't include the cover page or order form that holds deal-specific terms.

### License

The templates were created by [Common Paper](https://commonpaper.com) and are used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified versions must keep the attribution and indicate that changes were made. See [`templates/LICENSE.txt`](templates/LICENSE.txt) for details and the source of each file.
