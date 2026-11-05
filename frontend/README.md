# Prelegal frontend

A Next.js prototype for creating a Mutual NDA. Fill in the form, see the agreement update as you type, and download it as a PDF.

The app is a static site with no backend. What someone enters stays in their browser and isn't saved, and the PDF is generated in the browser.

## Run it

You need Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the static site into `out/` |
| `npm start` | Serves the built site from `out/` |
| `npm run lint` | Checks the code with ESLint |
| `npm test` | Runs the unit tests |
| `npm run test:e2e` | Builds the site and runs the browser tests |

Before the first browser test run, install the browser with `npx playwright install chromium`.

## How it works

1. At build time, `src/lib/loadTemplates.ts` reads the Mutual NDA templates from `../templates` and `src/lib/document.ts` parses them into a small document model.
2. In the browser, `src/lib/mnda.ts` validates the form and adds its values to the Cover Page. Values are added after parsing, so what someone types is never treated as markdown.
3. `DocumentPreview` and `MndaPdf` both render that model, as HTML and as a PDF.

Building requires the repository's `templates/` directory, so the site has to be built from a full checkout.

## Known limitations

- **Standard Terms aren't filled in.** The Cover Page states that the Standard Terms are identical to Common Paper's published version, so terms such as "Governing Law" stay as references to the Cover Page.
- **PDF characters are limited to Windows-1252.** The PDF uses the built-in Times fonts, which don't cover scripts such as Chinese or letters such as "Č". The form rejects these characters instead of printing them incorrectly.
- **Signing happens outside the app.** Signature and date lines are left blank in the PDF.
- **The PDF has no page numbers.** Its footer names the document section instead. Dynamic page numbers didn't render alongside the line height the document uses in `@react-pdf/renderer`.
