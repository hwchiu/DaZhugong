# 大豬公（DaZhugong）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個手機優先的 Web App，讓朋友在午餐時可以互相舉報講公事，被確認後投入 Token 到 3D 豬公撲滿，累積聚餐基金。

**Architecture:** React (Vite) 前端 + Firebase Hosting 部署，Firestore 即時同步資料，Cloud Functions 處理核心業務邏輯（舉報確認、Token 計數），Three.js 渲染互動式 3D 豬公。

**Tech Stack:** React 18, Vite, Tailwind CSS, Three.js, Cannon-es, Firebase (Hosting + Firestore + Functions), GitHub Actions, Recharts

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
│       │   └── authStore.js              # Zustand 登入狀態
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
│   └── src/
│       ├── index.js                      # Functions 進入點
│       ├── reportToken.js                # 建立舉報
│       └── confirmToken.js              # 確認/否認舉報
├── scripts/
│   └── seed.js                           # Firestore 初始資料
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

- [ ] **Step 1: 建立 firebase.json**

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
  }
}
```

- [ ] **Step 2: 建立 .firebaserc**

```json
{
  "projects": {
    "default": "dazhugong-4f185"
  }
}
```

- [ ] **Step 3: 建立 firestore.rules**

```
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

> 所有寫入透過 Cloud Functions，前端只讀。

- [ ] **Step 4: 建立 .gitignore**

```
node_modules/
.env
.env.local
frontend/.env.local
frontend/dist/
scripts/serviceAccountKey.json
*.log
.DS_Store
```

- [ ] **Step 5: 在 Firebase Console 啟用 Firestore**

前往 https://console.firebase.google.com/project/dazhugong-4f185/firestore → 建立資料庫 → 選 **production mode** → 選擇地區 `asia-east1`。

- [ ] **Step 6: Commit**

```bash
git add firebase.json .firebaserc firestore.rules .gitignore
git commit -m "chore: add firebase config, firestore rules, and gitignore"
```

---

## Task 2：Firestore 初始資料 Seed

**Files:**
- Create: `scripts/seed.js`
- Create: `package.json`（根目錄）

- [ ] **Step 1: 建立根目錄 package.json**

```json
{
  "name": "dazhugong-root",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "seed": "node scripts/seed.js"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0"
  }
}
```

```bash
npm install
```

- [ ] **Step 2: 取得 Firebase Admin SDK 金鑰**

前往 Firebase Console → 專案設定（齒輪）→ 服務帳戶 → **產生新的私密金鑰** → 下載 JSON → 儲存為 `scripts/serviceAccountKey.json`（已在 .gitignore 中，不會 commit）。

- [ ] **Step 3: 建立 scripts/seed.js**

```js
const admin = require('firebase-admin');
const crypto = require('crypto');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

async function seed() {
  const groupRef = db.collection('groups').doc('main');

  await groupRef.set({
    name: '午餐禁公事團',
    lunchStart: '12:00',
    lunchEnd: '13:00',
  });
  console.log('✅ Group created');

  const members = [
    { id: 'member1', name: '你', avatar: 'pig', color: '#FF6B8A', totalTokens: 0 },
    { id: 'member2', name: 'Kevin', avatar: 'cat', color: '#4A90E2', totalTokens: 0 },
    { id: 'member3', name: 'Amy', avatar: 'frog', color: '#7ED321', totalTokens: 0 },
    { id: 'member4', name: 'Jamie', avatar: 'bear', color: '#9B59B6', totalTokens: 0 },
    { id: 'member5', name: 'Vivian', avatar: 'dog', color: '#F39C12', totalTokens: 0 },
  ];

  for (const m of members) {
    const { id, ...data } = m;
    await groupRef.collection('members').doc(id).set(data);
    await groupRef.collection('memberAuth').doc(id).set({
      pinHash: hashPin('1234'),
    });
    console.log(`✅ Seeded: ${m.name}`);
  }

  console.log('\n🐷 Seed complete! 預設 PIN 都是 1234，記得之後讓大家自己改。');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: 執行 seed**

```bash
npm run seed
```

預期輸出：
```
✅ Group created
✅ Seeded: 你
✅ Seeded: Kevin
✅ Seeded: Amy
✅ Seeded: Jamie
✅ Seeded: Vivian

🐷 Seed complete! 預設 PIN 都是 1234，記得之後讓大家自己改。
```

- [ ] **Step 5: 驗證 Firestore 有資料**

前往 Firebase Console → Firestore → 確認 `groups/main/members` 有 5 筆資料。
再確認 `groups/main/memberAuth` 也有對應的 5 筆 PIN 雜湊資料。

- [ ] **Step 6: Commit**

```bash
git add scripts/seed.js package.json package-lock.json
git commit -m "chore: add firestore seed script with 5 members"
```

---

## Task 3：React 專案建立

**Files:**
- Create: `frontend/` (Vite project)
- Create: `frontend/src/firebase.js`
- Create: `frontend/src/index.css`

- [ ] **Step 1: 建立 Vite React 專案**

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install
```

- [ ] **Step 2: 安裝依賴**

```bash
cd frontend
npm install firebase react-router-dom zustand three cannon-es recharts
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: 設定 frontend/tailwind.config.js**

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
}
```

- [ ] **Step 4: 更新 frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
body {
  margin: 0;
  background: #FFF5F7;
  font-family: 'Noto Sans TC', sans-serif;
  -webkit-tap-highlight-color: transparent;
}
```

- [ ] **Step 5: 更新 frontend/index.html**

```html
<!DOCTYPE html>
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

- [ ] **Step 6: 建立 frontend/src/firebase.js**

```js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-east1');
```

- [ ] **Step 7: 建立 frontend/.env.local（本地開發用，不 commit）**

```
VITE_FIREBASE_API_KEY=AIzaSyALpQZO4-gRpobOng8_04r09EdaoAAGxJ0
VITE_FIREBASE_AUTH_DOMAIN=dazhugong-4f185.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dazhugong-4f185
VITE_FIREBASE_STORAGE_BUCKET=dazhugong-4f185.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=488383910775
VITE_FIREBASE_APP_ID=1:488383910775:web:d78289f4826331953d0772
```

- [ ] **Step 8: 驗證開發伺服器啟動**

```bash
cd frontend && npm run dev
```

預期：瀏覽器開啟 http://localhost:5173，頁面正常顯示（Vite 預設）。

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: initialize react vite project with tailwind, firebase, three.js"
```

---

## Task 4：GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 安裝 firebase-tools（本機一次性）**

```bash
npm install -g firebase-tools
```

- [ ] **Step 2: 建立 .github/workflows/deploy.yml**

```yaml
name: Deploy to Firebase

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Create frontend .env from secret
        working-directory: frontend
        run: |
          echo '${{ secrets.FIREBASE_CONFIG }}' | node -e "
            const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
            const lines = [
              'VITE_FIREBASE_API_KEY=' + c.apiKey,
              'VITE_FIREBASE_AUTH_DOMAIN=' + c.authDomain,
              'VITE_FIREBASE_PROJECT_ID=' + c.projectId,
              'VITE_FIREBASE_STORAGE_BUCKET=' + c.storageBucket,
              'VITE_FIREBASE_MESSAGING_SENDER_ID=' + c.messagingSenderId,
              'VITE_FIREBASE_APP_ID=' + c.appId,
            ];
            require('fs').writeFileSync('.env', lines.join('\n'));
          "

      - name: Install and build frontend
        working-directory: frontend
        run: |
          npm ci
          npm run build

      - name: Install functions deps
        working-directory: functions
        run: npm ci

      - name: Deploy to Firebase
        run: |
          npx firebase-tools deploy \
            --only hosting,functions,firestore:rules \
            --token "${{ secrets.FIREBASE_TOKEN }}" \
            --project dazhugong-4f185 \
            --non-interactive
```

- [ ] **Step 3: Commit 並 push 觸發 CI/CD**

```bash
git add .github/
git commit -m "ci: add github actions firebase deploy workflow"
git push origin main
```

前往 GitHub → Actions tab，確認 workflow 執行（初次可能因 Functions 尚未建立而有警告，繼續後面的 Task 即可解決）。

---

## Task 5：Zustand 登入狀態

**Files:**
- Create: `frontend/src/store/authStore.js`

- [ ] **Step 1: 建立 authStore.js**

```js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      currentMember: null,   // { id, name, avatar, color }
      groupId: 'main',
      login: (member) => set({ currentMember: member }),
      logout: () => set({ currentMember: null }),
    }),
    { name: 'dazhugong-auth' }
  )
);
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store/
git commit -m "feat: add zustand auth store with localStorage persistence"
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

## Task 7：Login 元件

**Files:**
- Create: `frontend/src/components/Login.jsx`

- [ ] **Step 1: 建立 Login.jsx**

```jsx
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useGroup } from '../hooks/useGroup';
import { useAuthStore } from '../store/authStore';
import { functions } from '../firebase';

const AVATARS = { pig: '🐷', cat: '🐱', frog: '🐸', bear: '🐻', dog: '🐶' };

export default function Login() {
  const { members } = useGroup('main');
  const login = useAuthStore((s) => s.login);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!selected || pin.length !== 4) return;
    // PIN 驗證交給 callable Cloud Function，前端不讀取 pinHash
    const verifyMemberPin = httpsCallable(functions, 'verifyMemberPin');
    const result = await verifyMemberPin({ groupId: 'main', memberId: selected.id, pin });

    if (result.data?.ok) {
      login({ id: selected.id, name: selected.name, avatar: selected.avatar, color: selected.color });
    } else {
      setError('PIN 錯誤，請再試一次');
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
git commit -m "feat: add login component with member selection and PIN verification"
```

---

## Task 8：App 路由 + BottomNav

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
  const currentMember = useAuthStore((s) => s.currentMember);

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

預期：登入頁出現 → 選成員 + 輸入 `1234` → 進入主畫面 → 底部導覽可切換頁面。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add router, bottom nav, member avatar, and page stubs"
```

---

## Task 9：Cloud Functions — reportToken, confirmToken & verifyMemberPin

**Files:**
- Create: `functions/package.json`
- Create: `functions/src/index.js`
- Create: `functions/src/reportToken.js`
- Create: `functions/src/confirmToken.js`
- Create: `functions/src/verifyMemberPin.js`

- [ ] **Step 1: 建立 functions/package.json**

```json
{
  "name": "dazhugong-functions",
  "version": "1.0.0",
  "main": "src/index.js",
  "engines": { "node": "22" },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

```bash
cd functions && npm install
```

- [ ] **Step 2: 建立 functions/src/reportToken.js**

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

exports.reportToken = onCall({ region: 'asia-east1' }, async (request) => {
  const { groupId, reporterId, targetId } = request.data;

  if (!groupId || !reporterId || !targetId) {
    throw new HttpsError('invalid-argument', '缺少必要參數');
  }
  if (reporterId === targetId) {
    throw new HttpsError('invalid-argument', '不能舉報自己');
  }

  const db = admin.firestore();
  const tokenRef = db.collection('groups').doc(groupId).collection('tokens').doc();

  await tokenRef.set({
    reporterId,
    targetId,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    confirmedAt: null,
  });

  return { tokenId: tokenRef.id };
});
```

- [ ] **Step 3: 建立 functions/src/confirmToken.js**

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

exports.confirmToken = onCall({ region: 'asia-east1' }, async (request) => {
  const { groupId, tokenId, action, memberId } = request.data;

  if (!['confirm', 'reject'].includes(action)) {
    throw new HttpsError('invalid-argument', 'action 必須是 confirm 或 reject');
  }

  const db = admin.firestore();
  const tokenRef = db.collection('groups').doc(groupId).collection('tokens').doc(tokenId);
  const tokenSnap = await tokenRef.get();

  if (!tokenSnap.exists) {
    throw new HttpsError('not-found', '舉報不存在');
  }

  const token = tokenSnap.data();

  if (token.targetId !== memberId) {
    throw new HttpsError('permission-denied', '只有被舉報者可以確認');
  }
  if (token.status !== 'pending') {
    throw new HttpsError('failed-precondition', '此舉報已處理');
  }

  const batch = db.batch();

  if (action === 'confirm') {
    batch.update(tokenRef, {
      status: 'confirmed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const reportRef = db.collection('groups').doc(groupId).collection('reports').doc();
    batch.set(reportRef, {
      targetId: token.targetId,
      reporterId: token.reporterId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const memberRef = db.collection('groups').doc(groupId).collection('members').doc(token.targetId);
    batch.update(memberRef, {
      totalTokens: admin.firestore.FieldValue.increment(1),
    });
  } else {
    batch.update(tokenRef, { status: 'rejected' });
  }

  await batch.commit();
  return { success: true };
});
```

- [ ] **Step 4: 建立 functions/src/verifyMemberPin.js**

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

exports.verifyMemberPin = onCall({ region: 'asia-east1' }, async (request) => {
  const { groupId, memberId, pin } = request.data;

  if (!groupId || !memberId || !pin) {
    throw new HttpsError('invalid-argument', '缺少必要參數');
  }

  const authSnap = await admin.firestore()
    .collection('groups').doc(groupId)
    .collection('memberAuth').doc(memberId)
    .get();

  if (!authSnap.exists) {
    throw new HttpsError('not-found', '成員不存在');
  }

  return { ok: authSnap.data().pinHash === hashPin(pin) };
});
```

- [ ] **Step 5: 建立 functions/src/index.js**

```js
const admin = require('firebase-admin');
admin.initializeApp();

const { reportToken } = require('./reportToken');
const { confirmToken } = require('./confirmToken');
const { verifyMemberPin } = require('./verifyMemberPin');

exports.reportToken = reportToken;
exports.confirmToken = confirmToken;
exports.verifyMemberPin = verifyMemberPin;
```

- [ ] **Step 6: 部署 Functions**

```bash
npx firebase-tools deploy --only functions --project dazhugong-4f185
```

預期：Firebase Console → Functions 出現 `reportToken`、`confirmToken` 和 `verifyMemberPin` 三個函數。

- [ ] **Step 7: Commit**

```bash
git add functions/
git commit -m "feat: add cloud functions for report and confirm token with atomic batch write"
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
      await reportToken({ groupId: 'main', reporterId: currentMember.id, targetId: selected.id });
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
2. 用「你」帳號登入（PIN: 1234）
3. 前往投票頁，選 Kevin
4. 點舉報按鈕
5. 前往 Firebase Console → Firestore → groups/main/tokens
   預期：出現一筆 status: "pending", targetId: "member2" 的文件
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
      await confirmToken({ groupId: 'main', tokenId, action, memberId: currentMember.id });
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
2. 重新登入為 Kevin（登出 → 選 Kevin → PIN: 1234）
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
      <p className="text-center text-xs text-gray-200 mt-1">預設 PIN：1234（請自行更改）</p>
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
✅ FIREBASE_TOKEN（重新產生的，非洩漏的那個）
✅ FIREBASE_CONFIG（JSON 格式）
```

- [ ] **Step 2: Push main 觸發完整 CI/CD**

```bash
git push origin main
```

- [ ] **Step 3: 確認 GitHub Actions 成功**

前往 GitHub → Actions → 最新的 `Deploy to Firebase` workflow → 確認所有 steps 綠色。

- [ ] **Step 4: 開啟正式網址**

```
https://dazhugong-4f185.web.app
```

- [ ] **Step 5: 完整驗收清單**

```
□ 登入頁顯示 5 位成員頭像
□ 選成員 + 輸入 1234 → 成功進入主畫面
□ 主畫面顯示 3D 玻璃豬公
□ 手機滑動可旋轉豬公
□ 點「投入 Token」→ 選成員 → 送出舉報
□ 切換到被舉報帳號 → 看到紅色通知橫幅
□ 進入待確認頁 → 點「我認了」
□ 主畫面 Token 數即時增加
□ 3D 豬公內球增加
□ 歷史紀錄顯示此次違規
□ 統計頁圓餅圖正確顯示
□ 設定頁成員排行正確
□ 登出/切換帳號正常
```

- [ ] **Step 6: 標記 v1.0.0**

```bash
git tag v1.0.0
git push origin v1.0.0
```

🎉 **大豬公上線！**
