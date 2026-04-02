const MASTER_SHEET_NAME = "Master Leads";
const GUIDE_SHEET_NAME = "Follow-Up Guide";
const MASTER_HEADER_ROW = [
  "Lead ID",
  "Date",
  "Lead Type",
  "Source",
  "Name",
  "Phone",
  "Email",
  "Area",
  "Timeline",
  "Budget",
  "Goal / Context",
  "Latest Message / Notes",
  "Realtor",
  "Brand",
  "Market",
  "Business Email",
  "Transcript / Raw Responses",
  "Consent to Text",
  "Lead Status",
  "Last Contact Date",
  "Next Follow-Up Date",
  "Follow-Up Rank",
  "Text Status",
  "Assigned Message"
];

function setupSheets() {
  const masterSheet = getMasterLeadSheet_();
  ensureGuideSheet_();
  formatMasterLeadSheet_(masterSheet);
}

function doGet(e) {
  try {
    const mode = String((e && e.parameter && e.parameter.mode) || "").trim();

    if (mode === "leads") {
      authorizeCrm_(e);
      setupSheets();

      return jsonResponse_({
        ok: true,
        leads: getLeadRecords_()
      });
    }

    return jsonResponse_({
      ok: true,
      message: "Homes By Gurleen CRM web app is running."
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    }, 500);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = String(payload.action || "").trim();

    if (action === "updateLead") {
      authorizeCrm_(e);
      setupSheets();

      return jsonResponse_({
        ok: true,
        lead: handleLeadUpdate_(payload)
      });
    }

    const secret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
    const providedSecret = payload.webhookSecret || getRequestParameter_(e, "webhookSecret") || getHeaderValue_(e, "x-webhook-secret");

    if (secret && secret !== providedSecret) {
      return jsonResponse_({
        ok: false,
        error: "Unauthorized"
      }, 401);
    }

    setupSheets();
    const sheet = getMasterLeadSheet_();
    const contactDetails = extractContactDetails_(payload.leadProfile?.contact || "");
    const leadType = normalizeLeadType_(payload.leadProfile?.intent || "AI Chat");

    sheet.appendRow([
      createLeadId_(),
      payload.sentAt || new Date().toISOString(),
      leadType,
      "AI Chat",
      "",
      contactDetails.phone,
      contactDetails.email,
      payload.leadProfile?.area || "",
      payload.leadProfile?.timeline || "",
      payload.leadProfile?.budget || "",
      "",
      payload.message || "",
      payload.businessConfig?.realtorName || "",
      payload.businessConfig?.brandName || "",
      payload.businessConfig?.market || "",
      payload.businessConfig?.contactEmail || "",
      formatTranscript_(payload.transcript || []),
      "",
      "New",
      "",
      formatDate_(addDays_(new Date(), 2)),
      "Rank A",
      "Pending Review",
      buildAssignedMessage_(leadType)
    ]);

    formatMasterLeadSheet_(sheet);

    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    }, 500);
  }
}

function onFormSubmit(e) {
  setupSheets();
  const sheet = getMasterLeadSheet_();
  const sourceSheetName = e && e.range ? e.range.getSheet().getName() : "Form";
  const namedValues = (e && e.namedValues) || {};
  const contactDetails = extractContactDetailsFromNamedValues_(namedValues);
  const leadType = inferLeadTypeFromSheetName_(sourceSheetName);

  sheet.appendRow([
    createLeadId_(),
    extractTimestamp_(e, namedValues),
    leadType,
    sourceSheetName,
    findFieldValue_(namedValues, ["name", "full name", "client name", "referral name"]),
    contactDetails.phone,
    contactDetails.email,
    findFieldValue_(namedValues, ["area", "city", "location", "preferred areas", "target area", "property address"]),
    findFieldValue_(namedValues, ["timeline", "timing", "desired timeline", "purchase timing"]),
    findFieldValue_(namedValues, ["budget", "budget range", "price range"]),
    findFieldValue_(namedValues, ["goal", "main goal", "investment goal", "property type", "referral type", "financing status", "financing"]),
    findFieldValue_(namedValues, ["notes", "must-haves", "anything gurleen should know", "anything else", "message"]),
    "Gurleen Chahal",
    "Homes By Gurleen",
    "",
    "gurleen@homesbygurleen.com",
    formatNamedValues_(namedValues),
    "",
    "New",
    "",
    formatDate_(addDays_(new Date(), 2)),
    "Rank A",
    "Pending Review",
    buildAssignedMessage_(leadType)
  ]);

  formatMasterLeadSheet_(sheet);
}

function getMasterLeadSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(MASTER_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(MASTER_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(MASTER_HEADER_ROW);
  }

  formatMasterLeadSheet_(sheet);
  return sheet;
}

function formatMasterLeadSheet_(sheet) {
  if (sheet.getLastRow() < 1) {
    return;
  }

  const headerRange = sheet.getRange(1, 1, 1, MASTER_HEADER_ROW.length);
  headerRange
    .setFontWeight("bold")
    .setBackground("#f1e6d6")
    .setFontColor("#241b18");

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, MASTER_HEADER_ROW.length);
  sheet.setRowHeight(1, 28);

  const leadInfoRange = sheet.getRange(1, 1, 1, 7);
  const opportunityRange = sheet.getRange(1, 8, 1, 5);
  const businessRange = sheet.getRange(1, 13, 1, 4);
  const transcriptRange = sheet.getRange(1, 17, 1, 1);
  const workflowRange = sheet.getRange(1, 18, 1, 7);

  leadInfoRange.setBackground("#efe2cf");
  opportunityRange.setBackground("#f4eadc");
  businessRange.setBackground("#eadcc6");
  transcriptRange.setBackground("#e2d2bc");
  workflowRange.setBackground("#d7e6d8");

  if (!sheet.getFilter() && sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), MASTER_HEADER_ROW.length).createFilter();
  }

  applyDropdowns_(sheet);
  applyStatusFormatting_(sheet);
}

function ensureGuideSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(GUIDE_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(GUIDE_SHEET_NAME);
  }

  if (sheet.getLastRow() > 0) {
    return;
  }

  const rows = [
    ["Homes By Gurleen Follow-Up Guide", ""],
    ["", ""],
    ["Lead Status", "Meaning"],
    ["New", "Brand new lead that just came in."],
    ["Active", "Currently in conversation or being worked."],
    ["Warm", "Interested lead but not urgent right now."],
    ["Closed", "No further follow-up needed."],
    ["", ""],
    ["Lead Status Colors", "Meaning"],
    ["New", "Light blue"],
    ["Active", "Bright green"],
    ["Warm", "Light peach"],
    ["Closed", "Light gray"],
    ["", ""],
    ["Follow-Up Rank", "Meaning"],
    ["Rank A", "Highest priority lead. Follow up quickly."],
    ["Rank B", "Important lead. Keep warm and follow up consistently."],
    ["Rank C", "Lower urgency lead. Follow up less frequently."],
    ["", ""],
    ["Suggested Timing", "Recommendation"],
    ["Rank A", "2 days after lead comes in."],
    ["Rank B", "5 days after last contact."],
    ["Rank C", "7 days after last contact."],
    ["", ""],
    ["Text Status", "Meaning"],
    ["Pending Review", "Needs review before outreach."],
    ["Ready", "Ready for outreach."],
    ["Sent", "Outreach completed."],
    ["Skipped", "No outreach sent."],
    ["", ""],
    ["Text Status Colors", "Meaning"],
    ["Pending Review", "Light peach"],
    ["Ready", "Light green"],
    ["Sent", "Light purple"],
    ["Skipped", "Light gray"],
    ["", ""],
    ["Next Follow-Up Date Colors", "Meaning"],
    ["Tomorrow", "Yellow"],
    ["Today", "Light red"],
    ["Overdue", "Dark red"],
    ["", ""],
    ["Simple Workflow", "Steps"],
    ["1", "New lead comes in."],
    ["2", "Review the lead details."],
    ["3", "Set Consent to Text if appropriate."],
    ["4", "Review Assigned Message."],
    ["5", "Reach out manually or through your own workflow."],
    ["6", "Update Last Contact Date."],
    ["7", "Adjust Follow-Up Rank if needed."],
    ["8", "Set the next Next Follow-Up Date."]
  ];

  sheet.clear();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 2);
  sheet.getRange("A1:B1").setFontWeight("bold").setFontSize(14).setBackground("#eadcc6");
  [3, 9, 15, 20, 25, 31, 36, 41].forEach((row) => {
    sheet.getRange(row, 1, 1, 2).setFontWeight("bold").setBackground("#f1e6d6");
  });
}

function extractContactDetails_(contactValue) {
  const value = String(contactValue || "").trim();
  const emailMatch = value.match(/\S+@\S+\.\S+/);
  const phoneMatch = value.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);

  return {
    email: emailMatch ? emailMatch[0] : "",
    phone: phoneMatch ? phoneMatch[0] : ""
  };
}

function extractContactDetailsFromNamedValues_(namedValues) {
  const combinedValues = Object.values(namedValues)
    .flat()
    .join(" ");

  return {
    phone: findFieldValue_(namedValues, ["phone", "phone number", "best phone"]) || extractContactDetails_(combinedValues).phone,
    email: findFieldValue_(namedValues, ["email", "best contact email"]) || extractContactDetails_(combinedValues).email
  };
}

function findFieldValue_(namedValues, keywords) {
  const keywordList = keywords.map((keyword) => keyword.toLowerCase());

  for (const [key, value] of Object.entries(namedValues)) {
    const normalizedKey = String(key).toLowerCase();

    if (keywordList.some((keyword) => normalizedKey.includes(keyword))) {
      return Array.isArray(value) ? String(value[0] || "").trim() : String(value || "").trim();
    }
  }

  return "";
}

function extractTimestamp_(e, namedValues) {
  const timestampField = findFieldValue_(namedValues, ["timestamp"]);

  if (timestampField) {
    return timestampField;
  }

  if (e && e.values && e.values.length) {
    return e.values[0];
  }

  return new Date().toISOString();
}

function createLeadId_() {
  return `HBG-${Utilities.getUuid().slice(0, 8).toUpperCase()}`;
}

function inferLeadTypeFromSheetName_(sheetName) {
  const normalized = String(sheetName || "").toLowerCase();

  if (normalized.includes("buyer")) {
    return "Buyer";
  }

  if (normalized.includes("seller")) {
    return "Seller";
  }

  if (normalized.includes("investor")) {
    return "Investor";
  }

  if (normalized.includes("referral")) {
    return "Referral";
  }

  return "Form Lead";
}

function normalizeLeadType_(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "AI Chat";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function addDays_(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function buildAssignedMessage_(leadType) {
  const type = String(leadType || "").toLowerCase();

  if (type === "buyer") {
    return "Hi, just following up on your buyer inquiry with Homes By Gurleen. Let me know if you'd like to talk through next steps.";
  }

  if (type === "seller") {
    return "Hi, just following up on your seller inquiry with Homes By Gurleen. Let me know if you'd like to discuss timing or next steps.";
  }

  if (type === "investor") {
    return "Hi, just following up on your investor inquiry with Homes By Gurleen. I'd be happy to continue the conversation when you're ready.";
  }

  if (type === "referral") {
    return "Hi, just following up on the referral sent to Homes By Gurleen. Let me know the best next step when you're ready.";
  }

  return "Hi, just following up from Homes By Gurleen. Let me know if you'd like to continue the conversation.";
}

function formatTranscript_(transcript) {
  if (!Array.isArray(transcript) || !transcript.length) {
    return "";
  }

  return transcript
    .map((entry) => `${entry.role || "unknown"}: ${entry.content || ""}`)
    .join("\n");
}

function formatNamedValues_(namedValues) {
  return Object.entries(namedValues)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
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

function authorizeCrm_(e) {
  const expected = PropertiesService.getScriptProperties().getProperty("CRM_API_TOKEN");
  const provided = getRequestParameter_(e, "crmToken") || getHeaderValue_(e, "x-crm-token");

  if (!expected || expected !== provided) {
    throw new Error("Unauthorized");
  }
}

function getRequestParameter_(e, key) {
  if (!e || !e.parameter) {
    return "";
  }

  return String(e.parameter[key] || "").trim();
}

function getLeadRecords_() {
  const sheet = getMasterLeadSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  return values.slice(1)
    .filter((row) => row.some((value) => String(value || "").trim()))
    .map((row, index) => {
      const record = {};
      headers.forEach((header, headerIndex) => {
        record[header] = row[headerIndex] || "";
      });
      record._rowNumber = index + 2;
      return record;
    });
}

function handleLeadUpdate_(payload) {
  const leadId = String(payload.leadId || "").trim();

  if (!leadId) {
    throw new Error("Missing leadId");
  }

  const sheet = getMasterLeadSheet_();
  const headers = sheet.getRange(1, 1, 1, MASTER_HEADER_ROW.length).getValues()[0];
  const leadIdColumn = headers.indexOf("Lead ID") + 1;

  if (!leadIdColumn) {
    throw new Error("Lead ID column not found");
  }

  const leadIds = sheet.getRange(2, leadIdColumn, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  const rowOffset = leadIds.findIndex(([value]) => String(value).trim() === leadId);

  if (rowOffset === -1) {
    throw new Error("Lead not found");
  }

  const rowNumber = rowOffset + 2;
  const writableFields = [
    "Name",
    "Phone",
    "Email",
    "Area",
    "Timeline",
    "Budget",
    "Goal / Context",
    "Latest Message / Notes",
    "Consent to Text",
    "Lead Status",
    "Last Contact Date",
    "Next Follow-Up Date",
    "Follow-Up Rank",
    "Text Status",
    "Assigned Message"
  ];

  writableFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const column = headers.indexOf(field) + 1;
      if (column) {
        sheet.getRange(rowNumber, column).setValue(payload[field] || "");
      }
    }
  });

  formatMasterLeadSheet_(sheet);
  const record = getLeadRecords_().find((entry) => entry["Lead ID"] === leadId);
  return record || {};
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

function applyDropdowns_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);

  const leadTypeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Buyer", "Seller", "Buyer + Seller", "Referral", "Investor"], true)
    .setAllowInvalid(false)
    .build();

  const consentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Yes", "No"], true)
    .setAllowInvalid(false)
    .build();

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["New", "Active", "Warm", "Closed"], true)
    .setAllowInvalid(false)
    .build();

  const rankRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Rank A", "Rank B", "Rank C"], true)
    .setAllowInvalid(false)
    .build();

  const textStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Pending Review", "Ready", "Sent", "Skipped"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, 3, maxRows, 1).setDataValidation(leadTypeRule);
  sheet.getRange(2, 18, maxRows, 1).setDataValidation(consentRule);
  sheet.getRange(2, 19, maxRows, 1).setDataValidation(statusRule);
  sheet.getRange(2, 22, maxRows, 1).setDataValidation(rankRule);
  sheet.getRange(2, 23, maxRows, 1).setDataValidation(textStatusRule);
}

function applyStatusFormatting_(sheet) {
  const lastRow = Math.max(sheet.getMaxRows(), 2);
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("New")
      .setBackground("#d9eaf7")
      .setRanges([sheet.getRange(2, 19, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Active")
      .setBackground("#93ff93")
      .setRanges([sheet.getRange(2, 19, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Warm")
      .setBackground("#fce5cd")
      .setRanges([sheet.getRange(2, 19, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Closed")
      .setBackground("#e6e6e6")
      .setRanges([sheet.getRange(2, 19, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Pending Review")
      .setBackground("#fce5cd")
      .setRanges([sheet.getRange(2, 23, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Ready")
      .setBackground("#d9ead3")
      .setRanges([sheet.getRange(2, 23, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Sent")
      .setBackground("#e6d9f7")
      .setRanges([sheet.getRange(2, 23, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Skipped")
      .setBackground("#eeeeee")
      .setRanges([sheet.getRange(2, 23, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($U2<>"",$U2<TODAY())')
      .setBackground("#e06666")
      .setRanges([sheet.getRange(2, 21, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($U2<>"",$U2=TODAY())')
      .setBackground("#f4cccc")
      .setRanges([sheet.getRange(2, 21, lastRow - 1, 1)])
      .build()
    ,
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($U2<>"",$U2=TODAY()+1)')
      .setBackground("#fff2cc")
      .setRanges([sheet.getRange(2, 21, lastRow - 1, 1)])
      .build()
  ];

  sheet.setConditionalFormatRules(rules);
}
