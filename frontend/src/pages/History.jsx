import { useMemo, useState } from 'react';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { confirmAppeal, fileAppeal } from '../services/tokenService.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入歷史紀錄，請稍後再試。';
const SAFE_APPEAL_ERROR_MESSAGE = '這個操作暫時無法完成，請稍後再試。';
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
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const { tokens, loading: tokensLoading, error: tokensError } = useTokens(groupId, 100);
  const [pendingReportId, setPendingReportId] = useState('');
  const [actionError, setActionError] = useState('');
  // confirmDialog非null時顯示彈窗：{ type: 'file' | 'confirm', token }，
  // 記住是「對哪一筆紀錄」做動作，讓彈窗裡可以把那筆紀錄的內容代入顯示。
  const [confirmDialog, setConfirmDialog] = useState(null);
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

  async function handleFileAppeal(token) {
    if (pendingReportId) {
      return;
    }
    setActionError('');
    setPendingReportId(token.id);
    try {
      await fileAppeal({ groupId, reportId: token.id, currentMember });
    } catch {
      setActionError(SAFE_APPEAL_ERROR_MESSAGE);
    } finally {
      setPendingReportId('');
    }
  }

  async function handleConfirmAppeal(token) {
    if (pendingReportId) {
      return;
    }
    setActionError('');
    setPendingReportId(token.id);
    try {
      await confirmAppeal({ groupId, reportId: token.id, currentMember });
    } catch {
      setActionError(SAFE_APPEAL_ERROR_MESSAGE);
    } finally {
      setPendingReportId('');
    }
  }

  // 「申訴」「確認」按鈕不會直接動作，先開彈窗；真正送出是在彈窗按下「確定」之後。
  function openFileAppealDialog(token) {
    setConfirmDialog({ type: 'file', token });
  }

  function openConfirmAppealDialog(token) {
    setConfirmDialog({ type: 'confirm', token });
  }

  async function handleDialogConfirm() {
    if (!confirmDialog) {
      return;
    }
    const { type, token } = confirmDialog;
    setConfirmDialog(null);
    if (type === 'file') {
      await handleFileAppeal(token);
    } else {
      await handleConfirmAppeal(token);
    }
  }

  return (
    <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
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
          <>
            {actionError ? (
              <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950">
                {actionError}
              </p>
            ) : null}
            <ol aria-label="已確認 Token 歷史紀錄" className="space-y-3">
              {rows.map((token) => {
                const reporter = membersById.get(token.reporterId);
                const target = membersById.get(token.targetId);
                const isOwnRecord = token.targetId === currentMember?.id;
                const appealConfirmedBy = Array.isArray(token.appealConfirmedBy) ? token.appealConfirmedBy : [];
                const hasActiveAppeal = Boolean(token.appealedAt);
                const alreadyConfirmed = appealConfirmedBy.includes(currentMember?.id);
                const isBusy = pendingReportId === token.id;

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

                      {hasActiveAppeal ? (
                        <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3">
                          <p className="text-sm font-bold text-amber-900">
                            申訴中（{appealConfirmedBy.length}/{APPEAL_CONFIRMATIONS_REQUIRED} 人確認）
                          </p>
                          <p className="mt-1 text-xs leading-5 text-amber-800">
                            滿 {APPEAL_CONFIRMATIONS_REQUIRED} 人確認後，這筆紀錄會被移除。
                          </p>
                          {!isOwnRecord && !alreadyConfirmed ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openConfirmAppealDialog(token)}
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
                          onClick={() => openFileAppealDialog(token)}
                          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-2xl border-2 border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? '處理中…' : '申訴'}
                        </button>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-9 text-center shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">目前還沒有已確認的 Token。</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">確認第一筆紀錄後，這裡就會顯示完整時間與成員。</p>
          </section>
        )}
      </div>

      {confirmDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={confirmDialog.type === 'file' ? '確認提出申訴' : '確認這筆申訴'}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-slate-950">
              {confirmDialog.type === 'file' ? '確定要提出申訴嗎？' : '確定要確認這筆申訴嗎？'}
            </h2>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm leading-6 text-slate-800">
                <MemberLabel member={membersById.get(confirmDialog.token.reporterId)} />
                <span className="mx-2 text-slate-600">記給</span>
                <MemberLabel member={membersById.get(confirmDialog.token.targetId)} />
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                原因：{typeof confirmDialog.token.reason === 'string' && confirmDialog.token.reason.trim()
                  ? confirmDialog.token.reason
                  : '未填寫原因（舊版紀錄）'}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{formatTimestamp(confirmDialog.token.timestamp)}</p>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">
              {confirmDialog.type === 'file'
                ? `送出後，需要有其他 ${APPEAL_CONFIRMATIONS_REQUIRED} 位成員確認，這筆紀錄才會被移除。`
                : `滿 ${APPEAL_CONFIRMATIONS_REQUIRED} 人確認後，這筆紀錄會被移除，此動作無法復原。`}
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDialogConfirm}
                className={`flex-1 rounded-2xl py-3 text-sm font-bold text-white transition ${
                  confirmDialog.type === 'file' ? 'bg-slate-950 hover:bg-slate-800' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
