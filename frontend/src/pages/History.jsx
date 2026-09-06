import { useMemo } from 'react';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入歷史紀錄，請稍後再試。';

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

function MemberLabel({ member }) {
  return (
    <span className="font-semibold text-slate-950">
      {getMemberName(member)}
      {member?.active === false ? (
        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">
          歷史成員
        </span>
      ) : null}
    </span>
  );
}

export default function History() {
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const { tokens, loading: tokensLoading, error: tokensError } = useTokens(groupId, 100);
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const rows = useMemo(
    () => tokens.slice().sort((left, right) => {
      const timeDifference = toMillis(right?.timestamp) - toMillis(left?.timestamp);
      if (timeDifference) return timeDifference;
      return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
    }),
    [tokens],
  );
  const loading = groupLoading || tokensLoading;
  const loadError = groupError || tokensError;

  return (
    <section className="app-page bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">DaZhugong</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">歷史紀錄</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">最近 100 筆已確認 Token，最新紀錄會排在最上方。</p>
        </header>

        {loading ? (
          <section role="status" aria-live="polite" className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="font-semibold text-slate-950">載入歷史紀錄中…</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">正在同步已確認的 Token。</p>
          </section>
        ) : loadError ? (
          <section role="alert" className="rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-5 text-rose-950">
            <p className="font-semibold">目前無法載入歷史紀錄</p>
            <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
          </section>
        ) : rows.length ? (
          <ol aria-label="已確認 Token 歷史紀錄" className="space-y-3">
            {rows.map((token) => {
              const reporter = membersById.get(token.reporterId);
              const target = membersById.get(token.targetId);

              return (
                <li key={token.id} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm shadow-rose-100">
                  <article>
                    <p className="text-base leading-7 text-slate-800">
                      <MemberLabel member={reporter} />
                      <span className="mx-2 text-slate-600">記給</span>
                      <MemberLabel member={target} />
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      原因：{typeof token.reason === 'string' && token.reason.trim() ? token.reason : '未填寫原因（舊版紀錄）'}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <time className="text-sm font-medium text-slate-700" dateTime={new Date(toMillis(token.timestamp)).toISOString()}>
                        {formatTimestamp(token.timestamp)}
                      </time>
                      <span className="shrink-0 rounded-full bg-slate-950 px-3 py-1 text-sm font-bold text-white">
                        1 Token
                      </span>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-9 text-center shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">目前還沒有已確認的 Token。</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">確認第一筆紀錄後，這裡就會顯示完整時間與成員。</p>
          </section>
        )}
      </div>
    </section>
  );
}
