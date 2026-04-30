# Changelog — DHL Cargo Barcode Audit PWA

## v0.1 — 2026-04-28 (Current stable)

### Features
- **Login** — JWT-based authentication, admin and user roles
- **Station scan** — scan station barcode or search by name to begin audit
- **Item checklist** — list of all items assigned to the station appears after station scan
- **Two-phase audit flow** — Scan Items → Done Scanning → Submit Report
  - Green tick when item barcode is scanned/confirmed
  - Red X for missing items; unscanned items auto-marked Missing on submit
- **Admin panel** (admin only)
  - **Stations** — add / delete stations with barcode
  - **Items** — add / delete items; optional station assignment on creation
  - **Distribution** — assign items to stations; reassign or remove
  - **Users** — add / delete users
  - **Reports** — date-grouped audit history with missing items highlighted in red; export to CSV or PDF
  - **Issues** — view and resolve user-submitted issue reports
  - **Settings** — admin email configuration
- **Alternating row colors** — white / pale yellow on all list views for readability
- **Change password** — all users can change their own password via the ⋮ menu
- **Issue reporting** — any user can submit an issue report from the Issues tab
- **PWA** — installable on mobile, offline-capable via service worker (network-first for app files)
- **Cloudflare tunnel** — shareable public URL for testing

### Tech stack
- Node.js + Express backend
- SQLite3 database
- JWT + bcryptjs authentication
- html5-qrcode barcode scanning
- Vanilla JS frontend (no framework)
- Service worker (cache v4, network-first strategy)

---

## v0.2 — (upcoming)
_Changes will be listed here as they are made._
