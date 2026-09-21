# GEMS EventHub / CEMS — corrected project

Prepared 20 September 2026 from `CEMS-FULL-BACKUP-20260920-111124.zip`.

This is an **application update**, with corrected source, a compiled production build, and reproducible tests. It is the CEMS/EventHub React + Node + SQLite project supplied for review. It is not the older SCCIS/PocketBase application discussed earlier.

Your original uploaded backup and data files were left unchanged. This V2 full package contains an unchanged copy of the EventHub data folder supplied in your backup, so existing users and records open without first-run setup. It excludes node_modules, historical patch files and old source snapshots. Keep your original backup and do not overwrite a newer live database with this older copy.

## Start here

1. Extract this update into a **new folder**, separate from the running application.
2. Install Node.js 22.18 or newer. The verification environment used Node.js 24.19.0.
3. Open a terminal in the extracted `GEMS-EventHub-Fixed` folder and run:

   ```powershell
   npm ci
   npm run check
   npm run build
   npm test
   ```

   Tests create disposable databases. They do not use your production records. The production build is included, but rebuilding verifies your local toolchain.

4. The included `data` folder is the copy supplied for repair. If your live EventHub received newer records after that backup, replace the included folder with a **consistent current backup** of your live `data` folder before starting. Stop the application that writes that database before copying the folder, or use an existing verified SQLite backup. Preserve accompanying WAL files when present. Do not copy only an active `.sqlite` file and assume it is complete.
5. Set the data-directory environment variable to that backup copy, then start this version:

   ```powershell
   $env:EVENTHUB_DATA_DIR = "C:\path\to\EventHub-test-data"
   npm start
   ```

   Replace the example with the actual folder containing `eventhub.sqlite`. Open **http://127.0.0.1:8787** on that computer. `npm start` serves both the compiled website and its API. A fresh empty data directory opens first-run setup; that is not a recovery of existing records.

6. Check your accounts and records before replacing the running version. For the final switch, stop the old EventHub process, preserve a fresh backup, point the new version at the existing EventHub data directory, and update the existing service/startup configuration to use the new application folder. Keep the previous application folder for rollback. This archive does not automatically stop services or deploy anything.

### Remote access and hosting

The API listens on `127.0.0.1:8787`. Keep the existing HTTPS reverse proxy/tunnel and forward the website to this port, or retain your existing static frontend hosting with `/api` forwarded to the backend. Do not expose a development server as the production site.

The frontend now uses its own origin for `/api`; it no longer directs a remote visitor to their own `localhost`. If your backend is intentionally hosted at a different origin, set `VITE_API_URL` before building. Vite reads `.env.local`; the backend does not automatically load a `.env` file. Set backend variables in the service/process environment.

- `EVENTHUB_DATA_DIR`: existing EventHub SQLite data directory. Default: `data` under this application.
- `EVENTHUB_API_PORT`: default `8787`.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: existing payment integration credentials, if online checkout is used. Never place the secret in a `VITE_` variable.

For local development, `npm run dev` starts the API and Vite. Open http://127.0.0.1:5173. Stop an existing listener intentionally if the port is occupied; this update does not kill unrelated processes automatically.

## What changed

### Appearance and navigation

- Shared light/dark theme and an accessible toggle across public pages, authenticated portals, setup and error screens.
- Persisted theme preference, system-theme fallback and a pre-paint theme script.
- Shared colors for surfaces, text, borders, alerts, controls and tables; normalized many hardcoded light-only colors.
- Standardized font inheritance and raised small on-screen text in existing styles.
- Removed duplicated legacy rules and conflicting public-only dark-mode overrides.
- Responsive public navigation and mobile portal sidebar, Escape-to-close behavior, focus styles and skip links.
- Improved wrapping for buttons/actions, tables, cards and event-management layouts.
- Fixed nested navigation links and the hook-order failure possible when signing out.
- Lazy-loaded page modules. Initial built JavaScript decreased from roughly 593 KB to 257 KB before gzip; other pages download as needed.

### Working application flows

- Removed hardcoded browser-local API origins from operational pages.
- Added clear loading, retry and connection-error handling in the shared resource/auth layers and repaired several silent-error screens.
- Session checks no longer erase a valid stored login merely because the network is unavailable.
- Replaced homepage demonstration events and invented event counts with real public records.
- Connected public results to published results only.
- Added certificate issuance from published results, duplicate prevention, student viewing/printing and public certificate-code verification. Certificate verification exposes only the fields needed to verify the certificate.
- Connected event-workspace tabs to team, payment, attendance, result, certificate and final-report tools. Communication and gallery tabs link to the relevant existing workspaces.
- Added admin event-control-center access, coordinator inbox and HOD notification/calendar routes.
- Made HOD department reports accessible while keeping attendance/payment modifications restricted.
- Completed librarian event approval/publishing access with owned-library-event restrictions.
- Fixed team-only creation, approval and registration, which previously required an impossible prior individual registration. Mixed-event teams retain the existing individual-registration prerequisite.
- Restricted student team registration/cancellation to the assigned leader.
- Improved payment checkout locking, timeout/retry behavior and verification-error handling. Team-payment actions are shown to the leader.
- Validated event dates/times and malformed JSON requests; repaired corrupted notification/error text in the server source.
- Added production static-file and SPA deep-link serving to the Node backend.
- Pinned dependencies to the installed lockfile versions.

## Verification performed

| Check | Result |
| --- | --- |
| TypeScript: `npm run check` | Passed |
| Production build: `npm run build` | Passed |
| API regression suite | 13 workflow tests passed; Node reports 14 including their parent suite |
| React rendering/interaction suite | 72 tests passed |
| Light/dark semantic text-color checks | 12 selected text/background pairs met 4.5:1 contrast |
| Copy of supplied existing database | Startup, four read endpoints and SQLite `quick_check` passed |
| Original uploaded data | Six matching data files remained byte-for-byte unchanged |
| ZIP integrity and included files | Checked when packaging |

API tests cover authentication/roles, registration/duplicates, attendance, result publication, certificate issuance/verification, report permissions, waiting-list promotion, offline payment confirmation/duplicate prevention, librarian approval boundaries, invalid input, team-only registration, production deep links/assets and session revocation.

React tests render public and role-specific routes against a disposable API. They also exercise the theme toggle and persistence, mobile-menu Escape behavior, event tabs, invalid certificate feedback and sign-out.

## What still needs deployment-side verification

This is a tested repair package, not a guarantee that every possible scenario is bug-free.

- The available browser session could not reach the local test server. Full visual inspection at desktop/tablet/mobile sizes, real browser printing and physical-device camera/scanner checks were **not** completed. The UI suite uses jsdom, which does not verify pixel layout.
- Real Razorpay checkout/settlement, external email/WhatsApp delivery and live hosting/tunnel configuration were not exercised. They depend on your configured services and credentials.
- The existing database was checked only on a copy, with startup and public read checks. Authenticated mutation tests used synthetic records, not your real students/payments.
- Offline-first operation for the older SCCIS classroom display and biometric sign-in are separate work from this uploaded CEMS project; this package does not add them.

Before the final switch, check: login for each role; light/dark mode at 360, 768 and 1440 px; event creation/approval; a test registration/team; payment sandbox; scanner/camera; certificate print preview; and notifications through each configured delivery channel. Preserve the previous application and a current database backup until those checks are complete.

## Styling overhaul (light/dark readability, alignment, GEMS theme)

The three overlapping stylesheets (`styles/global.css`, `styles.css`, `styles/theme.css`, about 17,000 lines with 2,000+ `!important` rules) were the cause of unreadable text and misalignment. They are replaced by one organised set in `src/styles/`, imported in this order by `src/main.tsx`:

| File | Purpose |
| --- | --- |
| `tokens.css` | Every colour, font, radius and shadow for light and dark mode. Change the theme here. |
| `base.css` | Reset, typography, forms, buttons, status badges, alerts, tables, cards, modals. |
| `public.css` | Public site: top strip, header, footer, home, events, gallery, results, certificate check, help, sign-in, 404/setup. |
| `portal.css` | Portal shell (sidebar, top bar), page frame, metric grids, list rows. |
| `portal-student.css` | Student pages. |
| `portal-staff.css` | Coordinator home, event list, control centre, event wizard, teams, scanner. |
| `portal-admin.css` | Admin, HOD, reports, tables, print rules, narrow-screen layout. |

Theme: navy, azure and gold taken from the GEMS Polytechnic logo and https://www.gemspolytechnic.edu.in/. All text/background pairs in the tokens meet WCAG AA (4.5:1). Fonts are Public Sans and Source Serif 4 from Google Fonts (see `index.html`), with system-font fallbacks if the network blocks them.

Markup changes: `layouts/PublicLayout.tsx` (college strip, header, footer), `pages/HomePage.tsx`, `components/Brand.tsx`, `components/EventCard.tsx`, the sign-in panel in `pages/LoginPage.tsx`, and a `?department=` filter in `pages/EventsPage.tsx`.

If you add a new class name in a component, style it with the variables from `tokens.css` (never a hard-coded colour) so it works in both themes.


## Backend, Google Sheets and cleanup (latest changes)

* **College references removed:** no college website/ERP/admission links, no phone numbers, address, e-mail, AICTE/NBA claims on the public site. The name and logo remain.
* **Google Sheets sync** (new): all users, students, events and registrations are mirrored to a Google Sheet, with one tab per event. Setup: `GOOGLE-SHEETS-SETUP.md`. Code: `server/sheets-sync.mjs`, `google-sheets/Code.gs`, admin page `src/pages/AdminSheetsPage.tsx` (Admin > Google Sheets).
* **Backend reliability:**
  * `npm start` / `npm run dev` now check the Node version first and explain problems in plain words (Node 22.18+ is required for the built-in database).
  * Port already in use is reported clearly. `PORT` (hosting services) and `EVENTHUB_HOST` are supported, so the server can be reached from other devices when hosted. Default stays `127.0.0.1` on your own computer.
  * `.env` file is loaded automatically. `npm run doctor` checks Node, dependencies, database integrity, data folder and port.
  * `START-MAC.command` no longer refuses to start when the database is missing.
  * Database check: `data/eventhub.sqlite` passes SQLite `integrity_check`. Keep the `-wal` and `-shm` files with it.
* **Hosting:** see `DEPLOYMENT.md` (VPS, Docker, college network). `Dockerfile` included.
* **Tests:** `npm run test:api` now also runs `tests/sheets.test.mjs`, which runs the real `Code.gs` against an in-memory imitation of Google Sheets.

* **Google Sheets, two connection methods:** Apps Script, or **Sheet link + service account** (paste the sheet link and a key file, no code). Both are in Admin > Google Sheets and linked from Admin > Settings. Tests: `tests/sheets.test.mjs` (Apps Script) and `tests/sheets-api.test.mjs` (service account, including JWT signing checks).

* **GitHub Pages hosting:** `GITHUB-PAGES.md` and `.github/workflows/deploy-pages.yml` publish the website free; the backend runs elsewhere. The app now works from a sub-folder (`VITE_BASE`), `VITE_API_URL` is used by every request (six calls in Students / Attendance report ignored it before), and `EVENTHUB_CORS_ORIGIN` can lock the API to your Pages address.
