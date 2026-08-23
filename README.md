# DaZhugong

DaZhugong is a Firebase Spark application deployed to:

**https://dazhugong-4f185.web.app**

## Firebase prerequisites

1. In Firebase Console, select project `dazhugong-4f185`.
2. Open **Authentication → Sign-in method** and enable **Email/Password**.
3. Create a dedicated Google Cloud service account for GitHub Actions.
4. Grant it these roles:
   - Firebase Hosting Admin
   - Firebase Rules Admin
   - Firebase Authentication Admin
   - Cloud Datastore User
   - Service Usage Consumer
5. Create a JSON key for that service account, store it only as the GitHub
   secret described below, and securely remove the downloaded key.

Use a dedicated, least-privilege account. Do not use a personal account key.

## GitHub Environment: `production`

Create a protected GitHub Environment named `production` and assign the
deploying workflows to it. Restrict deployment branches to `main`, and add
required reviewers if you want an extra approval gate before credentials are
exposed to the job.

## Required GitHub Actions secrets

Configure these under **Settings → Secrets and variables → Actions**:

### `FIREBASE_SERVICE_ACCOUNT_DAZHUGONG_4F185`

The complete JSON key for the dedicated service account. This is the preferred
deploy credential and is mandatory for the seed workflow.

### `FIREBASE_CONFIG`

The Firebase Web App config as one JSON object:

```json
{
  "apiKey": "<web-api-key>",
  "authDomain": "<project-id>.firebaseapp.com",
  "projectId": "<project-id>",
  "storageBucket": "<project-id>.firebasestorage.app",
  "messagingSenderId": "<sender-id>",
  "appId": "<web-app-id>"
}
```

All six fields are required. The deploy workflow validates this JSON and writes
`frontend/.env.production` with mode `0600` without logging values.

### `MEMBERS_CONFIG`

Private member configuration matching `scripts/members.example.json`. Copy the
whole object into the secret, replace every placeholder with a unique private
access code, and keep each `id` and `authUid` stable:

```json
{
  "groupId": "main",
  "members": [
    {
      "id": "<stable-member-id>",
      "authUid": "<stable-auth-uid>",
      "name": "<display-name>",
      "avatar": "<avatar-name>",
      "color": "<hex-color>",
      "accessCode": "<SET_UNIQUE_ACCESS_CODE>"
    }
  ]
}
```

Each `accessCode` must:

- contain 12–64 characters;
- contain at least one uppercase letter, lowercase letter, digit, and symbol;
- be unique across all members;
- have no leading or trailing whitespace.

The placeholder is intentionally invalid. Keep access codes only in the
protected `MEMBERS_CONFIG` secret and each member's password manager. Never
commit, log, paste into an issue, or disclose this JSON.

The browser hashes the selected member UID and access code into an opaque
Firebase password immediately before sign-in, then clears the access-code
input. A four-digit client-derived PIN is unsafe because it has only 10,000
possibilities and can be guessed without a paid/server backend enforcing a
dedicated rate limit. Strong private access codes preserve the simple member
selection experience while keeping the Spark/no-server deployment viable.

### Temporary `FIREBASE_TOKEN` fallback

`FIREBASE_TOKEN` is accepted only by the deploy workflow when the preferred
service-account secret is absent. It is not supported for Admin SDK seeding.

If a legacy token has leaked, revoke it immediately, remove the GitHub secret,
and replace it with the dedicated service-account credential. Prefer service
account authentication for every deployment.

## Seed members

After Email/Password authentication and the required secrets are configured:

1. Open **Actions → Seed Firebase Members**.
2. Select **Run workflow**.
3. Run it once for initial setup and again only for intentional member updates.

The workflow validates and writes both private JSON files with mode `0600`, runs
`npm run seed`, and removes the files even when a step fails. Removing a member
from `MEMBERS_CONFIG` deactivates that member according to the seed logic.
Changing an `accessCode` rotates that member's Firebase password on the next
seed run. Share the new access code through a private channel; do not include it
in workflow logs or repository files.

## Deploy

`.github/workflows/deploy.yml` runs automatically after a push to `main` and can
also be started manually. It:

1. installs root and frontend dependencies with `npm ci`;
2. runs root tests and Firestore Emulator tests under Temurin Java 21;
3. runs frontend tests and creates the production build;
4. authenticates with the service account, or temporarily with
   `FIREBASE_TOKEN` when no service account secret exists;
5. deploys only Firebase Hosting and Firestore Rules to `dazhugong-4f185`.

Concurrent deploys are serialized by cancelling an older in-progress deploy.
Cloud Functions and App Check are not deployed.

## Local validation

Use Node.js 22.12 or newer:

```sh
npm ci
npm ci --prefix frontend
npm test
npm run test:rules:emulator
npm test --prefix frontend
npm run build --prefix frontend
```

Firestore Emulator tests require Java 21. A machine still using Java 8 will
block that local command; install/select JDK 21. GitHub Actions always provisions
Temurin Java 21 before running the emulator.

To test the production env writer locally without exposing values in shell
output:

```sh
node -e 'process.stdout.write(process.env.FIREBASE_CONFIG || "")' |
  node scripts/write-frontend-env.js frontend/.env.production
```
