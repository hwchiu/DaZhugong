// 首頁「今日心情」圖示：把原本的3種emoji(😊/😐/😣)換成使用者提供的樂高人偶臉。
// 3個情緒分級(happy/neutral/angry)的判斷邏輯完全沿用原本Home.jsx的getMoodForCount，
// 只是每個分級底下現在有一整組(25/18/5張)人偶臉可以選，不是固定死一張圖——
// 「今天」用哪一張，採用跟daily background photo/每日主題色同一套「當年第幾天 mod 陣列長度」
// 演算法(見 data/traditionalColors.js 的 getTodayColorIndex)，同一天全部使用者看到同一張、
// 隔天自動換下一張，不需要打任何API、也不用使用者手動選。

import happy1 from '../assets/lego-icons/mood/happy_01.png';
import happy2 from '../assets/lego-icons/mood/happy_02.png';
import happy3 from '../assets/lego-icons/mood/happy_03.png';
import happy4 from '../assets/lego-icons/mood/happy_04.png';
import happy5 from '../assets/lego-icons/mood/happy_05.png';
import happy6 from '../assets/lego-icons/mood/happy_06.png';
import happy7 from '../assets/lego-icons/mood/happy_07.png';
import happy8 from '../assets/lego-icons/mood/happy_08.png';
import happy9 from '../assets/lego-icons/mood/happy_09.png';
import happy10 from '../assets/lego-icons/mood/happy_10.png';
import happy11 from '../assets/lego-icons/mood/happy_11.png';
import happy12 from '../assets/lego-icons/mood/happy_12.png';
import happy13 from '../assets/lego-icons/mood/happy_13.png';
import happy14 from '../assets/lego-icons/mood/happy_14.png';
import happy15 from '../assets/lego-icons/mood/happy_15.png';
import happy16 from '../assets/lego-icons/mood/happy_16.png';
import happy17 from '../assets/lego-icons/mood/happy_17.png';
import happy18 from '../assets/lego-icons/mood/happy_18.png';
import happy19 from '../assets/lego-icons/mood/happy_19.png';
import happy20 from '../assets/lego-icons/mood/happy_20.png';
import happy21 from '../assets/lego-icons/mood/happy_21.png';
import happy22 from '../assets/lego-icons/mood/happy_22.png';
import happy23 from '../assets/lego-icons/mood/happy_23.png';
import happy24 from '../assets/lego-icons/mood/happy_24.png';
import happy25 from '../assets/lego-icons/mood/happy_25.png';

import neutral1 from '../assets/lego-icons/mood/neutral_01.png';
import neutral2 from '../assets/lego-icons/mood/neutral_02.png';
import neutral3 from '../assets/lego-icons/mood/neutral_03.png';
import neutral4 from '../assets/lego-icons/mood/neutral_04.png';
import neutral5 from '../assets/lego-icons/mood/neutral_05.png';
import neutral6 from '../assets/lego-icons/mood/neutral_06.png';
import neutral7 from '../assets/lego-icons/mood/neutral_07.png';
import neutral8 from '../assets/lego-icons/mood/neutral_08.png';
import neutral9 from '../assets/lego-icons/mood/neutral_09.png';
import neutral10 from '../assets/lego-icons/mood/neutral_10.png';
import neutral11 from '../assets/lego-icons/mood/neutral_11.png';
import neutral12 from '../assets/lego-icons/mood/neutral_12.png';
import neutral13 from '../assets/lego-icons/mood/neutral_13.png';
import neutral14 from '../assets/lego-icons/mood/neutral_14.png';
import neutral15 from '../assets/lego-icons/mood/neutral_15.png';
import neutral16 from '../assets/lego-icons/mood/neutral_16.png';
import neutral17 from '../assets/lego-icons/mood/neutral_17.png';
import neutral18 from '../assets/lego-icons/mood/neutral_18.png';

import angry1 from '../assets/lego-icons/mood/angry_01.png';
import angry2 from '../assets/lego-icons/mood/angry_02.png';
import angry3 from '../assets/lego-icons/mood/angry_03.png';
import angry4 from '../assets/lego-icons/mood/angry_04.png';
import angry5 from '../assets/lego-icons/mood/angry_05.png';

const MOOD_ICON_POOLS = {
  happy: [happy1, happy2, happy3, happy4, happy5, happy6, happy7, happy8, happy9, happy10, happy11, happy12, happy13, happy14, happy15, happy16, happy17, happy18, happy19, happy20, happy21, happy22, happy23, happy24, happy25],
  neutral: [neutral1, neutral2, neutral3, neutral4, neutral5, neutral6, neutral7, neutral8, neutral9, neutral10, neutral11, neutral12, neutral13, neutral14, neutral15, neutral16, neutral17, neutral18],
  angry: [angry1, angry2, angry3, angry4, angry5],
};

const MOOD_TIER_LABELS = {
  happy: '心情很好，繼續保持！',
  neutral: '有點躁動，小心一點',
  angry: '快要爆炸了，冷靜一下',
};

// 跟 data/traditionalColors.js 的 getTodayColorIndex 同一套算法(刻意複製一份，不共用
// 匯出——這個repo對這類小型日期算法的慣例就是各自放一份，見該檔案的說明)：用「今年
// 第幾天」對陣列長度取模，同一天結果固定、隔天自動換下一個，不需要额外的state或API。
function dayOfYear(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date - startOfYear) / 86_400_000);
}

function pickDailyFromPool(pool, date) {
  const index = ((dayOfYear(date) % pool.length) + pool.length) % pool.length;
  return pool[index];
}

// 依今天累計的違規confirmed次數，決定屬於哪個情緒分級——門檻數字沿用原本
// Home.jsx getMoodForCount的設定(<=2開心、<=5普通、其餘生氣)，只是抽成獨立函式
// 方便跟圖示挑選邏輯放在同一個檔案裡維護。
export function getMoodTierForCount(count) {
  if (count <= 2) {
    return 'happy';
  }
  if (count <= 5) {
    return 'neutral';
  }
  return 'angry';
}

// Home.jsx唯一需要呼叫的進入點：給違規次數，回傳這個分級「今天」要顯示的圖示路徑
// 跟說明文字。date參數只是方便測試時可以指定固定日期，平常呼叫不用傳。
export function getMoodDisplay(count, date = new Date()) {
  const tier = getMoodTierForCount(count);
  return {
    tier,
    icon: pickDailyFromPool(MOOD_ICON_POOLS[tier], date),
    label: MOOD_TIER_LABELS[tier],
  };
}
