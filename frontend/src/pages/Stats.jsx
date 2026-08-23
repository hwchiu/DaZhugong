import { lazy, Suspense, useMemo } from 'react';
import { useGroup } from '../hooks/useGroup.js';
import { useAuthStore } from '../store/authStore.js';

const StatsPieChart = lazy(() => import('../components/StatsPieChart.jsx'));
const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入統計，請稍後再試。';
const FALLBACK_COLORS = ['#ec4899', '#0ea5e9', '#f97316', '#14b8a6', '#8b5cf6'];

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

function getTokenCount(member) {
  return Number.isFinite(member?.totalTokens) && member.totalTokens > 0
    ? Math.floor(member.totalTokens)
    : 0;
}

function getSafeColor(color, index) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
    ? color
    : FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export default function Stats() {
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading, error } = useGroup(groupId);
  const ranking = useMemo(
    () => members
      .map((member, index) => ({
        ...member,
        totalTokens: getTokenCount(member),
        chartColor: getSafeColor(member?.color, index),
      }))
      .sort((left, right) => (
        right.totalTokens - left.totalTokens
        || getMemberName(left).localeCompare(getMemberName(right), 'zh-TW')
        || String(left.id).localeCompare(String(right.id))
      )),
    [members],
  );
  const totalTokens = useMemo(
    () => ranking.reduce((sum, member) => sum + member.totalTokens, 0),
    [ranking],
  );
  const chartData = useMemo(
    () => ranking
      .filter((member) => member.totalTokens > 0)
      .map((member) => ({
        id: member.id,
        name: getMemberName(member),
        value: member.totalTokens,
        color: member.chartColor,
        inactive: member.active === false,
      })),
    [ranking],
  );

  return (
    <section className="app-page bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">DaZhugong</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">統計</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">依已確認 reports 彙整，歷史成員也會保留在排名中。</p>
        </header>

        {loading ? (
          <section role="status" aria-live="polite" className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="font-semibold text-slate-950">載入統計中…</p>
            <p className="mt-2 text-sm text-slate-700">正在同步成員 Token 總數。</p>
          </section>
        ) : error ? (
          <section role="alert" className="rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-5 text-rose-950">
            <p className="font-semibold">目前無法載入統計</p>
            <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
          </section>
        ) : !ranking.length ? (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-9 text-center shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">目前還沒有可統計的 Token 資料。</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">成員與已確認紀錄同步後，這裡會出現總覽。</p>
          </section>
        ) : (
          <>
            <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-lg shadow-slate-300">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-200">累計已確認</p>
              <p className="mt-3 text-4xl font-black tracking-tight">{totalTokens} Token</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">Token 只代表群組紀錄，不代表任何真實貨幣。</p>
            </section>

            {chartData.length ? (
              <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100" aria-labelledby="distribution-heading">
                <h2 id="distribution-heading" className="text-lg font-bold text-slate-950">成員占比</h2>
                <p className="mt-1 text-sm leading-6 text-slate-700">圓餅顏色只用於大型視覺區分，精確數值請查看下方排名。</p>
                <Suspense
                  fallback={<div role="status" className="mt-4 flex h-64 items-center justify-center rounded-2xl bg-slate-50 text-sm font-semibold text-slate-700">準備統計圖表中…</div>}
                >
                  <StatsPieChart data={chartData} total={totalTokens} />
                </Suspense>
              </section>
            ) : (
              <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-7 text-center">
                <p className="font-semibold text-slate-950">目前所有成員都是 0 Token。</p>
              </section>
            )}

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <h2 className="text-lg font-bold text-slate-950">排名</h2>
              <ol aria-label="成員 Token 排名" className="mt-4 space-y-3">
                {ranking.map((member, index) => (
                  <li key={member.id} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                      {index + 1}
                    </span>
                    <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border-2 border-white shadow ring-1 ring-slate-300" style={{ backgroundColor: member.chartColor }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-slate-950">{getMemberName(member)}</span>
                      <span className="block text-xs font-semibold text-slate-700">
                        {member.active === false ? '歷史成員' : '進行中'}
                      </span>
                    </span>
                    <span className="shrink-0 font-black tabular-nums text-slate-950">{member.totalTokens} Token</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </section>
  );
}
