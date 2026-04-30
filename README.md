# Barcode Audit System — PWA-Smartphone

A fully offline-capable, installable Progressive Web App for auditing cargo assets at stations. Designed to work as a **standalone app on smartphones** with zero internet dependency after first load — no CDN, no external fonts, no external scripts.

> **Two repos exist:**
> - **[`PWA`](https://github.com/trendsyncjourney-max/PWA)** — base web version (`claude-main` branch)
> - **`PWA-Smartphone`** (this repo) — offline-first, phone-optimised, all dependencies self-hosted (`dev` branch)

---

## Table of Contents

- [What Makes This Different from PWA](#what-makes-this-different-from-pwa)
- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Production Deploy with PM2](#production-deploy-with-pm2)
- [Expose Over the Internet (Cloudflare Tunnel)](#expose-over-the-internet-cloudflare-tunnel)
- [First-Time Setup](#first-time-setup)
- [How to Use](#how-to-use)
- [Installing on Your Phone](#installing-on-your-phone)
- [Offline Behaviour](#offline-behaviour)
- [Default Credentials](#default-credentials)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Version History](#version-history)
- [Tech Stack](#tech-stack)

---

## What Makes This Different from PWA

| Feature | PWA (base) | PWA-Smartphone (this repo) |
|---|---|---|
| Works fully offline | Partial | ✅ Full — app shell + API data cached |
| Dependencies | Some CDN links | ✅ 100% self-hosted |
| Font (Libre Barcode 39) | Google Fonts CDN | ✅ Downloaded locally |
| Barcode scanner library | CDN | ✅ Bundled in `/vendor/` |
| App icons (install) | ✅ | ✅ |
| Offline write queue | ✅ | ✅ Writes queued and replayed on reconnect |
| Offline banner | ✅ | ✅ |
| Installable to home screen | ✅ | ✅ |

Use **PWA-Smartphone** when users may have no internet connection during audits.

---

## Features

- **Dashboard** — landing page shows all stations with days since last audit, colour-coded green / amber / red; tap any card to start an audit
- **Floating scan button** — semi-transparent red FAB at top-right; one tap opens the camera scanner
- **Barcode scanning** — scan station and item barcodes with the phone camera (self-hosted library)
- **Station dropdown + search** — select or search without scanning
- **Item remarks** — remarks appear in the scan popup and checklist; multiple sub-location remarks shown as `SubLoc: remark; SubLoc: remark`
- **Audit reports** — view all completed audits; export to CSV or A4 PDF
- **PDF report** — includes item, version, status, condition, sub-location, and remarks
- **Admin panel** — manage stations, sub-locations, items, distribution, users, and reports
- **Camera scan in admin forms** — scan a barcode directly into any barcode field
- **Issue reporting** — staff report problems; admins view and resolve them
- **Full offline support** — app shell cached at install; API responses cached with stale-while-revalidate; offline writes queued and synced on reconnect
- **Offline banner** — shown automatically when device has no internet
- **Installable PWA** — add to home screen on Android and iPhone, launches full-screen with no browser bar
- **Auto-backup** — rolling 7-backup system for the SQLite database

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm (included with Node.js)
- A modern browser — Chrome (Android), Safari (iPhone), Edge, or Firefox
- Camera permission for barcode scanning

---

## Quick Start

```bash
# 1. Clone the repo (dev branch — active development)
git clone -b dev https://github.com/trendsyncjourney-max/PWA-Smartphone.git
cd PWA-Smartphone

# 2. Install dependencies
npm install

# 3. Start in development mode (auto-restarts on file change)
npm run dev

# OR start in production mode
npm start
```

Open **http://localhost:3000** in your browser.

---

## Production Deploy with PM2

[PM2](https://pm2.keymetrics.io/) keeps the server running in the background and restarts it on crash or reboot.

```bash
# Install PM2 globally (one-time)
npm install -g pm2

# Start the app
pm2 start server.js --name barcode-audit

# Auto-start after server reboot
pm2 save
pm2 startup    # run the printed command to enable startup on boot

# Common commands
pm2 status                  # check process status
pm2 logs barcode-audit      # tail live logs
pm2 restart barcode-audit   # restart after code changes
pm2 stop barcode-audit      # stop the server
```

---

## Expose Over the Internet (Cloudflare Tunnel)

Required if users are on different networks (e.g. airport Wi-Fi, mobile data). No domain or firewall changes needed.

```bash
# Install cloudflared (Linux, one-time)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# macOS (Homebrew)
brew install cloudflared

# Start a temporary public tunnel
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a URL like `https://random-words.trycloudflare.com`. Share it with users.

> **Note:** The URL changes every time you restart the tunnel. For a permanent URL, create a free Cloudflare account and set up a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps).

Run the tunnel in the background with PM2:

```bash
pm2 start "cloudflared tunnel --url http://localhost:3000" --name tunnel
pm2 save
```

---

## First-Time Setup

After starting the server, log in as admin and complete these steps once:

1. **Add Stations** → Admin → Stations → Add  
   Each station needs a name, location, and a unique barcode value (what's printed on the physical label).

2. **Add Items** → Admin → Items → Add  
   Enter the item name and the barcode on the physical item label.

3. **Assign Items to Stations** → Admin → Distribution → Assign  
   Choose an item, the station it belongs to, optionally a sub-location (e.g. "LHS", "PAX"), and remarks (e.g. `QTY x2`). The same item can be assigned to multiple sub-locations with different remarks.

4. **Add Staff Users** → Admin → Users → Add  
   Use role `user` for regular staff, `admin` for administrators.

---

## How to Use

### Dashboard (landing page after login)

Every station is listed with a badge showing how long ago it was last audited:

| Badge colour | Meaning |
|---|---|
| 🟢 Green | Audited within the last 7 days |
| 🟡 Amber | 8–30 days since last audit |
| 🔴 Red | More than 30 days since last audit |
| ⬜ Gray | No audit ever submitted |

- **Tap a station card** to start an audit for that station immediately.
- **Tap the red floating button** (top-right) to open the camera and scan a station barcode.

### Running an Audit

1. Select a station from the Dashboard, or go to the **Audit** tab and scan / search / select a station.
2. The app loads the full expected item list for that station.
3. Tap **Scan Item** and scan each item's barcode.  
   A popup shows the item name, remarks (e.g. `LHS: QTY x2; PAX: QTY x6`), and asks for the item condition (Good / OK / Bad).
4. Confirmed items turn **green**. Sub-location is shown on its own line below the item name.
5. Tap **Done Scanning**, review the list, then **Submit Report**.
6. Unscanned items are automatically marked **Missing**.

### Admin Panel

| Tab | Purpose |
|---|---|
| Stations | Add / delete stations |
| Sub-Locations | Add sub-locations within a station (e.g. LHS, PAX) |
| Items | Add / delete items |
| Distribution | Assign items to stations with sub-location and remarks |
| Users | Manage staff accounts |
| Reports | View all audits; export CSV or PDF |
| Issues | View and resolve issue reports from staff |
| Query | Look up audit history by station |
| Backups | Create or restore database backups |
| Settings | Set admin notification email |

### Changing Your Password

Tap **⋮** (top-right) → enter current password → enter and confirm new password → **Update Password**.

---

## Installing on Your Phone

Installing adds the app to your home screen so it opens full-screen like a native app — no browser bar.

### Android (Chrome)
1. Open the app URL in Chrome.
2. Tap **⋮** → **Add to Home Screen** → **Add**.
3. The app icon appears on your home screen.

### iPhone (Safari)
1. Open the app URL in **Safari** (must be Safari, not Chrome on iPhone).
2. Tap the **Share** button (box with upward arrow at the bottom).
3. Scroll down and tap **Add to Home Screen** → **Add**.
4. The app icon appears on your home screen.

After installing, open the app from the home screen icon. It will load and work even in **airplane mode** once the caches are warm (i.e. you've visited at least once with internet).

---

## Offline Behaviour

The service worker handles three scenarios:

| Scenario | Behaviour |
|---|---|
| **No internet, loading the app** | App loads from cache — full UI available |
| **No internet, viewing data** | Stations, items, distribution served from cache |
| **No internet, submitting a write** | Write is queued in `localStorage`; synced automatically when internet returns |

An **orange banner** appears at the top of the screen when the device is offline. When connectivity returns the banner disappears and any queued writes are replayed automatically, with a success toast.

---

## Default Credentials

| Username | Password |
|---|---|
| `admin` | `admin123` |

**Change this password immediately** after first login using the ⋮ menu.

---

## Environment Variables

Create a `.env` file in the project root to override defaults:

```env
PORT=3000
JWT_SECRET=change-this-to-a-long-random-string
ADMIN_EMAIL=your@email.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-gmail-app-password
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `JWT_SECRET` | `barcode-audit-secret-key-2026` | JWT signing secret — **change in production** |
| `ADMIN_EMAIL` | — | Email address for issue report notifications |
| `SMTP_USER` | — | Gmail address for sending email (optional) |
| `SMTP_PASS` | — | Gmail app password — not your account password (optional) |

---

## Project Structure

```
PWA-Smartphone/
├── server.js              # Express backend — all API routes, auth, SQLite
├── package.json
├── CHANGELOG.md           # Full version history
├── database/
│   ├── audit.db           # SQLite database (auto-created on first run)
│   └── backups/           # Automatic rolling backups (up to 7 kept)
└── public/
    ├── index.html         # PWA shell — all screens and modals
    ├── app.js             # All frontend logic (vanilla JS)
    ├── styles.css         # UI theme and layout
    ├── sw.js              # Service worker — full offline caching
    ├── manifest.json      # PWA manifest (name, icons, theme colour)
    ├── icon-192x192.png   # App icon for home screen
    ├── icon-512x512.png   # App icon (maskable, for Android)
    ├── dhl-logo.png       # Logo shown in header and login screen
    ├── fonts/
    │   ├── fonts.css          # @font-face for Libre Barcode 39
    │   └── LibreBarcode39.woff2  # Self-hosted barcode font
    └── vendor/
        └── html5-qrcode.min.js   # Self-hosted barcode scanning library
```

All external dependencies are bundled locally — the app makes **zero requests to external CDNs**.

---

## Version History

| Version | Highlights |
|---|---|
| **v1.8.0** | Remarks in scan popup; floating Scan to Audit FAB; sub-location always visible |
| **v1.7.0** | Dashboard landing page; scan shortcut; remarks in checklist and PDF |
| **v1.6.0** | Camera scan in admin forms; large item name in scan popup |
| **v1.5.0** | PWA-Smartphone repo created — self-hosted fonts + vendor; app icons; offline write queue |
| **v1.4.0** | Station dropdown on audit welcome screen |
| **v1.3.0** | Sub-locations; admin query tool; database backups |
| **v1.2.0** | Issue reporting; CSV/PDF export; admin settings |
| **v1.1.0** | Offline write queue; offline banner |
| **v1.0.0** | Initial release — full audit flow, admin panel, reports |

See [CHANGELOG.md](CHANGELOG.md) for full details per version.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Database | SQLite3 (file-based, zero config) |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Frontend | Vanilla HTML / CSS / JavaScript — no framework |
| Barcode scanning | html5-qrcode (self-hosted) |
| Barcode font | Libre Barcode 39 (self-hosted WOFF2) |
| PWA | Service Worker, Web App Manifest |
| Process manager | PM2 |
| Public tunnel | Cloudflare Tunnel |
