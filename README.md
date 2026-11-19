# habit-tracker

A clean, responsive, one-page habit tracker for Rodrigo. It includes daily
check-ins, positive and negative habits, dashboard filters, and milestone
celebrations.

## Run locally

```sh
npm start
```

Open `http://localhost:8080`. Without Google Sheets configuration, demo mode
uses the password `demo` and stores data in browser local storage.

## Google Sheets setup

1. Copy `google-apps-script/Code.gs` into your Google Sheet as an Apps Script.
2. Create a `Settings` tab:
   - `A1`: `key`, `B1`: `value`
   - `A2`: `password`, `B2`: your private password
3. Deploy as a Web app with **Execute as: Me** and **Who has access: Anyone**.
4. Set `GOOGLE_SHEETS_WEB_APP_URL` to the deployed Web app URL.
5. Optionally set `APP_PASSWORD` to enforce the password in the Node server.

The script automatically creates `Habits` and `CheckIns` tabs. Positive habits
reward completed actions. Negative habits represent avoided actions and use the
same daily check mark.

## Deploy to Google Cloud Run

```sh
gcloud run deploy habit-tracker \
  --source . \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_SHEETS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_ID/exec \
  --set-env-vars APP_PASSWORD=YOUR_PASSWORD
```
