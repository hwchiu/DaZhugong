import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LazyBoundary from '../components/LazyBoundary.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import PendingBanner from '../components/PendingBanner.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { reportToken } from '../services/tokenService.js';
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
    .map((member) => ({ ...member }))
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

function getTokenEmoji(color) {
  const lower = color?.toLowerCase() || '';
  if (lower === '#ff6b8a' || lower === '#ec4899') return '🩷';
  if (lower === '#4a90e2' || lower === '#3b82f6') return '🔵';
  if (lower === '#7ed957' || lower === '#10b981') return '🟢';
  if (lower === '#9b59b6' || lower === '#8b5cf6') return '🟣';
  if (lower === '#f5a623' || lower === '#f97316') return '🟠';
  return '⭐';
}

function getPigMood(count) {
  if (count >= 50) {
    return { key: 'laughing', emoji: '😍', label: '超開心', desc: '大笑', tip: '「哇！好多罰金！我們可以去吃大餐了！🥳」' };
  } else if (count >= 30) {
    return { key: 'smiling', emoji: '😊', label: '心情很好', desc: '微笑', tip: '「心情很好，繼續保持！大家今天很自律喔！」' };
  } else if (count >= 20) {
    return { key: 'neutral', emoji: '😐', label: '普通', desc: '平靜', tip: '「大家今天聊不少公事喔...」罰金準備可以拿去吃大餐了！' };
  } else if (count >= 10) {
    return { key: 'worried', emoji: '😟', label: '有點擔心', desc: '皺眉', tip: '「有點擔心，大家是不是太累了？要多休息喔！」' };
  } else if (count >= 3) {
    return { key: 'stressed', emoji: '😫', label: '壓力很大', desc: '累', tip: '「壓力很大，公事聊太多啦！罰款箱要爆了！」' };
  } else {
    return { key: 'crying', emoji: '😭', label: '爆量', desc: '哭泣', tip: '「嗚嗚... 爆量啦！午餐時間不准再講工作了！」' };
  }
}

export default function Home() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const logout = useAuthStore((state) => state.logout);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const { tokens = [] } = useTokens(groupId, 'all');

  // App UI State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [mockWeather, setMockWeather] = useState('sunny');
  const [mockTimePeriod, setMockTimeTheme] = useState('lunch');
  const [simulateLunch, setSimulateLunch] = useState(true);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Deposit Modal Flow State
  const [depositStep, setDepositStep] = useState(null);
  const [selectedViolatorId, setSelectedViolatorId] = useState('');
  const [isDepositingAnim, setIsDepositingAnim] = useState(false);
  const [submittingToken, setSubmittingToken] = useState(false);

  // Today dynamic counts
  const todayStr = new Date().toDateString();
  const todayTokensByMember = useMemo(() => {
    const counts = {};
    members.forEach((m) => {
      counts[m.id] = 0;
    });
    tokens.forEach((t) => {
      if (t.timestamp) {
        const d = t.timestamp.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        if (d.toDateString() === todayStr) {
          counts[t.targetId] = (counts[t.targetId] || 0) + 1;
        }
      }
    });
    return counts;
  }, [members, tokens, todayStr]);

  const todayTotalTokens = useMemo(() => {
    return Object.values(todayTokensByMember).reduce((sum, count) => sum + count, 0);
  }, [todayTokensByMember]);

  // Update real clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      setCurrentTimeStr(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const isLunchTime = useMemo(() => {
    if (simulateLunch) return true;
    const now = new Date();
    const hour = now.getHours();
    return hour === 12;
  }, [simulateLunch, currentTimeStr]);

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

  const selectedViolator = useMemo(() => {
    return members.find((m) => m.id === selectedViolatorId) || null;
  }, [members, selectedViolatorId]);

  const loading = groupLoading;
  const loadError = groupError;
  const hasMembers = memberSummary.length > 0;
  const hasReports = totalConfirmedTokens > 0;

  const currentPigMood = getPigMood(totalConfirmedTokens);

  // Quick CTA Handlers
  const handleOpenDeposit = () => {
    if (activeMembers.length <= 1) {
      setSelectedViolatorId(currentMember?.id || '');
      setDepositStep('confirm');
    } else {
      setDepositStep('select-violator');
    }
  };

  const handleSelectViolator = (memberId) => {
    setSelectedViolatorId(memberId);
    setDepositStep('confirm');
  };

  const handleConfirmDeposit = async () => {
    if (!selectedViolator || submittingToken) return;

    setSubmittingToken(true);
    try {
      if (selectedViolatorId !== currentMember?.id) {
        await reportToken({
          groupId,
          targetId: selectedViolatorId,
          targetMember: selectedViolator,
          currentMember,
        });
      }
      setDepositStep('animating');
      setIsDepositingAnim(true);
    } catch (err) {
      console.error('Failed to report token:', err);
      setDepositStep('error');
    } finally {
      setSubmittingToken(false);
    }
  };

  const handleAnimationFinished = () => {
    setIsDepositingAnim(false);
    setDepositStep('success');
  };

  const handleCloseModal = () => {
    setDepositStep(null);
    setSelectedViolatorId('');
  };

  return (
    <section className="app-page bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 text-slate-900 relative">
      {/* Menu Drawer Side Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
            aria-label="關閉選單"
          />
          <div className="relative flex w-64 max-w-xs flex-col bg-white p-6 shadow-2xl animate-fade-in-left h-full z-10">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-black text-slate-950">功能選單</h2>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 font-bold"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-col gap-4 font-semibold text-slate-800 text-base">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition">
                <span>🏠</span> 首頁
              </Link>
              <Link to="/vote" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition">
                <span>🗳️</span> 投票
              </Link>
              <Link to="/pending" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition">
                <span>⏳</span> 待確認
              </Link>
              <Link to="/history" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition">
                <span>📜</span> 歷史紀錄
              </Link>
              <Link to="/stats" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition">
                <span>📊</span> 統計
              </Link>
              <Link to="/settings" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition">
                <span>⚙️</span> 設定
              </Link>
            </nav>
            <div className="mt-auto border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 p-3 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-xl transition"
              >
                <span>🚪</span> 登出系統
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PendingBanner />

        {/* Home Page Box Section */}
        <section className="overflow-hidden rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          {/* Header Actions inside the main card */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-800 text-lg font-bold"
              aria-label="開啟側邊選單"
            >
              ☰
            </button>
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">Lunch Time</span>
            <Link
              to="/settings"
              className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-800 text-lg font-bold"
              aria-label="系統設定"
            >
              ⚙
            </Link>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-950">午餐禁聊公事罰金箱</h1>
          <p className="mt-3 text-base font-semibold text-slate-900">{`嗨，${getMemberName(currentMember)}`}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">中午先吃飯，公事晚點再說也可以。</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">輕鬆聊、慢慢吃，Token 就留給真的忍不住的人。</p>

          {/* Weather and Time Status Indicators */}
          <div className="mt-4 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between text-xs font-bold text-slate-700">
            <div className="flex items-center gap-2">
              <span>
                {mockWeather === 'sunny' && '☀️ Sunny 26°C 多雲'}
                {mockWeather === 'cloudy' && '⛅ Cloudy 22°C 多雲'}
                {mockWeather === 'rain' && '🌧 Rain 19°C 多雲'}
                {mockWeather === 'storm' && '⛈ Storm 17°C 多雲'}
                {mockWeather === 'fog' && '🌫 Fog 20°C 多雲'}
                {mockWeather === 'clear' && '🌙 Clear 18°C 多雲'}
              </span>
              <span className="text-slate-300">|</span>
              <span>{currentTimeStr || '12:15 PM'}</span>
            </div>
            <div className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider ${
              isLunchTime ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isLunchTime ? '🔴 禁聊公事中' : '🟢 可以聊公事'}
            </div>
          </div>

          {/* Interactive Environment simulator toggler */}
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={() => setShowDevPanel(!showDevPanel)}
              className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full hover:bg-slate-200 transition font-bold"
            >
              {showDevPanel ? '▲ 隱藏模擬面板' : '▼ 模擬天氣 / 時間主題'}
            </button>
          </div>

          {showDevPanel && (
            <div className="bg-slate-50 p-3.5 rounded-xl mt-2 border border-slate-200 flex flex-col gap-2.5 text-[11px] text-slate-600">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-bold">天氣狀態</label>
                  <select
                    value={mockWeather}
                    onChange={(e) => setMockWeather(e.target.value)}
                    className="w-full bg-white p-1.5 rounded border border-slate-300 font-medium text-slate-800"
                  >
                    <option value="sunny">☀️ Sunny (金黃色)</option>
                    <option value="cloudy">⛅ Cloudy (淡藍)</option>
                    <option value="rain">🌧 Rain (雨滴)</option>
                    <option value="storm">⛈ Storm (閃電)</option>
                    <option value="fog">🌫 Fog (灰白)</option>
                    <option value="clear">🌙 Clear Night (星空)</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-bold">時間背景</label>
                  <select
                    value={mockTimePeriod}
                    onChange={(e) => setMockTimeTheme(e.target.value)}
                    className="w-full bg-white p-1.5 rounded border border-slate-300 font-medium text-slate-800"
                  >
                    <option value="morning">🌅 Morning (晨光)</option>
                    <option value="lunch">🍱 Lunch (藍紫)</option>
                    <option value="afternoon">🌇 Afternoon (淡綠)</option>
                    <option value="evening">🌆 Evening (橘紫)</option>
                    <option value="night">🌃 Night (深藍)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sim-lunch-box"
                  checked={simulateLunch}
                  onChange={(e) => setSimulateLunch(e.target.checked)}
                  className="rounded text-rose-500 focus:ring-rose-500 w-3.5 h-3.5"
                />
                <label htmlFor="sim-lunch-box" className="font-bold text-slate-700">
                  強制模擬「禁聊公事」時段 (允許投入 Token)
                </label>
              </div>
            </div>
          )}

          {/* Dark Cumulative Token Card (The primary stat visual wrapper required by tests) */}
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

            {/* Render the Piggy Bank component */}
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
                  {(PiggyBank3D) => (
                    <PiggyBank3D
                      members={memberSummary}
                      timeTheme={mockTimePeriod}
                      weatherTheme={mockWeather}
                      isDepositing={isDepositingAnim}
                      depositingColor={selectedViolator?.color || '#ff6b8a'}
                      onAnimationEnd={handleAnimationFinished}
                    />
                  )}
                </LazyBoundary>
              )}
            </div>
            <p className="mt-3 text-center text-xs leading-5 text-slate-300">
              左右拖曳可旋轉；小豬內的彩色星形代表物件會依 Token 數量呈現。
            </p>
          </div>

          {/* Transparent Piggy Bank mood description box */}
          {!loading && !loadError && (
            <div className="mt-4 text-center bg-rose-50 border border-rose-100/50 p-3.5 rounded-[1.5rem]">
              <div className="inline-flex items-center gap-1.5 text-rose-700 font-bold text-sm">
                <span>{currentPigMood.emoji}</span>
                <span>{currentPigMood.label} (心情: {currentPigMood.desc})</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500 leading-relaxed">
                {currentPigMood.tip}
              </p>
            </div>
          )}

          {/* Primary CTA (＋ 投入一枚 Token) */}
          {!loading && !loadError && (
            <div className="mt-5">
              <button
                type="button"
                disabled={!isLunchTime}
                onClick={handleOpenDeposit}
                className={`w-full min-h-12 flex items-center justify-center rounded-[1.5rem] px-4 py-3 text-base font-black shadow-lg transition duration-300 ${
                  isLunchTime
                    ? 'bg-rose-500 text-white shadow-rose-200 hover:bg-rose-600 active:scale-[0.98]'
                    : 'bg-slate-200 text-slate-500 shadow-none cursor-not-allowed'
                }`}
              >
                {isLunchTime ? '＋ 投入一枚 Token' : '午餐時間再見 👋'}
              </button>
            </div>
          )}

          {/* Action Link Buttons */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            {/* Today Violations Section */}
            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
                <div>
                  <h2 className="text-base font-black text-slate-950">今日成員違規</h2>
                  <p className="text-xs text-slate-500 font-semibold">當日 00:00 至今累積的違規紀錄</p>
                </div>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
                  今日已投入 {todayTotalTokens} 枚
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-3">
                {activeMembers.map((member) => {
                  const count = todayTokensByMember[member.id] || 0;
                  const tokenEmoji = getTokenEmoji(member.color);
                  return (
                    <li
                      key={member.id}
                      className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm"
                    >
                      <MemberAvatar member={member} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900">{getMemberName(member)}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs">{tokenEmoji}</span>
                          <span className="text-xs font-black text-slate-700">{count} 次</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Token Color system identification */}
            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Token 顏色識別</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeMembers.map((member) => {
                  const tokenEmoji = getTokenEmoji(member.color);
                  return (
                    <span
                      key={member.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-50 border border-slate-100 shadow-sm"
                    >
                      <span>{tokenEmoji}</span>
                      <span className="text-slate-800">{getMemberName(member)}</span>
                    </span>
                  );
                })}
              </div>
            </section>

            {/* Active Members section */}
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

            {/* Total member summary list */}
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

      {/* POPUP CONFIRMATION & ANIMATION MODAL FLOW */}
      {depositStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={handleCloseModal}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity"
            aria-label="關閉對話框"
          />
          <div className="relative w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl z-10 animate-scale-up text-center border border-slate-100">
            {/* Step 1: Select Violator */}
            {depositStep === 'select-violator' && (
              <div>
                <h3 className="text-lg font-black text-slate-950">選擇違規者</h3>
                <p className="text-xs text-slate-500 mt-1">今天誰忍不住聊公事了？</p>
                <div className="grid grid-cols-2 gap-3 mt-5 max-h-60 overflow-y-auto p-1">
                  {activeMembers.map((member) => {
                    const tokenEmoji = getTokenEmoji(member.color);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => handleSelectViolator(member.id)}
                        className="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-2xl hover:bg-rose-50 border border-slate-100 hover:border-rose-100 transition text-center"
                      >
                        <MemberAvatar member={member} size="md" />
                        <span className="text-xs font-bold text-slate-800">{getMemberName(member)}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white font-black text-slate-500 border border-slate-100 flex items-center gap-1">
                          {tokenEmoji} {todayTokensByMember[member.id] || 0} 次
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="mt-5 w-full bg-slate-100 text-slate-600 hover:bg-slate-200 py-2.5 rounded-xl text-xs font-bold transition"
                >
                  取消
                </button>
              </div>
            )}

            {/* Step 2: Confirm Deposit */}
            {depositStep === 'confirm' && selectedViolator && (
              <div>
                <h3 className="text-lg font-black text-slate-950">投入一枚 Token</h3>
                <p className="text-xs text-slate-500 mt-1">請確認投入的違規紀錄</p>

                <div className="my-6 flex flex-col items-center">
                  <div
                    className="w-16 h-14 rounded-full border-2 border-white/85 shadow-lg flex items-center justify-center text-2xl font-black text-white mb-3"
                    style={{ backgroundColor: selectedViolator.color }}
                  >
                    {getTokenEmoji(selectedViolator.color)}
                  </div>
                  <h4 className="text-base font-black text-slate-900">{getMemberName(selectedViolator)}</h4>
                  <p className="text-xs font-bold text-rose-500 mt-1">
                    今日已投入 {todayTokensByMember[selectedViolator.id] || 0} 枚
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl text-xs font-medium text-slate-600 mb-6 border border-slate-100">
                  <span className="font-bold text-slate-800">違規原因：</span>「午餐時間講公事」
                  <span className="block text-slate-400 mt-1.5">-1 Token (加罰一枚)</span>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeMembers.length <= 1) {
                        handleCloseModal();
                      } else {
                        setDepositStep('select-violator');
                      }
                    }}
                    className="flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200 py-3 rounded-2xl text-xs font-bold transition"
                  >
                    返回選擇
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeposit}
                    disabled={submittingToken}
                    className="flex-1 bg-rose-500 text-white hover:bg-rose-600 py-3 rounded-2xl text-xs font-bold transition shadow-lg shadow-rose-100 disabled:opacity-50"
                  >
                    {submittingToken ? '處理中...' : '確認投入'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Animating */}
            {depositStep === 'animating' && (
              <div className="py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-500 mx-auto mb-4" />
                <h3 className="text-base font-black text-slate-900">紀錄送出中...</h3>
                <p className="text-xs text-slate-500 mt-1">正在將 Token 投進小豬肚子裡 🐷</p>
              </div>
            )}

            {/* Step 4: Success Screen */}
            {depositStep === 'success' && selectedViolator && (
              <div>
                <span className="text-5xl block animate-bounce mb-3">🎉</span>
                <h3 className="text-lg font-black text-slate-950">投入成功！</h3>
                
                <p className="text-xs text-slate-600 leading-relaxed mt-3 px-4 font-bold">
                  {selectedViolatorId === currentMember?.id ? (
                    `你今天已投入 ${todayTokensByMember[selectedViolator.id] + 1} 枚 Token`
                  ) : (
                    `${getMemberName(selectedViolator)} 今天已累計 ${todayTokensByMember[selectedViolator.id] + 1} 枚 Token`
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-2 font-medium">
                  午餐時間，先別聊公事囉 😆
                </p>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="mt-6 w-full bg-slate-900 text-white hover:bg-slate-800 py-3 rounded-2xl text-xs font-bold transition shadow-lg"
                >
                  關閉
                </button>
              </div>
            )}

            {/* Step 5: Error Screen */}
            {depositStep === 'error' && (
              <div>
                <span className="text-5xl block mb-3">⚠️</span>
                <h3 className="text-lg font-black text-slate-950">投入失敗</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-3 px-4 font-semibold">
                  無法與伺服器連線或同步資料，請確認您的網路連線後再試。
                </p>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setDepositStep('confirm')}
                    className="flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200 py-3 rounded-2xl text-xs font-bold transition"
                  >
                    重試
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 bg-slate-900 text-white hover:bg-slate-800 py-3 rounded-2xl text-xs font-bold transition"
                  >
                    關閉
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
