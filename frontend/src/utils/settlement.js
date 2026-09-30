// 結算(Settlement)功能的純函式：Token數值換算成金額、產生結算預覽/快照用的成員明細。
// 對應「DaZhugong｜結算 Settlement Feature Spec」。
//
// 核心規則(spec section 2)：結算一律SUM tokenValue，不能COUNT筆數——一筆Special 5x
// 帳面價值是5、一筆自首0.5x帳面價值是0.5，兩者都不能被當成「1筆=1 Token」處理。
// tokenUnitPrice(目前固定NT$100)刻意不寫死在Token本身，而是在建立Settlement快照時
// 才乘進去、存成totalAmount/amount，這樣未來調整單價不會讓舊的Settlement重新算出
// 不同的金額(spec section 19)。
import { CONFESSION_TOKEN_TYPE, isSpecialTokenReport, reportTokenValue, SPECIAL_TOKEN_TYPE } from './specialToken.js';

export const TOKEN_UNIT_PRICE = 100;
export const SETTLEMENT_CURRENCY = 'TWD';

function isConfessionTokenReport(report) {
  return report?.tokenType === CONFESSION_TOKEN_TYPE;
}

// 只有「已確認且尚未被結算、也沒有進行中申訴」的report才可以進入本次Settlement
// (spec section 7/17)：pending/appealing的紀錄本來就不會出現在reports collection
// 裡(pending留在tokens collection、直到confirm才寫入reports)，唯一需要在這裡額外
// 排除的是「目前正在申訴中」(appealedAt有值)跟「已經被結算過」(settlementId有值)。
export function isSettleableReport(report) {
  if (!report || typeof report !== 'object') {
    return false;
  }
  if (report.settlementId) {
    return false;
  }
  if (report.appealedAt) {
    return false;
  }
  return true;
}

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未知成員';
}

// 依成員彙整每一筆report，拆成一般/特殊/自首三種桶子分別SUM筆數與tokenValue，
// 對應spec section 6「Member Detail」要展開顯示的組成明細。
export function buildSettlementMembers(reports, members) {
  const membersById = new Map((Array.isArray(members) ? members : []).map((member) => [member.id, member]));
  const buckets = new Map();

  for (const report of Array.isArray(reports) ? reports : []) {
    if (!isSettleableReport(report)) {
      continue;
    }

    const targetId = report?.targetId;
    if (typeof targetId !== 'string' || !targetId) {
      continue;
    }

    if (!buckets.has(targetId)) {
      buckets.set(targetId, {
        memberId: targetId,
        memberName: getMemberName(membersById.get(targetId)),
        normalCount: 0,
        specialCount: 0,
        confessionCount: 0,
        normalValue: 0,
        specialValue: 0,
        confessionValue: 0,
      });
    }

    const bucket = buckets.get(targetId);
    const value = reportTokenValue(report);

    if (isSpecialTokenReport(report)) {
      bucket.specialCount += 1;
      bucket.specialValue += value;
    } else if (isConfessionTokenReport(report)) {
      bucket.confessionCount += 1;
      bucket.confessionValue += value;
    } else {
      bucket.normalCount += 1;
      bucket.normalValue += value;
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const totalTokenValue = bucket.normalValue + bucket.specialValue + bucket.confessionValue;
      return {
        ...bucket,
        totalTokenValue,
        amount: totalTokenValue * TOKEN_UNIT_PRICE,
      };
    })
    .sort((left, right) => (
      right.totalTokenValue - left.totalTokenValue
      || left.memberName.localeCompare(right.memberName, 'zh-TW')
      || left.memberId.localeCompare(right.memberId)
    ));
}

// 本期結算預覽：preview跟真正建立Settlement快照共用同一套計算邏輯，避免「預覽算一套、
// 兌換又另外算一套」兩邊兜不起來。
export function buildSettlementPreview(reports, members, { tokenUnitPrice = TOKEN_UNIT_PRICE } = {}) {
  const settlementMembers = buildSettlementMembers(reports, members);
  const totalTokenValue = settlementMembers.reduce((sum, member) => sum + member.totalTokenValue, 0);

  return {
    tokenUnitPrice,
    currency: SETTLEMENT_CURRENCY,
    totalTokenValue,
    totalAmount: totalTokenValue * tokenUnitPrice,
    members: settlementMembers,
  };
}

// 金額顯示："NT$4,850"，Token數顯示去掉多餘的.0("48.5"、"13"而不是"13.0")。
export function formatAmount(amount, currency = SETTLEMENT_CURRENCY) {
  const value = Number.isFinite(amount) ? amount : 0;
  const prefix = currency === 'TWD' ? 'NT$' : `${currency} `;
  return `${prefix}${Math.round(value).toLocaleString('zh-TW')}`;
}

export function formatTokenValue(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function pad(number, length) {
  return String(number).padStart(length, '0');
}

// Settlement ID:「YYYYMMDD-序號」，序號是「這個群組今天已經有幾筆settlement」+1，
// 例如今天第一筆結算是#20260930-001。
export function getSettlementDateKey(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
}

export function buildSettlementId(date, sequence) {
  return `${getSettlementDateKey(date)}-${pad(sequence, 3)}`;
}

export function formatSettlementDisplayId(settlementId) {
  return settlementId ? `#${settlementId}` : '';
}
