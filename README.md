# Prelegal
AI assisted legal documentation generator for business scope applications.

## Project Status

This project is in progress. Development is expected to take approximately 1 week.

The template dataset is in place, all 11 document types can be created through AI chat, and users sign up and log in. **Accounts are temporary: the database is recreated each time the container starts, which deletes every account.** It isn't ready for real customers until that changes.

## Creating a Document

Log in and tell the AI assistant what you need. It recommends a document, or explains if it can't generate what you asked for and offers the closest match. It then asks for each required detail in turn, the agreement fills in as you go, and you download it as a PDF.

Your messages and the agreement's details are sent through the backend to an AI provider (OpenRouter, using Cerebras) to produce each reply. Prelegal doesn't save them, and a page refresh starts over.

The Mutual NDA uses its own Cover Page template. The other documents get a generated page that lists each deal value under the name the Standard Terms use for it, followed by the unmodified Standard Terms. `documents/documents.json` defines each document's fields. **Neither that page's wording nor the field descriptions have been legally reviewed.**

## Running Prelegal

You need Docker. Copy `.env.example` to `.env`, set `OPENROUTER_API_KEY`, and run the start script for your system:

| System | Start | Stop |
| --- | --- | --- |
| Mac | `scripts/start-mac.sh` | `scripts/stop-mac.sh` |
| Linux | `scripts/start-linux.sh` | `scripts/stop-linux.sh` |
| Windows | `scripts/start-windows.ps1` | `scripts/stop-windows.ps1` |

Then open [http://localhost:8000](http://localhost:8000) and create an account. The FastAPI backend serves the frontend from a single container. Its SQLite database is created from scratch each time the container starts, so you'll need to sign up again after a restart.

Before running it anywhere public:

- **Use HTTPS, and remove `PRELEGAL_COOKIE_SECURE` from `docker-compose.yml`,** so session cookies are only sent over encrypted connections. It's there because local use is plain HTTP.
- **Know the limits:** login attempts, signups and chat messages are limited in memory, per process, so run one worker. Anyone can still sign up, and each new account gets its own chat allowance, which spends your OpenRouter credit.
- **Passwords can't be reset,** because the app doesn't send email.

## Development

- **Frontend:** see the [frontend README](frontend/README.md) for the dev server, tests and other commands.
- **Backend:** with [uv](https://docs.astral.sh/uv/) installed, run these from `backend/`:

| Command | What it does |
| --- | --- |
| `uv run pytest` | Runs the tests, without calling the real model |
| `uv run --env-file ../.env pytest -m live` | Tests the real model, which costs a little credit |
| `PRELEGAL_COOKIE_SECURE=false uv run --env-file ../.env uvicorn app.main:app --port 8000` | Starts the backend on its own |

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
