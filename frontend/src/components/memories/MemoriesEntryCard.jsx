import { Link } from 'react-router-dom';
import { buildMemoriesSummary, isDraftMemory } from '../../utils/memory.js';

// 大豬公回憶錄入口卡片(spec section 3/39/40)：故意不是普通button，用一張有辨識度的
// 大Card，讓使用者一眼知道「這不是Token transaction，是另外一個情感空間」。
// 這是唯一的Memories入口——Bottom Navigator不新增項目(spec section 59)。
export default function MemoriesEntryCard({ memories, loading }) {
  const summary = buildMemoriesSummary(memories);
  const latest = Array.isArray(memories) && memories.length ? memories[0] : null;
  const draftCount = (Array.isArray(memories) ? memories : []).filter(isDraftMemory).length;

  return (
    <Link
      to="/memories"
      aria-label="大豬公回憶錄"
      className="relative block overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#fff1f4] via-white to-[#fff7f8] p-5 shadow-lg shadow-rose-100 ring-1 ring-rose-100 transition hover:shadow-rose-200"
    >
      {/* scrapbook紋理：淡淡的斜紋膠帶裝飾，跟Token transaction的乾淨卡片做視覺區隔 */}
      <span
        aria-hidden="true"
        className="absolute -right-6 -top-6 h-24 w-24 rotate-12 rounded-lg bg-rose-200/40"
      />
      <span aria-hidden="true" className="absolute right-4 top-4 rotate-6 rounded bg-white/70 px-3 py-1 text-xs text-rose-300 shadow-sm">
        📷
      </span>

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-black text-rose-700">大豬公回憶錄</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            一起吃過的美食、繳過的罰金，
            <br />
            都是我們的回憶 ❤️
          </p>
        </div>
        <span aria-hidden="true" className="mt-1 shrink-0 text-2xl text-rose-300">→</span>
      </div>

      {!loading ? (
        <div className="relative mt-4 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
          <div className="text-xs font-semibold text-slate-600">
            <span className="text-sm font-black text-rose-700">{summary.gatheringCount}</span> 次聚會 ·{' '}
            <span className="text-sm font-black text-rose-700">{summary.photoCount}</span> 張照片
            {latest?.title ? (
              <p className="mt-1 truncate text-slate-500">最新：{latest.title}</p>
            ) : null}
          </div>
          <span aria-hidden="true" className="text-2xl">🐷</span>
        </div>
      ) : null}

      {draftCount > 0 ? (
        <span
          aria-label={`${draftCount} 篇回憶等你完成`}
          className="absolute left-4 top-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white"
        >
          {draftCount}
        </span>
      ) : null}
    </Link>
  );
}
