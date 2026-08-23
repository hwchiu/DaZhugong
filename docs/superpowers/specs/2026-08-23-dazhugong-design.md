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

1. 在任何寫入前讀取所有既有 member 文件，確認 `authUid` 不變。
2. 由穩定 `authUid` 衍生 synthetic email，由 `authUid` 與 PIN 衍生 Firebase password。
3. Auth user 不存在時建立；存在時更新 email、display name 與 password，讓 PIN 變更可重跑 seed 生效。
4. 以 transaction 建立或 merge member 文件，再次檢查 `authUid`，避免 preflight 後的競態覆寫。
5. 不寫入 `memberAuth`；舊環境若仍有此 collection，Security Rules 永久 deny-all。

公開 member 文件只包含：

```text
authUid, loginEmail, name, avatar, color
```

不得包含 PIN、hash 或 password。舊 `totalTokens` 欄位可保留，但不再是權威資料。

## Firestore 資料模型

```text
/groups/{groupId}
  name, lunchStart, lunchEnd, memberIds

/groups/{groupId}/members/{memberId}
  authUid, loginEmail, name, avatar, color

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

正式 Vote/Pending 頁面不在本次 migration 範圍；服務與規則先建立供後續頁面使用。

## Security Rules

Rules 使用 `rules_version = '2'`：

- group、members、tokens、reports 保留公開讀取，支援登入前成員選擇。
- group、member、memberAuth 客戶端寫入全部拒絕。
- token create 僅允許已登入且 UID 對應 reporter member 的使用者；欄位必須完全吻合、target 存在且不同、狀態為 pending、時間為 `request.time`。
- token update 僅允許 target member；身分與 createdAt 不可變。
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
2. 使用私有 `scripts/members.local.json` 與 service account 執行 seed。
3. 設定完整 Firebase Web config。
4. 安裝 Java 21+ 後執行 Firestore Emulator rules tests。
5. 建立上述兩個 GitHub Secrets，再另行實作 CI。
