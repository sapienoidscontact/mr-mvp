# MR Tracker

**An offline-first Progressive Web App for pharmaceutical medical
representatives: GPS-stamped doctor visits, voice-noted call reports and sample
tracking, logged from any phone with no signal — syncing to Google Sheets when
the network returns, at $0/month.**

> **This is a source-available portfolio repository.** You may read the code to
> evaluate the author's work. You may not copy, run, reuse, or build on it.
> See [LICENSE](LICENSE).

---

## Why it exists

A medical representative makes 10–15 clinic visits a day, and the places
prescriptions are actually written — hospital basements, small-town clinics,
rural practices — are exactly the places with no usable mobile signal. Every
commercial MR-reporting SaaS assumes an online device and fails there, so field
teams fall back to filling in a day's visits from memory at 9pm. The data that
reaches management is fiction.

Three constraints follow, and they drove the whole design:

| Constraint | Decision |
| --- | --- |
| **No signal at the point of work** | **Offline-first, not offline-tolerant.** The app is fully functional with no network; sync is a background concern. |
| **Per-seat SaaS × 40 reps is unaffordable** | **$0/month.** Google Sheets as the backend — no server, no database bill. |
| **No company-issued devices** | **PWA, not a native app.** Installs from a URL onto any Android or iOS phone. No app store, no MDM, no install friction. |

GPS stamping and photo capture exist for the same reason the offline model does:
they make a visit report verifiable rather than remembered.

## Architecture

```
   Phone (Android / iOS) — installed as PWA
   ┌────────────────────────────────────────┐
   │  React 18 + Vite + Tailwind            │
   │  ┌──────────────────────────────────┐  │
   │  │ Local-first store                │  │
   │  │ • visits queue                   │  │
   │  │ • GPS lat/long/accuracy          │  │
   │  │ • voice-to-text notes            │  │
   │  │ • photos                         │  │
   │  │ WORKS WITH ZERO CONNECTIVITY     │  │
   │  └──────────────┬───────────────────┘  │
   └─────────────────┼──────────────────────┘
                     │ when network returns
                     ▼
         ┌───────────────────────────┐
         │ Google Apps Script        │
         │ backend/Code.gs           │
         └───────────┬───────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌────────────────┐      ┌──────────────────┐
│ Google Sheets  │      │  Google Drive    │
│ MR_Visits      │      │  visit photos    │
│ MR_Employees   │      │                  │
│ Products       │      │                  │
└────────────────┘      └──────────────────┘
```

The backend is a **Google Apps Script** (`backend/Code.gs`) — there is no server
to run, patch or pay for. That is the whole reason the $0 figure is real rather
than marketing.

## Data model

Three sheets, deliberately flat so a non-technical manager can read and filter
them directly:

**`MR_Visits`** — `visit_id`, `mr_id`, `mr_name`, `timestamp_iso`, `event_type`,
`latitude`, `longitude`, `accuracy_m`, `doctor_name`, `doctor_degree`,
`doctor_specialty`, `clinic_name`, `city`, `products_discussed`,
`samples_given`, `order_value_inr`, `notes`, `day_session_id`,
`photo_drive_link`

**`MR_Employees`** — `mr_id`, `mr_name`, `pin_hash`, `territory`,
`reporting_manager`, `joined_date`

**`Products`** — `product_id`, `product_name`, `category`, `unit_price_inr`

Note `pin_hash`: reps authenticate with a PIN, and it is **stored hashed**, not
in plaintext, even in a Google Sheet.

## What it is made of

**Frontend** — React 18, Vite, Tailwind CSS, PostCSS
**Delivery** — Progressive Web App (installable, offline-capable service worker)
**Backend** — Google Apps Script (`backend/Code.gs`)
**Storage** — Google Sheets (records) + Google Drive (photos)
**Device APIs** — Geolocation, camera, speech-to-text
**Hosting** — static; GitHub Pages or Netlify
**Cost** — $0/month, entirely on free tiers

See [ARCHITECTURE.md](ARCHITECTURE.md) for the detailed design.

## What is deliberately not in this repo

`.env` (live Sheet IDs and deployment URLs), `node_modules/`, and build output.
`.env.example` documents every required variable. No real visit, doctor or
employee data is committed.

## Related projects

Part of the Pharma family:

- [**pharma-ai-lab**](https://github.com/sapienoidscontact/pharma-ai-lab) — the local-first
  Pharma AI Workspace desktop application (Base + Pro editions)
- [**n8n-sample**](https://github.com/sapienoidscontact/n8n-sample) — 35 n8n
  workflows automating the Pharma business cycle

## Status

Working PWA with a complete setup guide. The documentation below walks through
Google Sheet creation, Apps Script deployment and hosting step by step — written
for a non-technical operations manager, not a developer.

## Licensing and third-party credits

**Proprietary — All Rights Reserved.** See [LICENSE](LICENSE).

Depends on third-party software and services under their own licences and terms,
including React (MIT), Vite (MIT), Tailwind CSS (MIT), and the Google Sheets,
Drive and Apps Script platforms. Those licences and terms cover those components
only and grant no rights in this Work.

Contact: **aidevloping@gmail.com**

---

## Detailed project documentation

A **free, offline-first Progressive Web App** for pharmaceutical medical representatives.  
Runs on any Android/iOS device, syncs to Google Sheets, costs $0/month.

---

## Prerequisites

- Node.js 18+ (`node --version`)
- A Google account (for Google Sheets + Drive)
- A GitHub or Netlify account (for hosting)

---

## Step 1 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it **MR Tracker Data** (or anything you prefer).
3. Copy the Sheet ID from the URL:  
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_YOUR_SHEET_ID`**`/edit`
4. Create **3 tabs** (right-click the tab at the bottom → Insert sheet):

**Tab 1: `MR_Visits`** — paste these headers in Row 1:
```
visit_id | mr_id | mr_name | timestamp_iso | event_type | latitude | longitude | accuracy_m | doctor_name | doctor_degree | doctor_specialty | clinic_name | city | products_discussed | samples_given | order_value_inr | notes | day_session_id | photo_drive_link
```

**Tab 2: `MR_Employees`** — paste these headers in Row 1:
```
mr_id | mr_name | pin_hash | territory | reporting_manager | joined_date
```

**Tab 3: `Products`** — paste these headers in Row 1:
```
product_id | product_name | category | unit_price_inr
```

5. **Add sample data:**

In `MR_Employees`, add a row for each MR. For `pin_hash`, generate the SHA-256 of the PIN:
- Go to https://emn178.github.io/online-tools/sha256.html
- Type the 4-digit PIN (e.g. `1234`) → copy the output
- Example: PIN `1234` → hash `03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4`

| mr_id | mr_name | pin_hash | territory | reporting_manager | joined_date |
|-------|---------|----------|-----------|-------------------|-------------|
| MR001 | Rahul Sharma | 03ac674216f3... | Mumbai West | Amit Patel | 2024-01-01 |

In `Products`, add your product catalog:

| product_id | product_name | category | unit_price_inr |
|-----------|-------------|----------|----------------|
| P001 | Metformin 500mg | Diabetes | 45 |
| P002 | Atorvastatin 10mg | Cardiology | 120 |
| P003 | Amoxicillin 250mg | Antibiotic | 80 |

---

## Step 2 — Set Up Google Drive Folder (for Photos)

1. Go to [drive.google.com](https://drive.google.com)
2. Create a new folder called **MR Tracker Photos**
3. Open the folder — copy the folder ID from the URL:  
   `https://drive.google.com/drive/folders/`**`THIS_IS_YOUR_FOLDER_ID`**

---

## Step 3 — Deploy the Apps Script Backend

1. In your Google Sheet → click **Extensions** → **Apps Script**
2. Delete all existing code
3. Open `backend/Code.gs` from this project and paste the entire contents
4. Replace the two placeholders at the top:
   ```javascript
   var SHEET_ID = 'YOUR_ACTUAL_SHEET_ID';
   var DRIVE_FOLDER_ID = 'YOUR_ACTUAL_FOLDER_ID';
   ```
5. Click **Deploy** → **New Deployment**
6. Click the gear icon → **Web App**
7. Set:
   - Description: `MR Tracker v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy** → **Authorize access** (approve all permissions)
9. Copy the **Web App URL** — it looks like:  
   `https://script.google.com/macros/s/AKfy.../exec`

> **Each time you edit Code.gs, you must create a New Deployment** — existing deployments don't auto-update.

---

## Step 4 — Configure the App

```bash
# In the mr-tracker/ directory:
cp .env.example .env
```

Edit `.env` and paste your Apps Script URL:
```
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
```

---

## Step 5 — Build the App

```bash
cd mr-tracker
npm install
npm run build
```

The `dist/` folder contains the production app.

---

## Step 6 — Deploy to Hosting

### Option A: Netlify (recommended — easiest)

1. Go to [netlify.com](https://netlify.com) → sign up free
2. Drag and drop the `dist/` folder onto the Netlify dashboard
3. Your app is live at a `*.netlify.app` URL in 30 seconds

### Option B: GitHub Pages

1. Push the project to a GitHub repo
2. Go to Settings → Pages → Source: GitHub Actions
3. Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy PWA
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: mr-tracker
      - run: npm run build
        working-directory: mr-tracker
        env:
          VITE_APPS_SCRIPT_URL: ${{ secrets.VITE_APPS_SCRIPT_URL }}
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: mr-tracker/dist
```

4. Add `VITE_APPS_SCRIPT_URL` as a Repository Secret in Settings → Secrets

---

## Step 7 — Install on Phones

### Android
1. Open Chrome → navigate to your app URL
2. Tap the menu (⋮) → **Add to Home Screen**
3. Tap **Install** — app icon appears on home screen

### iOS (Safari only)
1. Open Safari → navigate to your app URL
2. Tap the Share button (□↑) → **Add to Home Screen**
3. Tap **Add**

> The app now works offline, remembers login, and syncs automatically.

---

## Step 8 — First Login

- Open the app → enter the MR ID and PIN you added to `MR_Employees`
- The app fetches your product list and caches it offline
- Start your day and log visits!

---

## Troubleshooting

**"VITE_APPS_SCRIPT_URL is not configured"**  
→ Check your `.env` file exists and has the correct URL, then rebuild.

**Login fails with correct credentials**  
→ Check Apps Script is deployed with "Anyone" access. Open the Web App URL directly in a browser — it should return `{"error":"Unknown action: undefined"}`.

**GPS not working**  
→ Allow location permission in browser. On iOS Safari, go to Settings → Safari → Location → Allow.

**Sync stuck at "N pending"**  
→ Check network connection. Tap the sync badge to retry. Check Apps Script logs: Extensions → Apps Script → Executions.

**Products not loading**  
→ Add at least one row to the `Products` tab and re-login.

**Photos not uploading**  
→ Verify `DRIVE_FOLDER_ID` in Code.gs and re-deploy. The Drive folder must be accessible to your Google account.

---

## Updating the App

```bash
npm run build
# Then re-deploy dist/ to Netlify or push to GitHub
```

For Apps Script changes: edit Code.gs → Deploy → **New Deployment** (don't update existing).

---

*MR Tracker v1.0.0 — Built with React + Dexie + Google Apps Script*
