# Hosting EventHub free with GitHub

## What GitHub can and cannot host
GitHub Pages hosts **static websites only**. EventHub has two parts:

| Part | What it is | Where it can run for free |
| --- | --- | --- |
| **Website** (screens students see) | React app, built into static files | **GitHub Pages** (this guide) |
| **Backend + database** (logins, events, registrations) | Node.js program + `data/eventhub.sqlite` | **Not on GitHub.** It needs a computer that stays on (see step 3) |

So: website on GitHub Pages, backend on a machine you control, joined by one setting (`EVENTHUB_API_URL`).

## 1. Put the project on GitHub
1. Create an account at github.com and a **new repository** (e.g. `eventhub`). Free accounts can use Pages only with a **public** repository, so the code will be public. It must never contain passwords, keys or data. `.gitignore` already excludes `data/`, `.env` and `*.sqlite`.
2. In the project folder (VS Code terminal):
```
git init
git add .
git status          # check that no "data/" or ".env" files are listed
git commit -m "EventHub"
git branch -M main
git remote add origin https://github.com/YOURNAME/eventhub.git
git push -u origin main
```

## 2. Turn on GitHub Pages
1. Repository **Settings > Pages > Source: GitHub Actions**.
2. **Settings > Secrets and variables > Actions > Variables > New repository variable**
   * `EVENTHUB_API_URL` = the https address of your backend from step 3 (no trailing slash), e.g. `https://cems.tail1234.ts.net`
   * only if the repository is named `YOURNAME.github.io` or you use a custom domain: `EVENTHUB_BASE` = `/`
3. Open the **Actions** tab and run *Deploy website to GitHub Pages* (it also runs on every push). When it turns green your site is at `https://YOURNAME.github.io/eventhub/`.

## 3. Run the backend somewhere always-on (free options)
The backend must be reachable over **https** (GitHub Pages is https, browsers block plain-http calls).

**Best fit: your own computer or server + Tailscale Funnel (free, stable https address).**
1. Install Node 22.18+, unzip the project there, run `npm ci && npm run build`.
2. Allow the website to call it, then start it:
```
EVENTHUB_CORS_ORIGIN=https://YOURNAME.github.io npm start
```
(or put `EVENTHUB_CORS_ORIGIN=...` in the `.env` file).
3. Install Tailscale on that machine, sign in, then run `tailscale funnel --bg 8787`. Follow its prompts to enable HTTPS/Funnel in the Tailscale admin page. It prints your public address (`https://machine-name.tailnet-name.ts.net`). Use that as `EVENTHUB_API_URL`.
4. The machine must stay on and connected. Keep `data/` backed up (see DEPLOYMENT.md).

Other options
* **Cloudflare quick tunnel** (`cloudflared tunnel --url http://127.0.0.1:8787`): free and easy for demos, but the address changes every restart, so you would have to update `EVENTHUB_API_URL` each time.
* **Oracle Cloud "Always Free" VM**: a real always-on server with a persistent disk (needs a card for verification). Follow DEPLOYMENT.md, option A.
* **Render / Railway free plans: not recommended.** Free plans sleep when idle and do not keep files, so the SQLite database would be erased on restart.

## 4. Check it
* `https://YOURBACKEND/api/health` shows `{"ok":true...}`
* Open your GitHub Pages address, sign in, register for an event.
* If the page loads but says it cannot reach EventHub: the `EVENTHUB_API_URL` variable is missing or wrong (re-run the workflow after fixing), the backend is not running, or `EVENTHUB_CORS_ORIGIN` does not exactly match `https://YOURNAME.github.io`.

## Notes
* The website is public; data stays behind logins on your backend. Use strong administrator passwords.
* Changing `EVENTHUB_API_URL` needs a new deployment (push any change or press *Run workflow*).
* Google Sheets sync keeps working: it runs inside the backend.
