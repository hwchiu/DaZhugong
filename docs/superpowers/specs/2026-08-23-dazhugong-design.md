# 大豬公（DaZhugong）設計文件

**日期：** 2026-08-23  
**專案：** 午餐禁聊公事罰金箱 Web App  
**專案 ID：** dazhugong-4f185

---

## 一、專案目標

一群朋友吃飯時禁止聊公事，違規者需投入一枚 Token（代表 100 元）到豬公撲滿。  
App 記錄所有 Token，作為未來聚餐基金的參考依據。

---

## 二、技術架構

```
前端：React (Vite) + Three.js + Tailwind CSS
資料庫：Cloud Firestore（即時同步）
身分驗證：Firebase Authentication custom token（PIN UX）+ Firebase App Check
後端邏輯：Firebase Cloud Functions (Node.js 22，authenticated callable)
部署：Firebase Hosting
CI/CD：GitHub Actions → firebase deploy
```

### Firebase 專案資訊
- Project ID: `dazhugong-4f185`
- Auth Domain: `dazhugong-4f185.firebaseapp.com`
- 敏感設定透過環境變數管理，不直接 commit 到 git

---

## 三、頁面結構

| 路徑 | 功能 |
|------|------|
| `/` | 主畫面：3D 豬公、總 Token 數、成員統計、投入按鈕 |
| `/vote` | 投票頁：選擇違規者並送出舉報 |
| `/pending` | 待確認頁：查看被舉報紀錄，確認或否認 |
| `/history` | 歷史紀錄頁 |
| `/stats` | 統計頁（圓餅圖） |
| `/settings` | 設定頁（成員管理、午餐時間） |

---

## 四、登入與授權機制（漸進式設計）

**Phase 1（當前實作，維持簡單 PIN UX）：**
1. 使用者選擇頭像/名字並輸入 4 位 PIN。
2. 前端呼叫 `loginWithPin({ groupId, memberId, pin })`。這是唯一接受 `memberId` 作為登入候選身分的 callable。
3. `loginWithPin` 從完全禁止客戶端存取的 `/groups/{groupId}/memberAuth/{memberId}` 讀取 `pinHash` 與失敗/鎖定狀態，在 Firestore transaction 內套用「5 次失敗鎖定 15 分鐘」的伺服器端節流。
4. PIN 正確時，Function 讀取該 member 預先 seed 的穩定 `authUid`，以 Firebase Admin SDK 建立 custom token。
5. 前端以 `signInWithCustomToken` 登入 Firebase Authentication；Firebase Auth persistence 負責恢復登入，前端不得把任意 member 物件當成授權身分持久化。

所有具權限的 callable（包含 `reportToken`、`confirmToken`）都必須：
- 設定 `enforceAppCheck: true`。
- 要求 `request.auth`，缺少時回傳 `unauthenticated`。
- 只從 `request.auth.uid` 查詢 `members.authUid` 取得 actor member；不得接受或信任 `reporterId`、`memberId` 等 caller identity 欄位。
- 僅把業務輸入（例如 `targetId`、`tokenId`、`action`）放在 `request.data`。

前端啟動時必須初始化 Firebase App Check（reCAPTCHA Enterprise，開發環境使用明確設定的 debug token），使 callable request 自動攜帶 App Check token。正式部署前須在 Firebase Console 註冊 Web App、設定 site key 並啟用 Functions App Check enforcement。

**Phase 2（未來 Google 登入）：**
- Phase 1 seed 已為每位 member 建立不變的 `authUid`，Firebase Auth UID 與 Firestore member ID 的映射不需重建。
- 帳號連結 migration 為：成員先用 PIN 登入既有 custom-token Firebase 使用者，再以 `linkWithPopup(currentUser, new GoogleAuthProvider())` 連結 Google provider，因此保留同一 `authUid`、member 文件及歷史資料。
- 若 Google provider 已屬於另一 Firebase user，migration 必須先驗證兩個帳號的所有權，再把 provider 連結到既有 member `authUid` 並移除重複帳號；不得以新的 Google UID 覆寫 `authUid`。

---

## 五、Firestore 資料模型

```
/groups/{groupId}
  ├── name: string              ← 群組名稱
  ├── lunchStart: string        ← 午餐開始時間 "12:00"
  └── lunchEnd: string          ← 午餐結束時間 "13:00"

/groups/{groupId}/members/{memberId}
  ├── name: string              ← 顯示名稱
  ├── avatar: string            ← 頭像編號（預設動物圖示）
  ├── color: string             ← 專屬 Token 顏色（hex）
  ├── totalTokens: number       ← 累計違規 Token 數
  └── authUid: string           ← seed 建立且永久不變的 Firebase Auth UID

/groups/{groupId}/memberAuth/{memberId}
  ├── pinHash: string           ← bcrypt 雜湊（僅 Admin SDK 可用）
  ├── failedAttempts: number    ← 連續失敗次數
  ├── lockedUntil: timestamp?   ← 鎖定期限
  ├── lastFailedAt: timestamp?
  └── lastSuccessfulAt: timestamp?

/groups/{groupId}/tokens/{tokenId}
  ├── reporterId: string        ← 舉報者 memberId
  ├── targetId: string          ← 被舉報者 memberId
  ├── status: string            ← "pending" | "confirmed" | "rejected"
  ├── createdAt: timestamp
  ├── confirmedAt: timestamp | null
  └── resolvedAt: timestamp | null

/groups/{groupId}/reports/{tokenId}    ← 僅 confirmed 後以 tokenId 寫入
  ├── targetId: string
  ├── reporterId: string
  └── timestamp: timestamp
```

`members` 是可公開讀取的顯示資料，絕不包含 `pinHash`。`memberAuth` 的 Firestore Rules 為 `allow read, write: if false`，只允許 Admin SDK 存取。

---

## 六、舉報確認流程

```
1. A 發現 B 講公事
   └── 點「投入 Token」→ 選擇 B → 送出舉報

2. Cloud Function 寫入 tokens（status: "pending"）

3. B 登入 app → 看到通知橫幅「你被舉報講公事！」
   ├── 確認 → Firestore transaction 將 pending → confirmed、建立 `reports/{tokenId}`、totalTokens +1
   └── 否認 → status: "rejected"，紀錄取消

4. 主畫面透過 Firestore 即時監聽自動更新
5. Transaction 會重新讀取 token 狀態；只有第一個 pending transition 能成功，因此重送或並行確認最多增加一次
6. `loginWithPin` 只回傳 Firebase custom token；前端永遠不接觸 `pinHash` 或 `memberAuth`
```

---

## 七、3D 豬公視覺設計

- **技術：** Three.js + Cannon.js（物理引擎）
- **豬公材質：** `MeshPhysicalMaterial`（玻璃透明質感）
- **Token 球：** 每位成員專屬顏色的球體，堆積在豬公內部
- **投幣動畫：** Token 從豬公頂部投入，模擬物理掉落
- **互動：** 手機左右滑動可旋轉豬公
- **視覺回饋：** Token 數量越多，豬公內球體越多

---

## 八、GitHub Actions CI/CD 設定

### 需要在 GitHub Repo 設定的 Secrets

前往 GitHub Repo → **Settings → Secrets and variables → Actions → New repository secret**，新增以下變數：

| Secret 名稱 | 說明 | 取得方式 |
|-------------|------|----------|
| `FIREBASE_TOKEN` | Firebase CLI 部署金鑰 | 執行 `firebase login:ci` 取得 |
| `FIREBASE_CONFIG` | Web config JSON，包含 `apiKey`、`authDomain`、`projectId`、`storageBucket`、`messagingSenderId`、`appId`、`appCheckSiteKey` | Firebase Console → 專案設定 / App Check |

### GitHub Actions Workflow 概覽

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test-build-deploy:
    steps:
      - npm --prefix functions ci && npm --prefix functions test
      - npm --prefix frontend ci && npm --prefix frontend run build
      - firebase deploy --only hosting,functions,firestore:rules
```

### 取得 FIREBASE_TOKEN 步驟
```bash
# 在本機執行（只需一次）
npm install -g firebase-tools
firebase login:ci
# 複製輸出的 token，貼到 GitHub Secrets
```

---

## 九、開發優先順序

1. **Phase 1：基礎建設**
   - Firebase 專案初始化、Firestore 規則與 `memberAuth` deny-all 設定
   - Seed 穩定 `authUid`、Firebase Auth user、PIN hash 與節流狀態
   - React 專案建立（Vite）、Firebase Auth/App Check 初始化
   - Cloud Functions scaffold、驗證/授權與 transaction 測試
   - 前後端 packages 都存在且測試可執行後，再加入 GitHub Actions CI/CD

2. **Phase 2：核心功能**
   - 登入（選名字 + PIN → Firebase custom token）
   - 主畫面（靜態版本，先不含 3D）
   - 投票流程（舉報 + 確認）

3. **Phase 3：視覺強化**
   - Three.js 3D 豬公
   - 投幣動畫
   - 歷史紀錄、統計圖表

4. **Phase 4：優化**
   - 通知機制
   - 設定頁面
   - 未來：Google 登入升級

---

## 十、不在範圍內（YAGNI）

- 真實金流或付款功能
- 推播通知（Phase 1）
- 多群組管理 UI
- 管理員後台
