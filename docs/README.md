# Koroboi — Tablet-First School Mental Health Screening PWA

**Koroboi** is a privacy-first, tablet-first web app (Progressive Web Application) designed for Kenyan schools (ages 10–19). It enables school students to privately complete a short mental health screening (PHQ-9 followed by GAD-7) on shared tablets. Responses are queued offline and written directly into the school practitioner's own Google Sheet.

**Key Guarantee**: Our company never receives, stores, processes, or can read student data. There is no central database or company server.

---

## Architecture Overview

```
               ┌──────────────────────────────────────────────┐
               │ Shared Tablets (30-40 offline in classroom)  │
               │ - Write-only offline PWA                     │
               │ - IndexedDB response queue                   │
               │ - WebCrypto hashed & salted staff PIN        │
               └──────────────────────┬───────────────────────┘
                                      │
                         HTTP POST    │ (Content-Type: text/plain)
                         Write-Only   │
                                      ▼
               ┌──────────────────────────────────────────────┐
               │ School Practitioner's Google Apps Script     │
               │ - Deployed under school-owned Google Account │
               │ - Validates shared secret token & payload    │
               │ - Rejects duplicate sessionIds               │
               └──────────────────────┬───────────────────────┘
                                      │
                                      ▼
               ┌──────────────────────────────────────────────┐
               │ School Practitioner's Google Sheet           │
               │ - Tabs: Roster, Responses, Triage, Summary,  │
               │   Demo, AlertLog                             │
               │ - Immediate URGENT email alerts              │
               └──────────────────────────────────────────────┘
```

---

## Practitioner Setup Instructions

Follow these step-by-step instructions to set up Koroboi for your school:

### Step 1: Set Up the Google Sheet & Apps Script
1. Log into your **school-owned Google account**.
2. Create a new Google Sheet and title it e.g., `Koroboi Mental Health Screening - [School Name]`.
3. Open **Extensions > Apps Script** from the top menu bar.
4. Replace the contents of `Code.gs` with the script provided in `apps-script/Code.gs` in this repository.
5. Save the project (`Ctrl+S` or `Cmd+S`).
6. Run the `setup()` function from the Apps Script editor:
   - When prompted, enter practitioner email address(es) (e.g., `counselor@school.ac.ke, deputy@school.ac.ke`).
   - Confirm receipt of the test email sent to your inbox.
   - Enter a **Shared Secret Token** (e.g., `koroboi-secret-2025`).

### Step 2: Deploy the Web App
1. In the Apps Script editor, click **Deploy > New deployment**.
2. Select type: **Web app**.
3. Set description: `Koroboi Production Backend`.
4. Set **Execute as**: `Me` (your school account).
5. Set **Who has access**: `Anyone` (required for write-only POST submissions from tablets without requiring Google login on student devices).
6. Click **Deploy** and copy the resulting **Web App URL** (e.g., `https://script.google.com/macros/s/.../exec`).

### Step 3: Hosting the App (PWA) over Static HTTPS
1. Build the static production bundle:
   ```bash
   cd app
   npm install
   npm run build
   ```
2. Deploy the generated `app/dist` folder to any static HTTPS host such as **GitHub Pages**, **Netlify**, or **Vercel**.
3. **Note on Privacy**: The static web host serves only static HTML, CSS, and JS files to the tablet browsers. No student screening data is ever sent to or processed by the web host.

### Step 4: Configure the Tablets
1. Open the hosted Koroboi app URL on each school tablet in Chrome / Safari.
2. Long-press on the **Koroboi logo/title** for **3 seconds** to open the hidden Staff Access screen.
3. On first launch, create a **6-digit Staff PIN**.
4. Enter the **Web App URL** and **Shared Secret Token** configured in Step 1 & 2.
5. Tap **Add to Home Screen** / **Install App** to install Koroboi as an offline PWA.

---

## Security & Privacy Guarantee

- **Write-Only Access**: Tablets have submit-only access. The tablet app cannot read, query, or display any historical records or Sheet content.
- **No Names Collected**: Students enter their **admission number only**. Student names are stored solely in the practitioner's offline `Roster` tab inside their own Google Sheet.
- **Hashed Staff PIN**: Staff authentication on tablets uses WebCrypto SHA-256 with a random salt. PINs are never stored in plain text.
- **Data Deletion**: Upon successful sync to Google Sheets, responses are deleted from tablet IndexedDB storage.
- **No Remote Tracking**: Zero analytics, trackers, external fonts, or third-party scripts.

---

## Triage Tiers & Clinical Logic

*Note: All thresholds are labelled "pending sign-off by a clinical advisor".*

- **URGENT**: PHQ-9 item 9 > 0, or PHQ-9 total $\ge 20$, or GAD-7 total $\ge 15$. Trigger immediate email notification to `PRACTITIONER_EMAILS`.
- **PRIORITY**: PHQ-9 total $\ge 9$ or GAD-7 total $\ge 10$.
- **WATCH**: PHQ-9 total 5–8 or GAD-7 total 5–9.
- **NONE**: Scores below watch thresholds.

---

## Known Limitations & Next Steps

1. **Non-Diagnostic Tool**: Koroboi is strictly a screening and triage prioritization aid. It does not diagnose mental health conditions or present diagnostic labels to students.
2. **Backup Email Alerting**: Automated email alerts depend on Google Apps Script daily quota limits. Practitioners must be on-site during screening waves and inspect the `Triage` sheet directly before students leave.
3. **Clinical & Institutional Sign-Off**: Prior to full deployment, school administration and clinical advisors must perform a formal data protection impact review and sign off on triage tier cutoff thresholds.
