import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import LazyBoundary from '../components/LazyBoundary.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import PendingBanner from '../components/PendingBanner.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法同步首頁資料，請稍後再試。';
const loadPiggyBank3D = () => import('../components/PiggyBank3D.jsx');

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

function getSafeAccentStyle(color) {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
    return undefined;
  }

  return {
    borderColor: color,
    backgroundColor: `${color}14`,
  };
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

function compareMembers(left, right, currentMemberId) {
  const leftIsCurrent = left?.id === currentMemberId;
  const rightIsCurrent = right?.id === currentMemberId;

  if (leftIsCurrent && !rightIsCurrent) return -1;
  if (!leftIsCurrent && rightIsCurrent) return 1;

  const leftIsActive = left?.active === true;
  const rightIsActive = right?.active === true;

  if (leftIsActive && !rightIsActive) return -1;
  if (!leftIsActive && rightIsActive) return 1;

  const leftName = getMemberName(left).toLocaleLowerCase();
  const rightName = getMemberName(right).toLocaleLowerCase();

  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  if ((left?.id ?? '') < (right?.id ?? '')) return -1;
  if ((left?.id ?? '') > (right?.id ?? '')) return 1;
  return 0;
}

function buildMemberSummary(members, currentMemberId) {
  return members
    .map((member) => ({
      ...member,
    }))
    .sort((left, right) => compareMembers(left, right, currentMemberId));
}

function MemberSummaryCard({ member, emphasize = false }) {
  const tokenCountLabel = formatTokenCount(member.totalTokens ?? 0);
  const statusLabel = member.active === true ? '進行中' : '歷史成員';

  return (
    <li
      className={`rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-rose-100 ${
        emphasize ? 'min-w-[8.5rem]' : ''
      }`}
      aria-label={`${getMemberName(member)}，${statusLabel}，${tokenCountLabel}`}
    >
      <div className="flex items-center gap-3">
        <MemberAvatar member={member} size={emphasize ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{getMemberName(member)}</p>
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/70"
              style={member?.color ? { backgroundColor: member.color } : undefined}
            />
          </div>
          <p className="mt-1 text-xs font-medium text-slate-600">{statusLabel}</p>
        </div>
      </div>
      <div
        className="mt-4 rounded-[1.25rem] border px-3 py-2"
        style={getSafeAccentStyle(member?.color)}
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-600">已確認</p>
        <p className="mt-1 text-lg font-bold text-slate-950">{tokenCountLabel}</p>
      </div>
    </li>
  );
}

export default function Home() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);

  const memberSummary = useMemo(
    () => buildMemberSummary(members, currentMember?.id ?? null),
    [currentMember?.id, members],
  );
  const activeMembers = useMemo(() => memberSummary.filter((member) => member.active === true), [memberSummary]);
  const totalConfirmedTokens = useMemo(
    () =>
      memberSummary.reduce((sum, member) => sum + (Number.isFinite(member.totalTokens) ? member.totalTokens : 0), 0),
    [memberSummary],
  );

  const loading = groupLoading;
  const loadError = groupError;
  const hasMembers = memberSummary.length > 0;
  const hasReports = totalConfirmedTokens > 0;

  return (
    <section className="app-page bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PendingBanner />

        <section className="overflow-hidden rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">Lunch time</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">午餐禁聊公事罰金箱</h1>
          <p className="mt-3 text-base font-semibold text-slate-900">{`嗨，${getMemberName(currentMember)}`}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">中午先吃飯，公事晚點再說也可以。</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">輕鬆聊、慢慢吃，Token 就留給真的忍不住的人。</p>

          <div className="mt-5 rounded-[2rem] bg-slate-950 px-5 py-6 text-white shadow-lg shadow-slate-300">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-200">本期已確認</p>
            {loading ? (
              <div role="status" aria-live="polite" className="mt-3">
                <p className="text-2xl font-black">同步中…</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">正在同步午餐 Token 與成員名單。</p>
              </div>
            ) : loadError ? (
              <div role="alert" className="mt-3">
                <p className="text-2xl font-black">稍後再試</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">{SAFE_LOAD_ERROR_MESSAGE}</p>
              </div>
            ) : (
              <>
                <p className="mt-3 text-4xl font-black tracking-tight">{formatTokenCount(totalConfirmedTokens)}</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">只看已確認 reports，不顯示任何真實貨幣。</p>
              </>
            )}

            <div className="mt-5">
              {loading || loadError ? (
                <div
                  aria-hidden="true"
                  className="flex h-72 items-center justify-center rounded-[1.75rem] border border-white/15 bg-white/5 px-5 text-center text-sm font-semibold text-slate-300"
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
                      className="flex h-72 items-center justify-center rounded-[1.75rem] border border-white/15 bg-white/5 px-5 text-center text-sm font-semibold text-slate-100"
                    >
                      正在準備 3D 小豬…
                    </div>
                  )}
                  errorFallback={({ retry }) => <PiggyBankErrorFallback retry={retry} />}
                >
                  {(PiggyBank3D) => <PiggyBank3D members={memberSummary} />}
                </LazyBoundary>
              )}
            </div>
            <p className="mt-3 text-center text-xs leading-5 text-slate-300">
              左右拖曳可旋轉；代表物件會依成員 Token 顏色與數量呈現。
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              to="/vote"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              去投一票
            </Link>
            <Link
              to="/history"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-rose-800"
            >
              查看歷史紀錄
            </Link>
          </div>
        </section>

        {loading ? null : loadError ? null : !hasMembers ? (
          <section className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="text-lg font-semibold text-slate-900">午餐團隊還在集合中。</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">等第一位成員進來後，這裡就會開始顯示 Token 總覽。</p>
          </section>
        ) : (
          <>
            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">活躍成員</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">主視覺先顯示目前 active 成員的午餐戰況。</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {activeMembers.length} 人
                </span>
              </div>

              <ul
                aria-label="活躍成員 Token 摘要"
                className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1"
              >
                {activeMembers.map((member) => (
                  <MemberSummaryCard key={member.id} member={member} emphasize />
                ))}
              </ul>
            </section>

            {!hasReports ? (
              <section className="rounded-[2rem] border border-dashed border-emerald-200 bg-emerald-50 px-6 py-6 text-center text-emerald-950 shadow-sm">
                <p className="text-lg font-semibold">今天大家都很克制，還沒有人被記 Token。</p>
                <p className="mt-2 text-sm leading-6">第一票還沒出現，先好好吃飯最重要。</p>
              </section>
            ) : null}

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">成員 Token 總覽</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  所有成員都依已確認 reports 統計，inactive 只保留歷史身分標記。
                </p>
              </div>

              <ul aria-label="成員 Token 總覽" className="mt-4 space-y-3">
                {memberSummary.map((member) => (
                  <MemberSummaryCard key={member.id} member={member} />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </section>
  );
}
