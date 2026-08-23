import { useEffect, useMemo, useState } from 'react';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { reportToken } from '../services/tokenService.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入投票資料，請稍後再試。';
const SAFE_SUBMIT_ERROR_MESSAGE = '目前無法送出這一票，請稍後再試。';

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

function buildConfirmedTotals(tokens) {
  const totals = new Map();

  for (const token of tokens) {
    if (typeof token?.targetId !== 'string') {
      continue;
    }

    totals.set(token.targetId, (totals.get(token.targetId) ?? 0) + 1);
  }

  return totals;
}

function toSafeLoadMessage(error) {
  return error instanceof Error && error.message ? SAFE_LOAD_ERROR_MESSAGE : SAFE_LOAD_ERROR_MESSAGE;
}

export default function Vote() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const { tokens, loading: tokensLoading, error: tokensError } = useTokens(groupId, 100);
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState({ tone: null, message: '' });

  const totalsByTargetId = useMemo(() => buildConfirmedTotals(tokens), [tokens]);
  const eligibleMembers = useMemo(
    () =>
      members
        .filter((member) => member?.active === true && member?.id !== currentMember?.id)
        .map((member) => ({
          ...member,
          confirmedCount: totalsByTargetId.get(member.id) ?? 0,
        })),
    [currentMember?.id, members, totalsByTargetId],
  );
  const selectedMember = eligibleMembers.find((member) => member.id === selectedId) ?? null;
  const selectedTargetMember =
    members.find((member) => member?.id === selectedId && member?.active === true) ?? null;
  const loading = groupLoading || tokensLoading;
  const loadError = groupError || tokensError;

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (!eligibleMembers.some((member) => member.id === selectedId)) {
      setSelectedId('');
    }
  }, [eligibleMembers, selectedId]);

  function handleSelect(member) {
    if (pending) {
      return;
    }

    setSelectedId(member.id);
    setFeedback({ tone: null, message: '' });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedMember || !selectedTargetMember || !currentMember || !groupId || pending) {
      return;
    }

    setPending(true);
    setFeedback({ tone: null, message: '' });

    try {
      await reportToken({
        groupId,
        targetId: selectedMember.id,
        targetMember: selectedTargetMember,
        currentMember,
      });
      setSelectedId('');
      setFeedback({
        tone: 'success',
        message: `已送出給${getMemberName(selectedMember)}的一票，等待對方確認。`,
      });
    } catch {
      setFeedback({
        tone: 'error',
        message: SAFE_SUBMIT_ERROR_MESSAGE,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 py-6 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <section className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-rose-400">DaZhugong</p>
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="text-3xl leading-none">
              🗳️
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">投票</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">選擇一位仍在群組中的成員，送出待確認的一票。</p>
            </div>
          </div>
        </section>

        {loading ? (
          <section
            role="status"
            aria-live="polite"
            className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100"
          >
            <p className="text-base font-semibold text-slate-900">載入可投票成員中…</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">正在同步目前成員與已確認票數。</p>
          </section>
        ) : loadError ? (
          <section role="alert" className="rounded-[2rem] border border-rose-200 bg-rose-50 px-6 py-5 text-rose-900 shadow-sm">
            <p className="text-base font-semibold">目前無法載入投票資料</p>
            <p className="mt-2 text-sm leading-6">{toSafeLoadMessage(loadError)}</p>
          </section>
        ) : (
          <>
            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">選擇對象</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">只顯示其他 active 成員，票數依已確認紀錄計算。</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {eligibleMembers.length} 人可選
                </span>
              </div>

              {eligibleMembers.length ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {eligibleMembers.map((member) => {
                    const selected = member.id === selectedMember?.id;
                    const memberName = getMemberName(member);

                    return (
                      <button
                        key={member.id}
                        type="button"
                        disabled={pending}
                        aria-pressed={selected}
                        aria-label={`${memberName}，已確認 ${member.confirmedCount} 票`}
                        onClick={() => handleSelect(member)}
                        className={`flex min-h-44 flex-col items-center rounded-[1.75rem] border px-4 py-4 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                          selected
                            ? 'border-slate-900 bg-slate-50 shadow-md shadow-slate-200'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <MemberAvatar member={member} size="md" />
                        <span className="mt-3 text-base font-semibold text-slate-900">{memberName}</span>
                        <span className="mt-2 rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">
                          已確認 {member.confirmedCount} 票
                        </span>
                        <span className="mt-3 text-sm leading-6 text-slate-600">
                          {selected ? '已選擇，準備送出。' : '點一下即可選擇。'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <p className="text-base font-semibold text-slate-900">目前沒有其他可投票的成員。</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">等待其他 active 成員加入後，就能在這裡送出一票。</p>
                </div>
              )}
            </section>

            <form onSubmit={handleSubmit} className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div className="rounded-[1.5rem] bg-slate-50 px-4 py-4">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">目前選擇</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {selectedMember ? `目前選擇：${getMemberName(selectedMember)}` : '請先選擇一位成員'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  送出後會先進入待確認狀態，對方確認後才會計入正式票數。
                </p>
              </div>

              {feedback.message ? (
                <p
                  role={feedback.tone === 'error' ? 'alert' : 'status'}
                  aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
                    feedback.tone === 'error'
                      ? 'bg-rose-50 text-rose-900'
                      : 'bg-emerald-50 text-emerald-900'
                  }`}
                >
                  {feedback.message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!selectedMember || pending}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
              >
                {pending ? '送出中…' : selectedMember ? '送出一票' : '請先選擇成員'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
