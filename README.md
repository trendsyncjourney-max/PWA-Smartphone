# DHL Cargo Barcode Audit PWA

A mobile-first Progressive Web App (PWA) for auditing cargo assets at DHL stations. Staff scan station and item barcodes to confirm what's present, flag missing or misplaced items, and submit audit reports — all from their phone, with or without internet.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Screenshots & Flow](#screenshots--flow)
- [Requirements](#requirements)
- [Installation](#installation)
- [First-Time Setup](#first-time-setup)
- [How to Use](#how-to-use)
  - [Logging In](#logging-in)
  - [Running an Audit](#running-an-audit)
  - [Reporting an Issue](#reporting-an-issue)
  - [Admin Panel](#admin-panel)
  - [Changing Your Password](#changing-your-password)
- [Installing on Your Phone (PWA)](#installing-on-your-phone-pwa)
- [Default Credentials](#default-credentials)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Versioning](#versioning)

---

## What It Does

The Barcode Audit PWA lets DHL cargo staff:

- **Scan a station barcode** to pull up the full list of items that should be at that station
- **Scan each item barcode** to mark it as Found — the list updates in real time with a green tick
- **Flag missing or misplaced items** automatically when the audit is submitted
- **Submit an audit report** that admins can view, grouped by date, from the Admin panel
- **Export audit reports** to CSV (for Google Sheets / Excel) or PDF
- **Report issues** directly from the app (equipment problems, missing items, etc.)
- **Work offline** — the service worker caches the app so it loads without internet

Admins get a separate panel to manage stations, items, distribution assignments, users, and view all audit history.

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- A modern browser (Chrome, Safari, Edge, Firefox)
- Camera access on mobile for barcode scanning

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/trendsyncjourney-max/PWA.git
cd PWA
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The server runs on **http://localhost:3000** by default.

### 4. Open in browser

Navigate to `http://localhost:3000` in your browser.

---

## First-Time Setup

After starting the server for the first time, log in as admin and do the following:

1. **Add Stations** — Go to Admin → Stations → Add. Give each station a name, location, and a unique barcode value (this is what gets printed on the physical barcode label).

2. **Add Items** — Go to Admin → Items → Add. Enter the item name and its barcode value (from the physical label on the item).

3. **Assign Items to Stations** — Go to Admin → Distribution → Assign. Select an item and the station it belongs to. Repeat for each item at each station.

4. **Add Staff Users** — Go to Admin → Users → Add. Create a username and password for each staff member. Set role to `user` for regular staff, `admin` for administrators.

Once stations and items are set up, staff can immediately start scanning audits.

---

## How to Use

### Logging In

Open the app URL on your phone or browser. Enter your username and password and tap **Sign In**.

### Running an Audit

1. Tap the **Audit** tab at the bottom of the screen.
2. Tap **Scan Station Barcode** and point your camera at the station's barcode label. Alternatively, type the station name in the search box and select it.
3. The app loads the full list of items expected at that station.
4. Tap **Scan Item** and scan each item's barcode. The item turns **green** (Found) when confirmed.
5. If an item is not at the station, you can skip it — it will be marked **Missing** automatically when you submit.
6. When finished scanning, tap **Done Scanning**, then **Submit Report**.
7. The audit is saved. Any missing items are flagged and visible to admins in the Reports panel.

> **Tip:** If you close the app mid-audit, reopening and scanning the same station will resume where you left off.

### Reporting an Issue

1. Tap the **Issues** tab.
2. Fill in a title, select a category, and describe the problem.
3. Tap **Submit Report**. The report appears in the Admin → Issues panel for the admin to review and resolve.

### Admin Panel

Only users with the `admin` role can see the Admin tab.

| Tab | What you can do |
|---|---|
| **Stations** | Add or delete stations |
| **Items** | Add or delete items, optionally assign to a station at creation |
| **Distribution** | Assign items to stations, reassign, or remove assignments |
| **Users** | Add or delete user accounts |
| **Reports** | View all completed audits grouped by date; export to CSV or PDF |
| **Issues** | View and resolve issue reports submitted by staff |
| **Settings** | Set admin email address |

**Exporting Reports:**
- **CSV** — downloads a spreadsheet file you can open in Google Sheets or Excel
- **PDF** — opens the browser print dialog; choose "Save as PDF"

### Changing Your Password

Tap the **⋮ (three dots)** button in the top-right corner. Enter your current password, then your new password twice, and tap **Update Password**. This works for all users — admin and regular staff alike.

---

## Installing on Your Phone (PWA)

The app can be installed as a native-like app on iOS and Android — no app store needed.

**Android (Chrome):**
1. Open the app URL in Chrome.
2. Tap the three-dot menu → **Add to Home Screen**.
3. Tap **Add**. The app icon appears on your home screen.

**iPhone (Safari):**
1. Open the app URL in Safari.
2. Tap the **Share** button (box with arrow at the bottom).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. The app icon appears on your home screen.

Once installed, the app works offline and feels like a native app — no browser bar, full screen.

---

## Default Credentials

When the server starts for the first time, a default admin account is created:

| Username | Password |
|---|---|
| `admin` | `admin123` |

**Change this password immediately** after first login using the ⋮ menu → Change Password.

---

## Environment Variables

Create a `.env` file in the project root to override defaults:

```env
PORT=3000
JWT_SECRET=your-secret-key-here
ADMIN_EMAIL=your@email.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `JWT_SECRET` | `barcode-audit-secret-key-2026` | Secret key for JWT tokens — **change in production** |
| `ADMIN_EMAIL` | `trendsyncjourney@gmail.com` | Email address for admin notifications |
| `SMTP_USER` | — | Gmail address for sending emails (optional) |
| `SMTP_PASS` | — | Gmail app password (optional) |

If `SMTP_USER` and `SMTP_PASS` are not set, email notifications are logged to the console only.

---

## Project Structure

```
PWA/
├── server.js            # Express backend, API routes, SQLite database
├── package.json
├── database/
│   └── audit.db         # SQLite database (auto-created on first run)
├── public/
│   ├── index.html       # Main PWA shell
│   ├── app.js           # Frontend JavaScript
│   ├── styles.css       # Styles (DHL brand theme)
│   ├── sw.js            # Service worker (offline support)
│   ├── manifest.json    # PWA manifest (name, icons, theme)
│   └── dhl-logo.svg     # Brand asset
└── CHANGELOG.md         # Version history
```

---

## Versioning

| Version | Date | Notes |
|---|---|---|
| `v0.1` | 2026-04-28 | Initial stable release — full audit flow, admin panel, reports, export, change password |

To run a specific version:

```bash
git checkout v0.1
npm install
npm start
```

See [CHANGELOG.md](CHANGELOG.md) for a full list of features per version.

---

## Tech Stack

- **Backend:** Node.js, Express, SQLite3
- **Auth:** JWT (jsonwebtoken), bcryptjs
- **Frontend:** Vanilla HTML/CSS/JavaScript (no framework)
- **Barcode scanning:** html5-qrcode
- **PWA:** Service Worker, Web App Manifest
- **Hosting/tunnel:** Cloudflare Tunnel (for sharing over the internet)
