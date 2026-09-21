# Running EventHub for everyone (backend hosting)

## Do you need an online server?
**Yes, if students and staff should use EventHub from their own phones and computers.**
EventHub is one Node.js program that contains the website, the API and the database (a single file, `data/eventhub.sqlite`). When you run `npm start` on your laptop it listens on `127.0.0.1`, which only your laptop can open. To make it available to everybody, run the same program on a machine that is always on and reachable from the internet (or the college network) and put HTTPS in front of it.

You do **not** need a separate database server. Google Sheets is an extra live copy for reporting, not a replacement for the database.

## Check that the backend works
```
npm run doctor      # checks Node version, database health, data folder, port
npm start           # website + API on http://127.0.0.1:8787
```
`npm run doctor` explains anything that is wrong in plain words.

## Option A: a Linux server or VPS (recommended)
Any small server (1 GB RAM is plenty) with Node.js 22.18 or newer. If you already have a server you can SSH into, use that.
```
git clone <your repo> eventhub && cd eventhub      # or upload the project folder
npm ci && npm run build
EVENTHUB_HOST=0.0.0.0 EVENTHUB_API_PORT=8787 npm start
```
Keep it running with a process manager: `npm i -g pm2 && pm2 start scripts/start.mjs --name eventhub && pm2 save && pm2 startup`.
Put HTTPS in front (Caddy is the easiest): a Caddyfile with `yourdomain.com { reverse_proxy 127.0.0.1:8787 }` gives automatic HTTPS. Do not expose port 8787 directly without HTTPS: passwords and payments travel over it.

## Option B: Docker / Render / Railway / Fly.io
The included `Dockerfile` builds everything. **Attach a persistent disk/volume mounted at `/data`**; without it the database is erased at every restart. Set environment variables in the dashboard (`PORT` is set by the platform). Free plans without persistent disks are not suitable.

## Option C: a computer inside the college network
Run `EVENTHUB_HOST=0.0.0.0 npm start` and open `http://<that-computer's-IP>:8787` from other devices on the same Wi-Fi. Give the computer a fixed IP and keep it powered on.

## Settings (`.env` file next to package.json, or hosting dashboard)
See `.env.example`: `EVENTHUB_API_PORT`, `EVENTHUB_HOST`, `EVENTHUB_DATA_DIR`, `GOOGLE_SHEETS_*`, `RAZORPAY_*`.

## Backups
* Copy the whole `data/` folder while the server is stopped, or at least `eventhub.sqlite` **together with** `eventhub.sqlite-wal` and `eventhub.sqlite-shm` if they exist. Copying only the `.sqlite` file of a running server can lose the latest changes.
* Your Google Sheet is a readable copy of users, students, events and registrations.
* Never delete `data/` on the server when updating the code. Update by replacing everything except `data/` and `.env`, then `npm ci && npm run build` and restart.
