// 冷卻時間完全是從既有的reports資料「推算」出來的，不需要新的欄位、不需要改Firestore結構：
// 「某成員最近一次被記錄的時間」本來就是reports collection裡已經有的timestamp，
// 冷卻中與否只是拿現在時間跟這個時間戳比較，純前端計算。
export const COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5分鐘

function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// 找出某成員「最近一次被記錄」的時間戳(毫秒)；這個成員完全沒被記錄過就回傳null。
export function getLastReportedAt(reports, memberId) {
  if (!Array.isArray(reports) || !memberId) {
    return null;
  }

  let latest = null;
  for (const report of reports) {
    if (report?.targetId !== memberId) {
      continue;
    }
    const ms = toMillis(report.timestamp);
    if (ms > 0 && (latest === null || ms > latest)) {
      latest = ms;
    }
  }
  return latest;
}

// 算出某成員在指定時間點(nowMs，預設現在)的冷卻狀態。
// 冷卻是「每個成員各自獨立」的：這裡只看targetId==memberId的紀錄，
// 牛哥被記錄不會影響阿龍的冷卻狀態，兩個人的計算完全獨立互不干擾。
export function getCooldownStatus(reports, memberId, nowMs = Date.now()) {
  const lastReportedAt = getLastReportedAt(reports, memberId);

  if (lastReportedAt === null) {
    return { inCooldown: false, remainingMs: 0, expiresAt: null };
  }

  const expiresAt = lastReportedAt + COOLDOWN_DURATION_MS;
  const remainingMs = expiresAt - nowMs;

  if (remainingMs <= 0) {
    return { inCooldown: false, remainingMs: 0, expiresAt };
  }

  return { inCooldown: true, remainingMs, expiresAt };
}

// 把剩餘毫秒數格式化成「分:秒」給倒數計時器UI用，例如 4:32、0:07。
export function formatCooldownRemaining(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
