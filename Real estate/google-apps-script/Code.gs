const SHEET_NAME = "Leads";
const HEADER_ROW = [
  "Timestamp",
  "Source",
  "Intent",
  "Timeline",
  "Area",
  "Budget",
  "Contact",
  "Latest User Message",
  "Assistant Reply",
  "Realtor Name",
  "Brand Name",
  "Market",
  "Contact Email",
  "Transcript"
];

function doPost(e) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
    const providedSecret = getHeaderValue_(e, "x-webhook-secret");

    if (secret && secret !== providedSecret) {
      return jsonResponse_({
        ok: false,
        error: "Unauthorized"
      }, 401);
    }

    const payload = JSON.parse(e.postData.contents || "{}");
    const sheet = getLeadSheet_();

    sheet.appendRow([
      payload.sentAt || new Date().toISOString(),
      payload.source || "",
      payload.leadProfile?.intent || "",
      payload.leadProfile?.timeline || "",
      payload.leadProfile?.area || "",
      payload.leadProfile?.budget || "",
      payload.leadProfile?.contact || "",
      payload.message || "",
      payload.reply || "",
      payload.businessConfig?.realtorName || "",
      payload.businessConfig?.brandName || "",
      payload.businessConfig?.market || "",
      payload.businessConfig?.contactEmail || "",
      formatTranscript_(payload.transcript || [])
    ]);

    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    }, 500);
  }
}

function getLeadSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
  }

  return sheet;
}

function formatTranscript_(transcript) {
  if (!Array.isArray(transcript) || !transcript.length) {
    return "";
  }

  return transcript
    .map((entry) => `${entry.role || "unknown"}: ${entry.content || ""}`)
    .join("\n");
}

function getHeaderValue_(e, headerName) {
  const headers = (e && e.headers) || {};
  const target = String(headerName).toLowerCase();

  for (const key in headers) {
    if (String(key).toLowerCase() === target) {
      return headers[key];
    }
  }

  return "";
}

function jsonResponse_(data, statusCode) {
  const output = ContentService
    .createTextOutput(JSON.stringify({
      status: statusCode || 200,
      ...data
    }))
    .setMimeType(ContentService.MimeType.JSON);

  return output;
}
