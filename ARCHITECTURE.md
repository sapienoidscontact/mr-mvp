# MR Tracker — Architecture Reference

A senior engineer can understand the full system in under 10 minutes.

---

## 1. System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MR's Phone (Chrome/Safari)                      │
│                                                                     │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────────────┐ │
│  │  React PWA   │    │   IndexedDB   │    │   Sync Engine        │ │
│  │  (Vite SPA)  │◄──►│   (Dexie.js)  │◄──►│  (syncEngine.js)    │ │
│  │              │    │               │    │  Interval: 30s       │ │
│  │ • Login      │    │ • visits      │    │  + online event      │ │
│  │ • Home       │    │ • syncQueue   │    │  + exponential       │ │
│  │ • VisitForm  │    │ • products    │    │    backoff           │ │
│  │ • History    │    │ • doctors     │    └──────────┬───────────┘ │
│  │ • Summary    │    │ • session     │               │             │
│  └──────────────┘    └───────────────┘               │ POST/GET    │
│                                                       │ (fetch)    │
│  ┌──────────────────────────────────────────────────┐│             │
│  │  Service Worker (Workbox via vite-plugin-pwa)   ││             │
│  │  • Caches static assets (Cache-first)           ││             │
│  │  • Network-first for Apps Script calls          ││             │
│  │  • Background sync tag: 'mr-tracker-sync'       ││             │
│  └──────────────────────────────────────────────────┘│             │
└─────────────────────────────────────────────────────┼─────────────┘
                                                       │ HTTPS
                                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Google Apps Script Web App                             │
│              (script.google.com — FREE, serverless)                 │
│                                                                     │
│  doGet:                         doPost:                             │
│  • action=validatePin           • action=syncVisits                 │
│  • action=getProducts           • action=uploadPhoto                │
│                                                                     │
└──────────────────────────┬──────────────────────┬───────────────────┘
                           │                       │
                           ▼                       ▼
              ┌─────────────────────┐   ┌─────────────────────┐
              │   Google Sheets     │   │    Google Drive      │
              │                     │   │                      │
              │ • MR_Visits tab     │   │ • Clinic photos      │
              │ • MR_Employees tab  │   │   (base64 → file)    │
              │ • Products tab      │   │   Public share link  │
              └─────────────────────┘   └─────────────────────┘
```

---

## 2. Data Flow Per Event Type

### ARRIVED (most complex — triggers visit form)

```
1. MR taps [🟢 ARRIVED] on Home screen
2. Home.jsx calls getCurrentPosition() → GPS captured (up to 15s)
3. React Router navigates to /visit-form with GPS coords in route state
4. MR fills form: doctor name (autocomplete), degree, specialty, clinic, 
   city, products (multi-select), samples, order value, notes, photo
5. VisitForm.jsx onSubmit:
   a. Assembles visit object with visit_id = uuidv4()
   b. Calls db.addVisit(visitData) — Dexie transaction:
      - db.visits.add({...visitData, synced: 0})
      - db.syncQueue.add({visit_id, created_at, attempts: 0})
   c. Calls db.addDoctorToCache() for autocomplete
   d. Navigate back to /home
6. syncEngine (running every 30s or on 'online' event):
   a. getUnsyncedVisits() → finds visit
   b. If photo: POST action=uploadPhoto → get Drive link
   c. POST action=syncVisits with event array
   d. Server responds {success, synced_ids: [visit_id], errors: []}
   e. markSynced([visit_id]) → visits.synced=1, syncQueue row deleted
7. SyncIndicator updates: "↻ 1 pending" → "✓ All synced"
```

### LEFT / BREAK_START / BREAK_END (simple events)

```
1. MR taps button
2. Home.jsx calls getCurrentPosition() → GPS
3. Assembles minimal visit object (doctor_name="", clinic_name="", etc.)
4. db.addVisit() — same atomic transaction
5. syncEngine picks it up on next cycle
```

### Login

```
1. MR enters MR ID + PIN
2. Client: SHA-256(PIN) via window.crypto.subtle (no library)
3. GET ?action=validatePin&mr_id=X&pin_hash=Y
4. Apps Script: reads MR_Employees sheet, compares hash
5. On valid: store {mr_id, mr_name, territory, manager} in localStorage
   + cache same in localStorage key mr_auth_{mr_id} with timestamp
6. Fetch products: GET ?action=getProducts → cache in IndexedDB
7. Navigate to /home, start sync engine
8. Offline fallback: if no network, check localStorage cache (30-day TTL)
```

---

## 3. Offline-First Strategy

### Write Path (always offline-safe)
Every user action writes to IndexedDB **first**, before any network call:
```
User action → IndexedDB (synced=0) + syncQueue entry → UI updates → sync later
```
The app is fully usable with zero network. All data is persisted locally.

### Sync Path
```
syncEngine.start() → 
  every 30s: if (navigator.onLine) syncNow()
  window 'online' event: syncNow() immediately
  
syncNow():
  rebuildSyncQueue()  ← crash recovery: ensures queue matches unsynced visits
  getUnsyncedVisits() ← reads visits where synced=0
  postEvents(visits)  ← batch POST to Apps Script
  markSynced(ids)     ← Dexie transaction: synced=1, queue row deleted
```

### Crash Recovery
- `syncQueue` is rebuilt from `visits` table on every sync cycle
- If the app crashes between writing to `visits` and `syncQueue`, the rebuild catches it
- `visits.synced=0` is the single source of truth — syncQueue is a derived view
- Server `synced_ids` response is authoritative — only confirmed IDs are marked synced

### Conflict Resolution
No true conflicts are possible because:
- Every event gets a new UUID (`visit_id`) — no updates, only inserts
- Apps Script checks `visit_id` uniqueness before appending (idempotent)
- Duplicate syncs (network timeout then retry) are silently deduped

### Exponential Backoff
```
Attempt 1: wait 5s
Attempt 2: wait 15s
Attempt 3: wait 30s
Attempt 4: wait 60s
Attempt 5: wait 120s (max)
After 5 failures: stop retrying, show ⚠ error, await manual retry
```

---

## 4. Security Model

### PIN Hashing
- SHA-256 is computed **client-side** via `window.crypto.subtle.digest`
- The raw PIN **never** leaves the device
- The hash is sent over HTTPS to Apps Script
- The hash is stored in the Google Sheet (not the PIN)

### Google Sheets as Credential Store
**Why this is acceptable for this use case:**
- This is an internal tool for employees, not a public-facing app
- MR data (doctor names, visit logs) is not classified PII in most jurisdictions
- The sheet is not publicly accessible — it requires the owner's Google login to view
- Apps Script runs as the owner, not as the caller — callers cannot access the sheet directly

**Known risks:**
- Anyone with the Web App URL can call `validatePin` with brute-force attempts (no rate limiting)
- Hash stored in sheet is visible to sheet admins — if sheet is shared, admins can see hashes
- SHA-256 without a salt is vulnerable to rainbow table attacks for simple PINs

**Acceptable mitigations for v1:**
- Web App URL is not public (shared only with MRs via manager)
- 4-digit PIN space is small — upgrade to PBKDF2 with salt for v2 if needed
- Sheet sharing should be restricted to owner + HR only

### Apps Script Public Deployment
- Deploy with "Execute as: Me" — script runs with owner's Google account credentials
- "Anyone" access means unauthenticated callers can invoke endpoints
- The script only has access to the owner's specific sheet and Drive folder (scoped by SHEET_ID and DRIVE_FOLDER_ID)
- Data is write-only from the caller's perspective (no read access for arbitrary data)

---

## 5. Schema Reference

### MR_Visits (tab)

| Column | Type | Notes |
|--------|------|-------|
| visit_id | UUID string | Primary key, generated client-side |
| mr_id | String | e.g. "MR001" |
| mr_name | String | e.g. "Rahul Sharma" |
| timestamp_iso | ISO 8601 string | e.g. "2024-11-15T09:30:00.000Z" |
| event_type | Enum | ARRIVED \| LEFT \| BREAK_START \| BREAK_END |
| latitude | Float | e.g. 19.0760 |
| longitude | Float | e.g. 72.8777 |
| accuracy_m | Integer | GPS accuracy in metres |
| doctor_name | String | Free text |
| doctor_degree | Enum | MBBS \| MD \| DM \| BDS \| MDS \| Other |
| doctor_specialty | Enum | General Practice \| Cardiology \| ... |
| clinic_name | String | Free text |
| city | String | Free text, manually entered |
| products_discussed | String | Comma-separated product names |
| samples_given | Integer | Count |
| order_value_inr | Float | Indian Rupees |
| notes | String | Optional free text |
| day_session_id | UUID string | Same for all events in one working day |
| photo_drive_link | String | Google Drive share URL or empty |

### MR_Employees (tab)

| Column | Type | Notes |
|--------|------|-------|
| mr_id | String | Primary key, e.g. "MR001" |
| mr_name | String | Full name |
| pin_hash | String | SHA-256 hex of 4-digit PIN |
| territory | String | Sales territory |
| reporting_manager | String | Manager name |
| joined_date | Date string | ISO date |

### Products (tab)

| Column | Type | Notes |
|--------|------|-------|
| product_id | String | e.g. "P001" |
| product_name | String | Display name |
| category | String | e.g. "Cardiology" |
| unit_price_inr | Float | Price per unit |

---

## 6. Setup Guide

See **README.md** for the complete step-by-step setup guide.  
Summary:
1. Create Google Sheet with 3 tabs (schema above)
2. Deploy Apps Script (`backend/Code.gs`) as Web App (Anyone)
3. Copy Web App URL → `.env` → `VITE_APPS_SCRIPT_URL`
4. `npm install && npm run build`
5. Deploy `dist/` to Netlify or GitHub Pages
6. Open on phone → Add to Home Screen

---

## 7. Cost Analysis

### Apps Script Quotas (Google Workspace free tier)

| Resource | Quota | This App's Usage | Safety Margin |
|----------|-------|-----------------|---------------|
| Script executions / day | 20,000 | 6,000 | 3.3× |
| URL Fetch calls / day | 20,000 | ~200 (sync engine) | 100× |
| Drive storage | 15 GB free | ~50 MB/month photos | 300× |
| Sheets rows | 10M per sheet | ~180,000/month | 55× |

**Calculation for 50 MRs × 30 visits/day:**
```
Events per visit: ~4 (ARRIVED + form + LEFT + possibly BREAK)
Events per day:   50 MRs × 30 visits × 4 events = 6,000 rows/day
Events per month: 6,000 × 22 working days = 132,000 rows/month

Sync engine posts: app batches all pending events in ONE POST per 30s cycle
Script executions: ≤ 6,000/day (one per event batch, but typically fewer)

Result: 6,000/day << 20,000/day quota ✅
```

**At 100 MRs:**
```
Events/day: 12,000 — still within 20,000 quota ✅
At ~250 MRs: consider batching multiple events per execution or upgrading to Google Workspace
```

### Hosting Costs

| Service | Plan | Cost |
|---------|------|------|
| Netlify | Free | $0/month |
| GitHub Pages | Free | $0/month |
| Google Sheets | Free (15 GB) | $0/month |
| Google Apps Script | Free | $0/month |
| Google Drive | Free (15 GB) | $0/month |
| **Total** | | **$0/month** |

---

## 8. Limitations and Known Trade-offs

### Apps Script
- **6-minute execution limit**: Each Web App request must complete in 6 minutes. A batch of 100 events takes ~2s — well within limits.
- **No rate limiting**: The endpoint accepts unlimited requests; implement IP-based throttling in v2 if abuse is a concern.
- **Deployment friction**: Every Code.gs change requires a new deployment. Old URLs continue to serve old code.
- **Cold start latency**: First request after inactivity can take 3–5 seconds; subsequent requests are faster.
- **No real-time collaboration**: Two MRs syncing simultaneously may interleave rows; this is acceptable for an append-only log.

### IndexedDB
- **Storage limit**: Browsers typically allow 50MB–1GB depending on device storage. Photos stored as base64 (≈33% larger than binary) — limit photo uploads or compress before storage.
- **Private/incognito mode**: IndexedDB is not persistent in private mode — warn MRs not to use private mode.
- **iOS Safari IndexedDB**: Fully supported since iOS 15. Older devices should update Safari.
- **No IndexedDB encryption**: Data at rest on device is unencrypted. For regulated industries, consider encrypting sensitive fields.

### PWA Install Experience
- **Android (Chrome)**: Smooth — browser prompts "Add to Home Screen" automatically after 2+ visits.
- **iOS (Safari)**: Manual — user must tap Share → Add to Home Screen. There is no install prompt. Coach MRs through this.
- **Desktop**: Supported in Chrome/Edge; not needed for this use case.
- **iOS background sync**: Background sync API is not supported on iOS — the app must be open to sync. Acceptable for an active-use field app.

### GPS Accuracy
- **Indoor accuracy**: GPS degrades inside buildings. The app falls back gracefully (shows accuracy_m in UI, allows form submission without GPS).
- **enableHighAccuracy**: set to true — drains battery faster. MRs should know to plug in if using all day.
- **No geocoding**: City name must be entered manually (no reverse geocoding to avoid paid APIs).

### Authentication
- **No token expiry**: localStorage session persists until cleared. If a phone is lost, the session remains valid. Mitigate by adding a "Logout" option in v2.
- **SHA-256 PIN without salt**: Vulnerable to rainbow tables for common PINs. Use PBKDF2 with a per-user salt in v2.

### Offline Photo Uploads
- **Photos sync after visit events**: If offline during photo capture, the base64 is stored in IndexedDB. On sync, the photo uploads first, then the visit record. If photo upload fails, the visit syncs without a photo link.
- **Large photos**: A 5MB photo becomes ~6.7MB base64 in IndexedDB. Encourage MRs to use lower camera resolution.
