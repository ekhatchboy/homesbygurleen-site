# Google Sheets Lead Capture

This folder lets the realtor AI assistant send qualified leads straight into Google Sheets without Zapier.

## What it does

The website backend sends a webhook when it has both:

- lead intent
- contact information

The Google Apps Script web app receives that payload and appends a row to a `Leads` sheet.

## Setup

1. Create a new Google Sheet for leads.
2. In that sheet, open `Extensions` -> `Apps Script`.
3. Replace the default script with the contents of `Code.gs`.
4. In Apps Script, open `Project Settings`.
5. Add a script property named `WEBHOOK_SECRET`.
6. Paste a random secret value you will also use in your website backend.
7. Click `Deploy` -> `New deployment`.
8. Choose type `Web app`.
9. Set access to `Anyone` or `Anyone with the link`.
10. Copy the deployment URL.

## Website environment variables

Set these in your website deployment:

- `LEAD_WEBHOOK_URL` = your Apps Script web app URL
- `LEAD_WEBHOOK_SECRET` = the same secret stored in Apps Script

## Data written to the sheet

Each row stores:

- timestamp
- source
- buyer or seller intent
- timeline
- area
- budget
- contact info
- latest user message
- assistant reply
- realtor name
- brand name
- market
- business contact email
- transcript

## Notes

- The script auto-creates the `Leads` sheet if it does not exist.
- It also auto-adds the header row on first use.
- If you redeploy the Apps Script later, update `LEAD_WEBHOOK_URL` if Google gives you a new URL.
