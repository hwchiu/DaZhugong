import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DateWeatherBar from '../components/DateWeatherBar.jsx';
import LazyBoundary from '../components/LazyBoundary.jsx';
import LiveClock from '../components/LiveClock.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { TokenIcon } from '../components/NavIcons.jsx';
import PendingBanner from '../components/PendingBanner.jsx';
import SpecialTokenFlow from '../components/SpecialTokenFlow.jsx';
import WeatherBackground from '../components/WeatherBackground.jsx';
import { getDailyBackgroundPhotoUrl } from '../utils/dailyBackgroundPhoto.js';
import { hasSummonedSpecialTokenToday } from '../utils/specialToken.js';
import { pickRandomGreeting } from '../data/greetings.js';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { useWeather } from '../hooks/useWeather.js';
import { useAuthStore } from '../store/authStore.js';
import homePigIcon from '../assets/lego-icons/home_pig.png';
import voteBoxIcon from '../assets/lego-icons/vote_box.png';
import historyIcon from '../assets/lego-icons/history.png';
import statsIcon from '../assets/lego-icons/stats.png';
import settingsHeaderIcon from '../assets/lego-icons/settings.png';
import menuIcon from '../assets/lego-icons/menu.png';
import infoIcon from '../assets/lego-icons/info.png';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法同步首頁資料，請稍後再試。';
const loadPiggyBank3D = () => import('../components/PiggyBank3D.jsx');

const NAV_LINKS = [
  { to: '/', icon: homePigIcon, label: '首頁' },
  { to: '/vote', icon: voteBoxIcon, label: '投票' },
  { to: '/history', icon: historyIcon, label: '歷史紀錄' },
  { to: '/stats', icon: statsIcon, label: '統計' },
  { to: '/settings', icon: settingsHeaderIcon, label: '設定' },
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
        {NAV_LINKS.map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-stone-700 transition hover:bg-rose-50"
          >
            <img src={icon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
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
  const [heroBackgroundPhotoUrl] = useState(() => getDailyBackgroundPhotoUrl());
  const { weather, weatherFailed } = useWeather();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // ---- 特殊Token(隱藏摩擦豬公彩蛋) ----
  // rubProgress：目前這一段摩擦嘗試的0~1進度，只用來畫「再摩擦一下…」的floating卡片，
  // 跟真正判定觸發的邏輯(在PiggyBank3D.jsx裡)分開，這裡純粹是顯示用。
  // specialFlowOpen：召喚成功後彈出的完整流程(選成員/選原因/投入動畫/成功畫面)是否開啟；
  // 開著的時候要順便關掉摩擦偵測(spec 32：觸發後鎖住偵測直到流程結束)。
  // resetRubToken：每次流程結束(成功或取消)就遞增一次，PiggyBank3D.jsx會在這個值變動時
  // 解除鎖定，讓使用者可以再摩擦一次(不過因為每日限制，通常隔天才有意義)。
  const [rubProgress, setRubProgress] = useState(0);
  const [specialFlowOpen, setSpecialFlowOpen] = useState(false);
  const [resetRubToken, setResetRubToken] = useState(0);

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

  // AC02：長按不移動不觸發、每日限制1次(spec 26/27)——今天已經召喚過的話，
  // 乾脆連手勢偵測都不要啟動，也不需要等使用者摩擦完才在API那邊被拒絕。
  // rules那邊(firestore.rules)仍然是最終防線，這裡只是提早給使用者正確的體驗。
  const alreadySummonedSpecialTokenToday = useMemo(
    () => hasSummonedSpecialTokenToday(reports, currentMember?.id),
    [reports, currentMember?.id],
  );
  const rubEnabled = !loading && !loadError && !specialFlowOpen && !alreadySummonedSpecialTokenToday;

  function handleSpecialTokenSummon() {
    setRubProgress(0);
    setSpecialFlowOpen(true);
  }

  function handleCloseSpecialTokenFlow() {
    setSpecialFlowOpen(false);
    setResetRubToken((token) => token + 1);
  }
  const mood = getMoodForCount(todayTotal);

  return (
    <section className="home-hero relative flex flex-col text-stone-900" style={{ background: 'var(--brand-bg)' }}>
      {/* 固定背景層：照片+天氣特效，position:fixed讓它永遠貼齊螢幕、不會被使用者往下滑動帶走。
          下面的內容(header、問候語、豬公、統計卡片...)照舊在正常文件流裡捲動——捲到後面那些
          本來就是實色背景的卡片，會自然疊上來蓋住這層固定背景，不用另外算「捲到哪裡該蓋住」。 */}
      <div className="fixed inset-x-0 top-0 z-0 h-[520px] overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          src={heroBackgroundPhotoUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
        <WeatherBackground weatherCode={weather?.weatherCode} />
        <div
          className="absolute inset-x-0 bottom-0 h-28"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--brand-bg))' }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-6 pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="開啟選單"
            className="rounded-full bg-white/25 p-1.5 backdrop-blur-md transition hover:bg-white/35"
          >
            <img src={menuIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
          </button>
          <h1 className="flex-1 truncate text-base font-bold text-white drop-shadow">午餐禁聊公事罰金箱</h1>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="規則說明"
            className="rounded-full bg-white/25 p-1.5 backdrop-blur-md transition hover:bg-white/35"
          >
            <img src={infoIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
          </button>
          <Link
            to="/settings"
            aria-label="設定"
            className="rounded-full bg-white/25 p-1.5 backdrop-blur-md transition hover:bg-white/35"
          >
            <img src={settingsHeaderIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
          </Link>
        </div>

        <PendingBanner />

        <div className="flex flex-wrap items-center gap-2">
          <DateWeatherBar weather={weather} weatherFailed={weatherFailed} glass />
          <LiveClock glass />
        </div>

        <div className="self-start rounded-[1.5rem] rounded-tl-sm bg-white/25 px-4 py-3 text-sm leading-6 text-white backdrop-blur-md">
          {greeting}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center">
          {loading || loadError ? (
            <div
              aria-hidden="true"
              className="flex h-72 w-full items-center justify-center rounded-[1.75rem] bg-white/25 px-5 text-center text-sm font-semibold text-white backdrop-blur-md"
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
                  className="flex h-72 w-full items-center justify-center rounded-[1.75rem] bg-white/25 px-5 text-center text-sm font-semibold text-white backdrop-blur-md"
                >
                  正在準備 3D 小豬…
                </div>
              )}
              errorFallback={({ retry }) => <PiggyBankErrorFallback retry={retry} />}
            >
              {(PiggyBank3D) => (
                <PiggyBank3D
                  members={members}
                  weatherCode={weather?.weatherCode}
                  size="transparent"
                  rubEnabled={rubEnabled}
                  onRubProgress={setRubProgress}
                  onSpecialTokenSummon={handleSpecialTokenSummon}
                  resetRubToken={resetRubToken}
                />
              )}
            </LazyBoundary>
          )}

          {/* spec 5.3：摩擦時的floating progress卡片，純視覺回饋，不用screen reader唸出來
              (持續摩擦的過程中一直被唸進度反而是干擾，不是幫助)。0跟1都不顯示：
              0是還沒開始摩擦，1的瞬間已經直接進入召喚動畫，卡片繼續留著沒有意義。 */}
          {rubProgress > 0 && rubProgress < 1 ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 left-1/2 w-52 -translate-x-1/2 rounded-2xl bg-slate-950/80 px-4 py-3 text-center text-white shadow-lg"
            >
              <p className="text-xs font-semibold">再摩擦一下…召喚神秘的力量！</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-rose-400 transition-[width]"
                  style={{ width: `${Math.round(rubProgress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
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
              className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 transition hover:bg-stone-200"
            >
              <img src={historyIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
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
      <SpecialTokenFlow
        open={specialFlowOpen}
        groupId={groupId}
        currentMember={currentMember}
        members={members}
        onClose={handleCloseSpecialTokenFlow}
      />
    </section>
  );
}
