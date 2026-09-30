import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { useAuthStore } from '../store/authStore.js';
import { useGroup } from '../hooks/useGroup.js';
import { useMemory } from '../hooks/useMemory.js';
import { addMemoryComment, deleteMemoryComment } from '../services/memoryCommentService.js';
import { deleteMemoryPhoto } from '../services/memoryPhotoService.js';
import { downloadMemoryCoverImage } from '../utils/memoryCover.js';
import { formatAmount, formatTokenValue } from '../utils/settlement.js';
import {
  formatMemoryAmount,
  formatMemoryDate,
  formatMemorySequence,
  formatMemoryTokenValue,
  resolveCoverPhotoUrl,
  resolveMemoryDisplayDate,
} from '../utils/memory.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入這篇回憶，請稍後再試。';
const SAFE_ACTION_ERROR_MESSAGE = '這個操作暫時無法完成，請稍後再試。';

const TABS = [
  { id: 'settlement', label: '成員結算' },
  { id: 'photos', label: '照片回憶' },
  { id: 'location', label: '地點資訊' },
  { id: 'comments', label: '留言' },
];

function formatCommentTime(timestamp) {
  const millis = timestamp?.toMillis?.() ?? (typeof timestamp?.seconds === 'number' ? timestamp.seconds * 1000 : null);
  if (!millis) return '';
  return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(millis),
  );
}

export default function MemoryDetail() {
  const { memoryId } = useParams();
  const navigate = useNavigate();
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members } = useGroup(groupId);
  const { memory, photos, comments, loading, error } = useMemory(groupId, memoryId);

  const [activeTab, setActiveTab] = useState('settlement');
  const [commentText, setCommentText] = useState('');
  const [actionError, setActionError] = useState('');
  const [commentPending, setCommentPending] = useState(false);

  const membersById = useMemo(() => new Map((members ?? []).map((member) => [member.id, member])), [members]);
  const coverUrl = resolveCoverPhotoUrl(memory, photos, null);

  async function handleAddComment(event) {
    event.preventDefault();
    if (commentPending || !commentText.trim()) return;
    setCommentPending(true);
    setActionError('');
    try {
      await addMemoryComment({ groupId, memoryId, currentMember, content: commentText });
      setCommentText('');
    } catch {
      setActionError(SAFE_ACTION_ERROR_MESSAGE);
    } finally {
      setCommentPending(false);
    }
  }

  async function handleDeleteComment(commentId) {
    setActionError('');
    try {
      await deleteMemoryComment({ groupId, memoryId, commentId });
    } catch {
      setActionError(SAFE_ACTION_ERROR_MESSAGE);
    }
  }

  async function handleDeletePhoto(photo) {
    setActionError('');
    try {
      await deleteMemoryPhoto({ groupId, memoryId, photo });
    } catch {
      setActionError(SAFE_ACTION_ERROR_MESSAGE);
    }
  }

  if (loading) {
    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div role="status" aria-live="polite" className="mx-auto mt-8 w-full max-w-md rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
          <p className="font-semibold text-slate-950">載入回憶中…</p>
        </div>
      </section>
    );
  }

  if (error || !memory) {
    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div role="alert" className="mx-auto mt-8 w-full max-w-md rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-8 text-center text-rose-950">
          <p className="font-semibold">{error ? SAFE_LOAD_ERROR_MESSAGE : '找不到這篇回憶'}</p>
          <Link to="/memories" className="mt-4 inline-block text-sm font-bold text-rose-800 underline">
            返回回憶錄
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="app-page bg-slate-50 px-0 pb-6 text-slate-900">
      {/* Hero(spec section 19)：大面積封面照片主導，不是資訊表 */}
      <div className="relative flex h-[42vh] min-h-64 items-end justify-center overflow-hidden bg-gradient-to-br from-rose-200 via-rose-100 to-white">
        {coverUrl ? (
          <img src={coverUrl} alt={memory.title || '聚會照片'} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="mb-10 text-6xl">🐷📷</span>
        )}
        <button
          type="button"
          onClick={() => navigate('/memories')}
          aria-label="返回回憶錄"
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg font-bold text-slate-800 shadow"
        >
          ←
        </button>
        <div className="relative z-10 w-full bg-gradient-to-t from-black/60 to-transparent px-5 pb-4 pt-16 text-white">
          <p className="text-sm font-bold">
            {formatMemorySequence(memory.sequenceNumber)} · {formatMemoryDate(resolveMemoryDisplayDate(memory))}
          </p>
          <h1 className="mt-1 text-2xl font-black">{memory.title || '這次的聚會'}</h1>
          {memory.location?.placeName ? <p className="mt-1 text-sm">📍 {memory.location.placeName}</p> : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-4">
        {memory.story ? <p className="rounded-2xl bg-white px-4 py-4 text-sm leading-6 text-slate-700 shadow-sm shadow-rose-100">{memory.story}</p> : null}

        <div className="flex flex-wrap justify-between gap-2">
          <Link
            to={`/memories/${memory.id}/edit`}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-2xl border-2 border-rose-800 bg-white px-3 text-sm font-bold text-rose-900 transition hover:bg-rose-50"
          >
            ✏️ 補上內容
          </Link>
          <button
            type="button"
            onClick={() => downloadMemoryCoverImage(memory, coverUrl)}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-2xl bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            🖼️ 生成回憶封面
          </button>
        </div>

        {actionError ? (
          <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950">
            {actionError}
          </p>
        ) : null}

        {/* sticky segmented navigation(spec section 20) */}
        <div role="tablist" aria-label="回憶內容分頁" className="sticky top-0 z-10 grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 shadow-sm shadow-rose-100">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                activeTab === tab.id ? 'bg-rose-100 text-rose-700' : 'text-slate-500 hover:bg-rose-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'settlement' ? (
          <section aria-label="成員結算">
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm shadow-rose-100">
              <p className="text-sm font-semibold text-slate-500">本次晚餐</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{formatMemoryTokenValue(memory)}</p>
              <p className="text-lg font-black text-rose-700">{formatMemoryAmount(memory)}</p>
            </div>
            <ul className="mt-3 space-y-2">
              {(memory.settlementSnapshot?.members ?? []).map((member) => (
                <li key={member.memberId} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm shadow-rose-100">
                  <MemberAvatar member={membersById.get(member.memberId) ?? { id: member.memberId, name: member.displayName }} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-bold text-slate-950">{member.displayName}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-semibold text-slate-500">{formatTokenValue(member.tokenValue)} Token</span>
                    <span className="block text-lg font-black tabular-nums text-rose-700">{formatAmount(member.amount, memory.settlementSnapshot?.currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {activeTab === 'photos' ? (
          <section aria-label="照片回憶">
            {photos.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-sm shadow-rose-100">還沒有照片，前往補上內容新增第一張吧！</p>
            ) : (
              <div className="columns-2 gap-2 [column-fill:_balance]">
                {photos.map((photo) => (
                  <figure key={photo.id} className="relative mb-2 break-inside-avoid overflow-hidden rounded-xl bg-white shadow-sm shadow-rose-100">
                    <img
                      src={photo.thumbnailUrl ?? photo.downloadUrl}
                      alt={photo.caption || `${memory.title || '這次的聚會'}的聚會照片`}
                      className="w-full object-cover"
                    />
                    {photo.uploadedBy === currentMember?.id ? (
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(photo)}
                        aria-label="刪除照片"
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                      >
                        ✕
                      </button>
                    ) : null}
                  </figure>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'location' ? (
          <section aria-label="地點資訊" className="rounded-2xl bg-white px-5 py-5 shadow-sm shadow-rose-100">
            {memory.location?.placeName ? (
              <>
                <p className="font-bold text-slate-950">📍 {memory.location.placeName}</p>
                {memory.location.address ? <p className="mt-1 text-sm text-slate-600">{memory.location.address}</p> : null}
                {memory.location.latitude && memory.location.longitude ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${memory.location.latitude},${memory.location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm font-bold text-rose-700 underline"
                  >
                    在地圖中開啟
                  </a>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-600">還沒有補上地點，前往補上內容新增吧！</p>
            )}
          </section>
        ) : null}

        {activeTab === 'comments' ? (
          <section aria-label="留言" className="flex flex-col gap-3">
            {comments.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-sm shadow-rose-100">還沒有留言，說說這次聚會吧！</p>
            ) : (
              <ul className="space-y-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-2xl bg-white px-4 py-3 shadow-sm shadow-rose-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-950">{comment.authorNameSnapshot}</span>
                      <span className="text-xs text-slate-400">{formatCommentTime(comment.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{comment.content}</p>
                    {comment.authorId === currentMember?.id ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        className="mt-1 text-xs font-semibold text-rose-600 underline"
                      >
                        刪除
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddComment} className="flex items-center gap-2">
              <label htmlFor="memory-comment" className="sr-only">留言內容</label>
              <input
                id="memory-comment"
                type="text"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="今天超開心！下次再約✨"
                maxLength={500}
                className="min-h-11 flex-1 rounded-2xl border border-rose-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-rose-300"
              />
              <button
                type="submit"
                disabled={commentPending || !commentText.trim()}
                className="min-h-11 rounded-2xl bg-rose-700 px-4 text-sm font-bold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                送出
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </section>
  );
}
