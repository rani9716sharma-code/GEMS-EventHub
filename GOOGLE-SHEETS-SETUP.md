# Google Sheets setup (5 minutes)

EventHub keeps a live copy of your data in a Google Sheet:

| Tab | What it holds |
| --- | --- |
| **Users** | Every login account: name, role, department, IDs (never passwords) |
| **Students** | The student directory: ID, name, department, year, email, phone, status |
| **Events** | One row per event with status and live registration counts |
| **All Registrations** | Registrations from every event in one tab |
| **`EH-2026-0001 Event name`** | **One tab per event** with only that event's registrations, payment, attendance and result |

New rows and changes are sent automatically a few seconds after they happen. If the internet or Google is down, nothing is lost: EventHub retries until it works. The database is always the master copy, so **edit data in EventHub, not in the sheet** (the next sync overwrites edits made inside the sheet). You can add your own columns to the right of the existing ones.

There are **two ways** to connect. Both are in **Admin > Google Sheets** (also reachable from Admin > Settings). Pick one.

## Method 1: Google Sheet link + service account (no code to paste)
1. Open https://console.cloud.google.com, create a project, then **APIs & Services > Library**, search **Google Sheets API** and click **Enable**.
2. **IAM & Admin > Service Accounts > Create service account** (name it e.g. `eventhub`), then Done.
3. Open the service account > **Keys > Add key > Create new key > JSON**. A `.json` file downloads.
4. In EventHub open **Admin > Google Sheets**, choose *Sheet link + service account*, pick that `.json` file (or paste its text) and click **Save and connect**. EventHub shows the service account e-mail (`eventhub@…iam.gserviceaccount.com`).
5. Open your Google Sheet > **Share** > add that e-mail as **Editor**.
6. Paste the Google Sheet link (the address in your browser) and click **Save and connect** again. EventHub confirms the sheet name and starts the first sync.

If Google says the account cannot open the sheet, the sheet is not shared with that e-mail yet. Some school/organisation Google accounts block creating keys; use a personal Google account for the Cloud project (the sheet can still be shared from any account).
The key file gives access to your sheet: keep it private and do not put it in the project folder or email it.

## Method 2: Google Apps Script

1. Create a new Google Sheet (name it e.g. *GEMS EventHub Data*).
2. In the sheet choose **Extensions > Apps Script**.
3. Delete the sample code, then paste the contents of `google-sheets/Code.gs` (or open **EventHub > Admin > Google Sheets > Copy the script**).
4. In the pasted code change `SECRET` to a long private text, at least 12 characters, and press Save.
5. Click **Deploy > New deployment**, choose the type **Web app**, then set
   * Execute as: **Me**
   * Who has access: **Anyone**

   Click **Deploy** and allow access when Google asks (you may need *Advanced > Go to project*).
6. Copy the **Web app URL** (it ends with `/exec`).
7. In EventHub sign in as Super Admin, open **Google Sheets** in the sidebar, paste the URL and the same secret, and click **Save and connect**.

EventHub tests the connection and starts the first sync, which copies everything that is already in the database. Use **Full resync** any time to send every row again (for example if someone deleted a tab).

### Changing the script later
After editing the script use **Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy**. The URL stays the same.

### Connecting from the server settings instead
Instead of the Admin page you can set `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_SECRET` in a `.env` file or your hosting dashboard. Values set this way override the Admin page.

### Privacy
The sheet contains students' names, emails and phone numbers. Share the Google Sheet only with people who should see them.

### Troubleshooting
| Message | Fix |
| --- | --- |
| "Google did not return data" | The deployment is not set to *Who has access: Anyone*, or you pasted the editor URL. Use the Web app URL ending in `/exec`. |
| "The secret does not match" | The secret in EventHub differs from `SECRET` in the script. Save the script and deploy a **new version** after changing it. |
| "Open the script and change SECRET first" | You did not change the default secret in the script. |
| Rows missing after someone deleted a tab | Click **Full resync**. |
