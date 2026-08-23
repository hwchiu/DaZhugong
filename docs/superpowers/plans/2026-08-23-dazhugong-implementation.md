# Firebase Spark Architecture Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate DaZhugong v1 from Cloud Functions to Firebase Authentication email/password plus direct, Security-Rules-protected Firestore writes so it can deploy on Firebase Spark.

**Architecture:** The seed maps each stable member `authUid` and private PIN to deterministic Firebase credentials. The frontend signs in directly with Firebase Auth and writes token transitions through a focused service; Firestore Rules bind every write to `request.auth.uid` and require atomic confirmation/report creation. Confirmed reports, not `members.totalTokens`, are the source of truth.

**Tech Stack:** Node.js, Firebase Admin SDK, React 18, Vite, Firebase Auth, Cloud Firestore, Firestore Security Rules v2, Vitest, Node test runner, Firebase Emulator Suite.

---

## File responsibilities

- `scripts/credentials.js`: seed-side deterministic email/password derivation.
- `scripts/seed.js`: validates private member input, synchronizes Auth users, transaction-safely writes public member configuration.
- `frontend/src/auth/credentials.js`: browser-side mirror of the exact password algorithm.
- `frontend/src/components/Login.jsx`: direct Email/Password sign-in and safe error mapping.
- `frontend/src/services/tokenService.js`: authenticated pending/report/resolve writes.
- `frontend/src/hooks/useGroup.js`: public group/member/report listeners and report-derived totals.
- `firestore.rules`: complete direct-client authorization contract.
- `firebase.json`: Hosting, Firestore, Auth/Firestore emulators only.
- `test/firestore.rules.*.test.js`: static contracts plus executable Emulator authorization tests.

## Task 1: Credential and seed migration

- [x] Add identical fixed-vector tests in root and frontend.
- [x] Implement `deriveLoginEmail(authUid)` and `deriveFirebasePassword(authUid, pin)` with namespace `dazhugong.firebase-auth.v1`.
- [x] Test missing-user create and existing-user update behavior.
- [x] Add `loginEmail` to public member documents and assert no PIN/hash/password leakage.
- [x] Preserve preflight and transaction-time `authUid` immutability checks.
- [x] Stop writing `memberAuth` and stop creating new `totalTokens` fields.
- [x] Remove the unused bcrypt dependency.

Validation:

```bash
npm test
```

Expected: root derivation, seed, and rules contract tests pass.

## Task 2: Frontend Auth migration

- [x] Remove Firebase Functions initialization/export.
- [x] Replace callable/custom-token login with `signInWithEmailAndPassword`.
- [x] Derive the password only at the sign-in call boundary.
- [x] Map `auth/too-many-requests` to the lockout message.
- [x] Map invalid credential/wrong password and all other failures to the generic PIN error.
- [x] Keep member/PIN interaction locked while sign-in is pending.

Validation:

```bash
npm --prefix frontend test -- --run src/auth/credentials.test.js src/firebase.test.js src/components/Login.test.jsx
```

## Task 3: Direct Token write service

- [x] Add spoof-prevention tests requiring Auth UID to match `currentMember.authUid`.
- [x] Implement pending token creation with reporter identity from `currentMember`.
- [x] Implement reject as a token-only update.
- [x] Implement confirm as one batch updating token and creating `reports/{tokenId}`.
- [x] Use server timestamps for every transition time.

Validation:

```bash
npm --prefix frontend test -- --run src/services/tokenService.test.js
```

## Task 4: Report-derived totals

- [x] Extend `useGroup` tests with a reports listener.
- [x] Derive every member `totalTokens` display value by counting report target IDs.
- [x] Ignore any legacy `members.totalTokens` value.
- [x] Keep current stub pages unchanged; future Vote/Pending page implementation is separate.

Validation:

```bash
npm --prefix frontend test -- --run src/hooks/useGroup.test.js src/components/Login.test.jsx
```

## Task 5: Firestore authorization

- [x] Keep public reads for group, members, tokens, and reports.
- [x] Keep group/member/memberAuth direct writes denied.
- [x] Require exact token/report keys and server timestamps.
- [x] Bind token create to the authenticated reporter member.
- [x] Bind pending resolution to the authenticated target member.
- [x] Require pending → confirmed and matching `getAfter(reports/{tokenId})` in one atomic write.
- [x] Require pending → rejected without a report.
- [x] Deny report update/delete and all unmatched writes.
- [x] Add static contract tests and real Emulator tests.

Validation:

```bash
npm test
npm run test:rules:emulator
```

The Emulator command requires Java 21+. Java 8 is an acknowledged local blocker; static contracts remain mandatory when the Emulator cannot start.

## Task 6: Spark configuration and deployment plan

- [x] Delete tracked `functions/`.
- [x] Remove Functions source/runtime/emulator configuration.
- [x] Document Spark-only v1 and the trusted-small-group PIN tradeoff.
- [x] Remove Functions from all CI/deployment instructions.
- [x] Specify only `FIREBASE_CONFIG` and `FIREBASE_SERVICE_ACCOUNT_DAZHUGONG_4F185`.
- [x] Recommend Firebase Hosting Action or Google Auth, not `firebase login:ci`.
- [x] Do not deploy in this task.

Final validation:

```bash
npm test
npm --prefix frontend test
npm --prefix frontend run build
git grep -nE 'httpsCallable|signInWithCustomToken|getFunctions|firebase deploy --only .*functions' -- ':!package-lock.json' ':!frontend/package-lock.json'
```

Expected: tests/build pass and the grep returns no runtime/deployment references.
