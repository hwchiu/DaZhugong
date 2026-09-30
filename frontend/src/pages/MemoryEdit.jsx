import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useMemory } from '../hooks/useMemory.js';
import { publishMemory, updateMemory } from '../services/memoryService.js';
import { uploadMemoryPhoto } from '../services/memoryPhotoService.js';
import { formatMemoryAmount, formatMemorySequence, formatMemoryTokenValue } from '../utils/memory.js';

const SAFE_ACTION_ERROR_MESSAGE = '這個操作暫時無法完成，請稍後再試。';

function toDateInputValue(timestamp) {
  const millis = timestamp?.toMillis?.() ?? (typeof timestamp?.seconds === 'number' ? timestamp.seconds * 1000 : null);
  if (!millis) return '';
  const date = new Date(millis);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 補上回憶(spec section 13/33)：MVP只需要Settlement就能存在，title/story/
// eventDate/location/photos全部可以後補、也可以先儲存Draft再回來補。
export default function MemoryEdit() {
  const { memoryId } = useParams();
  const navigate = useNavigate();
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { memory, photos, loading, error } = useMemory(groupId, memoryId);

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [coverPhotoId, setCoverPhotoId] = useState('');
  const [savePending, setSavePending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [actionError, setActionError] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!memory || initialized) return;
    setTitle(memory.title ?? '');
    setStory(memory.story ?? '');
    setEventDate(toDateInputValue(memory.eventDate) || toDateInputValue(memory.createdAt));
    setPlaceName(memory.location?.placeName ?? '');
    setAddress(memory.location?.address ?? '');
    setCoverPhotoId(memory.coverPhotoId ?? '');
    setInitialized(true);
  }, [memory, initialized]);

  async function handleSave(nextStatus) {
    if (savePending) return;
    setSavePending(true);
    setActionError('');
    try {
      await updateMemory({
        groupId,
        memoryId,
        currentMember,
        patch: {
          title: title.trim(),
          story: story.trim() || null,
          eventDate: eventDate ? new Date(`${eventDate}T00:00:00`) : null,
          location: placeName.trim() ? { placeName: placeName.trim(), address: address.trim() || null } : null,
          coverPhotoId: coverPhotoId || null,
        },
      });
      if (nextStatus === 'PUBLISHED' && memory?.status !== 'PUBLISHED') {
        await publishMemory({ groupId, memoryId, currentMember });
      }
      navigate(`/memories/${memoryId}`);
    } catch {
      setActionError(SAFE_ACTION_ERROR_MESSAGE);
    } finally {
      setSavePending(false);
    }
  }

  async function handleUploadPhotos(event) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setActionError('');

    for (let index = 0; index < files.length; index += 1) {
      setUploadProgress({ current: index + 1, total: files.length });
      try {
        const uploaded = await uploadMemoryPhoto({
          groupId,
          memoryId,
          file: files[index],
          currentMember,
          order: photos.length + index,
        });
        await updateMemory({ groupId, memoryId, currentMember, patch: { photoCount: photos.length + index + 1 } });
        if (!coverPhotoId) {
          setCoverPhotoId(uploaded.id);
        }
      } catch {
        setActionError('有 1 張照片還沒上傳成功，請重新上傳。');
      }
    }

    setUploadProgress(null);
    event.target.value = '';
  }

  if (loading) {
    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div role="status" aria-live="polite" className="mx-auto mt-8 w-full max-w-md rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
          <p className="font-semibold text-slate-950">載入中…</p>
        </div>
      </section>
    );
  }

  if (error || !memory) {
    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div role="alert" className="mx-auto mt-8 w-full max-w-md rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-8 text-center text-rose-950">
          <p className="font-semibold">找不到這篇回憶</p>
          <Link to="/memories" className="mt-4 inline-block text-sm font-bold text-rose-800 underline">返回回憶錄</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="flex items-center justify-between rounded-[2rem] bg-white/95 px-5 py-4 shadow-lg shadow-rose-100">
          <button type="button" onClick={() => navigate(`/memories/${memoryId}`)} className="text-sm font-bold text-slate-600">取消</button>
          <p className="text-base font-black text-slate-950">{formatMemorySequence(memory.sequenceNumber)} 新增回憶</p>
          <button
            type="button"
            disabled={savePending}
            onClick={() => handleSave(memory.status)}
            className="text-sm font-bold text-rose-700 disabled:opacity-50"
          >
            {savePending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="rounded-2xl bg-white/90 px-5 py-4 text-sm text-slate-600 shadow-sm shadow-rose-100">
          <p>Settlement {memory.settlementId}</p>
          <p className="mt-1 font-bold text-slate-950">{formatMemoryTokenValue(memory)} · {formatMemoryAmount(memory)}</p>
          <p className="mt-1">Members {memory.participants?.length ?? 0}</p>
        </div>

        {actionError ? (
          <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950">{actionError}</p>
        ) : null}

        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-300 bg-white text-sm font-bold text-rose-700">
          ＋ 新增照片
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="hidden" onChange={handleUploadPhotos} />
        </label>

        {uploadProgress ? (
          <p className="text-center text-xs font-semibold text-slate-500">正在上傳 {uploadProgress.current} / {uploadProgress.total}</p>
        ) : null}

        {photos.length ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setCoverPhotoId(photo.id)}
                className={`relative overflow-hidden rounded-xl ring-2 ${coverPhotoId === photo.id ? 'ring-rose-600' : 'ring-transparent'}`}
              >
                <img src={photo.thumbnailUrl ?? photo.downloadUrl} alt="" className="h-20 w-full object-cover" />
                {coverPhotoId === photo.id ? (
                  <span className="absolute bottom-1 right-1 rounded-full bg-rose-700 px-1.5 text-[10px] font-bold text-white">封面</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <label className="text-sm font-bold text-slate-700">
          聚會名稱
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="秋日燒肉之夜"
            className="mt-1 min-h-11 w-full rounded-2xl border border-rose-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-rose-300"
          />
        </label>

        <label className="text-sm font-bold text-slate-700">
          日期
          <input
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-2xl border border-rose-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-rose-300"
          />
        </label>

        <label className="text-sm font-bold text-slate-700">
          地點
          <input
            type="text"
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
            placeholder="📍 添加地點"
            className="mt-1 min-h-11 w-full rounded-2xl border border-rose-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-rose-300"
          />
        </label>

        {placeName.trim() ? (
          <label className="text-sm font-bold text-slate-700">
            地址
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="台北市信義區松壽路12號2樓"
              className="mt-1 min-h-11 w-full rounded-2xl border border-rose-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-rose-300"
            />
          </label>
        ) : null}

        <label className="text-sm font-bold text-slate-700">
          這次的故事
          <textarea
            value={story}
            onChange={(event) => setStory(event.target.value)}
            placeholder="九月的聚餐，邊吃燒肉邊聊工作和生活…"
            rows={4}
            className="mt-1 w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-rose-300"
          />
        </label>

        {memory.status === 'DRAFT' ? (
          <button
            type="button"
            disabled={savePending}
            onClick={() => handleSave('PUBLISHED')}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-700 px-4 py-3 text-base font-bold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ❤️ 儲存並發佈回憶
          </button>
        ) : null}
      </div>
    </section>
  );
}
