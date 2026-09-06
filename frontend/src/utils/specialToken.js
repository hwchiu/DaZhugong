// 特殊Token(隱藏摩擦豬公彩蛋)的常數與純函式邏輯，對應開發規格書 section 27 的Server Config。
// 刻意不寫死在元件裡，方便之後要調整倍率/每日次數時只改這一個檔案。
//
// 這個app本身沒有獨立後端伺服器(Firebase Spark、前端直接讀寫Firestore)，
// 規格書裡「Server Config」「Summon API」等描述在這裡對應成：
// - 常數：這個檔案
// - Server端驗證：firestore.rules(拒絕篡改tokenValue、拒絕同一人同一天重複建立)
// - Summon session：不另外開一個collection存session，改成「摩擦達成後，直接連同
//   report一起寫入」，一次寫入原子完成，省去「session建立」「session核銷」兩段式的
//   額外一致性風險(這裡沒有伺服器可以幫忙做背景清理過期session)。

export const SPECIAL_TOKEN_MULTIPLIER = 5;
export const SPECIAL_TOKEN_TYPE = 'SPECIAL_5X';
export const NORMAL_TOKEN_TYPE = 'NORMAL';
export const SPECIAL_TOKEN_SOURCE = 'PIG_RUB_EASTER_EGG';
export const NORMAL_TOKEN_SOURCE = 'NORMAL_FLOW';
export const SPECIAL_TOKEN_SPIN_DURATION_MS = 1000;
export const SPECIAL_TOKEN_DAILY_LIMIT = 1;

// 一筆report換算成統計用的「Token數值」：新資料一律會有明確的tokenValue欄位，
// 但既有(這次功能上線之前)寫入的舊資料完全沒有這個欄位，對舊資料一律視為1，
// 這樣舊資料的統計結果不會因為這次改動而變動(spec沒有要求，但這是不破壞既有資料的必要做法)。
export function reportTokenValue(report) {
  const value = report?.tokenValue;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function isSpecialTokenReport(report) {
  return report?.tokenType === SPECIAL_TOKEN_TYPE;
}

// 「今天」的日期字串，用來源自本地瀏覽器時區(這個app本來就是純前端算時間，
// 沒有後端做時區轉換，跟其他統計頁面的日期計算方式一致)。
export function getTodayDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 每日限制的標記文件ID：決定性(deterministic)產生，同一人同一天算出來的ID一定一樣，
// 這樣firestore.rules才能單純用「這個ID的文件是否已經存在」來擋下第二次召喚，
// 不需要規則語言自己做複雜的日期運算或查詢比對。
export function buildSpecialTokenSummonMarkerId(groupId, reporterId, dateKey) {
  return `${groupId}__${reporterId}__${dateKey}`;
}

// 用「目前已經載入的reports清單」判斷今天是否已經召喚過一次——這是給前端UI
// 提早擋掉的判斷(讓摩擦偵測乾脆不要啟動、CTA直接disable)，真正的安全防線
// 是firestore.rules那邊的markerId唯一性，這裡只是提升使用者體驗、不做重複的網路請求。
export function hasSummonedSpecialTokenToday(reports, reporterId, now = new Date()) {
  if (!Array.isArray(reports) || !reporterId) {
    return false;
  }
  const todayKey = getTodayDateKey(now);
  return reports.some((report) => {
    if (report?.reporterId !== reporterId || !isSpecialTokenReport(report)) {
      return false;
    }
    const timestampMs = typeof report?.timestamp?.toMillis === 'function'
      ? report.timestamp.toMillis()
      : (report?.timestamp instanceof Date ? report.timestamp.getTime() : null);
    if (timestampMs == null) {
      return false;
    }
    return getTodayDateKey(new Date(timestampMs)) === todayKey;
  });
}
