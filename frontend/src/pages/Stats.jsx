import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LazyBoundary from '../components/LazyBoundary.jsx';
import LunchTimeHeatmap from '../components/LunchTimeHeatmap.jsx';
import { useAuthStore } from '../store/authStore.js';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { buildGroupStatisticsDashboard, buildStatisticsDashboard } from '../utils/statisticsDashboard.js';
import { clampPeriodOffset } from '../utils/statisticsPeriod.js';

const SAFE_LOAD_ERROR_MESSAGE = '統計資料載入失敗，請稍後再試。';
const loadDailyTokenLineChart = () => import('../components/DailyTokenLineChart.jsx');
const loadReasonDonutChart = () => import('../components/ReasonDonutChart.jsx');
const loadPiggyBank3D = () => import('../components/PiggyBank3D.jsx');

const SCOPE_OPTIONS = [
  { value: 'personal', label: '個人統計' },
  { value: 'group', label: '全員統計' },
];

const PERIOD_OPTIONS = [
  { value: 'week', label: '本週' },
  { value: 'month', label: '本月' },
  { value: 'all', label: '全部' },
];

function formatChangeRate(changeRate, periodType) {
  if (periodType === 'all' || changeRate === null) {
    return { text: '—', tone: 'neutral' };
  }
  const previousLabel = periodType === 'month' ? '上月' : '上週';
  if (changeRate === 0) {
    return { text: `與${previousLabel}持平`, tone: 'neutral' };
  }
  const arrow = changeRate > 0 ? '↑' : '↓';
  return {
    text: `較${previousLabel} ${arrow} ${Math.abs(changeRate).toFixed(1)}%`,
    tone: changeRate > 0 ? 'up' : 'down',
  };
}

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

export default function Stats() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  // 拿全部reports(不是只拿最近幾筆)：本月/全部這兩個期間、以及「跟上一期比較」都需要
  // 回溯比目前畫面看得到的期間更早的資料，用有限筆數的分頁在這裡反而會算錯。
  const { tokens: reports, loading: tokensLoading, error: tokensError } = useTokens(groupId, 'all');
  const { members, loading: membersLoading, error: membersError } = useGroup(groupId);
  const [scope, setScope] = useState('personal');
  const [periodType, setPeriodType] = useState('week');
  const [periodOffset, setPeriodOffset] = useState(0);

  const loading = tokensLoading || (scope === 'group' && membersLoading);
  const error = tokensError || (scope === 'group' ? membersError : null);

  const personalDashboard = useMemo(
    () => buildStatisticsDashboard({
      reports,
      currentMemberId: currentMember?.id,
      periodType,
      periodOffset,
    }),
    [reports, currentMember?.id, periodType, periodOffset],
  );

  const groupDashboard = useMemo(
    () => buildGroupStatisticsDashboard({
      reports,
      members,
      periodType,
      periodOffset,
    }),
    [reports, members, periodType, periodOffset],
  );

  const dashboard = scope === 'group' ? groupDashboard : personalDashboard;

  // 迷你3D豬公要看的是「這個時段的數字」，不是成員的Firestore終身累計totalTokens，
  // 所以這裡另外組一份「假的members陣列」餵給PiggyBank3D，totalTokens換成當前期間算出來的數字。
  const piggyMembers = scope === 'group'
    ? groupDashboard.memberContributions.map((c) => ({ id: c.memberId, name: c.name, color: c.color, totalTokens: c.tokenCount }))
    : [{
      id: currentMember?.id ?? 'self',
      name: getMemberName(currentMember),
      color: currentMember?.color,
      totalTokens: personalDashboard.summary.currentTokenCount,
    }];

  function handleSelectScope(nextScope) {
    setScope(nextScope);
  }

  function handleSelectPeriod(nextType) {
    setPeriodType(nextType);
    setPeriodOffset(0);
  }

  function handleStepPeriod(direction) {
    setPeriodOffset((current) => clampPeriodOffset(current + direction));
  }

  const change = formatChangeRate(dashboard.summary.changeRate, periodType);
  const changeToneClass = change.tone === 'up' ? 'text-rose-600' : change.tone === 'down' ? 'text-emerald-600' : 'text-slate-500';
  const canStepForward = periodType !== 'all' && periodOffset < 0;
  const periodNoun = periodType === 'week' ? '本週' : periodType === 'month' ? '本月' : '累計';
  const scopeNoun = scope === 'group' ? '全員' : '';

  return (
    <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-brand text-sm font-semibold uppercase tracking-[0.3em]">DaZhugong</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">午餐聊公事統計</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {scope === 'group' ? '全體成員的午餐聊公事總覽。' : '只會顯示你自己的午餐聊公事紀錄，不需要另外選人。'}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-sm shadow-rose-100" role="tablist" aria-label="統計範圍">
          {SCOPE_OPTIONS.map((option) => {
            const active = scope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelectScope(option.value)}
                className={`min-h-10 rounded-full text-sm font-bold transition ${
                  active ? 'bg-brand-gradient text-white' : 'text-slate-600'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-sm shadow-rose-100" role="tablist" aria-label="統計期間">
          {PERIOD_OPTIONS.map((option) => {
            const active = periodType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelectPeriod(option.value)}
                className={`min-h-10 rounded-full text-sm font-bold transition ${
                  active ? 'bg-brand-gradient text-white' : 'text-slate-600'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {periodType !== 'all' ? (
          <div className="flex items-center justify-center gap-4 text-sm font-bold text-slate-700">
            <button
              type="button"
              aria-label="上一個期間"
              onClick={() => handleStepPeriod(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-sm shadow-rose-100"
            >
              ‹
            </button>
            <span>{dashboard.period.label}</span>
            <button
              type="button"
              aria-label="下一個期間"
              disabled={!canStepForward}
              onClick={() => handleStepPeriod(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-sm shadow-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ›
            </button>
          </div>
        ) : null}

        {loading ? (
          <section role="status" aria-live="polite" className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="font-semibold text-slate-950">載入統計中…</p>
            <p className="mt-2 text-sm text-slate-700">正在同步{scopeNoun}午餐聊公事紀錄。</p>
          </section>
        ) : error ? (
          <section role="alert" className="rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-5 text-rose-950">
            <p className="font-semibold">統計資料載入失敗</p>
            <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
          </section>
        ) : dashboard.isEmpty ? (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-9 text-center shadow-sm">
            <p aria-hidden="true" className="text-3xl">🎉</p>
            <h2 className="mt-2 text-lg font-bold text-slate-950">這段期間沒有聊公事！</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">午餐就是午餐，保持得很好～</p>
            <Link
              to="/"
              className="bg-brand-gradient mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl px-5 text-sm font-bold text-white"
            >
              返回首頁
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div className="flex items-center gap-4">
                <LazyBoundary
                  loader={loadPiggyBank3D}
                  loadingFallback={(
                    <div role="status" aria-label="準備豬公中" className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-slate-100" />
                  )}
                  errorFallback={() => (
                    <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-rose-50 text-3xl">🐷</span>
                  )}
                >
                  {(PiggyBank3DLazy) => <PiggyBank3DLazy members={piggyMembers} size="compact" />}
                </LazyBoundary>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-600">
                    {periodNoun}{scopeNoun}午餐聊公事 Token 總數
                  </p>
                  <p className="mt-1 text-4xl font-black tracking-tight text-slate-950">
                    {dashboard.summary.currentTokenCount}
                    <span className="ml-1 text-base font-bold text-slate-600">枚</span>
                  </p>
                  <p className={`mt-1 text-sm font-bold ${changeToneClass}`}>{change.text}</p>
                </div>
              </div>
              <div className="bg-brand-soft mt-4 rounded-2xl px-4 py-3 text-xs leading-5 text-slate-700">
                午餐時間專心吃飯，工作留給工作時間！一起守護午餐時光 🍱
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <h2 className="text-lg font-bold text-slate-950">每日 Token 投入趨勢</h2>
              <LazyBoundary
                loader={loadDailyTokenLineChart}
                loadingFallback={(
                  <div role="status" className="mt-4 flex h-56 items-center justify-center rounded-2xl bg-slate-50 text-sm font-semibold text-slate-700">
                    準備趨勢圖表中…
                  </div>
                )}
                errorFallback={() => (
                  <div role="alert" className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
                    <p className="font-semibold text-slate-950">趨勢圖表暫時無法顯示</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">請先參考下方原因統計。</p>
                  </div>
                )}
              >
                {(DailyTokenLineChart) => (
                  <DailyTokenLineChart data={dashboard.dailyTrend} brandColor="var(--brand-500)" />
                )}
              </LazyBoundary>
            </section>

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <h2 className="text-lg font-bold text-slate-950">聊公事原因分布</h2>
              <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="sm:w-40 sm:shrink-0">
                  <LazyBoundary
                    loader={loadReasonDonutChart}
                    loadingFallback={(
                      <div role="status" className="flex h-40 items-center justify-center rounded-2xl bg-slate-50 text-xs font-semibold text-slate-700">
                        準備圖表中…
                      </div>
                    )}
                    errorFallback={() => (
                      <div role="alert" className="flex h-40 items-center justify-center rounded-2xl bg-slate-50 px-3 text-center text-xs font-semibold text-slate-700">
                        圖表暫時無法顯示
                      </div>
                    )}
                  >
                    {(ReasonDonutChart) => (
                      <ReasonDonutChart data={dashboard.reasonDistribution} total={dashboard.summary.currentTokenCount} />
                    )}
                  </LazyBoundary>
                </div>
                <ul aria-label="聊公事原因圖例" className="flex-1 space-y-2">
                  {dashboard.reasonDistribution.map((row) => (
                    <li key={row.reasonId} className="flex items-center gap-2 text-sm">
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{row.reasonName}</span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-950">{row.tokenCount} 枚</span>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold text-slate-500">{row.percentage}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <h2 className="text-lg font-bold text-slate-950">聊公事原因統計</h2>
              <ul aria-label="聊公事原因統計" className="mt-4 space-y-3">
                {dashboard.reasonDistribution.map((row) => (
                  <li key={row.reasonId} className="rounded-[1.5rem] border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 font-bold text-slate-950">
                        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                        <span className="truncate">{row.reasonName}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-slate-700">
                        {row.tokenCount} 枚（{row.percentage}%）
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{ width: `${row.progress * 100}%`, backgroundColor: row.color }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">
                        {row.eventCount} 次・{row.averagePerEvent} 枚/次
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <h2 className="text-lg font-bold text-slate-950">使用時段分析</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">只聚焦午餐時間三個時段，非全天分析。</p>
              <div className="mt-4">
                <LunchTimeHeatmap heatmap={dashboard.lunchTimeHeatmap} />
              </div>
            </section>

            {scope === 'group' ? (
              <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
                <h2 className="text-lg font-bold text-slate-950">成員貢獻 Top {groupDashboard.memberContributions.length}</h2>
                <ol aria-label="成員貢獻排名" className="mt-4 space-y-3">
                  {groupDashboard.memberContributions.map((contribution, index) => (
                    <li key={contribution.memberId} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold text-slate-950">{contribution.name}</span>
                      <div className="h-2 w-16 shrink-0 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${(contribution.tokenCount / groupDashboard.memberContributions[0].tokenCount) * 100}%`,
                            backgroundColor: contribution.color ?? 'var(--brand-500)',
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-sm font-black tabular-nums text-slate-950">{contribution.tokenCount} 枚</span>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold text-slate-500">{contribution.percentage}%</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
