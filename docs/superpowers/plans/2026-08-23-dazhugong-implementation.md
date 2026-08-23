# 大豬公（DaZhugong）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個手機優先的 Web App，讓朋友在午餐時可以互相舉報講公事，被確認後投入 Token 到 3D 豬公撲滿，累積聚餐基金。

**Architecture:** React (Vite) 前端以 Firebase Auth custom token 維持 PIN UX，啟動時先驗證必要 Firebase Web config，缺少設定時只顯示安全的 setup error；Cloud Functions 一律從 `request.auth.uid` 映射 actor，並以 Firestore transaction 保證確認與 Token 計數只發生一次。v1 先不使用 Firebase App Check，留待未來 hardening。Firestore 即時同步資料，Three.js 渲染互動式 3D 豬公，Firebase Hosting 部署。

**Tech Stack:** React 18, Vite, Tailwind CSS, Three.js, Cannon-es, Firebase (Auth + Hosting + Firestore + Functions + Emulator Suite), bcryptjs, GitHub Actions, Recharts

---

## 檔案結構總覽

```
DaZhugong/
├── .github/workflows/deploy.yml          # CI/CD pipeline
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx                      # React 進入點
│       ├── App.jsx                       # 路由設定
│       ├── firebase.js                   # Firebase 初始化
│       ├── store/
│       │   └── authStore.js              # Firebase Auth observer 衍生狀態（不持久化 member）
│       ├── hooks/
│       │   ├── useGroup.js               # 讀取群組+成員
│       │   ├── usePending.js             # 待確認舉報
│       │   └── useTokens.js              # Token 歷史
│       ├── components/
│       │   ├── Login.jsx                 # 選名字+PIN 登入
│       │   ├── PiggyBank3D.jsx           # Three.js 豬公
│       │   ├── MemberAvatar.jsx          # 成員頭像+顏色
│       │   ├── PendingBanner.jsx         # 待確認通知橫幅
│       │   └── BottomNav.jsx             # 底部導覽列
│       └── pages/
│           ├── Home.jsx                  # 主畫面
│           ├── Vote.jsx                  # 選擇違規者
│           ├── Pending.jsx               # 確認/否認舉報
│           ├── History.jsx               # 歷史紀錄
│           ├── Stats.jsx                 # 統計圓餅圖
│           └── Settings.jsx              # 設定
├── functions/
│   ├── package.json
│   ├── src/
│       ├── index.js                      # Functions 進入點
│       ├── memberIdentity.js             # request.auth.uid → member 映射
│       ├── loginWithPin.js               # PIN 節流 + custom token
│       ├── reportToken.js                # 建立舉報
│       └── confirmToken.js              # 確認/否認舉報
│   └── test/
│       └── callables.test.js             # auth、冒用、節流、並行確認測試
├── scripts/
│   ├── seed.js                           # Firestore 初始資料（讀取 members.local.json）
│   ├── members.example.json              # 可提交的範本（含安全示例 authUid，PIN 無效）
│   └── members.local.json                # 本機私有設定（勿提交）
├── firestore.rules                       # Firestore 安全規則
├── firebase.json                         # Firebase 設定
└── .firebaserc                           # Firebase 專案綁定
```

---

## Task 1：Firebase 設定檔 + Firestore 規則

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `firestore.rules`
- Create: `.gitignore`

- [ ] **Step 1: 建立 Firebase 設定與 Emulator ports**

`firebase.json`：

```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs22"
  },
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

`.firebaserc`：

```json
{
  "projects": {
    "default": "dazhugong-4f185"
  }
}
```

- [ ] **Step 2: 在 Firebase Console 建立 Firestore（production mode / asia-east1）**

前往 Firebase Console，建立 Firestore Database，選擇 **production mode**，並將地區設定為 `asia-east1`。

- [ ] **Step 3: 建立 deny-by-default Firestore 規則**

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /groups/{groupId} {
      allow read: if true;
      allow write: if false;

      match /members/{memberId} {
        allow read: if true;
        allow write: if false;
      }

      match /memberAuth/{memberId} {
        allow read, write: if false;
      }

      match /tokens/{tokenId} {
        allow read: if true;
        allow write: if false;
      }

      match /reports/{reportId} {
        allow read: if true;
        allow write: if false;
      }
    }
  }
}
```

`memberAuth` 必須有明確 deny 規則；Admin SDK 仍可從 Functions/seed 存取。所有客戶端寫入都拒絕。

- [ ] **Step 4: 建立 `.gitignore`**

```text
node_modules/
.env
.env.local
frontend/.env.local
frontend/dist/
scripts/serviceAccountKey.json
scripts/members.local.json
*.log
.DS_Store
```

- [ ] **Step 5: 驗證規則可由 Emulator 載入**

```bash
npx firebase-tools emulators:exec --only firestore --project demo-dazhugong "echo PASS"
```

Expected: Firestore Emulator 啟動時無 rules parse error，命令輸出 `PASS`。`memberAuth` 的明確 deny 規則不得在後續 Task 被放寬。

- [ ] **Step 6: Commit**

```bash
git add firebase.json .firebaserc firestore.rules .gitignore
git commit -m "chore: add firebase config and private member auth rules"
```

---

## Task 2：穩定 Auth UID + PIN Seed

**Files:**
- Create: `scripts/seed.js`
- Create: `package.json`

- [ ] **Step 1: 建立 seed 依賴**

```json
{
  "name": "dazhugong-root",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "seed": "node scripts/seed.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "firebase-admin": "^12.0.0"
  }
}
```

Run: `npm install`

- [ ] **Step 2: 建立 `scripts/seed.js`**

```js
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const serviceAccount = require('./serviceAccountKey.json');
const membersConfig = require('./members.local.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function assertValidPin(pin, memberId) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error(`Invalid PIN for ${memberId}: must be exactly 4 digits`);
  }
}

async function ensureAuthUser(member) {
  try {
    await admin.auth().getUser(member.authUid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await admin.auth().createUser({ uid: member.authUid, displayName: member.name });
  }
}

async function seed() {
  const groupRef = db.collection('groups').doc('main');
  await groupRef.set({
    name: '午餐禁公事團',
    lunchStart: '12:00',
    lunchEnd: '13:00',
  });

  const seenPins = new Set();
  const seenAuthUids = new Set();

  for (const member of membersConfig.members) {
    assertValidPin(member.pin, member.id);
    if (seenPins.has(member.pin)) {
      throw new Error(`Duplicate PIN detected for ${member.id}`);
    }
    seenPins.add(member.pin);

    if (typeof member.authUid !== 'string' || member.authUid.length === 0 || member.authUid.length > 128) {
      throw new Error(`Invalid authUid for ${member.id}: must be a non-empty Firebase-compatible UID`);
    }
    if (seenAuthUids.has(member.authUid)) {
      throw new Error(`Duplicate authUid detected for ${member.id}: ${member.authUid}`);
    }
    seenAuthUids.add(member.authUid);

    const pinHash = await bcrypt.hash(member.pin, 12);
    await ensureAuthUser(member);

    await groupRef.collection('members').doc(member.id).set({
      authUid: member.authUid,
      name: member.name,
      avatar: member.avatar,
      color: member.color,
      totalTokens: 0,
    });
    await groupRef.collection('memberAuth').doc(member.id).set({
      pinHash,
      failedAttempts: 0,
      lockedUntil: null,
      lastFailedAt: null,
      lastSuccessfulAt: null,
    });
  }
}

seed().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Seed command:

```bash
cp scripts/members.example.json scripts/members.local.json
# 編輯 scripts/members.local.json，保留每位 member 的 authUid 並設定唯一且私有的 4 位 PIN
npm run seed
```

`authUid` 是 member 的永久 Firebase Auth UID。之後連結 Google provider 時保留此 UID，不以 Google 登入產生的新 UID 覆寫。

- [ ] **Step 3: 執行與驗證 seed**

```bash
npm run seed
```

預期：
- Firebase Authentication 有 5 個 UID：`dazhugong_main_member1` 至 `dazhugong_main_member5`，分別對應 `你`、`Kevin`、`Amy`、`Jamie`、`Vivian`。
- `groups/main/members/*` 含 `authUid`，不含 `pinHash`。
- `groups/main/memberAuth/*` 含 bcrypt `pinHash` 與節流欄位，客戶端不可讀。

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.js package.json package-lock.json
git commit -m "chore: seed stable firebase auth member identities"
```

---

## Task 3：React scaffold + Firebase Auth startup gate

**Files:**
- Create: `frontend/`
- Create: `frontend/src/firebase.js`
- Create: `frontend/src/index.css`

- [ ] **Step 1: 建立 Vite app 並安裝依賴**

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install firebase react-router-dom zustand three cannon-es recharts
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: 建立 Tailwind、CSS 與 HTML**

`frontend/tailwind.config.js`：

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Noto Sans TC', 'sans-serif'] },
    },
  },
  plugins: [],
};
```

`frontend/src/index.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
body {
  margin: 0;
  background: #fff5f7;
  font-family: 'Noto Sans TC', sans-serif;
  -webkit-tap-highlight-color: transparent;
}
```

`frontend/index.html`：

```html
<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>大豬公 🐷</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 建立 `frontend/src/firebase.js`**

```js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const requiredFields = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = requiredFields.filter((key) => !String(import.meta.env[key] ?? '').trim());
if (missing.length > 0) {
  throw new Error(`Missing required Firebase environment variables: ${missing.join(', ')}`);
}

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-east1');
```

- [ ] **Step 4: 建立本機環境變數**

`frontend/.env.local`：

```text
VITE_FIREBASE_API_KEY=<web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<your-project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<your-project>
VITE_FIREBASE_STORAGE_BUCKET=<your-project>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<messaging-sender-id>
VITE_FIREBASE_APP_ID=<web-app-id>
```

本機 `.env.local` 只保存 Firebase Web 公開設定，並由 `.gitignore` 排除。

- [ ] **Step 5: 完成 Firebase Console 部署前置**

1. Authentication → 啟用 Firebase Authentication。
2. Project settings → 取得 Web App config，提供本機與 CI 建立 frontend env。
3. 確認 v1 不設定 App Check / reCAPTCHA Enterprise；未來 hardening 再評估加入，但不得取代 `request.auth` 與 server-derived actor identity。

- [ ] **Step 6: 驗證 frontend build**

Run: `npm --prefix frontend run build`

Expected: exit 0，且 `frontend/dist/index.html` 存在。

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: initialize react with firebase auth startup guard"
```

---

## Task 4：Cloud Functions authentication + atomic token flow

**Files:**
- Create: `functions/package.json`
- Create: `functions/src/memberIdentity.js`
- Create: `functions/src/loginWithPin.js`
- Create: `functions/src/reportToken.js`
- Create: `functions/src/confirmToken.js`
- Create: `functions/src/index.js`
- Test: `functions/test/callables.test.js`

- [ ] **Step 1: 建立 Functions package**

```json
{
  "name": "dazhugong-functions",
  "version": "1.0.0",
  "main": "src/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "test": "firebase emulators:exec --config ../firebase.json --only auth,firestore --project demo-dazhugong \"node --test test/*.test.js\""
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  },
  "devDependencies": {
    "firebase-functions-test": "^3.4.0",
    "firebase-tools": "^14.0.0"
  }
}
```

Run: `npm --prefix functions install`

- [ ] **Step 2: 建立 actor 映射 helper**

`functions/src/memberIdentity.js`：

```js
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

function requireAuthentication(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '請先登入');
  }
  return request.auth.uid;
}

async function requireActorMember(request, groupId) {
  const authUid = requireAuthentication(request);

  const snapshot = await admin.firestore()
    .collection('groups').doc(groupId)
    .collection('members')
    .where('authUid', '==', authUid)
    .limit(2)
    .get();

  if (snapshot.size !== 1) {
    throw new HttpsError('permission-denied', '登入身分未綁定成員');
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

module.exports = { requireAuthentication, requireActorMember };
```

- [ ] **Step 3: 建立 `loginWithPin`**

`functions/src/loginWithPin.js`：

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const OPTIONS = { region: 'asia-east1' };
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

exports.loginWithPin = onCall(OPTIONS, async (request) => {
  const { groupId, memberId, pin } = request.data || {};
  if (!groupId || !memberId || !/^\d{4}$/.test(pin || '')) {
    throw new HttpsError('invalid-argument', '請選擇成員並輸入 4 位 PIN');
  }

  const db = admin.firestore();
  const memberRef = db.collection('groups').doc(groupId).collection('members').doc(memberId);
  const authRef = db.collection('groups').doc(groupId).collection('memberAuth').doc(memberId);
  const nowMs = Date.now();
  let authUid;
  let failureCode;

  await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const authSnap = await transaction.get(authRef);
    if (!memberSnap.exists || !authSnap.exists) {
      failureCode = 'permission-denied';
      return;
    }

    const authData = authSnap.data();
    if (authData.lockedUntil?.toMillis() > nowMs) {
      failureCode = 'resource-exhausted';
      return;
    }

    const valid = await bcrypt.compare(pin, authData.pinHash);
    if (!valid) {
      const failedAttempts = (authData.failedAttempts || 0) + 1;
      const shouldLock = failedAttempts >= MAX_FAILURES;
      transaction.update(authRef, {
        failedAttempts,
        lastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        lockedUntil: shouldLock
          ? admin.firestore.Timestamp.fromMillis(nowMs + LOCK_MS)
          : null,
      });
      failureCode = shouldLock ? 'resource-exhausted' : 'permission-denied';
      return;
    }

    authUid = memberSnap.data().authUid;
    if (!authUid) {
      failureCode = 'permission-denied';
      return;
    }
    transaction.update(authRef, {
      failedAttempts: 0,
      lockedUntil: null,
      lastSuccessfulAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  if (failureCode) {
    const message = failureCode === 'resource-exhausted'
      ? '嘗試次數過多，請稍後再試'
      : '成員或 PIN 錯誤';
    throw new HttpsError(failureCode, message);
  }

  return { customToken: await admin.auth().createCustomToken(authUid) };
});
```

- [ ] **Step 4: 建立 authenticated `reportToken`**

`functions/src/reportToken.js`：

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireAuthentication, requireActorMember } = require('./memberIdentity');

exports.reportToken = onCall(
  { region: 'asia-east1' },
  async (request) => {
    requireAuthentication(request);
    const data = request.data || {};
    const { groupId, targetId } = data;
    if (!groupId) {
      throw new HttpsError('invalid-argument', '缺少 groupId');
    }

    const actor = await requireActorMember(request, groupId);
    if ('reporterId' in data || 'memberId' in data) {
      throw new HttpsError('invalid-argument', 'caller identity 不可由 request.data 指定');
    }
    if (!targetId) {
      throw new HttpsError('invalid-argument', '缺少 targetId');
    }
    if (actor.id === targetId) {
      throw new HttpsError('invalid-argument', '不能舉報自己');
    }

    const db = admin.firestore();
    const targetRef = db.collection('groups').doc(groupId).collection('members').doc(targetId);
    if (!(await targetRef.get()).exists) {
      throw new HttpsError('not-found', '被舉報成員不存在');
    }

    const tokenRef = db.collection('groups').doc(groupId).collection('tokens').doc();
    await tokenRef.set({
      reporterId: actor.id,
      targetId,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedAt: null,
      resolvedAt: null,
    });
    return { tokenId: tokenRef.id };
  }
);
```

- [ ] **Step 5: 建立 transaction-based `confirmToken`**

`functions/src/confirmToken.js`：

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireAuthentication, requireActorMember } = require('./memberIdentity');

exports.confirmToken = onCall(
  { region: 'asia-east1' },
  async (request) => {
    requireAuthentication(request);
    const data = request.data || {};
    const { groupId, tokenId, action } = data;
    if (!groupId) {
      throw new HttpsError('invalid-argument', '缺少 groupId');
    }

    const actor = await requireActorMember(request, groupId);
    if ('memberId' in data || 'reporterId' in data) {
      throw new HttpsError('invalid-argument', 'caller identity 不可由 request.data 指定');
    }
    if (!tokenId || !['confirm', 'reject'].includes(action)) {
      throw new HttpsError('invalid-argument', 'tokenId 或 action 錯誤');
    }
    const db = admin.firestore();
    const groupRef = db.collection('groups').doc(groupId);
    const tokenRef = groupRef.collection('tokens').doc(tokenId);

    await db.runTransaction(async (transaction) => {
      const tokenSnap = await transaction.get(tokenRef);
      if (!tokenSnap.exists) throw new HttpsError('not-found', '舉報不存在');

      const token = tokenSnap.data();
      if (token.targetId !== actor.id) {
        throw new HttpsError('permission-denied', '只有被舉報者可以處理');
      }
      if (token.status !== 'pending') {
        throw new HttpsError('failed-precondition', '此舉報已處理');
      }

      if (action === 'reject') {
        transaction.update(tokenRef, {
          status: 'rejected',
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      transaction.update(tokenRef, {
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(groupRef.collection('reports').doc(tokenId), {
        targetId: token.targetId,
        reporterId: token.reporterId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(groupRef.collection('members').doc(token.targetId), {
        totalTokens: admin.firestore.FieldValue.increment(1),
      });
    });

    return { success: true, status: action === 'confirm' ? 'confirmed' : 'rejected' };
  }
);
```

使用 `reports/{tokenId}` 而非 transaction callback 內產生隨機 ID，避免 transaction retry 留下不同 report ID。只有讀到 `pending` 的 transaction 能 commit。

- [ ] **Step 6: 匯出 callable**

`functions/src/index.js`：

```js
const admin = require('firebase-admin');
admin.initializeApp();

const { loginWithPin } = require('./loginWithPin');
const { reportToken } = require('./reportToken');
const { confirmToken } = require('./confirmToken');

exports.loginWithPin = loginWithPin;
exports.reportToken = reportToken;
exports.confirmToken = confirmToken;
```

- [ ] **Step 7: 先寫 Emulator tests**

`functions/test/callables.test.js` 使用 `node:test`、`firebase-functions-test`、Admin SDK 連 Firestore Emulator，並在每個 test seed `members`、`memberAuth`、`tokens`。以 `fft.wrap()` 呼叫 callable，未登入 case 不帶 `auth`，authenticated case 只帶 `{ auth: { uid: '<authUid>' } }`。stub `admin.auth().createCustomToken(uid)` 回傳 `test-token:${uid}`。

必須實作以下具名測試與 assertion：

```text
loginWithPin throttles on the fifth failure
  first 4 wrong PIN calls => permission-denied
  fifth wrong PIN => resource-exhausted
  memberAuth.failedAttempts === 5
  memberAuth.lockedUntil > now
  correct PIN while locked => resource-exhausted

loginWithPin returns the stable member auth UID
  set lockedUntil to a past timestamp
  correct PIN => customToken === test-token:dazhugong_main_member1
  failedAttempts === 0 and lockedUntil === null

reportToken rejects unauthenticated and spoofed identities
  no auth => unauthenticated
  reporterId/memberId in request.data => invalid-argument
  auth UID member1 with target member2 => stored reporterId === member1

confirmToken prevents impersonation
  token target is member2, auth UID is member1 => permission-denied
  adding memberId: member2 to data still cannot authorize the call

confirmToken is concurrent and idempotent
  Promise.allSettled(two confirm calls authenticated as member2)
  exactly one fulfilled and one rejected with failed-precondition
  token.status === confirmed
  member2.totalTokens === 1
  exactly one report exists at reports/{tokenId}
```

- [ ] **Step 8: 執行 Functions tests**

```bash
npm --prefix functions test
```

Expected:

```text
tests 5
pass 5
fail 0
```

- [ ] **Step 9: Commit**

```bash
git add functions/
git commit -m "feat: add authenticated callable token workflow"
```

---

## Task 5：Firebase Auth 衍生狀態（禁止 member persistence）

**Files:**
- Create: `frontend/src/store/authStore.js`

- [ ] **Step 1: 建立 auth observer store**

```js
import { create } from 'zustand';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';

export const useAuthStore = create((set) => ({
  authReady: false,
  firebaseUser: null,
  currentMember: null,
  groupId: 'main',
  logout: () => signOut(auth),
}));

let unsubscribe;

export function startAuthObserver() {
  if (unsubscribe) return unsubscribe;
  unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      useAuthStore.setState({ authReady: true, firebaseUser: null, currentMember: null });
      return;
    }

    const memberQuery = query(
      collection(db, 'groups', 'main', 'members'),
      where('authUid', '==', user.uid),
      limit(2)
    );
    const snapshot = await getDocs(memberQuery);
    if (snapshot.size !== 1) {
      await signOut(auth);
      useAuthStore.setState({ authReady: true, firebaseUser: null, currentMember: null });
      return;
    }

    const memberDoc = snapshot.docs[0];
    useAuthStore.setState({
      authReady: true,
      firebaseUser: user,
      currentMember: { id: memberDoc.id, ...memberDoc.data() },
    });
  });
  return unsubscribe;
}
```

不得使用 Zustand `persist`、`localStorage` 或接受任意 `login(member)`。Firebase Auth persistence 是唯一登入 persistence；`currentMember` 每次由已驗證的 `user.uid` 重新映射。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store/authStore.js
git commit -m "feat: derive member state from firebase authentication"
```

---

## Task 6：Firestore Hooks

**Files:**
- Create: `frontend/src/hooks/useGroup.js`
- Create: `frontend/src/hooks/usePending.js`
- Create: `frontend/src/hooks/useTokens.js`

- [ ] **Step 1: 建立 useGroup.js**

```js
import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useGroup(groupId) {
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, 'groups', groupId), (snap) => {
      setGroup({ id: snap.id, ...snap.data() });
    });

    const unsub2 = onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub1(); unsub2(); };
  }, [groupId]);

  return { group, members };
}
```

- [ ] **Step 2: 建立 usePending.js**

```js
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function usePending(groupId, memberId) {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    if (!memberId) return;
    const q = query(
      collection(db, 'groups', groupId, 'tokens'),
      where('targetId', '==', memberId),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [groupId, memberId]);

  return pending;
}
```

- [ ] **Step 3: 建立 useTokens.js**

```js
import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useTokens(groupId, count = 30) {
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'groups', groupId, 'reports'),
      orderBy('timestamp', 'desc'),
      limit(count)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTokens(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [groupId, count]);

  return tokens;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat: add firestore realtime hooks for group, pending, and tokens"
```

---

## Task 7：Login 元件（PIN → Firebase custom token）

**Files:**
- Create: `frontend/src/components/Login.jsx`

- [ ] **Step 1: 建立 Login.jsx**

```jsx
import { useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useGroup } from '../hooks/useGroup';
import { auth, functions } from '../firebase';

const AVATARS = { pig: '🐷', cat: '🐱', frog: '🐸', bear: '🐻', dog: '🐶' };

export default function Login() {
  const { members } = useGroup('main');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!selected || pin.length !== 4) return;
    setError('');
    try {
      const loginWithPin = httpsCallable(functions, 'loginWithPin');
      const result = await loginWithPin({ groupId: 'main', memberId: selected.id, pin });
      await signInWithCustomToken(auth, result.data.customToken);
    } catch (error) {
      setError(
        error.code === 'functions/resource-exhausted'
          ? '嘗試次數過多，請稍後再試'
          : 'PIN 錯誤，請再試一次'
      );
      setPin('');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100 flex flex-col items-center justify-center p-6">
      <div className="text-6xl mb-3">🐷</div>
      <h1 className="text-2xl font-bold text-pink-600 mb-1">大豬公</h1>
      <p className="text-gray-400 text-sm mb-8">午餐禁聊公事罰金箱</p>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <p className="text-center text-gray-600 mb-4 font-medium">你是誰？</p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSelected(m); setPin(''); setError(''); }}
              className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                selected?.id === m.id ? 'scale-105' : 'border-gray-100'
              }`}
              style={selected?.id === m.id ? { borderColor: m.color, background: m.color + '15' } : {}}
            >
              <span className="text-3xl">{AVATARS[m.avatar] || '🐷'}</span>
              <span className="text-xs mt-1 text-gray-700 font-medium">{m.name}</span>
              <span className="text-xs text-gray-400">{m.totalTokens} 枚</span>
            </button>
          ))}
        </div>

        {selected && (
          <>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="輸入 4 位 PIN"
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg tracking-widest mb-3 focus:outline-none focus:border-pink-400"
            />
            {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}
            <button
              onClick={handleLogin}
              disabled={pin.length !== 4}
              className="w-full text-white rounded-xl py-3 font-bold disabled:opacity-40 transition-opacity"
              style={{ background: selected.color }}
            >
              進入 🐷
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Login.jsx
git commit -m "feat: sign in members with pin custom tokens"
```

---

## Task 8：Auth-aware App 路由 + BottomNav

**Files:**
- Create: `frontend/src/components/BottomNav.jsx`
- Create: `frontend/src/components/MemberAvatar.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`
- Create: `frontend/src/pages/Home.jsx` (stub)
- Create: `frontend/src/pages/Vote.jsx` (stub)
- Create: `frontend/src/pages/Pending.jsx` (stub)
- Create: `frontend/src/pages/History.jsx` (stub)
- Create: `frontend/src/pages/Stats.jsx` (stub)
- Create: `frontend/src/pages/Settings.jsx` (stub)

- [ ] **Step 1: 建立 BottomNav.jsx**

```jsx
import { useNavigate, useLocation } from 'react-router-dom';

const tabs = [
  { path: '/', icon: '🐷', label: '首頁' },
  { path: '/vote', icon: '🗳️', label: '投票' },
  { path: '/history', icon: '📋', label: '紀錄' },
  { path: '/stats', icon: '📊', label: '統計' },
  { path: '/settings', icon: '⚙️', label: '設定' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around py-2 z-50 max-w-md mx-auto">
      {tabs.map((t) => (
        <button
          key={t.path}
          onClick={() => navigate(t.path)}
          className={`flex flex-col items-center px-4 py-1 transition-colors ${
            pathname === t.path ? 'text-pink-500' : 'text-gray-400'
          }`}
        >
          <span className="text-xl">{t.icon}</span>
          <span className="text-xs mt-0.5">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: 建立 MemberAvatar.jsx**

```jsx
const AVATARS = { pig: '🐷', cat: '🐱', frog: '🐸', bear: '🐻', dog: '🐶' };

export default function MemberAvatar({ member, size = 'md', onClick, selected }) {
  const sizeClass = size === 'lg'
    ? 'text-5xl w-20 h-20'
    : size === 'sm'
    ? 'text-xl w-10 h-10'
    : 'text-3xl w-14 h-14';

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-2xl border-2 transition-all bg-white ${sizeClass} ${
        selected ? 'scale-105' : 'border-gray-100'
      }`}
      style={selected ? { borderColor: member.color, background: member.color + '20' } : {}}
    >
      <span>{AVATARS[member.avatar] || '🐷'}</span>
    </button>
  );
}
```

- [ ] **Step 3: 更新 App.jsx**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './components/Login';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Vote from './pages/Vote';
import Pending from './pages/Pending';
import History from './pages/History';
import Stats from './pages/Stats';
import Settings from './pages/Settings';

export default function App() {
  const authReady = useAuthStore((s) => s.authReady);
  const currentMember = useAuthStore((s) => s.currentMember);

  if (!authReady) return <div className="min-h-screen grid place-items-center">載入中…</div>;
  if (!currentMember) return <Login />;

  return (
    <BrowserRouter>
      <div className="max-w-md mx-auto min-h-screen pb-20 relative">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/vote" element={<Vote />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/history" element={<History />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: 更新 main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { startAuthObserver } from './store/authStore';

startAuthObserver();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: 建立 page stubs**

`frontend/src/pages/Home.jsx`:
```jsx
export default function Home() {
  return <div className="p-6"><h1 className="text-xl font-bold text-gray-800">🐷 首頁</h1></div>;
}
```

`frontend/src/pages/Vote.jsx`:
```jsx
export default function Vote() {
  return <div className="p-6"><h1 className="text-xl font-bold text-gray-800">🗳️ 投票</h1></div>;
}
```

`frontend/src/pages/Pending.jsx`:
```jsx
export default function Pending() {
  return <div className="p-6"><h1 className="text-xl font-bold text-gray-800">⚠️ 待確認</h1></div>;
}
```

`frontend/src/pages/History.jsx`:
```jsx
export default function History() {
  return <div className="p-6"><h1 className="text-xl font-bold text-gray-800">📋 歷史紀錄</h1></div>;
}
```

`frontend/src/pages/Stats.jsx`:
```jsx
export default function Stats() {
  return <div className="p-6"><h1 className="text-xl font-bold text-gray-800">📊 統計</h1></div>;
}
```

`frontend/src/pages/Settings.jsx`:
```jsx
export default function Settings() {
  return <div className="p-6"><h1 className="text-xl font-bold text-gray-800">⚙️ 設定</h1></div>;
}
```

- [ ] **Step 6: 驗證 routing 正常**

```bash
cd frontend && npm run dev
```

預期：登入頁出現 → 選成員 + 輸入 `members.local.json` 內配置的私有 PIN → Firebase Auth user UID 等於 seed 的 `authUid` → 進入主畫面。重新整理後由 Firebase Auth 恢復，不依賴可竄改的 member localStorage。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add router, bottom nav, member avatar, and page stubs"
```

---

## Task 9：GitHub Actions CI/CD（frontend + functions scaffold 完成後）

**Depends on:** Task 3、Task 4、Task 8

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 建立 workflow**

```yaml
name: Deploy to Firebase

on:
  push:
    branches: [main]

jobs:
  test-build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: |
            frontend/package-lock.json
            functions/package-lock.json

      - name: Install functions dependencies
        run: npm --prefix functions ci

      - name: Test authenticated functions
        run: npm --prefix functions test

      - name: Create frontend environment
        run: |
          echo '${{ secrets.FIREBASE_CONFIG }}' | node -e "
            const c = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
            const lines = [
              'VITE_FIREBASE_API_KEY=' + c.apiKey,
              'VITE_FIREBASE_AUTH_DOMAIN=' + c.authDomain,
              'VITE_FIREBASE_PROJECT_ID=' + c.projectId,
              'VITE_FIREBASE_STORAGE_BUCKET=' + c.storageBucket,
              'VITE_FIREBASE_MESSAGING_SENDER_ID=' + c.messagingSenderId,
              'VITE_FIREBASE_APP_ID=' + c.appId
            ];
            require('fs').writeFileSync('frontend/.env', lines.join('\n'));
          "

      - name: Install and build frontend
        run: |
          npm --prefix frontend ci
          npm --prefix frontend run build

      - name: Deploy
        run: |
          npx firebase-tools deploy \
            --only hosting,functions,firestore:rules \
            --token "${{ secrets.FIREBASE_TOKEN }}" \
            --project dazhugong-4f185 \
            --non-interactive
```

- [ ] **Step 2: 設定 Secrets**

`FIREBASE_CONFIG` JSON 只需包含 Firebase Web config 欄位；另設定 `FIREBASE_TOKEN`。此時 `frontend/package-lock.json` 與 `functions/package-lock.json` 已存在，所以 cache、`npm ci`、tests、build 都不得因尚未 scaffold 的 package 失敗。

- [ ] **Step 3: 本機重現 CI**

```bash
npm --prefix functions ci
npm --prefix functions test
npm --prefix frontend ci
npm --prefix frontend run build
```

Expected: functions tests 5/5 pass；frontend build exit 0。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: test and deploy frontend and authenticated functions"
```

---

## Task 10：Vote 頁（舉報流程）

**Files:**
- Modify: `frontend/src/pages/Vote.jsx`

- [ ] **Step 1: 更新 Vote.jsx**

```jsx
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useGroup } from '../hooks/useGroup';
import { useAuthStore } from '../store/authStore';
import MemberAvatar from '../components/MemberAvatar';

export default function Vote() {
  const { members } = useGroup('main');
  const currentMember = useAuthStore((s) => s.currentMember);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const others = members.filter((m) => m.id !== currentMember?.id);

  async function handleReport() {
    if (!selected || loading) return;
    setLoading(true);
    try {
      const reportToken = httpsCallable(functions, 'reportToken');
      await reportToken({ groupId: 'main', targetId: selected.id });
      setDone(true);
    } catch (e) {
      alert('舉報失敗：' + (e.message || '請稍後再試'));
    } finally {
      setLoading(false);
    }
  }

  if (done) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
      <span className="text-7xl mb-4">✅</span>
      <p className="text-xl font-bold text-gray-700">舉報已送出！</p>
      <p className="text-gray-400 text-sm mt-2 text-center">
        等待 <span style={{ color: selected?.color }} className="font-bold">{selected?.name}</span> 確認
      </p>
      <button
        onClick={() => { setDone(false); setSelected(null); }}
        className="mt-10 bg-pink-500 text-white px-10 py-3 rounded-2xl font-bold"
      >
        再舉報一次
      </button>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-1">誰講了公事？</h1>
      <p className="text-gray-400 text-sm mb-6">選擇違規者，送出後對方需確認才生效</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {others.map((m) => (
          <div key={m.id} className="flex flex-col items-center gap-2">
            <MemberAvatar
              member={m}
              selected={selected?.id === m.id}
              onClick={() => setSelected(m)}
            />
            <span className="text-sm text-gray-700 font-medium">{m.name}</span>
            <span className="text-xs font-bold" style={{ color: m.color }}>{m.totalTokens} 枚</span>
          </div>
        ))}
      </div>

      <button
        onClick={handleReport}
        disabled={!selected || loading}
        className="w-full text-white rounded-2xl py-4 font-bold text-lg disabled:opacity-40 transition-all"
        style={{ background: selected?.color || '#FF6B8A' }}
      >
        {loading ? '送出中...' : selected ? `🪙 舉報 ${selected.name}` : '請先選擇違規者'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 測試舉報流程**

```
1. npm run dev 開啟 app
2. 用「你」帳號登入（使用 `scripts/members.local.json` 中配置的私有 PIN）
3. 前往投票頁，選 Kevin
4. 點舉報按鈕
5. 前往 Firebase Console → Firestore → groups/main/tokens
   預期：出現一筆 status: "pending", targetId: "member2", reporterId: "member1" 的文件；
   request 未傳 reporterId，值必須來自登入者的 request.auth.uid 映射。
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Vote.jsx
git commit -m "feat: implement vote page with report submission"
```

---

## Task 11：PendingBanner + Pending 頁

**Files:**
- Create: `frontend/src/components/PendingBanner.jsx`
- Modify: `frontend/src/pages/Pending.jsx`

- [ ] **Step 1: 建立 PendingBanner.jsx**

```jsx
import { useNavigate } from 'react-router-dom';
import { usePending } from '../hooks/usePending';
import { useAuthStore } from '../store/authStore';

export default function PendingBanner() {
  const navigate = useNavigate();
  const currentMember = useAuthStore((s) => s.currentMember);
  const pending = usePending('main', currentMember?.id);

  if (pending.length === 0) return null;

  return (
    <div
      onClick={() => navigate('/pending')}
      className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-transform"
    >
      <span className="text-2xl">⚠️</span>
      <div className="flex-1">
        <p className="text-red-600 font-bold text-sm">你被舉報講公事了！</p>
        <p className="text-red-400 text-xs">有 {pending.length} 筆舉報待確認 → 點此查看</p>
      </div>
      <span className="text-red-400 text-lg">›</span>
    </div>
  );
}
```

- [ ] **Step 2: 更新 Pending.jsx**

```jsx
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { usePending } from '../hooks/usePending';
import { useGroup } from '../hooks/useGroup';
import { useAuthStore } from '../store/authStore';

const AVATARS = { pig: '🐷', cat: '🐱', frog: '🐸', bear: '🐻', dog: '🐶' };

export default function Pending() {
  const currentMember = useAuthStore((s) => s.currentMember);
  const pending = usePending('main', currentMember?.id);
  const { members } = useGroup('main');
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

  async function handleAction(tokenId, action) {
    try {
      const confirmToken = httpsCallable(functions, 'confirmToken');
      await confirmToken({ groupId: 'main', tokenId, action });
    } catch (e) {
      alert('操作失敗：' + (e.message || '請稍後再試'));
    }
  }

  if (pending.length === 0) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
      <span className="text-6xl mb-4">✨</span>
      <p className="text-gray-500 font-medium">目前沒有待確認的舉報</p>
      <p className="text-gray-300 text-sm mt-1">繼續開心吃飯！</p>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-2">待確認舉報</h1>
      <p className="text-gray-400 text-sm mb-6">確認後 Token 才會正式計入</p>

      <div className="space-y-4">
        {pending.map((t) => {
          const reporter = memberMap[t.reporterId];
          return (
            <div key={t.id} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-50">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2"
                  style={{ borderColor: reporter?.color }}
                >
                  {AVATARS[reporter?.avatar] || '🐷'}
                </div>
                <div>
                  <p className="font-bold text-gray-800">
                    <span style={{ color: reporter?.color }}>{reporter?.name}</span> 說你講公事了
                  </p>
                  <p className="text-xs text-gray-400">你認了嗎？認了要投入 1 枚 Token 🪙</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleAction(t.id, 'confirm')}
                  className="flex-1 bg-pink-500 text-white rounded-xl py-2.5 font-bold text-sm"
                >
                  😔 我認了
                </button>
                <button
                  onClick={() => handleAction(t.id, 'reject')}
                  className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-2.5 font-bold text-sm"
                >
                  🙅 沒有！
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 測試確認流程**

```
1. 用「你」帳號登入 → 舉報 Kevin
2. 重新登入為 Kevin（登出 → 選 Kevin → 使用私有 PIN）
3. 預期：主畫面頂部出現紅色「你被舉報講公事了！」橫幅
4. 點橫幅進入 Pending 頁，看到舉報
5. 點「我認了」
6. 驗證 Firestore：
   - tokens/{id}.status === "confirmed"
   - reports 集合出現新紀錄
   - members/member2.totalTokens 增加 1
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PendingBanner.jsx frontend/src/pages/Pending.jsx
git commit -m "feat: add pending banner and confirm/reject flow"
```

---

## Task 12：Home 主畫面（靜態豬公版）

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

- [ ] **Step 1: 更新 Home.jsx**

```jsx
import { useNavigate } from 'react-router-dom';
import { useGroup } from '../hooks/useGroup';
import { useAuthStore } from '../store/authStore';
import PendingBanner from '../components/PendingBanner';

const AVATARS = { pig: '🐷', cat: '🐱', frog: '🐸', bear: '🐻', dog: '🐶' };

export default function Home() {
  const navigate = useNavigate();
  const { group, members } = useGroup('main');
  const currentMember = useAuthStore((s) => s.currentMember);
  const total = members.reduce((s, m) => s + (m.totalTokens || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <PendingBanner />

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <div>
          <h1 className="text-base font-bold text-gray-700">午餐禁聊公事罰金箱</h1>
          <p className="text-xs text-gray-400">{group?.lunchStart} - {group?.lunchEnd} 禁止公事</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">你好，</p>
          <p className="text-sm font-bold" style={{ color: currentMember?.color }}>
            {AVATARS[currentMember?.avatar]} {currentMember?.name}
          </p>
        </div>
      </div>

      {/* 豬公佔位（Task 13 換成 3D） */}
      <div className="flex flex-col items-center py-6">
        <div className="relative w-52 h-52 bg-pink-100 rounded-full flex items-center justify-center shadow-inner border-4 border-pink-200">
          <span className="text-8xl">🐷</span>
          {total > 0 && (
            <div className="absolute -top-2 -right-2 bg-pink-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-sm shadow-lg">
              {total}
            </div>
          )}
        </div>
        <p className="mt-4 text-gray-400 text-sm">總罰金 Token 數</p>
        <p className="text-4xl font-bold text-pink-500 mt-1">{total} 枚</p>
        <p className="text-xs text-gray-400 mt-1">≈ NT$ {total * 100} 聚餐基金</p>
      </div>

      {/* 投入按鈕 */}
      <div className="px-6 mb-6">
        <button
          onClick={() => navigate('/vote')}
          className="w-full bg-pink-500 text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-pink-200 flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <span>🪙</span> 投入一枚 Token
        </button>
      </div>

      {/* 成員違規統計 */}
      <div className="px-6">
        <p className="text-sm font-bold text-gray-600 mb-3">成員違規統計</p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[...members].sort((a, b) => b.totalTokens - a.totalTokens).map((m) => (
            <div key={m.id} className="flex flex-col items-center min-w-[60px]">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-white shadow-sm border-2"
                style={{ borderColor: m.color }}
              >
                {AVATARS[m.avatar] || '🐷'}
              </div>
              <p className="text-xs mt-1.5 text-gray-700 font-medium">{m.name}</p>
              <p className="text-sm font-bold" style={{ color: m.color }}>{m.totalTokens}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 驗證主畫面**

```bash
cd frontend && npm run dev
```

預期：主畫面顯示豬公、總 Token 數、成員排行、投入按鈕，PendingBanner 在被舉報時出現。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat: implement home page with piggy bank placeholder and member stats"
```

---

## Task 13：Three.js 3D 豬公

**Files:**
- Create: `frontend/src/components/PiggyBank3D.jsx`
- Modify: `frontend/src/pages/Home.jsx`

- [ ] **Step 1: 建立 PiggyBank3D.jsx**

```jsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { World, Body, Sphere as CannonSphere, Plane, Vec3 } from 'cannon-es';

export default function PiggyBank3D({ tokens = [] }) {
  const mountRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ world: null, tokenBodies: [], tokenMeshes: [], pig: null });

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;

    // Scene & Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0.5, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const point = new THREE.PointLight(0xffccdd, 2, 15);
    point.position.set(3, 4, 5);
    scene.add(point);
    const backLight = new THREE.PointLight(0xaaccff, 0.8, 10);
    backLight.position.set(-3, -2, -3);
    scene.add(backLight);

    // 豬公主體（玻璃球）
    const pigGeo = new THREE.SphereGeometry(1.5, 64, 64);
    const pigMat = new THREE.MeshPhysicalMaterial({
      color: 0xffcce0,
      metalness: 0.0,
      roughness: 0.05,
      transmission: 0.88,
      thickness: 0.8,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const pig = new THREE.Mesh(pigGeo, pigMat);
    scene.add(pig);
    stateRef.current.pig = pig;

    // 豬耳朵
    const earGeo = new THREE.SphereGeometry(0.4, 32, 32);
    const earMat = new THREE.MeshPhysicalMaterial({
      color: 0xffaabb,
      transmission: 0.6,
      transparent: true,
      opacity: 0.75,
    });
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(side * 0.95, 1.25, 0.4);
      ear.scale.set(1, 0.85, 0.7);
      pig.add(ear);
    });

    // 豬鼻子
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff99aa, roughness: 0.3 });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 32), noseMat);
    nose.position.set(0, -0.15, 1.4);
    pig.add(nose);

    // 鼻孔
    const nostrilMat = new THREE.MeshStandardMaterial({ color: 0xdd7788 });
    [-0.09, 0.09].forEach((x) => {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), nostrilMat);
      n.position.set(x, -0.18, 1.66);
      pig.add(n);
    });

    // 眼睛
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    [-0.45, 0.45].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), eyeMat);
      eye.position.set(x, 0.5, 1.35);
      pig.add(eye);
    });

    // 投幣口（頂部小縫）
    const slotMat = new THREE.MeshStandardMaterial({ color: 0xcc8899 });
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.15), slotMat);
    slot.position.set(0, 1.5, 0);
    pig.add(slot);

    // 物理引擎
    const world = new World({ gravity: new Vec3(0, -12, 0) });
    stateRef.current.world = world;

    // 豬公內部邊界（用多個平面模擬球形容器）
    const wallDefs = [
      { pos: [0, -1.2, 0], rot: [-Math.PI / 2, 0, 0] },          // 底部
      { pos: [1.2, 0, 0], rot: [0, 0, -Math.PI / 2] },            // 右
      { pos: [-1.2, 0, 0], rot: [0, 0, Math.PI / 2] },            // 左
      { pos: [0, 0, 1.2], rot: [Math.PI / 2, 0, 0] },             // 前
      { pos: [0, 0, -1.2], rot: [-Math.PI / 2, 0, 0] },           // 後
    ];
    wallDefs.forEach(({ pos, rot }) => {
      const b = new Body({ mass: 0 });
      b.addShape(new Plane());
      b.position.set(...pos);
      b.quaternion.setFromEuler(...rot);
      world.addBody(b);
    });

    // Token 球
    const tokenBodies = [];
    const tokenMeshes = [];

    tokens.forEach((t, i) => {
      const r = 0.16;
      const geo = new THREE.SphereGeometry(r, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: t.color || '#ff6688',
        metalness: 0.5,
        roughness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      tokenMeshes.push(mesh);

      const body = new Body({ mass: 1 });
      body.addShape(new CannonSphere(r));
      body.position.set(
        (Math.random() - 0.5) * 0.8,
        -0.3 + (i % 5) * 0.4 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.8
      );
      body.linearDamping = 0.4;
      world.addBody(body);
      tokenBodies.push(body);
    });

    stateRef.current.tokenBodies = tokenBodies;
    stateRef.current.tokenMeshes = tokenMeshes;

    // Touch 旋轉
    let isDragging = false, lastX = 0;
    const onTouchStart = (e) => { isDragging = true; lastX = e.touches[0].clientX; };
    const onTouchMove = (e) => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - lastX;
      pig.rotation.y += dx * 0.015;
      lastX = e.touches[0].clientX;
    };
    const onTouchEnd = () => { isDragging = false; };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);

    // Animation
    const clock = new THREE.Clock();
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      world.step(1 / 60, dt, 3);

      tokenBodies.forEach((body, i) => {
        tokenMeshes[i].position.copy(body.position);
        tokenMeshes[i].quaternion.copy(body.quaternion);
      });

      if (!isDragging) pig.rotation.y += 0.004;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [tokens.length]);

  return <div ref={mountRef} className="w-full h-full" style={{ touchAction: 'none' }} />;
}
```

- [ ] **Step 2: 更新 Home.jsx 使用 PiggyBank3D**

將豬公佔位區塊替換：

```jsx
// 在 Home.jsx 頂部加入 import
import PiggyBank3D from '../components/PiggyBank3D';

// 計算 tokenData（在 return 之前）
const tokenData = members.flatMap((m) =>
  Array(m.totalTokens || 0).fill(null).map(() => ({ color: m.color }))
);

// 替換豬公佔位 div 為：
<div className="flex flex-col items-center px-6 pb-2">
  <div className="w-full h-60 relative">
    <PiggyBank3D tokens={tokenData} />
    {total > 0 && (
      <div className="absolute top-2 right-2 bg-pink-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-sm shadow-lg pointer-events-none">
        {total}
      </div>
    )}
  </div>
  <p className="text-gray-400 text-sm mt-2">← 滑動可旋轉豬公 →</p>
  <p className="text-4xl font-bold text-pink-500 mt-2">{total} 枚</p>
  <p className="text-xs text-gray-400 mt-1">≈ NT$ {total * 100} 聚餐基金</p>
</div>
```

- [ ] **Step 3: 驗證 3D 效果**

```bash
cd frontend && npm run dev
```

預期：
- 主畫面顯示玻璃透明豬公，內有彩色球（Token 數量對應）
- 手機左右滑動可旋轉豬公
- 豬公緩慢自轉

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PiggyBank3D.jsx frontend/src/pages/Home.jsx
git commit -m "feat: add three.js 3d piggy bank with cannon-es physics tokens"
```

---

## Task 14：History 頁 & Stats 頁

**Files:**
- Modify: `frontend/src/pages/History.jsx`
- Modify: `frontend/src/pages/Stats.jsx`

- [ ] **Step 1: 更新 History.jsx**

```jsx
import { useTokens } from '../hooks/useTokens';
import { useGroup } from '../hooks/useGroup';

const AVATARS = { pig: '🐷', cat: '🐱', frog: '🐸', bear: '🐻', dog: '🐶' };

export default function History() {
  const tokens = useTokens('main', 50);
  const { members } = useGroup('main');
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">歷史紀錄</h1>

      {tokens.length === 0 && (
        <div className="flex flex-col items-center justify-center mt-20">
          <span className="text-5xl mb-3">🎉</span>
          <p className="text-gray-400">還沒有違規紀錄！</p>
        </div>
      )}

      <div className="space-y-3">
        {tokens.map((t) => {
          const target = memberMap[t.targetId];
          const reporter = memberMap[t.reporterId];
          const date = t.timestamp?.toDate?.();
          const timeStr = date
            ? date.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';

          return (
            <div key={t.id} className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl border-2"
                style={{ borderColor: target?.color }}
              >
                {AVATARS[target?.avatar] || '🐷'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: target?.color }}>
                  {target?.name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  被 {reporter?.name} 舉報 · {timeStr}
                </p>
              </div>
              <span className="text-pink-500 font-bold text-sm whitespace-nowrap">-1 🪙</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 更新 Stats.jsx**

```jsx
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useGroup } from '../hooks/useGroup';

export default function Stats() {
  const { members } = useGroup('main');
  const total = members.reduce((s, m) => s + (m.totalTokens || 0), 0);
  const sorted = [...members].sort((a, b) => b.totalTokens - a.totalTokens);
  const chartData = sorted
    .filter((m) => m.totalTokens > 0)
    .map((m) => ({ name: m.name, value: m.totalTokens, color: m.color }));

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-1">違規統計</h1>
      <p className="text-gray-400 text-sm mb-6">累計總 Token：<span className="text-pink-500 font-bold">{total} 枚</span></p>

      {total === 0 ? (
        <div className="flex flex-col items-center mt-20">
          <span className="text-5xl mb-3">🎉</span>
          <p className="text-gray-400">大家都很乖，繼續保持！</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={85}
                strokeWidth={2}
              >
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.color} stroke="white" />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [`${v} 枚`, '']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>

          <div className="mt-4 space-y-2">
            {sorted.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                <span className="text-gray-400 text-sm w-4 text-center font-bold">{i + 1}</span>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: m.color }} />
                <span className="flex-1 text-sm font-medium text-gray-700">{m.name}</span>
                <span className="text-sm font-bold" style={{ color: m.color }}>{m.totalTokens} 枚</span>
                <span className="text-xs text-gray-400 w-10 text-right">
                  {total > 0 ? Math.round((m.totalTokens / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/History.jsx frontend/src/pages/Stats.jsx
git commit -m "feat: implement history page and stats pie chart"
```

---

## Task 15：Settings 頁

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

- [ ] **Step 1: 更新 Settings.jsx**

```jsx
import { useGroup } from '../hooks/useGroup';
import { useAuthStore } from '../store/authStore';

const AVATARS = { pig: '🐷', cat: '🐱', frog: '🐸', bear: '🐻', dog: '🐶' };

export default function Settings() {
  const { group, members } = useGroup('main');
  const { currentMember, logout } = useAuthStore();
  const total = members.reduce((s, m) => s + (m.totalTokens || 0), 0);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">設定</h1>

      {/* 目前登入 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border-2"
          style={{ borderColor: currentMember?.color }}
        >
          {AVATARS[currentMember?.avatar] || '🐷'}
        </div>
        <div>
          <p className="text-xs text-gray-400">目前登入</p>
          <p className="font-bold" style={{ color: currentMember?.color }}>
            {currentMember?.name}
          </p>
        </div>
      </div>

      {/* 午餐時間 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <p className="text-xs text-gray-400 mb-1">午餐時間</p>
        <p className="font-bold text-gray-700">{group?.lunchStart} - {group?.lunchEnd}</p>
        <p className="text-xs text-gray-400 mt-1">此時間內聊公事需投 Token</p>
      </div>

      {/* 成員列表 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400">成員（共 {members.length} 人）</p>
          <p className="text-xs text-gray-400">違規總計：{total} 枚</p>
        </div>
        <div className="space-y-2">
          {[...members].sort((a, b) => b.totalTokens - a.totalTokens).map((m, i) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="text-gray-300 text-sm w-4 text-center">{i + 1}</span>
              <span className="text-xl">{AVATARS[m.avatar] || '🐷'}</span>
              <span className="flex-1 font-medium text-gray-700">{m.name}</span>
              <span className="text-sm font-bold" style={{ color: m.color }}>
                {m.totalTokens} 枚
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 登出 */}
      <button
        onClick={logout}
        className="w-full bg-gray-100 text-gray-500 rounded-2xl py-3 font-medium mb-6 active:scale-95 transition-transform"
      >
        切換帳號
      </button>

      <p className="text-center text-xs text-gray-300">大豬公 v1.0.0 🐷</p>
      <p className="text-center text-xs text-gray-200 mt-1">PIN 由 `scripts/members.local.json` 私下設定，不會在 UI 顯示</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: implement settings page with member list and logout"
```

---

## Task 16：最終部署 & 驗收

- [ ] **Step 1: 確認 GitHub Secrets 已設定**

前往 GitHub Repo → Settings → Secrets and variables → Actions，確認：
```
✅ FIREBASE_TOKEN
✅ FIREBASE_CONFIG（JSON 格式，包含 Firebase Web config 欄位）
```

- [ ] **Step 2: 部署前執行 auth/concurrency validation**

```bash
npm --prefix functions test
```

Expected:

```text
tests 5
pass 5
fail 0
```

這 5 個 tests 必須涵蓋：第 5 次錯誤 PIN 鎖定且正確 PIN 仍被拒、未登入拒絕、caller identity 欄位不能冒用、非 target 不能確認、兩個並行確認只成功一次且 `totalTokens === 1`。

- [ ] **Step 3: Push main 觸發完整 CI/CD**

```bash
git push origin main
```

- [ ] **Step 4: 確認 GitHub Actions 成功**

前往 GitHub → Actions → 最新的 `Deploy to Firebase` workflow → 確認所有 steps 綠色。

- [ ] **Step 5: 確認 callable 驗證與部署區域**

Firebase Console / Emulator 驗證：
- `loginWithPin`、`reportToken`、`confirmToken` 均部署在 `asia-east1`。
- 未登入呼叫 callable 會被 `request.auth` 檢查拒絕。
- actor identity 一律由 `request.auth.uid` 映射，前端不得提交 `reporterId` 或其他 caller identity 欄位。
- Firebase App Check / reCAPTCHA Enterprise 仍列為未來 hardening，不屬於 v1 驗收。

- [ ] **Step 6: 開啟正式網址**

```
https://dazhugong-4f185.web.app
```

- [ ] **Step 7: 完整驗收清單**

```
□ 登入頁顯示 5 位成員頭像
□ 選成員 + 輸入各自的私有 PIN → Firebase Auth UID 等於該 member.authUid
□ 重新整理後由 Firebase Auth 恢復登入，localStorage 沒有可指定 member 身分的資料
□ 連續 5 次錯誤 PIN 後鎖定，鎖定期間正確 PIN 也不能登入
□ 主畫面顯示 3D 玻璃豬公
□ 手機滑動可旋轉豬公
□ 點「投入 Token」→ 選成員 → 送出舉報
□ token.reporterId 由登入 UID 映射產生，前端 request 不傳 reporterId
□ 切換到被舉報帳號 → 看到紅色通知橫幅
□ 進入待確認頁 → 點「我認了」
□ 重複/並行確認只有一次成功，主畫面 Token 數只增加 1
□ 3D 豬公內球增加
□ 歷史紀錄顯示此次違規
□ 統計頁圓餅圖正確顯示
□ 設定頁成員排行正確
□ 登出使用 Firebase signOut，切換帳號正常
```

- [ ] **Step 8: 標記 v1.0.0**

```bash
git tag v1.0.0
git push origin v1.0.0
```

🎉 **大豬公上線！**
