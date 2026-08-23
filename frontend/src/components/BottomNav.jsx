import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', icon: '🐷', label: '首頁' },
  { to: '/vote', icon: '🗳️', label: '投票' },
  { to: '/history', icon: '📋', label: '歷史紀錄' },
  { to: '/stats', icon: '📊', label: '統計' },
  { to: '/settings', icon: '⚙️', label: '設定' },
];

export default function BottomNav() {
  return (
    <nav aria-label="主要功能導覽" className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-md border-t border-rose-100 bg-white/95 shadow-[0_-8px_24px_rgba(244,114,182,0.08)] backdrop-blur">
        <div
          className="grid grid-cols-5 gap-1 px-2 pt-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 py-1 text-xs font-medium transition ${
                  isActive ? 'bg-rose-50 text-pink-600' : 'text-slate-400'
                }`
              }
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {tab.icon}
              </span>
              <span className="mt-1">{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
