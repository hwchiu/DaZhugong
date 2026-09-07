import { useMemo } from 'react';
import { COOLDOWN_DURATION_MS } from '../utils/cooldown.js';

// 冷卻中成員卡片的「英雄聯盟技能冷卻」風格遮罩：整張卡片蓋一層半透明深色，
// 用conic-gradient畫出一塊「順時針收縮」的扇形，隨冷卻時間經過逐漸縮小到消失，
// 視覺上就像LoL技能圖示冷卻時那塊逐漸被清空的黑色扇形。
//
// 實作方式see index.css的 `--cooldown-remaining` / `@keyframes cooldown-sweep`：
// - `@property --cooldown-remaining` 讓瀏覽器把這個自訂屬性當成可以平滑內插的
//   <number>，animation 才能畫出連續的扇形收縮動畫，而不是像一般字串自訂屬性
//   那樣只能整數跳動、或必須每個影格用JS重新畫一次conic-gradient字串。
// - 用「負的 animation-delay」讓動畫在這個元件掛載的當下，就直接跳到
//   「目前實際剩餘時間」對應的進度，不用JS在每個影格手動算角度。
// - 這個負延遲值特意用 useMemo 鎖定在 `expiresAt`（同一次冷卻期間內固定不變的
//   時間戳）上，不是鎖在會每秒跳動的 `remainingMs` 上——如果每次 usePending
//   的 useNowTicker 那個1秒一次的tick都重新算一次 animation-delay 字串，
//   瀏覽器會把它當成一個新的動畫重新啟動，畫面反而會不流暢。expiresAt 在
//   同一段冷卻期間內是常數，所以這個 useMemo 的計算結果在同一段冷卻期間內
//   的每次重新render都完全一樣，動畫就能真的連續播放到底，不會被重置。
export default function CooldownSweepOverlay({ expiresAt, remainingMs }) {
  const animationDelayMs = useMemo(() => {
    const remainingAtMountMs = Math.max(0, expiresAt - Date.now());
    const elapsedAtMountMs = COOLDOWN_DURATION_MS - remainingAtMountMs;
    return -elapsedAtMountMs;
  }, [expiresAt]);

  // prefers-reduced-motion時(見index.css)，CSS animation會被整個關掉，改成
  // 直接吃這裡算好的靜態比例——這個比例每次render(每秒一次的計時器tick)都會
  // 重新算，所以在關閉動態效果的情況下，扇形一樣會每秒更新一次來反映目前的
  // 剩餘比例，只是不會有平滑的過場動畫。
  const staticRemainingFraction = Math.min(1, Math.max(0, remainingMs / COOLDOWN_DURATION_MS));

  return (
    <span
      aria-hidden="true"
      className="cooldown-sweep-mask pointer-events-none absolute inset-0 z-0"
      style={{
        borderRadius: 'inherit',
        '--cooldown-remaining': staticRemainingFraction,
        animationDuration: `${COOLDOWN_DURATION_MS}ms`,
        animationDelay: `${animationDelayMs}ms`,
      }}
    />
  );
}
