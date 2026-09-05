import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DateWeatherBar from '../components/DateWeatherBar.jsx';
import LazyBoundary from '../components/LazyBoundary.jsx';
import LiveClock from '../components/LiveClock.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { HistoryIcon, HomeIcon, SettingsIcon, StatsIcon, TokenIcon, VoteIcon } from '../components/NavIcons.jsx';
import PendingBanner from '../components/PendingBanner.jsx';
import { pickRandomGreeting } from '../data/greetings.js';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { useWeather } from '../hooks/useWeather.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法同步首頁資料，請稍後再試。';
const loadPiggyBank3D = () => import('../components/PiggyBank3D.jsx');

const NAV_LINKS = [
  { to: '/', Icon: HomeIcon, label: '首頁' },
  { to: '/vote', Icon: VoteIcon, label: '投票' },
  { to: '/history', Icon: HistoryIcon, label: '歷史紀錄' },
  { to: '/stats', Icon: StatsIcon, label: '統計' },
  { to: '/settings', Icon: SettingsIcon, label: '設定' },
];

const RULES = [
  '午餐時間（12:00–13:00）禁止討論與工作相關的事情。',
  '從在F12P7 8樓相見之後就開始進行管制，直至結束用餐走進電梯中。電梯中屬於公海，非管制範圍。',
  '違規者須由其他成員投入一枚屬於自己顏色的 Token 到罰金箱中，off-line 由違規者認罪。',
  'Token 會記錄每個人違規次數，統計會即時更新。',
  '違規情節重大者，視當下 SHERRY 之懲處規則進行懲罰。',
  '罰金用途：聚餐、下午茶，或出遊基金！',
];

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

// 跟 useTokens.js / usePending.js 裡同樣邏輯的本地副本：這個 repo 目前對 Firestore
// timestamp 轉毫秒的寫法就是每個檔案各自放一份，這裡延續同樣的慣例。
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

function startOfTodayMillis() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function getMoodForCount(count) {
  if (count <= 2) {
    return { emoji: '😊', label: '心情很好，繼續保持！' };
  }
  if (count <= 5) {
    return { emoji: '😐', label: '有點躁動，小心一點' };
  }
  return { emoji: '😣', label: '快要爆炸了，冷靜一下' };
}

function PiggyBankErrorFallback({ retry }) {
  return (
    <div
      role="alert"
      className="flex h-72 flex-col items-center justify-center rounded-[1.75rem] bg-white/70 px-5 text-center text-stone-700"
    >
      <span role="img" aria-label="3D 小豬暫時無法顯示" className="text-6xl">
        🐷
      </span>
      <p className="mt-4 text-base font-semibold text-stone-900">3D 小豬暫時無法顯示</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">先看總 Token 與成員列表，稍後可以重新載入小豬模型。</p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        重試 3D 小豬
      </button>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
      >
        <h2 id="rules-modal-title" className="text-lg font-bold text-stone-900">
          規則說明
        </h2>
        <ol className="mt-4 flex flex-col gap-3">
          {RULES.map((rule, index) => (
            <li key={rule} className="flex gap-3 text-sm leading-6 text-stone-700">
              <span className="bg-brand-soft text-brand flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {index + 1}
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-stone-900 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
        >
          知道了
        </button>
      </div>
    </div>
  );
}

function NavDrawer({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="關閉選單背景"
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/50"
      />
      <nav aria-label="主選單" className="relative flex h-full w-64 flex-col gap-1 bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-stone-900">選單</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉選單"
            className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
          >
            ✕
          </button>
        </div>
        {NAV_LINKS.map(({ to, Icon, label }) => (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-stone-700 transition hover:bg-rose-50"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default function Home() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const { tokens: reports, loading: reportsLoading, error: reportsError } = useTokens(groupId, null);
  const [greeting] = useState(() => pickRandomGreeting());
  const { weather, weatherFailed } = useWeather();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const totalConfirmedTokens = useMemo(
    () => members.reduce((sum, member) => sum + (Number.isFinite(member.totalTokens) ? member.totalTokens : 0), 0),
    [members],
  );

  const todayCountsByMember = useMemo(() => {
    const startOfDay = startOfTodayMillis();
    const counts = new Map();

    for (const report of reports) {
      if (toMillis(report?.timestamp) < startOfDay) {
        continue;
      }
      if (typeof report?.targetId !== 'string') {
        continue;
      }
      counts.set(report.targetId, (counts.get(report.targetId) ?? 0) + 1);
    }

    return counts;
  }, [reports]);

  const todayTotal = useMemo(
    () => Array.from(todayCountsByMember.values()).reduce((sum, count) => sum + count, 0),
    [todayCountsByMember],
  );

  const activeMembersForStats = useMemo(() => {
    const active = members.filter((member) => member?.active === true);
    return active.slice().sort((a, b) => {
      if (a.id === currentMember?.id) return -1;
      if (b.id === currentMember?.id) return 1;
      return 0;
    });
  }, [currentMember?.id, members]);

  const loading = groupLoading || reportsLoading;
  const loadError = groupError || reportsError;
  const mood = getMoodForCount(todayTotal);

  return (
    <section className="home-hero flex flex-col bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-stone-900">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 pb-6 pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="開啟選單"
            className="rounded-full p-2 text-stone-700 transition hover:bg-white/70"
          >
            <span aria-hidden="true" className="text-xl">☰</span>
          </button>
          <h1 className="flex-1 truncate text-base font-bold text-stone-900">午餐禁聊公事罰金箱</h1>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="規則說明"
            className="rounded-full p-2 text-stone-700 transition hover:bg-white/70"
          >
            <span aria-hidden="true" className="text-lg">ⓘ</span>
          </button>
          <Link
            to="/settings"
            aria-label="設定"
            className="rounded-full p-2 text-stone-700 transition hover:bg-white/70"
          >
            <span aria-hidden="true" className="text-lg">⚙️</span>
          </Link>
        </div>

        <PendingBanner />

        <div className="flex flex-wrap items-center gap-2">
          <DateWeatherBar weather={weather} weatherFailed={weatherFailed} />
          <LiveClock />
        </div>

        <div className="rounded-[1.5rem] rounded-tl-sm bg-white px-4 py-3 text-sm leading-6 text-stone-700 shadow-sm shadow-stone-200">
          {greeting}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-[1.75rem]">
          {loading || loadError ? (
            <div
              aria-hidden="true"
              className="flex h-72 w-full items-center justify-center rounded-[1.75rem] bg-white/60 px-5 text-center text-sm font-semibold text-stone-500"
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
                  className="flex h-72 w-full items-center justify-center rounded-[1.75rem] bg-white/60 px-5 text-center text-sm font-semibold text-stone-600"
                >
                  正在準備 3D 小豬…
                </div>
              )}
              errorFallback={({ retry }) => <PiggyBankErrorFallback retry={retry} />}
            >
              {(PiggyBank3D) => <PiggyBank3D members={members} weatherCode={weather?.weatherCode} />}
            </LazyBoundary>
          )}
        </div>

        <div className="flex items-stretch gap-3">
          <div className="flex flex-col items-center justify-center gap-1 rounded-[1.5rem] bg-white px-4 py-3 text-center shadow-sm shadow-stone-200">
            <span aria-hidden="true" className="text-2xl">{mood.emoji}</span>
            <span className="max-w-[5rem] text-xs font-semibold leading-4 text-stone-600">{mood.label}</span>
          </div>

          <div className="flex flex-1 items-center justify-between rounded-[1.5rem] bg-white px-4 py-3 shadow-sm shadow-stone-200">
            {loading ? (
              <div role="status" aria-live="polite">
                <p className="text-xs font-semibold text-stone-500">總罰金 Token 數</p>
                <p className="mt-1 text-xl font-black text-stone-900">同步中…</p>
              </div>
            ) : loadError ? (
              <div role="alert">
                <p className="text-xs font-semibold text-stone-500">總罰金 Token 數</p>
                <p className="mt-1 text-sm font-black text-rose-700">{SAFE_LOAD_ERROR_MESSAGE}</p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-stone-500">總罰金 Token 數</p>
                <p className="mt-1 text-3xl font-black tracking-tight text-stone-900">
                  {totalConfirmedTokens}
                  <span className="ml-1 text-sm font-bold text-stone-500">枚</span>
                </p>
                <p className="mt-0.5 text-xs text-stone-500">今日已投入 {todayTotal} 枚</p>
              </div>
            )}
            <Link
              to="/history"
              aria-label="歷史紀錄"
              className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 transition hover:bg-stone-200"
            >
              <HistoryIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>

        <Link
          to="/vote"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-gradient text-base font-bold text-white transition focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-500)]"
        >
          <TokenIcon className="h-5 w-5" /> 投入一枚 Token
        </Link>

        {!loading && !loadError && activeMembersForStats.length ? (
          <div className="rounded-[1.5rem] bg-white p-4 shadow-sm shadow-stone-200">
            <p className="text-sm font-bold text-stone-900">成員違規統計（今日）</p>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {activeMembersForStats.map((member) => (
                <div key={member.id} className="flex flex-col items-center gap-1">
                  <MemberAvatar member={member} size="sm" />
                  <span className="text-xs font-semibold text-stone-700">
                    {member.id === currentMember?.id ? '你' : getMemberName(member)}
                  </span>
                  <span className="text-brand text-xs font-bold">
                    {todayCountsByMember.get(member.id) ?? 0} 枚
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {drawerOpen ? <NavDrawer onClose={() => setDrawerOpen(false)} /> : null}
      {rulesOpen ? <RulesModal onClose={() => setRulesOpen(false)} /> : null}
    </section>
  );
}
