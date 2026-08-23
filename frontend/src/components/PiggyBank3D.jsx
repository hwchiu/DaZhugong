import { useEffect, useMemo, useState } from 'react';
import piggyBankPng from './gemini-piggy-bank.png';

const MAX_RENDERED_TOKENS = 80;
const DEFAULT_TOKEN_COLOR = '#f472b6';
const STAR_TOKEN_PALETTE = ['#fb7185', '#38bdf8', '#84cc16', '#a855f7', '#f59e0b'];

function toTokenCount(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function toSafeColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : DEFAULT_TOKEN_COLOR;
}

export function samplePiggyTokens(members, maxRendered = MAX_RENDERED_TOKENS) {
  const normalizedMembers = (Array.isArray(members) ? members : [])
    .map((member, memberIndex) => ({
      memberId: member?.id ?? `member-${memberIndex}`,
      color: toSafeColor(member?.color),
      count: toTokenCount(member?.totalTokens),
    }))
    .filter((member) => member.count > 0);
  const totalCount = normalizedMembers.reduce((sum, member) => sum + member.count, 0);
  const safeCap = Number.isFinite(maxRendered) ? Math.max(0, Math.floor(maxRendered)) : MAX_RENDERED_TOKENS;
  const renderedCount = Math.min(totalCount, safeCap);

  if (!renderedCount) {
    return { totalCount, renderedCount: 0, tokens: [] };
  }

  const cumulativeMembers = [];
  let cumulativeCount = 0;

  for (const member of normalizedMembers) {
    cumulativeCount += member.count;
    cumulativeMembers.push({ ...member, cumulativeCount });
  }

  const tokens = Array.from({ length: renderedCount }, (_, index) => {
    const sourceIndex = Math.min(
      totalCount - 1,
      Math.floor(((index + 0.5) * totalCount) / renderedCount),
    );
    const member = cumulativeMembers.find((candidate) => sourceIndex < candidate.cumulativeCount)
      ?? cumulativeMembers[cumulativeMembers.length - 1];

    return {
      id: `${member.memberId}-${index}`,
      memberId: member.memberId,
      color: member.color,
      sampleIndex: index,
    };
  });

  return { totalCount, renderedCount, tokens };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 6 dynamic Mood states
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

function PigFace({ mood }) {
  return (
    <svg viewBox="0 0 100 60" className="w-full h-full text-slate-700">
      {/* Blush cheeks */}
      {(mood === 'laughing' || mood === 'smiling') && (
        <>
          <ellipse cx="15" cy="38" rx="8" ry="5" fill="#fda4af" opacity="0.65" />
          <ellipse cx="85" cy="38" rx="8" ry="5" fill="#fda4af" opacity="0.65" />
        </>
      )}
      {mood === 'stressed' && (
        <>
          <ellipse cx="15" cy="38" rx="6" ry="4" fill="#fda4af" opacity="0.4" />
          <ellipse cx="85" cy="38" rx="6" ry="4" fill="#fda4af" opacity="0.4" />
        </>
      )}

      {/* Eyes */}
      {mood === 'laughing' && (
        <>
          <path d="M10 25 Q20 15 30 25" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M70 25 Q80 15 90 25" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
        </>
      )}
      {mood === 'smiling' && (
        <>
          <path d="M12 24 Q20 18 28 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M72 24 Q80 18 88 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {mood === 'neutral' && (
        <>
          <circle cx="20" cy="24" r="4.5" fill="currentColor" />
          <circle cx="80" cy="24" r="4.5" fill="currentColor" />
        </>
      )}
      {mood === 'worried' && (
        <>
          <circle cx="20" cy="26" r="5" fill="currentColor" />
          <circle cx="80" cy="26" r="5" fill="currentColor" />
          <path d="M12 16 L26 20" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M88 16 L74 20" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {mood === 'stressed' && (
        <>
          <path d="M12 20 L24 28 M24 20 L12 28" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M76 20 L88 28 M88 20 L76 28" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {mood === 'crying' && (
        <>
          <path d="M12 26 Q20 32 28 26" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M72 26 Q80 32 88 26" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M18 30 Q18 45 16 48" fill="none" stroke="#0ea5e9" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M82 30 Q82 45 84 48" fill="none" stroke="#0ea5e9" strokeWidth="4.5" strokeLinecap="round" />
        </>
      )}

      {/* Mouth */}
      {mood === 'laughing' && (
        <path d="M38 38 Q50 54 62 38 Z" fill="currentColor" />
      )}
      {mood === 'smiling' && (
        <path d="M40 38 Q50 48 60 38" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      )}
      {mood === 'neutral' && (
        <path d="M40 42 L60 42" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      )}
      {mood === 'worried' && (
        <path d="M40 44 Q50 38 60 44" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      )}
      {mood === 'stressed' && (
        <path d="M40 45 Q50 39 60 45" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      )}
      {mood === 'crying' && (
        <path d="M38 46 Q50 35 62 46" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function PiggyBank3D({
  members = [],
  timeTheme = 'lunch',
  weatherTheme = 'sunny',
  isDepositing = false,
  depositingColor = '#ff6b8a',
  onAnimationEnd = () => {},
}) {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [triggerWiggle, setTriggerWiggle] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(event.matches);
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  const sample = useMemo(() => samplePiggyTokens(members), [members]);
  const mood = getPigMood(sample.totalCount);

  // Trigger pig wiggle/bounce animation when depositing starts
  useEffect(() => {
    if (isDepositing) {
      setTriggerWiggle(true);
      const timer = setTimeout(() => {
        setTriggerWiggle(false);
        onAnimationEnd();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isDepositing, onAnimationEnd]);

  // Determine Time-of-day gradients and Pig visual tints
  const timeGradientClass = {
    morning: 'from-amber-200 via-orange-100 to-rose-50 text-slate-800',
    lunch: 'from-indigo-900 via-purple-800 to-pink-700 text-white',
    afternoon: 'from-sky-200 via-teal-100 to-emerald-50 text-slate-800',
    evening: 'from-orange-400 via-pink-400 to-purple-600 text-white',
    night: 'from-slate-950 via-indigo-950 to-slate-900 text-white',
  }[timeTheme] || 'from-indigo-900 via-purple-800 to-pink-700 text-white';

  const pigFilterStyle = {
    morning: { filter: 'sepia(0.12) saturate(1.2) hue-rotate(5deg)' },
    lunch: { filter: 'hue-rotate(240deg) saturate(1.05) brightness(0.95)' },
    afternoon: { filter: 'none' },
    evening: { filter: 'hue-rotate(15deg) saturate(1.25) contrast(1.05)' },
    night: { filter: 'brightness(0.75) hue-rotate(210deg)' },
  }[timeTheme] || {};

  // Generate simple weather elements inside the container
  const renderWeatherElements = () => {
    switch (weatherTheme) {
      case 'sunny':
        return (
          <div className="absolute top-4 left-4 w-12 h-12 bg-amber-400 rounded-full blur-sm opacity-85 animate-pulse" />
        );
      case 'cloudy':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-60">
            <div className="absolute top-4 left-6 text-2xl float-cloud opacity-80">☁️</div>
            <div className="absolute top-8 right-10 text-xl float-cloud opacity-70" style={{ animationDelay: '2s' }}>☁️</div>
          </div>
        );
      case 'rain':
      case 'storm':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-75">
            {weatherTheme === 'storm' && <div className="absolute inset-0 flash-lightning z-0" />}
            {Array.from({ length: 12 }).map((_, idx) => {
              const leftPercent = (idx * 9) + 5;
              const delay = (idx * 0.15).toFixed(2);
              const duration = (0.8 + ((idx * 7) % 5) * 0.1).toFixed(2);
              return (
                <div
                  key={idx}
                  className="absolute w-[2px] h-[24px] bg-sky-200 rain-particle"
                  style={{
                    left: `${leftPercent}%`,
                    top: '-20px',
                    animationDelay: `${delay}s`,
                    animationDuration: `${duration}s`,
                  }}
                />
              );
            })}
          </div>
        );
      case 'fog':
        return (
          <div className="absolute inset-0 pointer-events-none rounded-[2rem] backdrop-blur-[1.5px] bg-slate-100/15" />
        );
      case 'clear':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 10 }).map((_, idx) => {
              const leftPercent = ((idx * 9 + 7) % 90) + 5;
              const topPercent = ((idx * 13 + 3) % 40) + 5;
              const delay = (idx * 0.3).toFixed(2);
              return (
                <div
                  key={idx}
                  className="absolute w-[3px] h-[3px] bg-white rounded-full star-twinkle"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    animationDelay: `${delay}s`,
                  }}
                />
              );
            })}
          </div>
        );
      default:
        return null;
    }
  };

  const label = `小豬撲滿，內含 ${sample.totalCount} Token，畫面顯示 ${sample.renderedCount} 個代表物件`;

  return (
    <figure
      role="img"
      aria-label={label}
      className={`relative w-full h-80 rounded-[2rem] border border-white/20 shadow-xl overflow-hidden bg-gradient-to-b ${timeGradientClass} transition-all duration-700 flex flex-col items-center justify-center`}
    >
      {/* Background Weather Elements */}
      {renderWeatherElements()}

      {/* Floating Star/Token for Deposit Animation */}
      {isDepositing && (
        <div
          className="absolute z-30 animate-drop-token"
          style={{ top: '65px', left: '49%' }}
        >
          <div
            className="w-5 h-5 rounded-full border border-white/70 shadow-lg flex items-center justify-center font-bold text-white text-[10px]"
            style={{ backgroundColor: depositingColor }}
          >
            ★
          </div>
        </div>
      )}

      {/* The Transparent Pig visual body */}
      <div
        className={`relative w-60 h-60 flex items-center justify-center ${
          triggerWiggle && !reducedMotion ? 'animate-wiggle-pig' : ''
        }`}
      >
        {/* Main Pig PNG Image */}
        <img
          src={piggyBankPng}
          alt="Transparent Glass Piggy Bank"
          className="w-52 h-52 object-contain select-none pointer-events-none transition-all duration-700"
          style={pigFilterStyle}
        />

        {/* Stacked colored tokens inside the pig belly */}
        <div
          className="absolute bottom-[23%] left-[23%] w-[54%] h-[35%] pointer-events-none flex flex-wrap-reverse gap-[3px] items-end justify-center content-start overflow-hidden rounded-full"
          style={{ transform: 'rotate(-2deg)' }}
        >
          {sample.tokens.map((t, idx) => {
            const rot = (Math.sin(idx * 3.14) * 20).toFixed(1);
            return (
              <span
                key={t.id || idx}
                className="w-[11px] h-[11px] rounded-full border border-white/40 shadow-inner inline-block shrink-0"
                style={{
                  backgroundColor: t.color,
                  transform: `rotate(${rot}deg)`,
                }}
              />
            );
          })}
        </div>

        {/* Dynamic Cute Eyes/Mouth overlaid on top of Pig face */}
        <div className="absolute top-[37%] left-[54%] w-[25%] h-[15%] pointer-events-none z-20">
          <PigFace mood={mood.key} />
        </div>
      </div>

      {reducedMotion ? (
        <p className="absolute bottom-2 text-[10px] opacity-75">已依系統設定關閉動態效果。</p>
      ) : null}
    </figure>
  );
}
