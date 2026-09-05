import { NavLink } from 'react-router-dom';
import { HistoryIcon, HomeIcon, PlusIcon, SettingsIcon, StatsIcon } from './NavIcons.jsx';

// 投票是中間的浮動主要按鈕(FAB)，不跟其他4個放在同一個TABS陣列裡處理，
// 因為它的視覺(圓形、往上突出、漸層底色)跟其他純文字+線條圖示的分頁完全不同。
const SIDE_TABS = [
  { to: '/', Icon: HomeIcon, label: '首頁' },
  { to: '/history', Icon: HistoryIcon, label: '記錄' },
  { to: '/stats', Icon: StatsIcon, label: '統計' },
  { to: '/settings', Icon: SettingsIcon, label: '設定' },
];

export default function BottomNav() {
  return (
    <nav aria-label="主要功能導覽" className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-md border-t border-rose-100 bg-white/95 shadow-[0_-8px_24px_rgba(244,114,182,0.08)] backdrop-blur">
        <div
          className="grid grid-cols-5 items-end gap-1 px-2 pt-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
        >
          {SIDE_TABS.slice(0, 2).map(({ to, Icon, label }) => (
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
              <Icon className="h-6 w-6" />
              <span className="mt-1">{label}</span>
            </NavLink>
          ))}

          <NavLink to="/vote" end aria-label="投票" className="flex flex-col items-center">
            {({ isActive }) => (
              <>
                <span
                  className={`bg-brand-gradient -mt-7 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-white transition ${
                    isActive ? 'scale-105' : ''
                  }`}
                >
                  <PlusIcon className="h-7 w-7" />
                </span>
                <span className={`mt-1 text-xs font-medium ${isActive ? 'text-brand' : 'text-slate-600'}`}>投票</span>
              </>
            )}
          </NavLink>

          {SIDE_TABS.slice(2).map(({ to, Icon, label }) => (
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
              <Icon className="h-6 w-6" />
              <span className="mt-1">{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
