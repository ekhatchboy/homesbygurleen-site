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
  "Lending",
  "Assigned Message",
  "Buyer Contract Signed",
  "Buyer Contract Signed Date",
  "Buyer Contract Expiration Date",
  "Seller Contract Signed",
  "Seller Contract Signed Date",
  "Seller Contract Expiration Date"
];

function setupSheets() {
  const masterSheet = getMasterLeadSheet_();
  ensureGuideSheet_();
  formatMasterLeadSheet_(masterSheet);
}

function backupMasterLeads() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = getMasterLeadSheet_();
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HHmm");
  const backupName = `Master Leads Backup ${timestamp}`;
  const existingSheet = spreadsheet.getSheetByName(backupName);

  if (existingSheet) {
    throw new Error(`Backup sheet already exists: ${backupName}`);
  }

  const backupSheet = spreadsheet.insertSheet(backupName);
  const sourceRange = sourceSheet.getDataRange();
  const values = sourceRange.getValues();

  if (values.length && values[0].length) {
    backupSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }

  const lastRow = sourceSheet.getLastRow();
  const lastColumn = sourceSheet.getLastColumn();

  if (lastRow > 0 && lastColumn > 0) {
    sourceSheet.getRange(1, 1, lastRow, lastColumn).copyFormatToRange(backupSheet, 1, lastColumn, 1, lastRow);
    backupSheet.setFrozenRows(sourceSheet.getFrozenRows());
    backupSheet.setFrozenColumns(sourceSheet.getFrozenColumns());
    copySheetDimensions_(sourceSheet, backupSheet, lastRow, lastColumn);
  }

  return backupName;
}

function backupMasterLeadsDaily() {
  return syncRollingMasterLeadsBackup_();
}

function restoreMasterLeadsFromBackup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = spreadsheet.getSheetByName("Master Leads Backup");

  if (!sourceSheet) {
    throw new Error('Sheet not found: Master Leads Backup');
  }

  backupMasterLeads();

  const targetSheet = getMasterLeadSheet_();
  const sourceRange = sourceSheet.getDataRange();
  const values = sourceRange.getValues();
  const sourceLastRow = sourceSheet.getLastRow();
  const sourceLastColumn = sourceSheet.getLastColumn();
  const targetFilter = targetSheet.getFilter();

  if (targetFilter) {
    targetFilter.remove();
  }

  targetSheet.clearContents();
  targetSheet.clearFormats();

  if (targetSheet.getMaxRows() > sourceLastRow) {
    targetSheet.deleteRows(sourceLastRow + 1, targetSheet.getMaxRows() - sourceLastRow);
  } else if (targetSheet.getMaxRows() < sourceLastRow) {
    targetSheet.insertRowsAfter(targetSheet.getMaxRows(), sourceLastRow - targetSheet.getMaxRows());
  }

  if (targetSheet.getMaxColumns() > sourceLastColumn) {
    targetSheet.deleteColumns(sourceLastColumn + 1, targetSheet.getMaxColumns() - sourceLastColumn);
  } else if (targetSheet.getMaxColumns() < sourceLastColumn) {
    targetSheet.insertColumnsAfter(targetSheet.getMaxColumns(), sourceLastColumn - targetSheet.getMaxColumns());
  }

  if (values.length && values[0].length) {
    targetSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    sourceSheet.getRange(1, 1, sourceLastRow, sourceLastColumn).copyFormatToRange(targetSheet, 1, sourceLastColumn, 1, sourceLastRow);
  }

  targetSheet.setFrozenRows(sourceSheet.getFrozenRows());
  targetSheet.setFrozenColumns(sourceSheet.getFrozenColumns());
  copySheetDimensions_(sourceSheet, targetSheet, sourceLastRow, sourceLastColumn);

  if (sourceSheet.getFilter() && sourceLastRow > 1) {
    targetSheet.getRange(1, 1, sourceLastRow, sourceLastColumn).createFilter();
  }

  formatMasterLeadSheet_(targetSheet);
  return "Master Leads restored from backup.";
}

function syncRollingMasterLeadsBackup_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = getMasterLeadSheet_();
  const backupName = "Master Leads Backup";
  let backupSheet = spreadsheet.getSheetByName(backupName);

  if (!backupSheet) {
    backupSheet = spreadsheet.insertSheet(backupName);
  } else {
    backupSheet.clearContents();
    backupSheet.clearFormats();
    const existingFilter = backupSheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }
  }

  const sourceRange = sourceSheet.getDataRange();
  const values = sourceRange.getValues();

  if (values.length && values[0].length) {
    backupSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }

  const lastRow = sourceSheet.getLastRow();
  const lastColumn = sourceSheet.getLastColumn();

  if (lastRow > 0 && lastColumn > 0) {
    sourceSheet.getRange(1, 1, lastRow, lastColumn).copyFormatToRange(backupSheet, 1, lastColumn, 1, lastRow);
    backupSheet.setFrozenRows(sourceSheet.getFrozenRows());
    backupSheet.setFrozenColumns(sourceSheet.getFrozenColumns());
    copySheetDimensions_(sourceSheet, backupSheet, lastRow, lastColumn);
  }

  return backupName;
}

function copySheetDimensions_(sourceSheet, targetSheet, lastRow, lastColumn) {
  for (let column = 1; column <= lastColumn; column += 1) {
    targetSheet.setColumnWidth(column, sourceSheet.getColumnWidth(column));
  }

  for (let row = 1; row <= lastRow; row += 1) {
    targetSheet.setRowHeight(row, sourceSheet.getRowHeight(row));
  }
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
      authorizeCrm_(e, payload);
      setupSheets();
      backupMasterLeadsDaily();

      return jsonResponse_({
        ok: true,
        lead: handleLeadUpdate_(payload)
      });
    }

    if (action === "createLead") {
      authorizeCrm_(e, payload);
      setupSheets();
      backupMasterLeadsDaily();

      return jsonResponse_({
        ok: true,
        lead: handleLeadCreate_(payload)
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

    upsertLead_(sheet, {
      "Date": payload.sentAt || new Date().toISOString(),
      "Lead Type": leadType,
      "Source": "AI Chat",
      "Name": "",
      "Phone": formatPhoneValue_(contactDetails.phone),
      "Email": contactDetails.email,
      "Area": String(payload.leadProfile?.area || "").trim(),
      "Timeline": payload.leadProfile?.timeline || "",
      "Budget": payload.leadProfile?.budget || "",
      "Goal / Context": "",
      "Latest Message / Notes": payload.message || "",
      "Realtor": payload.businessConfig?.realtorName || "",
      "Brand": payload.businessConfig?.brandName || "",
      "Market": payload.businessConfig?.market || "",
      "Business Email": payload.businessConfig?.contactEmail || "",
      "Transcript / Raw Responses": formatTranscript_(payload.transcript || []),
      "Consent to Text": "",
      "Lead Status": "New",
      "Last Contact Date": "",
      "Next Follow-Up Date": formatDate_(addDays_(new Date(), 2)),
      "Follow-Up Rank": "Rank A",
      "Text Status": "Pending Review",
      "Lending": "",
      "Assigned Message": buildAssignedMessage_(leadType),
      "Buyer Contract Signed": "",
      "Buyer Contract Signed Date": "",
      "Buyer Contract Expiration Date": "",
      "Seller Contract Signed": "",
      "Seller Contract Signed Date": "",
      "Seller Contract Expiration Date": ""
    });

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
  const buyingArea = findBuyerArea_(namedValues, sourceSheetName);
  const sellingLocation = findSellingLocation_(namedValues, sourceSheetName);

  upsertLead_(sheet, {
    "Date": extractTimestamp_(e, namedValues),
    "Lead Type": leadType,
    "Source": sourceSheetName,
    "Name": findFieldValue_(namedValues, ["name", "full name", "client name", "referral name"]),
    "Phone": contactDetails.phone,
    "Email": contactDetails.email,
    "Area": buildIncomingArea_(buyingArea, sellingLocation),
    "Timeline": findFieldValue_(namedValues, ["timeline", "timing", "desired timeline", "purchase timing"]),
    "Budget": findFieldValue_(namedValues, ["budget", "budget range", "price range"]),
    "Goal / Context": findFieldValue_(namedValues, ["goal", "main goal", "investment goal", "property type", "referral type", "financing status", "financing"]),
    "Latest Message / Notes": findFieldValue_(namedValues, ["notes", "must-haves", "anything gurleen should know", "anything else", "message"]),
    "Realtor": "Gurleen Chahal",
    "Brand": "Homes By Gurleen",
    "Market": "",
    "Business Email": "gurleen@homesbygurleen.com",
    "Transcript / Raw Responses": formatNamedValues_(namedValues),
    "Consent to Text": "",
    "Lead Status": "New",
    "Last Contact Date": "",
    "Next Follow-Up Date": formatDate_(addDays_(new Date(), 2)),
    "Follow-Up Rank": "Rank A",
    "Text Status": "Pending Review",
    "Lending": "",
    "Assigned Message": buildAssignedMessage_(leadType),
    "Buyer Contract Signed": "",
    "Buyer Contract Signed Date": "",
    "Buyer Contract Expiration Date": "",
    "Seller Contract Signed": "",
    "Seller Contract Signed Date": "",
    "Seller Contract Expiration Date": "",
    "_buyingArea": buyingArea,
    "_sellingLocation": sellingLocation
  });

  formatMasterLeadSheet_(sheet);
}

function onEdit(e) {
  try {
    if (!e || !e.range) {
      return;
    }

    const sheet = e.range.getSheet();
    if (sheet.getName() !== MASTER_SHEET_NAME) {
      return;
    }

    const row = e.range.getRow();
    if (row === 1) {
      return;
    }

    const headers = sheet.getRange(1, 1, 1, MASTER_HEADER_ROW.length).getValues()[0];
    const leadIdColumn = headers.indexOf("Lead ID") + 1;

    if (!leadIdColumn) {
      return;
    }

    const rowValues = sheet.getRange(row, 1, 1, MASTER_HEADER_ROW.length).getValues()[0];
    const hasAnyData = rowValues.some((value, index) => index !== (leadIdColumn - 1) && String(value || "").trim());

    if (!hasAnyData) {
      return;
    }

    const currentLeadId = String(sheet.getRange(row, leadIdColumn).getValue() || "").trim();
    if (currentLeadId) {
      return;
    }

    sheet.getRange(row, leadIdColumn).setValue(createLeadId_());
  } catch (error) {
    Logger.log(error);
  }
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

  ensureMasterHeaders_(sheet);

  formatMasterLeadSheet_(sheet);
  return sheet;
}

function ensureMasterHeaders_(sheet) {
  const maxColumns = sheet.getMaxColumns();

  if (maxColumns < MASTER_HEADER_ROW.length) {
    sheet.insertColumnsAfter(maxColumns, MASTER_HEADER_ROW.length - maxColumns);
  }

  if (maxColumns > MASTER_HEADER_ROW.length) {
    sheet.deleteColumns(MASTER_HEADER_ROW.length + 1, maxColumns - MASTER_HEADER_ROW.length);
  }

  sheet.getRange(1, 1, 1, MASTER_HEADER_ROW.length).setValues([MASTER_HEADER_ROW]);
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
    ["No Answer", "Outreach has gone out, but there has not been a response yet."],
    ["Closed", "No further follow-up needed."],
    ["", ""],
    ["Lead Status Colors", "Meaning"],
    ["New", "Light blue"],
    ["Active", "Bright green"],
    ["Warm", "Light peach"],
    ["No Answer", "Soft rose"],
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

function backfillBuyerResponses() {
  backfillFormResponsesBySheetName_("Buyer form");
}

function backfillSellerResponses() {
  backfillFormResponsesBySheetName_("Seller form");
}

function backfillInvestorResponses() {
  backfillFormResponsesBySheetName_("Investor form");
}

function backfillReferralResponses() {
  backfillFormResponsesBySheetName_("Referral form");
}

function backfillAllLinkedForms() {
  backupMasterLeadsDaily();
  [
    "Buyer form",
    "Seller form",
    "Investor form",
    "Referral form"
  ].forEach((sheetName) => backfillFormResponsesBySheetName_(sheetName));
}

function backfillFormResponsesBySheetName_(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = spreadsheet.getSheetByName(sheetName);

  if (!sourceSheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  setupSheets();

  const data = sourceSheet.getDataRange().getValues();
  if (data.length < 2) {
    return;
  }

  const headers = data[0];
  const rows = data.slice(1);
  const masterSheet = getMasterLeadSheet_();

  rows.forEach((row) => {
    if (!row.some((value) => String(value || "").trim())) {
      return;
    }

    const namedValues = {};
    headers.forEach((header, index) => {
      namedValues[header] = [row[index]];
    });

    const contactDetails = extractContactDetailsFromNamedValues_(namedValues);
    const leadType = inferLeadTypeFromSheetName_(sheetName);
    const buyingArea = findBuyerArea_(namedValues, sheetName);
    const sellingLocation = findSellingLocation_(namedValues, sheetName);
    upsertLead_(masterSheet, {
      "Date": row[0] || extractTimestamp_(null, namedValues),
      "Lead Type": leadType,
      "Source": sheetName,
      "Name": findFieldValue_(namedValues, ["name", "full name", "client name", "referral name"]),
      "Phone": contactDetails.phone,
      "Email": contactDetails.email,
      "Area": buildIncomingArea_(buyingArea, sellingLocation),
      "Timeline": findFieldValue_(namedValues, ["timeline", "timing", "desired timeline", "purchase timing"]),
      "Budget": findFieldValue_(namedValues, ["budget", "budget range", "price range"]),
      "Goal / Context": findFieldValue_(namedValues, ["goal", "main goal", "investment goal", "property type", "referral type", "financing status", "financing"]),
      "Latest Message / Notes": findFieldValue_(namedValues, ["notes", "must-haves", "anything gurleen should know", "anything else", "message"]),
      "Realtor": "Gurleen Chahal",
      "Brand": "Homes By Gurleen",
      "Market": "",
      "Business Email": "gurleen@homesbygurleen.com",
      "Transcript / Raw Responses": formatNamedValues_(namedValues),
      "Consent to Text": "",
      "Lead Status": "New",
      "Last Contact Date": "",
      "Next Follow-Up Date": formatDate_(addDays_(new Date(), 2)),
      "Follow-Up Rank": "Rank A",
      "Text Status": "Pending Review",
      "Lending": "",
      "Assigned Message": buildAssignedMessage_(leadType),
      "Buyer Contract Signed": "",
      "Buyer Contract Signed Date": "",
      "Buyer Contract Expiration Date": "",
      "Seller Contract Signed": "",
      "Seller Contract Signed Date": "",
      "Seller Contract Expiration Date": "",
      "_buyingArea": buyingArea,
      "_sellingLocation": sellingLocation
    });
  });

  formatMasterLeadSheet_(masterSheet);
}

function upsertLead_(sheet, leadData) {
  const existingRows = getLeadRecords_();
  const match = findMatchingLead_(existingRows, leadData);

  if (!match) {
    const row = MASTER_HEADER_ROW.map((header) => {
      if (header === "Lead ID") {
        return createLeadId_();
      }

      if (header === "Area") {
        return mergeAreaSummary_("", leadData);
      }

      if (header === "Phone") {
        return formatPhoneValue_(leadData[header] || "");
      }

      return leadData[header] || "";
    });

    sheet.appendRow(row);
    return;
  }

  const rowNumber = match._rowNumber;
  const nextLeadType = mergeLeadTypes_(match["Lead Type"], leadData["Lead Type"]);
  const updates = {
    "Date": leadData["Date"] || match["Date"],
    "Lead Type": nextLeadType,
    "Source": mergeTextValues_(match["Source"], leadData["Source"], " | "),
    "Name": leadData["Name"] || match["Name"],
    "Phone": formatPhoneValue_(leadData["Phone"] || match["Phone"]),
    "Email": leadData["Email"] || match["Email"],
    "Area": mergeAreaSummary_(match["Area"], leadData),
    "Timeline": mergeTextValues_(match["Timeline"], leadData["Timeline"], " | "),
    "Budget": mergeTextValues_(match["Budget"], leadData["Budget"], " | "),
    "Goal / Context": mergeTextValues_(match["Goal / Context"], leadData["Goal / Context"], "\n"),
    "Latest Message / Notes": mergeTextValues_(match["Latest Message / Notes"], leadData["Latest Message / Notes"], "\n\n"),
    "Realtor": leadData["Realtor"] || match["Realtor"],
    "Brand": leadData["Brand"] || match["Brand"],
    "Market": leadData["Market"] || match["Market"],
    "Business Email": leadData["Business Email"] || match["Business Email"],
    "Transcript / Raw Responses": mergeTextValues_(match["Transcript / Raw Responses"], leadData["Transcript / Raw Responses"], "\n\n---\n\n"),
    "Lending": leadData["Lending"] || match["Lending"],
    "Assigned Message": buildAssignedMessage_(nextLeadType),
    "Buyer Contract Signed": leadData["Buyer Contract Signed"] || match["Buyer Contract Signed"],
    "Buyer Contract Signed Date": leadData["Buyer Contract Signed Date"] || match["Buyer Contract Signed Date"],
    "Buyer Contract Expiration Date": leadData["Buyer Contract Expiration Date"] || match["Buyer Contract Expiration Date"],
    "Seller Contract Signed": leadData["Seller Contract Signed"] || match["Seller Contract Signed"],
    "Seller Contract Signed Date": leadData["Seller Contract Signed Date"] || match["Seller Contract Signed Date"],
    "Seller Contract Expiration Date": leadData["Seller Contract Expiration Date"] || match["Seller Contract Expiration Date"]
  };

  MASTER_HEADER_ROW.forEach((header, index) => {
    if (header === "Lead ID") {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(updates, header)) {
      sheet.getRange(rowNumber, index + 1).setValue(updates[header] || "");
    }
  });
}

function findMatchingLead_(existingRows, leadData) {
  const incomingName = normalizeKeyPart_(leadData["Name"]);
  const incomingPhone = normalizePhone_(leadData["Phone"]);
  const incomingEmail = normalizeKeyPart_(leadData["Email"]);

  return existingRows.find((row) => {
    const rowName = normalizeKeyPart_(row["Name"]);
    const rowPhone = normalizePhone_(row["Phone"]);
    const rowEmail = normalizeKeyPart_(row["Email"]);

    const phoneMatch = incomingPhone && rowPhone && incomingPhone === rowPhone;
    const emailMatch = incomingEmail && rowEmail && incomingEmail === rowEmail;
    const namePlusPhone = incomingName && rowName && incomingPhone && rowPhone && incomingName === rowName && incomingPhone === rowPhone;
    const namePlusEmail = incomingName && rowName && incomingEmail && rowEmail && incomingName === rowName && incomingEmail === rowEmail;

    return phoneMatch || emailMatch || namePlusPhone || namePlusEmail;
  }) || null;
}

function mergeLeadTypes_(currentType, nextType) {
  const current = normalizeLeadType_(currentType || "");
  const next = normalizeLeadType_(nextType || "");

  if (!current) {
    return next;
  }

  if (!next || current === next) {
    return current;
  }

  const combined = new Set([
    ...splitLeadTypes_(current),
    ...splitLeadTypes_(next)
  ]);

  if (combined.has("Buyer") && combined.has("Seller")) {
    return "Buyer + Seller";
  }

  if (combined.size === 1) {
    return [...combined][0];
  }

  return [...combined].join(" + ");
}

function splitLeadTypes_(value) {
  if (value === "Buyer + Seller") {
    return ["Buyer", "Seller"];
  }

  return String(value || "")
    .split("+")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeAreaSummary_(existingArea, leadData) {
  const parsedExisting = parseAreaSummary_(existingArea);
  const parsedIncoming = parseAreaSummary_(leadData["Area"]);
  const incomingBuying = String(leadData._buyingArea || "").trim();
  const incomingSelling = String(leadData._sellingLocation || "").trim();

  const nextBuying = mergeTextValues_(
    parsedExisting.buying,
    incomingBuying || parsedIncoming.buying,
    " | "
  );
  const nextSelling = mergeTextValues_(
    parsedExisting.selling,
    incomingSelling || parsedIncoming.selling,
    " | "
  );
  const nextGeneral = mergeTextValues_(
    parsedExisting.general,
    parsedIncoming.general,
    " | "
  );

  if (nextBuying || nextSelling) {
    const structured = buildIncomingArea_(nextBuying, nextSelling);
    return nextGeneral ? mergeTextValues_(structured, nextGeneral, " | ") : structured;
  }

  return nextGeneral;
}

function parseAreaSummary_(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { buying: "", selling: "", general: "" };
  }

  const buyingMatch = text.match(/Buying:\s*([^|]+)/i);
  const sellingMatch = text.match(/Selling:\s*([^|]+)/i);

  if (buyingMatch || sellingMatch) {
    return {
      buying: buyingMatch ? buyingMatch[1].trim() : "",
      selling: sellingMatch ? sellingMatch[1].trim() : "",
      general: ""
    };
  }

  return { buying: "", selling: "", general: text };
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
    phone: formatPhoneValue_(findFieldValue_(namedValues, ["phone", "phone number", "best phone"]) || extractContactDetails_(combinedValues).phone),
    email: findFieldValue_(namedValues, ["email", "best contact email"]) || extractContactDetails_(combinedValues).email
  };
}

function findBuyerArea_(namedValues, sourceSheetName) {
  const normalized = String(sourceSheetName || "").toLowerCase();
  const value = findFieldValue_(namedValues, [
    "preferred areas",
    "target area",
    "cities most interested in",
    "cities",
    "areas are you interested in",
    "what cities/areas are you interested in"
  ]);

  if (value) {
    return value;
  }

  if (normalized.includes("buyer")) {
    return findFieldValue_(namedValues, ["area", "city", "location"]);
  }

  return "";
}

function findSellingLocation_(namedValues, sourceSheetName) {
  const normalized = String(sourceSheetName || "").toLowerCase();
  const address = findFieldValue_(namedValues, [
    "property address",
    "home address",
    "address of property",
    "address of home",
    "property location"
  ]);

  if (address) {
    return address;
  }

  if (normalized.includes("seller")) {
    return findFieldValue_(namedValues, ["location", "city", "area"]);
  }

  return "";
}

function buildIncomingArea_(buyingArea, sellingLocation) {
  const buyer = String(buyingArea || "").trim();
  const seller = String(sellingLocation || "").trim();

  if (buyer && seller) {
    return `Buying: ${buyer} | Selling: ${seller}`;
  }

  if (buyer) {
    return `Buying: ${buyer}`;
  }

  if (seller) {
    return `Selling: ${seller}`;
  }

  return "";
}

function mergeTextValues_(existingValue, incomingValue, separator) {
  const current = String(existingValue || "").trim();
  const next = String(incomingValue || "").trim();

  if (!current) {
    return next;
  }

  if (!next || current.toLowerCase().includes(next.toLowerCase())) {
    return current;
  }

  return `${current}${separator}${next}`;
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

function formatPhoneValue_(value) {
  const text = String(value || "").trim();
  const digits = text.replace(/\D/g, "");

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return text;
}

function inferLeadTypeFromSheetName_(sheetName) {
  const normalized = String(sheetName || "").toLowerCase();

  if (normalized.includes("buyer") && normalized.includes("seller")) {
    return "Buyer + Seller";
  }

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

  if (
    normalized.includes("buyer + seller") ||
    normalized.includes("buy and sell") ||
    normalized.includes("buying and selling") ||
    normalized.includes("selling and buying")
  ) {
    return "Buyer + Seller";
  }

  if (normalized === "buyer") {
    return "Buyer";
  }

  if (normalized === "seller") {
    return "Seller";
  }

  if (normalized === "referral") {
    return "Referral";
  }

  if (normalized === "investor") {
    return "Investor";
  }

  if (normalized === "ai chat") {
    return "AI Chat";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeKeyPart_(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone_(value) {
  return String(value || "").replace(/\D/g, "");
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

  if (type === "buyer + seller") {
    return "Hi, just following up on your buy-and-sell plans with Homes By Gurleen. I'd be happy to help map out the best next step for both sides of the move.";
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

function authorizeCrm_(e, payload) {
  const expected = PropertiesService.getScriptProperties().getProperty("CRM_API_TOKEN");
  const provided = String(
    (payload && payload.crmToken) ||
    getRequestParameter_(e, "crmToken") ||
    getHeaderValue_(e, "x-crm-token") ||
    ""
  ).trim();

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
    "Lending",
    "Assigned Message",
    "Buyer Contract Signed",
    "Buyer Contract Signed Date",
    "Buyer Contract Expiration Date",
    "Seller Contract Signed",
    "Seller Contract Signed Date",
    "Seller Contract Expiration Date"
  ];

  writableFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const column = headers.indexOf(field) + 1;
      if (column) {
        let nextValue = payload[field] || "";
        if (field === "Phone") {
          nextValue = formatPhoneValue_(nextValue);
        }
        if (field === "Lead Type") {
          nextValue = normalizeLeadType_(nextValue);
        }
        sheet.getRange(rowNumber, column).setValue(nextValue);
      }
    }
  });

  formatMasterLeadSheet_(sheet);
  const record = getLeadRecords_().find((entry) => entry["Lead ID"] === leadId);
  return record || {};
}

function handleLeadCreate_(payload) {
  const sheet = getMasterLeadSheet_();
  const leadType = normalizeLeadType_(payload["Lead Type"] || "Buyer");
  const newLeadId = createLeadId_();
  const nextFollowUpDate = normalizeIncomingDate_(payload["Next Follow-Up Date"]) || formatDate_(addDays_(new Date(), 2));
  const dateCreated = normalizeIncomingDate_(payload["Date"]) || new Date().toISOString();
  const phone = formatPhoneValue_(payload["Phone"] || "");
  const name = String(payload["Name"] || "").trim();
  const email = String(payload["Email"] || "").trim();
  const area = String(payload["Area"] || "").trim();
  const timeline = String(payload["Timeline"] || "").trim();
  const budget = String(payload["Budget"] || "").trim();
  const goal = String(payload["Goal / Context"] || "").trim();
  const notes = String(payload["Latest Message / Notes"] || "").trim();
  const consent = String(payload["Consent to Text"] || "").trim();
  const status = String(payload["Lead Status"] || "New").trim();
  const lastContactDate = normalizeIncomingDate_(payload["Last Contact Date"]);
  const rank = String(payload["Follow-Up Rank"] || "Rank A").trim();
  const textStatus = String(payload["Text Status"] || "Pending Review").trim();
  const lending = String(payload["Lending"] || "").trim();
  const assignedMessage = String(payload["Assigned Message"] || "").trim() || buildAssignedMessage_(leadType);
  const buyerContractSigned = String(payload["Buyer Contract Signed"] || "").trim();
  const buyerContractSignedDate = normalizeIncomingDate_(payload["Buyer Contract Signed Date"]);
  const buyerContractExpirationDate = normalizeIncomingDate_(payload["Buyer Contract Expiration Date"]);
  const sellerContractSigned = String(payload["Seller Contract Signed"] || "").trim();
  const sellerContractSignedDate = normalizeIncomingDate_(payload["Seller Contract Signed Date"]);
  const sellerContractExpirationDate = normalizeIncomingDate_(payload["Seller Contract Expiration Date"]);
  const source = String(payload["Source"] || "Manual CRM Entry").trim();

  const row = MASTER_HEADER_ROW.map((header) => {
    switch (header) {
      case "Lead ID":
        return newLeadId;
      case "Date":
        return dateCreated;
      case "Lead Type":
        return leadType;
      case "Source":
        return source;
      case "Name":
        return name;
      case "Phone":
        return phone;
      case "Email":
        return email;
      case "Area":
        return area;
      case "Timeline":
        return timeline;
      case "Budget":
        return budget;
      case "Goal / Context":
        return goal;
      case "Latest Message / Notes":
        return notes;
      case "Realtor":
        return String(payload["Realtor"] || "Gurleen Chahal").trim();
      case "Brand":
        return String(payload["Brand"] || "Homes By Gurleen").trim();
      case "Market":
        return String(payload["Market"] || "").trim();
      case "Business Email":
        return String(payload["Business Email"] || "gurleen@homesbygurleen.com").trim();
      case "Transcript / Raw Responses":
        return String(payload["Transcript / Raw Responses"] || "Manual CRM entry.").trim();
      case "Consent to Text":
        return consent;
      case "Lead Status":
        return status;
      case "Last Contact Date":
        return lastContactDate;
      case "Next Follow-Up Date":
        return nextFollowUpDate;
      case "Follow-Up Rank":
        return rank;
      case "Text Status":
        return textStatus;
      case "Lending":
        return lending;
      case "Assigned Message":
        return assignedMessage;
      case "Buyer Contract Signed":
        return buyerContractSigned;
      case "Buyer Contract Signed Date":
        return buyerContractSignedDate;
      case "Buyer Contract Expiration Date":
        return buyerContractExpirationDate;
      case "Seller Contract Signed":
        return sellerContractSigned;
      case "Seller Contract Signed Date":
        return sellerContractSignedDate;
      case "Seller Contract Expiration Date":
        return sellerContractExpirationDate;
      default:
        return "";
    }
  });

  sheet.appendRow(row);
  formatMasterLeadSheet_(sheet);
  const record = getLeadRecords_().find((entry) => entry["Lead ID"] === newLeadId);
  return record || {};
}

function normalizeIncomingDate_(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return formatDate_(date);
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
    .requireValueInList(["New", "Active", "Warm", "No Answer", "Closed"], true)
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

  const lendingRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["", "In Progress", "Pre-Approved", "Not Needed"], true)
    .setAllowInvalid(false)
    .build();

  const contractRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["", "Yes", "No"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, 3, maxRows, 1).setDataValidation(leadTypeRule);
  sheet.getRange(2, 18, maxRows, 1).setDataValidation(consentRule);
  sheet.getRange(2, 19, maxRows, 1).setDataValidation(statusRule);
  sheet.getRange(2, 22, maxRows, 1).setDataValidation(rankRule);
  sheet.getRange(2, 23, maxRows, 1).setDataValidation(textStatusRule);
  sheet.getRange(2, 24, maxRows, 1).setDataValidation(lendingRule);
  sheet.getRange(2, 26, maxRows, 1).setDataValidation(contractRule);
  sheet.getRange(2, 29, maxRows, 1).setDataValidation(contractRule);
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
      .whenTextEqualTo("No Answer")
      .setBackground("#f4d7d7")
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
