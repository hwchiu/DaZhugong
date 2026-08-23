import PendingBanner from '../components/PendingBanner.jsx';

export default function Home() {
  return (
    <section className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 py-6 text-slate-800">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PendingBanner />

        <section className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-rose-400">DaZhugong</p>
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="text-3xl leading-none">
              🐷
            </span>
            <h1 className="text-2xl font-bold text-slate-800">首頁</h1>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">這是首頁暫存頁，之後會替換成正式的主畫面內容。</p>
        </section>
      </div>
    </section>
  );
}
