# Realtor AI Agent Starter

This project is now a simple realtor website plus a live Google Gemini-ready backend for the Homes By Gurleen assistant.

## What is included

- A polished landing page in `index.html`
- A responsive design in `styles.css`
- A chat assistant UI in `script.js`
- A serverless Gemini backend in `api/chat.js`
- A health check endpoint in `api/health.js`
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

There is also a `GET /api/health` endpoint that helps verify whether the server is up and whether `OPENAI_API_KEY` is present.

## Local development

This project now expects a Node.js environment for the live Gemini backend.

1. Install Node.js 20 or newer.
2. Run `npm install`
3. Copy `.env.example` to `.env.local`
4. Add your real Gemini API key to `.env.local`
5. Run `npm run dev`
6. Open the local Vercel URL and test the assistant

## Environment variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL` with default `gemini-3-flash-preview`
- `BRAND_NAME`
- `REALTOR_NAME`
- `MARKET_NAME`
- `CONTACT_EMAIL`
- `LEAD_WEBHOOK_URL` for optional Google Sheets or CRM forwarding
- `LEAD_WEBHOOK_SECRET` for securing the lead webhook

## Recommended production setup

Because the domain is with GoDaddy, the simplest setup is:

1. Keep the domain in GoDaddy.
2. Host the project on Vercel.
3. Add `GEMINI_API_KEY` and optional `GEMINI_MODEL` in Vercel project settings.
4. Point the GoDaddy domain DNS to Vercel.
5. Store the Gemini API key only on the backend, never in browser JavaScript.

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
