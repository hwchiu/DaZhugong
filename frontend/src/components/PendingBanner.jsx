import { Link } from 'react-router-dom';
import { usePending } from '../hooks/usePending.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_BANNER_ERROR_MESSAGE = '待確認提醒暫時無法同步，請稍後前往待確認頁面查看。';

export default function PendingBanner() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { pending, loading, error } = usePending(groupId, currentMember?.id ?? null);

  if (!currentMember || loading) {
    return null;
  }

  if (error) {
    return (
      <section
        role="alert"
        className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">待確認提醒</p>
            <p className="mt-1 text-sm leading-6">{SAFE_BANNER_ERROR_MESSAGE}</p>
          </div>
          <Link
            to="/pending"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-amber-900"
          >
            查看待確認清單
          </Link>
        </div>
      </section>
    );
  }

  if (!pending.length) {
    return null;
  }

  return (
    <section
      role="alert"
      className="rounded-[1.75rem] border border-rose-200 bg-rose-50 px-5 py-4 text-rose-950 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">待確認提醒</p>
          <p className="mt-1 text-sm leading-6">
            你目前有 {pending.length} 筆待確認的一票，確認後才會正式加上 Token。
          </p>
        </div>
        <Link
          to="/pending"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-rose-800"
        >
          查看待確認清單
        </Link>
      </div>
    </section>
  );
}
