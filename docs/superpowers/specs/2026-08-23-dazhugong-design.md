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
後端邏輯：Firebase Cloud Functions (Node.js 22)
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

## 四、登入機制（漸進式設計）

**Phase 1（當前實作）：**
- 進入 app → 選擇頭像/名字 → 輸入 4 位 PIN → 進入主畫面
- PIN 以雜湊方式儲存，不明文儲存

**Phase 2（未來升級）：**
- 替換登入模組為 Firebase Auth（Google 登入）
- Firestore 資料結構不需變動（`userId` 欄位從 Phase 1 就存在）

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
  ├── pinHash: string           ← PIN 雜湊值
  └── totalTokens: number       ← 累計違規 Token 數

/groups/{groupId}/tokens/{tokenId}
  ├── reporterId: string        ← 舉報者 memberId
  ├── targetId: string          ← 被舉報者 memberId
  ├── status: string            ← "pending" | "confirmed" | "rejected"
  ├── createdAt: timestamp
  └── confirmedAt: timestamp | null

/groups/{groupId}/reports/{reportId}   ← 僅 confirmed 後寫入
  ├── targetId: string
  ├── reporterId: string
  └── timestamp: timestamp
```

---

## 六、舉報確認流程

```
1. A 發現 B 講公事
   └── 點「投入 Token」→ 選擇 B → 送出舉報

2. Cloud Function 寫入 tokens（status: "pending"）

3. B 登入 app → 看到通知橫幅「你被舉報講公事！」
   ├── 確認 → status: "confirmed"，totalTokens +1，觸發豬公投幣動畫
   └── 否認 → status: "rejected"，紀錄取消

4. 主畫面透過 Firestore 即時監聽自動更新
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
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | Firebase Console → 專案設定 |
| `VITE_FIREBASE_AUTH_DOMAIN` | `dazhugong-4f185.firebaseapp.com` | Firebase Console |
| `VITE_FIREBASE_PROJECT_ID` | `dazhugong-4f185` | Firebase Console |
| `VITE_FIREBASE_STORAGE_BUCKET` | `dazhugong-4f185.firebasestorage.app` | Firebase Console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `488383910775` | Firebase Console |
| `VITE_FIREBASE_APP_ID` | `1:488383910775:web:...` | Firebase Console |

### GitHub Actions Workflow 概覽

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  deploy:
    steps:
      - npm ci && npm run build   # 建置 React
      - firebase deploy --only hosting,functions  # 部署
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
   - Firebase 專案初始化、Firestore 規則設定
   - React 專案建立（Vite）、路由設定
   - GitHub Actions CI/CD pipeline

2. **Phase 2：核心功能**
   - 登入（選名字 + PIN）
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
