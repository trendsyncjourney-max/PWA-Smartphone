# Changelog — DHL Cargo Barcode Audit PWA

---

## v1.8.0 — 2026-04-30

### Added
- **Remarks in scan modal** — when an item is scanned and found, its remarks (if any) are displayed below the item name in the condition popup
- **Floating Scan to Audit button** — semi-transparent red FAB at the top-right of the dashboard; one tap opens the station scanner immediately

### Fixed
- **Sub-location tag always visible** — moved sub-location tag to its own line below the item name in the checklist so it is never clipped when names are long

---

## v1.7.0 — 2026-04-30

### Added
- **Dashboard landing page** — new first tab showing all stations with days since last audit, colour-coded green/amber/red by recency, "No audit done" for stations never audited, and who last audited each station
- **Scan to Audit shortcut** — button in the dashboard header that opens the station scanner immediately so users can start an audit in one tap
- **Item remarks in checklist** — when scanning items during an audit, remarks are shown in italic below the barcode for context
- **Item remarks in PDF report** — Remarks column added to the A4 audit detail table

### Changed
- Dashboard is now the default landing screen after login for all users
- Tapping any station card on the dashboard jumps straight into an audit for that station

---

## v1.6.0 — 2026-04-30

### Added
- **Camera scan in admin forms** — Barcode fields in Add Station and Add Item forms now have a Scan button; admin can scan a barcode directly into the field using the camera instead of typing

### Changed
- **Scan modal redesign** — removed the box icon, item name is now displayed large and centered for fast readability at a glance

---

## v1.5.0 — 2026-04-30

### Added
- **Custom branding** — replaced default DHL logo and app icon with custom logo and icon images
- **PWA-Smartphone repo** — new standalone repository with full offline support, no CDN dependencies, proper install icons, and offline write queue

### Changed
- All external CDN dependencies removed: html5-qrcode and Libre Barcode 39 font are now self-hosted
- App icons (192×192, 512×512) added — PWA can now be properly installed to home screen
- manifest.json enhanced: scope, orientation, display_override, maskable icon

---

## v1.4.0 — 2026-04-30

### Added
- **Offline support** — service worker now caches all static assets (app shell, fonts, vendor library) and API GET responses (stations, items, distribution, sub-locations) using stale-while-revalidate strategy
- **Offline banner** — amber fixed bar at top of screen when device is offline
- **Offline write queue** — failed POST/PUT/DELETE requests are queued in localStorage and auto-synced when connection is restored
- **Offline detection** — `navigator.onLine` + online/offline events wired throughout the app

---

## v1.3.0 — 2026-04-30

### Added
- **Rolling database backups** — automatic backup triggered 8 seconds after any data change; maximum 7 backups kept, oldest pruned automatically
- **Admin Backups tab** — lists all backup files with timestamp and file size; "Backup Now" button for manual snapshots
- **Database restore** — admin can restore any backup with one tap; current database is snapshotted before restoring; server restarts automatically via PM2
- **Admin tabs scroll indicator** — fade gradient on the right edge when more tabs are off-screen
- **End-of-list markers** — "— End of list —" divider at the bottom of all admin lists
- **Version info** — tap ⋮ menu to see App Version, Last Updated, and Database Updated timestamps
- **GitHub tag v1.2.0** — "Final MVP Version" tag created on claude-main

### Fixed
- Modal state not reset when closing scan result modal with X button
- Distribution sub-location filter value not explicitly reset on station change
- `querySelector('.condition-section')` scoped to modal to prevent document-wide match

---

## v1.2.0 — 2026-04-29 (Tagged: Final MVP Version)

### Added
- **Sub-location filter** — filter Sub-Locations admin list by station
- **Distribution filters** — filter Distribution admin list by station and sub-location
- **Remarks field** — optional notes field on distribution assignments, shown in list view
- **Device time** — audit start/end and scan times now recorded in device local time instead of server UTC
- **No-barcode manual audit** — items without a barcode appear in the checklist with a tap-to-update indicator; admin can tap to set Found/Missing status and condition manually

---

## v1.1.0 — 2026-04-28

### Added
- **Sub-locations** — stations can have named sub-locations (e.g. Zone A, Shelf 2); items can be assigned to a sub-location within a station
- **Item condition tracking** — when an item is scanned as Found, auditor selects Good / OK / Bad condition; condition stored and shown in reports
- **A4 audit report** — print a formatted A4 PDF report for any completed audit from the Reports tab
- **Misplaced item actions** — when a scanned item belongs to a different station, auditor selects an action (Old ver. replace, Replaced, Misplaced removed)
- **Admin Query tab** — look up any station to see its active and past audits
- **Distribution versioning** — distribution assignments record the item version at time of assignment

---

## v1.0.0 — 2026-04-28

### Features
- JWT-based authentication — admin and user roles
- Station scan — scan station barcode or search by name to begin audit
- Item checklist — items assigned to the station listed after station scan
- Two-phase audit flow: Scan Items → Done Scanning → Submit Report
- Admin panel: Stations, Items, Distribution, Users, Reports, Issues, Settings
- Reports — date-grouped audit history, export to CSV or PDF
- Issue reporting — any user can submit a report; admin can resolve
- Change password — all users can update their password via ⋮ menu
- PWA — service worker, web manifest, installable on mobile
- Cloudflare tunnel support for testing

### Tech Stack
- Node.js + Express, SQLite3, JWT + bcryptjs
- html5-qrcode barcode scanning
- Vanilla JS SPA (no framework)
- PM2 process manager
