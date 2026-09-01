import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import DateWeatherBar from '../components/DateWeatherBar.jsx';
import GoalTokenControl from '../components/GoalTokenControl.jsx';
import LazyBoundary from '../components/LazyBoundary.jsx';
import PendingBanner from '../components/PendingBanner.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法同步首頁資料，請稍後再試。';
const loadPiggyBank3D = () => import('../components/PiggyBank3D.jsx');

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

function formatTokenCount(count) {
  return `${count} Token`;
}

function PiggyBankErrorFallback({ retry }) {
  return (
    <div
      role="alert"
      className="flex h-72 flex-col items-center justify-center rounded-[1.75rem] border border-white/15 bg-white/5 px-5 text-center text-slate-100"
    >
      <span role="img" aria-label="3D 小豬暫時無法顯示" className="text-6xl">
        🐷
      </span>
      <p className="mt-4 text-base font-semibold">3D 小豬暫時無法顯示</p>
      <p className="mt-2 text-sm leading-6 text-slate-200">先看總 Token 與成員列表，稍後可以重新載入小豬模型。</p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        重試 3D 小豬
      </button>
    </div>
  );
}

export default function Home() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);

  const totalConfirmedTokens = useMemo(
    () => members.reduce((sum, member) => sum + (Number.isFinite(member.totalTokens) ? member.totalTokens : 0), 0),
    [members],
  );

  const loading = groupLoading;
  const loadError = groupError;

  return (
    <section className="home-hero flex flex-col bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 px-4 text-amber-50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 overflow-hidden">
        <PendingBanner />

        <section className="flex flex-1 flex-col overflow-hidden rounded-[2rem] border border-amber-200/10 bg-stone-900/60 p-5 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between gap-3">
            <DateWeatherBar />
            <Link
              to="/history"
              className="shrink-0 rounded-full border border-amber-200/20 px-3 py-1 text-xs font-semibold text-amber-200/80 transition hover:border-amber-200/50 hover:text-amber-100"
            >
              歷史紀錄 ›
            </Link>
          </div>

          <p className="mt-3 truncate text-sm font-medium text-amber-100/80">{`嗨，${getMemberName(currentMember)}，午餐禁聊公事罰金箱`}</p>

          <div className="mt-2 flex flex-1 flex-col items-center justify-center">
            {loading || loadError ? (
              <div
                aria-hidden="true"
                className="flex h-72 w-full items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/5 px-5 text-center text-sm font-semibold text-amber-100/70"
              >
                小豬撲滿會在資料同步後出現
              </div>
            ) : (
              <LazyBoundary
                loader={loadPiggyBank3D}
                loadingFallback={(
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex h-72 w-full items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/5 px-5 text-center text-sm font-semibold text-amber-50"
                  >
                    正在準備 3D 小豬…
                  </div>
                )}
                errorFallback={({ retry }) => <PiggyBankErrorFallback retry={retry} />}
              >
                {(PiggyBank3D) => <PiggyBank3D members={members} />}
              </LazyBoundary>
            )}
          </div>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-amber-200/10 pt-4">
            {loading ? (
              <div role="status" aria-live="polite">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/70">本期已確認</p>
                <p className="mt-1 text-2xl font-black">同步中…</p>
              </div>
            ) : loadError ? (
              <div role="alert">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/70">本期已確認</p>
                <p className="mt-1 text-lg font-black">{SAFE_LOAD_ERROR_MESSAGE}</p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/70">本期已確認</p>
                <p className="mt-1 text-4xl font-black tracking-tight">{formatTokenCount(totalConfirmedTokens)}</p>
              </div>
            )}

            {!loading && !loadError ? (
              <GoalTokenControl groupId={groupId} totalTokens={totalConfirmedTokens} />
            ) : null}
          </div>
        </section>

        <Link
          to="/vote"
          className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-amber-400 text-base font-bold tracking-wide text-stone-950 shadow-lg shadow-black/30 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-amber-200"
        >
          投 Token
        </Link>
      </div>
    </section>
  );
}
