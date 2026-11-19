# Habit Tracker

A personal habit tracker for Rodrigo: daily check-ins, positive habits to build,
negative habits to avoid, weekly/monthly goals, progress charts, and milestones.
The dashboard includes week and month calendars with daily completion counts,
habit filtering, previous/next navigation, and a Today shortcut.

## Production

Live app: https://habit-tracker-217746768723.us-east1.run.app

- Google account: `rodrigovanzelotti@gmail.com`
- Project: `rv-habit-tracker-2026`
- Cloud Run service: `habit-tracker`, region `us-east1`
- Storage: Firestore Native, database `(default)`, region `us-east1`
- Password: Secret Manager secret `habit-app-password`

Cloud Run serves the page and authenticated API. Firestore persists habits and
check-ins across devices and deployments. Signed, HttpOnly, Secure cookies keep
you signed in on each browser/device for one year, including browser restarts.
Existing valid 30-day logins upgrade automatically on the next visit. The one-year
expiry is fixed, so using the app does not postpone the next password prompt.
Clearing site cookies or using a different browser requires signing in again.
Changing the password invalidates existing sessions
after deploying a new revision. Only the runtime service account can access the
password and application data through its assigned roles.

Cloud Run scales to zero and is limited to one instance. Billing is usage based;
the instance limit is not a spending cap. Firestore database deletion protection
is enabled. This is a single-user app, not a multi-account service.

Get the URL:

```powershell
gcloud.cmd run services describe habit-tracker --project=rv-habit-tracker-2026 --region=us-east1 --account=rodrigovanzelotti@gmail.com --format="value(status.url)"
```

Retrieve your generated login password privately in your terminal:

```powershell
gcloud.cmd secrets versions access latest --secret=habit-app-password --project=rv-habit-tracker-2026 --account=rodrigovanzelotti@gmail.com
```

## Automatic deployment

`.github/workflows/deploy.yml` runs tests for pull requests and pushes to `main`.
After passing tests, pushes to `main` deploy to Cloud Run and check the service.
Manual deployment is also available through GitHub Actions' **Run workflow**.

The Google Cloud side is configured: GitHub Workload Identity Federation accepts
only this repository's deployment workflow on `main`. No service-account key,
GitHub secret, or repository variable is required. Runtime, build, and deployment
use separate service accounts.

**Activation:** the workflow and application changes must be committed and pushed
to `main` by the repository owner. No code was committed or pushed during setup.
Until then, the initial deployment uses the local working tree and GitHub cannot
run the new workflow.

## Local development

Requires Node.js 22 or newer.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd start
```

Open `http://localhost:8080`. Without backend configuration, demo mode uses the
password `demo` and stores data in browser local storage. Production never falls
back to demo mode when storage fails. Production data is not written to local
storage, and failed saves show an error instead of silently appearing saved.

To develop against Firestore, set `STORAGE_BACKEND=firestore`, `APP_PASSWORD`, and
`GOOGLE_CLOUD_PROJECT`, then use Application Default Credentials or the Firestore
emulator. Never commit passwords or downloaded credentials.

## Manual deployment

Run tests first, then deploy from this directory:

```powershell
gcloud.cmd run deploy habit-tracker `
  --source . `
  --project=rv-habit-tracker-2026 `
  --region=us-east1 `
  --account=rodrigovanzelotti@gmail.com `
  --build-service-account=projects/rv-habit-tracker-2026/serviceAccounts/habit-build@rv-habit-tracker-2026.iam.gserviceaccount.com `
  --service-account=habit-runtime@rv-habit-tracker-2026.iam.gserviceaccount.com `
  --set-env-vars=STORAGE_BACKEND=firestore `
  --set-secrets=APP_PASSWORD=habit-app-password:latest `
  --min-instances=0 --max-instances=1 `
  --memory=256Mi --cpu=1 --concurrency=20 --timeout=30 `
  --quiet
```

The service's public invocation policy was set during initial deployment. The
page is public; every data request requires the signed login cookie.

## What happened to Google Sheets?

The supplied spreadsheet is untouched. Firestore replaces the Apps Script
integration, so there is no Apps Script deployment to configure. The file
`google-apps-script/Code.gs` remains as a historical reference and is not included
in the application container. Its original write endpoints lack authentication;
do not publish it as an Anyone-accessible web app. Archive any existing web-app
deployment under Apps Script → Deploy → Manage deployments.

Existing spreadsheet or browser demo data is not automatically imported. New
production storage starts empty; use **+** to create your habits.
