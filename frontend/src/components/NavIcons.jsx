// Loft風格的線條圖示，取代原本的emoji，統一給BottomNav跟首頁選單抽屜共用。
// 風格：細線條(stroke-based)、圓角端點、無填色，顏色完全繼承currentColor，
// 跟著父層的active/inactive文字顏色自動變化，不用另外管理圖示配色。
const BASE_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export function HomeIcon({ className }) {
  return (
    <svg {...BASE_PROPS} className={className}>
      {/* 極簡小豬撲滿剪影：圓潤身體 + 投幣孔 + 兩隻耳朵 + 鼻子 */}
      <path d="M4.5 13.5c0-3.6 3.2-6.2 7.5-6.2s7.5 2.6 7.5 6.2c0 2.2-1.2 3.9-3 5v1.7a.8.8 0 0 1-.8.8h-1.4a.8.8 0 0 1-.8-.8v-.6a12 12 0 0 1-3 0v.6a.8.8 0 0 1-.8.8H8.3a.8.8 0 0 1-.8-.8v-1.7c-1.8-1.1-3-2.8-3-5Z" />
      <path d="M9 7.6 8.3 5.4 10.5 6.7" />
      <path d="M15 7.6l.7-2.2-2.2 1.3" />
      <circle cx="16.3" cy="13" r=".9" fill="currentColor" stroke="none" />
      <path d="M10.8 10.2h2.6" />
      <path d="M6.3 15.2v1.6" />
    </svg>
  );
}

export function VoteIcon({ className }) {
  return (
    <svg {...BASE_PROPS} className={className}>
      {/* 投票箱：箱身 + 投入口 + 打勾的選票 */}
      <path d="M4.5 11.5h15v7.2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7.2Z" />
      <path d="M4.5 11.5 6.8 6h10.4l2.3 5.5" />
      <path d="M9.2 11.5h5.6" />
      <path d="M9.3 6.8l1.7 1.9 3.4-3.9" />
    </svg>
  );
}

export function HistoryIcon({ className }) {
  return (
    <svg {...BASE_PROPS} className={className}>
      {/* 剪貼板：夾板外框 + 上緣夾夾 + 三行紀錄線 */}
      <rect x="5.5" y="4.5" width="13" height="16" rx="1.6" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M8.3 10.5h7.4" />
      <path d="M8.3 13.7h7.4" />
      <path d="M8.3 16.9h4.6" />
    </svg>
  );
}

export function StatsIcon({ className }) {
  return (
    <svg {...BASE_PROPS} className={className}>
      {/* 長短不一的長條圖 */}
      <path d="M5 20V11" />
      <path d="M12 20V6" />
      <path d="M19 20v-6.5" />
      <path d="M3.5 20h17" />
    </svg>
  );
}

export function SettingsIcon({ className }) {
  return (
    <svg {...BASE_PROPS} className={className}>
      {/* 滑桿式設定圖示：三條軌道各配一個滑鈕 */}
      <path d="M4 7h9.5" />
      <circle cx="16" cy="7" r="1.8" />
      <path d="M20 7h-1.2" />
      <path d="M4 12h1.2" />
      <circle cx="8" cy="12" r="1.8" />
      <path d="M11 12H20" />
      <path d="M4 17h13.5" />
      <circle cx="19" cy="17" r="1.8" />
    </svg>
  );
}

export function TokenIcon({ className }) {
  return (
    <svg {...BASE_PROPS} className={className}>
      {/* 硬幣：圓框+五角星，呼應3D豬公裡實際的硬幣造型 */}
      <circle cx="12" cy="12" r="8" />
      <path
        d="M12 8.2 13 10.6 15.6 10.9 13.7 12.7 14.2 15.3 12 14 9.8 15.3 10.3 12.7 8.4 10.9 11 10.6Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function PlusIcon({ className }) {
  return (
    <svg {...BASE_PROPS} strokeWidth={2.2} className={className}>
      {/* 底部導覽列中間投票FAB用的+號，跟其他線條圖示同一套筆畫粗細/圓角端點 */}
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export const NAV_ICON_BY_KEY = {
  home: HomeIcon,
  vote: VoteIcon,
  history: HistoryIcon,
  stats: StatsIcon,
  settings: SettingsIcon,
};
