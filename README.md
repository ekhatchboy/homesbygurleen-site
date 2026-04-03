# Realtor AI Agent Starter

This project is now a simple realtor website plus a live multi-provider AI backend for the Homes By Gurleen assistant. It also includes a private CRM dashboard that can run on Cloudflare Pages while using Google Sheets as the database.

## What is included

- A polished landing page in `index.html`
- A responsive design in `styles.css`
- A chat assistant UI in `script.js`
- A serverless multi-provider AI backend in `api/chat.js`
- A health check endpoint in `api/health.js`
- A Cloudflare-ready CRM dashboard in `crm.html`, `crm.css`, and `crm.js`
- Cloudflare Pages Functions in `functions/crm/`
- Vercel-ready project files in `package.json` and `vercel.json`

## How to open the front end right now

1. Open `index.html` in a browser.
2. Test the chat panel in the "AI Home Concierge" section.
3. If the backend is not deployed yet, the assistant falls back to demo mode automatically.

## Backend behavior

The site now includes a backend endpoint:

- Front end sends `POST /api/chat`
- Request body includes:
  - `message`
  - `leadProfile`
- Response body should return JSON:

```json
{
  "reply": "Assistant response here"
}
```

There is also a `GET /api/health` endpoint that helps verify whether the server is up and which AI provider keys are present.

## Multi-provider AI fallback

The chat backend now tries providers in this order:

1. Gemini
2. OpenRouter free model chain
3. Groq
4. OpenAI

If all live providers fail, the front end still falls back to demo mode automatically.

For the most budget-friendly setup, a good starting combo is:

- Gemini as primary
- OpenRouter free-model chain as fallback
- optional OpenAI as a third backup

## CRM dashboard

The project now includes a lightweight CRM experience that reads from and updates your Google Sheet:

- `crm.html` is the private dashboard page
- `functions/crm/leads.js` loads records from Apps Script
- `functions/crm/update.js` writes lead edits back to Apps Script
- `google-apps-script/Code.gs` now supports:
  - `setupSheets()`
  - a `Master Leads` tab
  - a `Follow-Up Guide` tab
  - secure CRM lead reads
  - secure CRM lead updates

The CRM is designed to feel more like a mini HubSpot pipeline while still using Google Sheets as the source of truth.

## Local development

This project now expects a Node.js environment for the live AI backend.

1. Install Node.js 20 or newer.
2. Run `npm install`
3. Copy `.env.example` to `.env.local`
4. Add your real AI provider key or keys to `.env.local`
5. Run `npm run dev`
6. Open the local Vercel URL and test the assistant

## Environment variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL` with default `gemini-3-flash-preview`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` with comma-separated free fallbacks, default `meta-llama/llama-3.1-8b-instruct:free,mistralai/mistral-7b-instruct:free,google/gemma-2-9b-it:free`
- `GROQ_API_KEY`
- `GROQ_MODEL` with default `llama-3.1-8b-instant`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` with default `gpt-4.1-mini`
- `APP_BASE_URL`
- `BRAND_NAME`
- `REALTOR_NAME`
- `MARKET_NAME`
- `CONTACT_EMAIL`
- `LEAD_WEBHOOK_URL` for optional Google Sheets or CRM forwarding
- `LEAD_WEBHOOK_SECRET` for securing the lead webhook
- `CRM_SHEETS_URL` for Cloudflare CRM read/write access to your Apps Script web app
- `CRM_API_TOKEN` for securing CRM dashboard actions

## Recommended production setup

Because the domain is with GoDaddy, the simplest setup is:

1. Keep the domain in GoDaddy.
2. Host the project on Vercel.
3. Add at least one AI provider key in Vercel project settings.
4. Point the GoDaddy domain DNS to Vercel.
5. Store the Gemini API key only on the backend, never in browser JavaScript.

## Cloudflare Pages CRM setup

If you want the CRM running on Cloudflare Pages instead of Vercel:

1. Push this project to GitHub.
2. In Cloudflare Pages, set the root directory to `cloudflare-crm`.
3. Set the framework preset to `None`.
4. Leave the build command blank.
5. Leave the build output directory blank.
6. Add Cloudflare environment variables:
   - `CRM_SHEETS_URL`
   - `CRM_API_TOKEN`
7. In Google Apps Script, add a matching script property:
   - `CRM_API_TOKEN`
8. Run `setupSheets()` once in Apps Script to create `Master Leads` and `Follow-Up Guide`.
9. Open `/crm.html` on the deployed Cloudflare Pages site.

This keeps the CRM server-side bridge on Cloudflare while Google Sheets remains the database.

### Why the separate `cloudflare-crm` folder

That folder contains only the Cloudflare CRM files and Pages Functions, so Cloudflare does not need to install the older Vercel tooling from the main site repo just to deploy the dashboard.

## Suggested assistant instructions

When you connect Gemini, the assistant should:

- Speak warmly and professionally.
- Help buyers, sellers, and referrals.
- Ask one question at a time.
- Prioritize collecting:
  - name
  - email
  - phone
  - buyer/seller intent
  - timeline
  - area
  - budget or price expectations
- End by offering one clear next step:
  - consultation
  - showing
  - valuation call

## Deployment checklist

1. Create a GitHub repo and upload this project.
2. Import the repo into Vercel.
3. Add the environment variables before the first production deploy.
4. Confirm `/api/health` returns `ok: true`.
5. In GoDaddy DNS, connect the domain to Vercel using the records Vercel gives you.
6. Replace placeholder branding, city, and contact details with the real business info.

## Lead forwarding

If you add a `LEAD_WEBHOOK_URL`, the backend will forward qualified leads once it has both:

- `intent`
- `contact`

This works well with:

- Google Apps Script web apps
- a custom CRM endpoint

The payload includes the lead profile, latest message, assistant reply, transcript, and timestamp.

## Google Sheets setup

This repo includes a ready-to-use Apps Script in `google-apps-script/Code.gs`.

1. Create a Google Sheet.
2. Open Apps Script from that sheet.
3. Paste in `google-apps-script/Code.gs`.
4. Add a script property called `WEBHOOK_SECRET`.
5. Deploy it as a web app.
6. Put the web app URL into `LEAD_WEBHOOK_URL`.
7. Put the same secret into `LEAD_WEBHOOK_SECRET`.

The helper notes are in `google-apps-script/README.md`.

For the CRM layer, also add this script property in Apps Script:

- `CRM_API_TOKEN`

Use the same value in Cloudflare Pages for:

- `CRM_API_TOKEN`

## Good next version ideas

- Replace placeholder branding with her real name and headshot
- Add MLS or IDX search
- Connect leads to a CRM
- Add appointment booking
- Add neighborhood pages and seller guides

## If you want me to keep going

I can build the next step too:

- a more personalized design using her brand
- seller and buyer intake forms
- CRM or Google Sheets lead capture
- conversation memory and lead transcripts
