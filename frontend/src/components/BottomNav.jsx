import { NavLink } from 'react-router-dom';
import homePigIcon from '../assets/lego-icons/home_pig_icon_only.png';
import historyIcon from '../assets/lego-icons/history.png';
import settingsIcon from '../assets/lego-icons/settings_bottom.png';
import statsIcon from '../assets/lego-icons/stats.png';
import tokenBadgeIcon from '../assets/lego-icons/token_badge.png';

// 投票是中間的浮動主要按鈕(FAB)，不跟其他4個放在同一個TABS陣列裡處理，
// 因為它的視覺(圓形、往上突出、漸層底色)跟其他純圖片圖示的分頁完全不同。
//
// 這裡從Loft風格的線條SVG圖示(NavIcons.jsx)換成使用者提供的樂高風格照片圖示。
// 有一個明確的取捨要記住：SVG版本用currentColor，active/inactive狀態可以直接
// 讓圖示本身變色；照片圖示做不到這件事(沒辦法動態換照片裡的顏色)，所以這裡改用
// 「圖示大小/透明度」+「底色圓角/文字顏色」共同表示目前選中狀態，不再依賴圖示變色。
const SIDE_TABS = [
  { to: '/', icon: homePigIcon, label: '首頁' },
  { to: '/history', icon: historyIcon, label: '記錄' },
  { to: '/stats', icon: statsIcon, label: '統計' },
  { to: '/settings', icon: settingsIcon, label: '設定' },
];

export default function BottomNav() {
  return (
    <nav aria-label="主要功能導覽" className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-md border-t border-rose-100 bg-white/95 shadow-[0_-8px_24px_rgba(244,114,182,0.08)] backdrop-blur">
        <div
          className="grid grid-cols-5 items-end gap-1 px-2 pt-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
        >
          {SIDE_TABS.slice(0, 2).map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 py-1 text-xs font-medium transition ${
                  isActive ? 'bg-brand-soft text-brand' : 'text-slate-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <img
                    src={icon}
                    alt=""
                    aria-hidden="true"
                    className={`h-7 w-7 object-contain transition ${isActive ? 'scale-110' : 'opacity-60'}`}
                  />
                  <span className="mt-1">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          <NavLink to="/vote" end aria-label="投票" className="flex flex-col items-center">
            {({ isActive }) => (
              <>
                <span
                  className={`bg-brand-gradient -mt-7 flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-white transition ${
                    isActive ? 'scale-105' : ''
                  }`}
                >
                  <img src={tokenBadgeIcon} alt="" aria-hidden="true" className="h-9 w-9 object-contain" />
                </span>
                <span className={`mt-1 text-xs font-medium ${isActive ? 'text-brand' : 'text-slate-600'}`}>投票</span>
              </>
            )}
          </NavLink>

          {SIDE_TABS.slice(2).map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 py-1 text-xs font-medium transition ${
                  isActive ? 'bg-brand-soft text-brand' : 'text-slate-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <img
                    src={icon}
                    alt=""
                    aria-hidden="true"
                    className={`h-7 w-7 object-contain transition ${isActive ? 'scale-110' : 'opacity-60'}`}
                  />
                  <span className="mt-1">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
