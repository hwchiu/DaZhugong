import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/Login.jsx';
import BottomNav from './components/BottomNav.jsx';
import Home from './pages/Home.jsx';
import Vote from './pages/Vote.jsx';
import Pending from './pages/Pending.jsx';
import History from './pages/History.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import { useAuthStore } from './store/authStore.js';

function AppContent() {
  const authReady = useAuthStore((state) => state.authReady);
  const currentMember = useAuthStore((state) => state.currentMember);

  if (!authReady) {
    return (
      <main
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-rose-50 px-6 py-12 text-slate-800"
      >
        <section className="w-full max-w-sm rounded-3xl bg-white px-8 py-10 text-center shadow-lg shadow-rose-100">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-rose-400">DaZhugong</p>
          <h1 className="mt-4 text-3xl font-bold text-rose-500">登入狀態載入中</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">正在確認你的登入身分，請稍候。</p>
        </section>
      </main>
    );
  }

  if (!currentMember) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-rose-50">
      <div
        className="mx-auto flex min-h-screen max-w-md flex-col bg-white"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
      >
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/vote" element={<Vote />} />
            <Route path="/pending" element={<Pending />} />
            <Route path="/history" element={<History />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
