# 大豬公（DaZhugong）v1 設計文件

**日期：** 2026-08-23  
**專案 ID：** `dazhugong-4f185`

## 目標與 v1 邊界

大豬公是供固定小團體使用的午餐違規 Token 記錄 App。v1 必須可在 Firebase Spark 免費方案運作，因此部署架構固定為：

- Firebase Hosting
- Firebase Authentication（Email/Password）
- Cloud Firestore
- React + Vite 前端

v1 **不使用 Cloud Functions，也不使用 App Check**。Cloud Functions 部署需要 Blaze billing，不符合目前限制；App Check 留待未來強化。

## PIN 登入的取捨

UI 仍讓使用者選擇成員並輸入唯一的私有 4 位 PIN，但底層映射為 Firebase Email/Password：

- Email：`${authUid}@dazhugong.invalid`
- Password：`dazhugong.firebase-auth.v1:${authUid}:${pin}`

前端與 seed 各有純函式 `deriveFirebasePassword(authUid, pin)`，並以相同固定向量測試確保演算法一致。衍生密碼只在登入呼叫當下存在，不寫入 local storage、Firestore、log 或公開文件。

這個方案依賴 Firebase Authentication 的登入節流；4 位 PIN 的搜尋空間有限，因此只適合可信任的小型群組。若未來需要伺服器端 PIN 節流、App Check、MFA 或更強的登入方式，可選擇升級 Blaze 並遷移到 Functions/更強認證。

## Seed 與身分

`scripts/members.local.json` 是未提交的唯一私有 4 位 PIN 來源。每位成員必須有唯一 `id`、穩定且唯一的 `authUid`、唯一 PIN，以及顯示欄位。

Seed 流程：

1. 在任何寫入前列出所有既有 member 文件，確認仍在設定中的 member `authUid` 不變，並一次決定需停用的成員。
2. 由穩定 `authUid` 衍生 synthetic email，由 `authUid` 與 PIN 衍生 Firebase password。
3. 設定中的成員寫入 `active: true`；Auth user 不存在時建立，存在時以 `disabled: false` 重新啟用並更新 email、display name 與 password。
4. 既有但已從 `members.local` 移除的 member 文件只 merge `active: false`，保留姓名、歷史欄位、reports 與 tokens；再依該文件既有 `authUid` 停用 Firebase Auth。
5. 停用前以 transaction 重讀 member 並確認 `authUid` 未在 preflight 後改變。任何目前設定中的 `authUid` 都列入保護集合，即使舊資料重複引用也不得被停用。
6. 設定中的 member 亦以 transaction 建立或 merge，再次檢查 `authUid`，避免競態覆寫。
7. 不寫入 `memberAuth`；舊環境若仍有此 collection，Security Rules 永久 deny-all。

公開 member 文件只包含：

```text
authUid, loginEmail, name, avatar, color, active
```

不得包含 PIN、hash 或 password。舊 `totalTokens` 欄位可保留，但不再是權威資料。

## Firestore 資料模型

```text
/groups/{groupId}
  name, lunchStart, lunchEnd, memberIds

/groups/{groupId}/members/{memberId}
  authUid, loginEmail, name, avatar, color, active

/groups/{groupId}/tokens/{tokenId}
  targetId, reporterId, status
  createdAt, confirmedAt, resolvedAt

/groups/{groupId}/reports/{tokenId}
  targetId, reporterId, timestamp
```

`reports` 是已確認 Token 的權威集合，文件 ID 必須等於來源 `tokenId`。畫面上的成員總數由 confirmed reports 即時計算，不讀取 `members.totalTokens` 作為權威值。

## 客戶端寫入流程

`frontend/src/services/tokenService.js` 是唯一 Token 寫入介面。每次寫入前都要求 `auth.currentUser.uid === currentMember.authUid`，且 API 不接受獨立的 reporter identity。

- `reportToken`：以 `addDoc` 建立 pending token，reporterId 只取自 `currentMember.id`。
- `resolveToken(..., action: 'reject')`：只更新 token 為 rejected，`resolvedAt` 使用 server timestamp。
- `resolveToken(..., action: 'confirm')`：讀取 pending token，使用單一 atomic batch 更新 token，並以 tokenId 建立對應 report。所有時間使用 server timestamp。
- 當 `currentMember` 或呼叫端已提供的 target member 資料顯示 `active: false` 時，本機先拒絕操作；Security Rules 仍是權威防線。

登入頁只顯示 active member。`useGroup` 仍保留完整 member 集合，讓統計與歷史畫面可以解析已離隊成員名稱。

正式 Vote/Pending 頁面不在本次 migration 範圍；服務與規則先建立供後續頁面使用。

## Security Rules

Rules 使用 `rules_version = '2'`：

- group、members、tokens、reports 保留公開讀取，支援登入前成員選擇。
- group、member、memberAuth 客戶端寫入全部拒絕。
- token create 僅允許已登入、active 且 UID 對應 reporter member 的使用者；target 也必須 active，欄位必須完全吻合、target 不同、狀態為 pending、時間為 `request.time`。
- token update 僅允許 active target member；原 reporter 與 target 都必須維持 active，身分與 createdAt 不可變。
- reject 必須是 pending → rejected，resolvedAt 為 `request.time`，且不存在 report。
- confirm 必須是 pending → confirmed，confirmedAt/resolvedAt 為 `request.time`，且同一次 atomic write 的 `getAfter` 可見完全吻合的 `reports/{tokenId}`。
- report 只能 create，必須與同批有效 confirmation 相符；禁止 update/delete。
- 其他寫入全部拒絕。

## 部署與 CI 計畫

目前不部署，也不新增 workflow。未來 GitHub Actions 只需要：

| Secret | 用途 |
|---|---|
| `FIREBASE_CONFIG` | Firebase Web config JSON，供 Vite build 產生 `VITE_FIREBASE_*` |
| `FIREBASE_SERVICE_ACCOUNT_DAZHUGONG_4F185` | Firebase Hosting Action 或 Google Auth 使用的 service-account JSON |

建議使用 Firebase Hosting GitHub Action 或 `google-github-actions/auth`。不使用已 deprecated 的 `firebase login:ci`/`FIREBASE_TOKEN`。

未來 pipeline 只執行 root tests、frontend tests/build、rules tests，以及部署 `hosting,firestore:rules`；不得包含 Functions install、test 或 deploy。

## 部署前必要條件

1. Firebase Console 啟用 Email/Password provider。
2. 使用私有 `scripts/members.local.json` 與 service account 執行 seed；必須先完成 active 欄位與 Auth 停用同步，再部署要求 `active: true` 的 Rules。
3. 設定完整 Firebase Web config。
4. 安裝 Java 21+ 後執行 Firestore Emulator rules tests。
5. 建立上述兩個 GitHub Secrets，再另行實作 CI。
