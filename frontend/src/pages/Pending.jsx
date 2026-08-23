import { useEffect, useMemo, useState } from 'react';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { usePending } from '../hooks/usePending.js';
import { resolveToken } from '../services/tokenService.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入待確認項目，請稍後再試。';
const SAFE_RESOLVE_ERROR_MESSAGE = '目前無法更新這筆待確認，請再試一次。';

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

function toMillis(timestamp) {
  if (!timestamp) {
    return 0;
  }

  if (typeof timestamp === 'number') {
    return timestamp;
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  if (typeof timestamp.toMillis === 'function') {
    return timestamp.toMillis();
  }

  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCreatedAt(timestamp) {
  const millis = toMillis(timestamp);

  if (!millis) {
    return '時間稍後同步';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(millis));
}

export default function Pending() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { pending, loading: pendingLoading, error: pendingError } = usePending(groupId, currentMember?.id ?? null);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const [resolving, setResolving] = useState(null);
  const [feedback, setFeedback] = useState({ tone: null, message: '' });

  const membersById = useMemo(
    () =>
      new Map(
        members.map((member) => [member.id, member]),
      ),
    [members],
  );
  const loading = pendingLoading || groupLoading;
  const loadError = pendingError || groupError;

  useEffect(() => {
    if (feedback.tone !== 'success' || !feedback.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback((current) => (current.tone === 'success' ? { tone: null, message: '' } : current));
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  async function handleResolve(token, action) {
    if (!groupId || !currentMember || resolving) {
      return;
    }

    if (token?.targetId !== currentMember.id) {
      return;
    }

    setResolving({ tokenId: token.id, action });
    setFeedback({ tone: null, message: '' });

    try {
      await resolveToken({
        groupId,
        tokenId: token.id,
        action,
        currentMember,
      });
      setFeedback({
        tone: 'success',
        message: action === 'confirm'
          ? '已送出確認，+1 Token 會在同步後生效。'
          : '已送出駁回，待確認清單會在同步後更新。',
      });
    } catch {
      setFeedback({
        tone: 'error',
        message: SAFE_RESOLVE_ERROR_MESSAGE,
      });
    } finally {
      setResolving(null);
    }
  }

  return (
    <section className="app-page bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <section className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-rose-400">DaZhugong</p>
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="text-3xl leading-none">
              ⚠️
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">待確認</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">只有被點名的成員能確認或駁回這些待確認的一票。</p>
            </div>
          </div>
        </section>

        {feedback.message ? (
          <section
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
            className={`rounded-[1.75rem] px-5 py-4 text-sm font-medium shadow-sm ${
              feedback.tone === 'error'
                ? 'border border-rose-200 bg-rose-50 text-rose-900'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {feedback.message}
          </section>
        ) : null}

        {loading ? (
          <section
            role="status"
            aria-live="polite"
            className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100"
          >
            <p className="text-base font-semibold text-slate-900">載入待確認項目中…</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">正在同步誰送出了待確認的一票，以及目前可操作的項目。</p>
          </section>
        ) : loadError ? (
          <section role="alert" className="rounded-[2rem] border border-rose-200 bg-rose-50 px-6 py-5 text-rose-900 shadow-sm">
            <p className="text-base font-semibold">目前無法載入待確認項目</p>
            <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
          </section>
        ) : pending.length ? (
          <section className="flex flex-col gap-4" aria-label="待確認清單">
            {pending.map((token) => {
              const reporter = membersById.get(token.reporterId) ?? null;
              const reporterName = getMemberName(reporter);
              const accentColor = reporter?.color ?? '#f472b6';
              const canResolve = Boolean(currentMember?.id) && currentMember.id === token.targetId;
              const disabled = Boolean(resolving) || !canResolve;

              return (
                <article
                  key={token.id}
                  className="rounded-[2rem] border bg-white p-5 shadow-lg shadow-rose-100"
                  style={{ borderColor: `${accentColor}55` }}
                >
                  <div className="flex items-start gap-4">
                    <MemberAvatar member={reporter ?? { name: reporterName }} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">{reporterName}</h2>
                        <span
                          className="rounded-full border px-3 py-1 text-xs font-semibold text-slate-800"
                          style={{ backgroundColor: `${accentColor}20`, borderColor: `${accentColor}55` }}
                        >
                          送票人
                        </span>
                        {reporter?.active === false ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            曾經送出待確認的一票
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">建立時間：{formatCreatedAt(token.createdAt)}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        確認後會替自己正式 +1 Token；若資訊不正確，可以直接駁回。
                      </p>
                      {!canResolve ? (
                        <p className="mt-2 text-sm font-medium text-amber-900">只有被點名的成員可以處理這筆待確認。</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleResolve(token, 'confirm')}
                      className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
                    >
                      {resolving?.tokenId === token.id && resolving?.action === 'confirm' ? '確認中…' : '確認 +1 Token'}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleResolve(token, 'reject')}
                      className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      {resolving?.tokenId === token.id && resolving?.action === 'reject' ? '駁回中…' : '駁回'}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p aria-hidden="true" className="text-4xl leading-none">
              🎉
            </p>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">目前沒有待確認的一票，太棒了！</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">等有人送出待確認的一票時，這裡會自動更新。</p>
          </section>
        )}
      </div>
    </section>
  );
}
