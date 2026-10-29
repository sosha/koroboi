/**
 * Koroboi - Google Apps Script Backend (Code.gs)
 *
 * Provides setup() for initializing Google Sheet tabs, formulas, conditional formatting,
 * and practitioner email alerts, plus doPost() for write-only student screening responses.
 */

// Script Property Keys
var PROP_SECRET_TOKEN = 'SECRET_TOKEN';
var PROP_PRACTITIONER_EMAILS = 'PRACTITIONER_EMAILS';

/**
 * Setup function run once by practitioner from Apps Script Editor.
 * Initializes sheets, formulas, conditional formatting, and email config.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // 1. Prompt for Practitioner Email Addresses
  var emailResponse = ui.prompt(
    'Practitioner Email Setup',
    'Enter comma-separated email address(es) to receive immediate URGENT alerts (e.g. counselor@school.ac.ke, deputy@school.ac.ke):',
    ui.ButtonSet.OK_CANCEL
  );

  if (emailResponse.getSelectedButton() === ui.Button.OK) {
    var emailInput = emailResponse.getResponseText().trim();
    if (emailInput) {
      PropertiesService.getScriptProperties().setProperty(PROP_PRACTITIONER_EMAILS, emailInput);

      // Send Immediate Test Email
      try {
        MailApp.sendEmail({
          to: emailInput,
          subject: '[Koroboi Setup] Test Alert Confirmation',
          body: 'This is a test notification from your Koroboi Screening Sheet setup. Urgent alerts will be emailed here.'
        });
        ui.alert('Setup Success', 'Test email sent successfully to: ' + emailInput, ui.ButtonSet.OK);
      } catch (err) {
        ui.alert('Warning', 'Saved email(s) but test email failed: ' + err.toString(), ui.ButtonSet.OK);
      }
    } else {
      ui.alert('Warning', 'No email address entered. URGENT alerts will NOT be emailed!', ui.ButtonSet.OK);
    }
  }

  // 2. Prompt for Shared Secret Token if not set
  var currentSecret = PropertiesService.getScriptProperties().getProperty(PROP_SECRET_TOKEN);
  if (!currentSecret) {
    var secretResponse = ui.prompt(
      'Shared Secret Token Setup',
      'Create a shared secret token (matching VITE_SECRET_TOKEN on tablets):',
      ui.ButtonSet.OK
    );
    var token = secretResponse.getResponseText().trim() || 'koroboi-secret-key-2025';
    PropertiesService.getScriptProperties().setProperty(PROP_SECRET_TOKEN, token);
  }

  // 3. Initialize Required Tabs
  getOrCreateSheet(ss, 'Roster', [
    ['Admission Number', 'Student Name', 'Class']
  ]);

  getOrCreateSheet(ss, 'Responses', [
    [
      'Timestamp', 'Session ID', 'Session Label', 'Admission Number', 'Language', 'Status',
      'PHQ1', 'PHQ2', 'PHQ3', 'PHQ4', 'PHQ5', 'PHQ6', 'PHQ7', 'PHQ8', 'PHQ9',
      'GAD1', 'GAD2', 'GAD3', 'GAD4', 'GAD5', 'GAD6', 'GAD7'
    ]
  ]);

  getOrCreateSheet(ss, 'Triage', [
    [
      'Admission Number', 'Student Name', 'Class', 'Session Label', 'Timestamp', 'Status',
      'PHQ-9 Total', 'PHQ-9 Band', 'GAD-7 Total', 'GAD-7 Band', 'Triage Tier'
    ]
  ]);

  getOrCreateSheet(ss, 'Summary', [
    ['Triage Tier', 'Count'],
    ['URGENT', '=COUNTIF(Triage!K:K, "URGENT")'],
    ['PRIORITY', '=COUNTIF(Triage!K:K, "PRIORITY")'],
    ['WATCH', '=COUNTIF(Triage!K:K, "WATCH")'],
    ['NONE', '=COUNTIF(Triage!K:K, "NONE")'],
    ['', ''],
    ['Term-on-Term Trend (Student Multi-Session Change)', ''],
    ['Admission Number', 'Student Name', 'First PHQ-9', 'Latest PHQ-9', 'PHQ-9 Change', 'First GAD-7', 'Latest GAD-7', 'GAD-7 Change']
  ]);

  getOrCreateSheet(ss, 'Demo', [
    [
      'Timestamp', 'Session ID', 'Session Label', 'Admission Number', 'Language', 'Status',
      'PHQ1', 'PHQ2', 'PHQ3', 'PHQ4', 'PHQ5', 'PHQ6', 'PHQ7', 'PHQ8', 'PHQ9',
      'GAD1', 'GAD2', 'GAD3', 'GAD4', 'GAD5', 'GAD6', 'GAD7'
    ]
  ]);

  getOrCreateSheet(ss, 'AlertLog', [
    ['Timestamp', 'Session ID', 'Admission Number', 'Recipients', 'Status', 'Details']
  ]);

  // 4. Set up Triage Formulas
  setupTriageFormulas(ss);

  // 5. Apply Conditional Formatting on Triage Sheet
  applyTriageConditionalFormatting(ss);

  ui.alert('Setup Complete', 'Koroboi Google Sheet initialized successfully!', ui.ButtonSet.OK);
}

/**
 * Web App HTTP POST Endpoint
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJson({ status: 'error', message: 'Empty post body' });
    }

    var data = JSON.parse(e.postData.contents);
    var secretToken = PropertiesService.getScriptProperties().getProperty(PROP_SECRET_TOKEN);

    // Validate Secret Token
    if (secretToken && data.secretToken !== secretToken) {
      return responseJson({ status: 'error', message: 'Unauthorized secret token' });
    }

    var payload = data.payload;
    if (!payload || !payload.sessionId || !payload.admissionNumber) {
      return responseJson({ status: 'error', message: 'Invalid payload structure' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Check for Duplicates by Session ID
    var targetSheetName = payload.demo ? 'Demo' : 'Responses';
    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      return responseJson({ status: 'error', message: 'Sheet not found: ' + targetSheetName });
    }

    if (isDuplicateSessionId(sheet, payload.sessionId)) {
      return responseJson({ status: 'duplicate', message: 'Session ID already processed' });
    }

    // Format Row Data
    var phq = payload.phq9Answers || [];
    var gad = payload.gad7Answers || [];
    var row = [
      payload.timestamp || new Date().toISOString(),
      payload.sessionId,
      payload.sessionLabel || '',
      payload.admissionNumber,
      payload.language || 'en',
      payload.incomplete ? 'INCOMPLETE' : 'COMPLETE',
      phq[0] ?? '', phq[1] ?? '', phq[2] ?? '', phq[3] ?? '', phq[4] ?? '', phq[5] ?? '', phq[6] ?? '', phq[7] ?? '', phq[8] ?? '',
      gad[0] ?? '', gad[1] ?? '', gad[2] ?? '', gad[3] ?? '', gad[4] ?? '', gad[5] ?? '', gad[6] ?? ''
    ];

    sheet.appendRow(row);

    // Demo mode returns early without alerts or triage calculation
    if (payload.demo) {
      return responseJson({ status: 'success', message: 'Demo response saved to Demo tab' });
    }

    // Evaluate Triage Tier & Handle Email Alert
    var tier = evaluatePayloadTier(payload);
    if (tier === 'URGENT') {
      sendUrgentEmailAlert(ss, payload);
    }

    return responseJson({ status: 'success', message: 'Response recorded' });
  } catch (err) {
    return responseJson({ status: 'error', message: err.toString() });
  }
}

/**
 * Evaluates Triage Tier for incoming payload
 */
function evaluatePayloadTier(payload) {
  var phq = payload.phq9Answers || [];
  var gad = payload.gad7Answers || [];

  var phqTotal = phq.reduce(function(a, b) { return a + (Number(b) || 0); }, 0);
  var gadTotal = gad.reduce(function(a, b) { return a + (Number(b) || 0); }, 0);
  var item9 = Number(phq[8]) || 0;

  if (item9 > 0 || phqTotal >= 20 || gadTotal >= 15 || (payload.incomplete && item9 > 0)) {
    return 'URGENT';
  }
  if (phqTotal >= 9 || gadTotal >= 10) {
    return 'PRIORITY';
  }
  if ((phqTotal >= 5 && phqTotal <= 8) || (gadTotal >= 5 && gadTotal <= 9)) {
    return 'WATCH';
  }
  return 'NONE';
}

/**
 * Sends URGENT notification email with error logging
 */
function sendUrgentEmailAlert(ss, payload) {
  var alertLogSheet = ss.getSheetByName('AlertLog');
  var recipientEmails = PropertiesService.getScriptProperties().getProperty(PROP_PRACTITIONER_EMAILS);

  if (!recipientEmails) {
    if (alertLogSheet) {
      alertLogSheet.appendRow([new Date().toISOString(), payload.sessionId, payload.admissionNumber, 'NONE', 'SKIPPED', 'No practitioner emails configured']);
    }
    return;
  }

  // Deduplicate email alert by checking AlertLog for sessionId
  if (alertLogSheet && isDuplicateSessionId(alertLogSheet, payload.sessionId)) {
    return; // Already emailed
  }

  var subject = '[URGENT Koroboi Alert] Action Required for Admission #' + payload.admissionNumber;
  var body = 'URGENT SCREENING ALERT\n\n' +
    'A student response requires immediate practitioner attention:\n' +
    '• Admission Number: ' + payload.admissionNumber + '\n' +
    '• Session Label: ' + (payload.sessionLabel || 'N/A') + '\n' +
    '• Timestamp: ' + (payload.timestamp || new Date().toISOString()) + '\n\n' +
    'Please review the Triage tab in your school Google Sheet immediately.\n' +
    '(Note: No names or scores are transmitted in this automated email for privacy.)';

  try {
    MailApp.sendEmail({
      to: recipientEmails,
      subject: subject,
      body: body
    });

    if (alertLogSheet) {
      alertLogSheet.appendRow([new Date().toISOString(), payload.sessionId, payload.admissionNumber, recipientEmails, 'SUCCESS', 'Email sent successfully']);
    }
  } catch (err) {
    if (alertLogSheet) {
      alertLogSheet.appendRow([new Date().toISOString(), payload.sessionId, payload.admissionNumber, recipientEmails, 'FAILED', err.toString()]);
    }
  }
}

/**
 * Helper to get or create sheet tab
 */
function getOrCreateSheet(ss, name, initialRows) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (initialRows && initialRows.length > 0 && sheet.getLastRow() === 0) {
    for (var i = 0; i < initialRows.length; i++) {
      sheet.appendRow(initialRows[i]);
    }
    sheet.getRange(1, 1, 1, initialRows[0].length).setFontWeight('bold').setBackground('#e2e8f0');
  }
  return sheet;
}

/**
 * Helper to check if sessionId exists in column B
 */
function isDuplicateSessionId(sheet, sessionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var sessionIds = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = 0; i < sessionIds.length; i++) {
    if (sessionIds[i][0] === sessionId) {
      return true;
    }
  }
  return false;
}

/**
 * Setup dynamic Triage sheet formulas
 */
function setupTriageFormulas(ss) {
  var triageSheet = ss.getSheetByName('Triage');
  if (!triageSheet) return;

  // Header in row 1
  // Add formula to row 2 if empty
  if (triageSheet.getLastRow() <= 1) {
    triageSheet.getRange('A2').setFormula(
      '=ARRAYFORMULA(IF(LEN(Responses!D2:D), {' +
      'Responses!D2:D, ' +
      'IFERROR(VLOOKUP(Responses!D2:D, Roster!A:B, 2, FALSE), "Unlisted"), ' +
      'IFERROR(VLOOKUP(Responses!D2:D, Roster!A:C, 3, FALSE), "Unlisted"), ' +
      'Responses!C2:C, ' +
      'Responses!A2:A, ' +
      'Responses!F2:F, ' +
      'Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O, ' +
      'IF(Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O>=20, "Severe", IF(Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O>=15, "Moderately severe", IF(Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O>=10, "Moderate", IF(Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O>=5, "Mild", "Minimal")))), ' +
      'Responses!P2:P+Responses!Q2:Q+Responses!R2:R+Responses!S2:S+Responses!T2:T+Responses!U2:U+Responses!V2:V, ' +
      'IF(Responses!P2:P+Responses!Q2:Q+Responses!R2:R+Responses!S2:S+Responses!T2:T+Responses!U2:U+Responses!V2:V>=15, "Severe", IF(Responses!P2:P+Responses!Q2:Q+Responses!R2:R+Responses!S2:S+Responses!T2:T+Responses!U2:U+Responses!V2:V>=10, "Moderate", IF(Responses!P2:P+Responses!Q2:Q+Responses!R2:R+Responses!S2:S+Responses!T2:T+Responses!U2:U+Responses!V2:V>=5, "Mild", "Minimal"))), ' +
      'IF((Responses!O2:O>0)+(Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O>=20)+(Responses!P2:P+Responses!Q2:Q+Responses!R2:R+Responses!S2:S+Responses!T2:T+Responses!U2:U+Responses!V2:V>=15)>0, "URGENT", IF((Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O>=9)+(Responses!P2:P+Responses!Q2:Q+Responses!R2:R+Responses!S2:S+Responses!T2:T+Responses!U2:U+Responses!V2:V>=10)>0, "PRIORITY", IF((Responses!G2:G+Responses!H2:H+Responses!I2:I+Responses!J2:J+Responses!K2:K+Responses!L2:L+Responses!M2:M+Responses!N2:N+Responses!O2:O>=5)+(Responses!P2:P+Responses!Q2:Q+Responses!R2:R+Responses!S2:S+Responses!T2:T+Responses!U2:U+Responses!V2:V>=5)>0, "WATCH", "NONE")))' +
      '}, ""))'
    );
  }
}

/**
 * Setup Conditional Formatting rules on Triage sheet
 */
function applyTriageConditionalFormatting(ss) {
  var triageSheet = ss.getSheetByName('Triage');
  if (!triageSheet) return;

  var range = triageSheet.getRange('A2:K1000');

  var urgentRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K2="URGENT"')
    .setBackground('#fecaca')
    .setFontColor('#991b1b')
    .setBold(true)
    .setRanges([range])
    .build();

  var priorityRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K2="PRIORITY"')
    .setBackground('#fed7aa')
    .setFontColor('#9a3412')
    .setBold(true)
    .setRanges([range])
    .build();

  var watchRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K2="WATCH"')
    .setBackground('#fef08a')
    .setFontColor('#854d0e')
    .setRanges([range])
    .build();

  triageSheet.setConditionalFormatRules([urgentRule, priorityRule, watchRule]);
}

/**
 * JSON Response Helper
 */
function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
