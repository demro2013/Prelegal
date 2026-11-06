# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation creates all 11 document types through AI chat, served by the FastAPI backend from a Docker container. The catalog has 12 files because the Mutual NDA's cover page and terms form one document. User authentication and document persistence aren't built yet.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
Consider statically building the frontend and serving it via FastAPI, if that will work.  
There should be scripts in scripts/ for:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

## Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Post Activity  

After you finish each Jira task and the task has been marked for completion, update the CLAUDE.md file here and add at the bottom of the document what each task was by using the Jira task # as the header and in a brief summary describe the implementation details below it.

## KAN-6

**Status:** Complete

Built the technical foundation for V1 with no product feature changes. `backend/` is a uv FastAPI project with a `create_app` factory, `GET /api/health`, and the static frontend mounted last at `/`. Each startup deletes and recreates the SQLite database with an empty `users` table (stdlib `sqlite3`); sign up and sign in endpoints and UI aren't built yet. A multi-stage `Dockerfile` builds the frontend and runs as a non-root user, and `docker-compose.yml` passes `.env` at runtime with a healthcheck. `scripts/` has start and stop scripts for Mac, Linux and Windows. Backend tests run with `cd backend && uv run pytest`.

## KAN-7

**Status:** Complete

Replaced the Mutual NDA form with a freeform AI chat beside the live preview. `POST /api/chat` (`backend/app/routes/chat.py`) takes the message history, current values and today's date, and returns a reply plus field updates, where null means no change. It's stateless: the browser holds the conversation, and nothing is saved or logged. `backend/app/llm.py` is the only module that imports LiteLLM and calls the model through OpenRouter and Cerebras with Structured Outputs. `chat_schema.py` holds the schemas and drops unusable values (blanks, invalid years and dates), and `prompts/mnda.py` holds the system prompt. In the frontend, `ChatPane` is the conversation UI, `lib/chat.ts` sends messages and merges updates, and `validateMnda` still gates the PDF download. `next dev` reaches the backend through `NEXT_PUBLIC_API_BASE` and CORS. Playwright tests mock the chat API, and `uv run --env-file ../.env pytest -m live` tests the real model.


## KAN-8

**Status:** Complete

Expanded the chat to all 11 document types. `documents/documents.json` is the single source for each document's fields, roles and titles, and `backend/tests/test_documents.py` fails if a template's linked term is neither listed nor deliberately excluded. `POST /api/chat` now takes and returns a `documentType`, flat `values` and a list of key/value `updates`, a fixed shape for every document that the server checks by field type. When the model chooses a document, the route calls it a second time with that document's fields, so details already given are captured. Only the parties carry over when switching. `prompts/document.py` builds the prompt, including how to handle unsupported requests. In the frontend, `lib/agreement.ts` builds the agreement: the Mutual NDA keeps its Cover Page template, and the others get a generated page of values under the template's own terms, with empty optional fields printed as "Not specified". The parser renders every span class and rebuilds nested numbering such as 5.2 and (a), because the terms cite sections by number. Each document's parsed templates are a static `/templates/<id>.json` fetched once it's chosen.
