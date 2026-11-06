# Prelegal frontend

A Next.js app for creating legal agreements. Chat with the AI assistant, see the agreement fill in as you go, and download it as a PDF.

The app is a static site, which the FastAPI backend serves in production. Each chat message goes to the backend's `/api/chat` endpoint with the conversation, the chosen document and its current values. Nothing is saved, and the PDF is generated in the browser.

## Run it

You need Node.js 20.9 or later. For the chat to work, [start the backend](../README.md#development) on port 8000 and create `frontend/.env.local` containing:

```bash
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

Then run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the static site into `out/` |
| `npm start` | Serves the built site from `out/` |
| `npm run lint` | Checks the code with ESLint |
| `npm test` | Runs the unit tests |
| `npm run test:e2e` | Builds the site and runs the browser tests, with the chat API mocked |

Before the first browser test run, install the browser with `npx playwright install chromium`.

## How it works

1. At build time, `src/lib/loadTemplates.ts` reads `../documents/documents.json` and `../templates`, and `src/lib/document.ts` parses each template into a small document model. Each document's result is written to `/templates/<id>.json`, which the browser fetches once that document is chosen.
2. In the browser, `src/lib/chat.ts` sends each message to the backend and merges the field updates in its reply into the current values.
3. `src/lib/agreement.ts` builds the agreement: `src/lib/mnda.ts` fills in the Mutual NDA's Cover Page, and other documents get a generated page. Values are added after parsing, so what someone types is never treated as markdown. `src/lib/documents.ts` validates them before download.
4. `DocumentPreview` and `DocumentPdf` both render that model, as HTML and as a PDF.

Building requires the repository's `templates/` and `documents/` directories, so the site has to be built from a full checkout.

## Known limitations

- **The AI can make mistakes.** Review the agreement in the preview before downloading it. To correct something, tell the assistant, since there's no form to edit.
- **Standard Terms aren't filled in.** They stay identical to Common Paper's published text, so terms such as "Governing Law" stay as references to the first page.
- **Generated pages have no modifications section.** Only the Mutual NDA's Cover Page can record changes to the Standard Terms.
- **One document at a time.** Companion documents, such as an SLA for a Cloud Service Agreement, are created separately. A page refresh starts over.
- **PDF characters are limited to Windows-1252.** The PDF uses the built-in Times fonts, which don't cover scripts such as Chinese or letters such as "Č". The app blocks the download and says which details to change, instead of printing these characters incorrectly.
- **Signing happens outside the app.** Signature and date lines are left blank in the PDF.
- **The PDF has no page numbers.** Its footer names the document section instead. Dynamic page numbers didn't render alongside the line height the document uses in `@react-pdf/renderer`.
