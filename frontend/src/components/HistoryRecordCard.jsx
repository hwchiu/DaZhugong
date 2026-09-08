import MemberAvatar from './MemberAvatar.jsx';
import { isSpecialTokenReport, reportTokenValue } from '../utils/specialToken.js';

const APPEAL_CONFIRMATIONS_REQUIRED = 3;

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未知成員';
}

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

function formatTimestamp(timestamp) {
  const millis = toMillis(timestamp);
  if (!millis) {
    return '時間稍後同步';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(millis));
}

// 歷史紀錄的單筆卡片，History.jsx的三個Scope(全部/近三天/我被投票)都是用同一份卡片，
// 差別只在`perspective`這個prop——這是這次改版的重點之一：不要把「全部」跟「我被投票」
// 兩套不同文案/邏輯的卡片各自維護一份，而是同一份卡片依情境切換敘述方式。
//
// 頭像固定顯示「被投票成員」(target)的頭像，不是記錄者(reporter)的——這是使用者在附圖裡
// 明確標注的需求：不管是哪個Scope，卡片最前面看到的臉，永遠是「這筆Token算在誰頭上」，
// 「誰投的」只出現在文字裡。在「我被投票」這個Scope底下，target固定是自己，所以每張卡片
// 前面看到的都會是自己的頭像——這是預期行為，不是bug，用意是同一套視覺語言不因Scope而變。
//
// 申訴按鈕的domain rule(這次改版明確要求的重點)：只有「target === 目前登入者」的紀錄
// 才可能顯示「申訴」——「牛哥投給房產大亨」這種別人投給別人的紀錄，不管在哪個Scope下
// 顯示，都不會有申訴按鈕，因為這不是你的紀錄。
export default function HistoryRecordCard({
  token,
  reporter,
  target,
  currentMember,
  perspective = 'general',
  isBusy,
  onFileAppeal,
  onConfirmAppeal,
}) {
  const isOwnRecord = token.targetId === currentMember?.id;
  const appealConfirmedBy = Array.isArray(token.appealConfirmedBy) ? token.appealConfirmedBy : [];
  const hasActiveAppeal = Boolean(token.appealedAt);
  const alreadyConfirmed = appealConfirmedBy.includes(currentMember?.id);
  const isSpecial = isSpecialTokenReport(token);
  const tokenValue = reportTokenValue(token);
  const reasonText = typeof token.reason === 'string' && token.reason.trim() ? token.reason : '未填寫原因（舊版紀錄）';

  return (
    <li
      className={`rounded-[1.75rem] border p-5 shadow-sm ${
        isSpecial ? 'border-rose-300 bg-gradient-to-br from-rose-50 to-amber-50 shadow-rose-200' : 'border-slate-200 bg-white shadow-rose-100'
      }`}
    >
      <article className="flex gap-3">
        <MemberAvatar member={target} size="sm" />

        <div className="min-w-0 flex-1">
          {isSpecial ? (
            <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">
              <span aria-hidden="true">⭐</span> 特殊 5x
            </p>
          ) : null}

          <p className="text-base leading-7 text-slate-800">
            <span className="font-semibold text-slate-950">
              {getMemberName(reporter)}
              {reporter?.active === false ? (
                <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">歷史成員</span>
              ) : null}
            </span>
            <span className="mx-2 text-slate-600">投給</span>
            {perspective === 'votedAgainstMe' ? (
              <span className="font-semibold text-slate-950">我</span>
            ) : (
              <span className="font-semibold text-slate-950">
                {getMemberName(target)}
                {target?.active === false ? (
                  <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">歷史成員</span>
                ) : null}
              </span>
            )}
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-600">原因：{reasonText}</p>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <time className="text-sm font-medium text-slate-700" dateTime={new Date(toMillis(token.timestamp)).toISOString()}>
              {formatTimestamp(token.timestamp)}
            </time>
            <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold text-white ${isSpecial ? 'bg-rose-600' : 'bg-slate-950'}`}>
              +{tokenValue}
            </span>
          </div>

          {hasActiveAppeal ? (
            <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3">
              <p className="text-sm font-bold text-amber-900">
                申訴中（{appealConfirmedBy.length}/{APPEAL_CONFIRMATIONS_REQUIRED} 人確認）
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-800">滿 {APPEAL_CONFIRMATIONS_REQUIRED} 人確認後，這筆紀錄會被移除。</p>
              {!isOwnRecord && !alreadyConfirmed ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onConfirmAppeal(token)}
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-2xl bg-amber-600 px-4 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBusy ? '處理中…' : '確認'}
                </button>
              ) : alreadyConfirmed ? (
                <p className="mt-3 text-xs font-semibold text-amber-700">你已經確認過這筆申訴。</p>
              ) : null}
            </div>
          ) : isOwnRecord ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onFileAppeal(token)}
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-2xl border-2 border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? '處理中…' : '申訴'}
            </button>
          ) : null}
        </div>
      </article>
    </li>
  );
}
