import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useMemories } from '../hooks/useMemories.js';
import {
  buildMemoriesSummary,
  formatMemoryAmount,
  formatMemoryDate,
  formatMemorySequence,
  isDraftMemory,
  resolveMemoryDisplayDate,
} from '../utils/memory.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入回憶錄，請稍後再試。';

// 回憶錄首頁(spec section 5-7)：Header + Hero Summary + Reverse Chronological
// Timeline。故意不做成dashboard，Memories是Emotional Product。
function MemoryTimelineCard({ memory }) {
  const draft = isDraftMemory(memory);
  return (
    <Link
      to={draft ? `/memories/${memory.id}/edit` : `/memories/${memory.id}`}
      className="block overflow-hidden rounded-[1.75rem] bg-white shadow-lg shadow-rose-100 ring-1 ring-rose-50 transition hover:shadow-rose-200"
    >
      <div className="flex h-40 items-center justify-center bg-gradient-to-br from-rose-100 via-rose-50 to-white">
        {memory.coverPhotoUrl ? (
          <img src={memory.coverPhotoUrl} alt={memory.title || '聚會照片'} className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="text-4xl">🐷📷</span>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs font-bold text-rose-500">
          {formatMemorySequence(memory.sequenceNumber)} · {formatMemoryDate(resolveMemoryDisplayDate(memory))}
        </p>
        {draft ? (
          <>
            <p className="mt-1 text-lg font-black text-slate-950">新的回憶等你完成</p>
            <p className="mt-1 text-sm font-semibold text-rose-600">📝 尚未完成 · ＋ 補上照片與聚會資訊</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-black text-slate-950">{memory.title || '這次的聚會'}</p>
            {memory.location?.placeName ? (
              <p className="mt-1 text-sm text-slate-600">📍 {memory.location.placeName}</p>
            ) : null}
          </>
        )}
        <p className="mt-2 text-sm font-semibold text-slate-500">
          {memory.participants?.length ?? 0} 位成員 · {formatMemoryAmount(memory)}
        </p>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[2rem] bg-white/80 px-6 py-12 text-center shadow-lg shadow-rose-100">
      <p className="text-4xl">🐷📷</p>
      <p className="mt-4 text-lg font-black text-slate-950">還沒有第一篇回憶</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        下一次豬公結算後，
        <br />
        我們會把一起吃飯的故事
        <br />
        收藏在這裡。
        <br />
        期待第一次聚會 ❤️
      </p>
    </div>
  );
}

export default function Memories() {
  const groupId = useAuthStore((state) => state.groupId);
  const { memories, loading, error } = useMemories(groupId);
  const summary = buildMemoriesSummary(memories);

  return (
    <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">DaZhugong</p>
              <h1 className="mt-3 text-2xl font-black text-slate-950">❤️ 回憶本</h1>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                一起吃過的美食、繳過的罰金，
                <br />
                都是我們的回憶 ❤️
              </p>
            </div>
            <span aria-hidden="true" className="shrink-0 text-3xl">🐷📷</span>
          </div>
        </header>

        {loading ? (
          <div role="status" aria-live="polite" className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="font-semibold text-slate-950">載入回憶錄中…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-5 text-rose-950">
            <p className="font-semibold">目前無法載入回憶錄</p>
            <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
          </div>
        ) : memories.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Hero Summary：只是很簡單的累積感，故意不是dashboard(spec section 6) */}
            <div className="rounded-[2rem] bg-white/90 px-6 py-5 text-center shadow-lg shadow-rose-100">
              <p className="text-sm leading-7 text-slate-700">
                我們已經一起留下
                <br />
                <span className="text-xl font-black text-rose-700">{summary.gatheringCount}</span> 次聚會 ·{' '}
                <span className="text-xl font-black text-rose-700">{summary.photoCount}</span> 張照片
                <br />
                <span className="text-xl font-black text-rose-700">{summary.totalAmountLabel}</span> 的快樂
              </p>
            </div>

            <ol aria-label="回憶時間軸" className="space-y-4">
              {memories.map((memory) => (
                <li key={memory.id}>
                  <MemoryTimelineCard memory={memory} />
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
