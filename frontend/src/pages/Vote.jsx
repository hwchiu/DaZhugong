import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useNowTicker } from '../hooks/useNowTicker.js';
import { useTokens } from '../hooks/useTokens.js';
import { reportAndConfirmToken } from '../services/tokenService.js';
import { useAuthStore } from '../store/authStore.js';
import { formatCooldownRemaining, getCooldownStatus } from '../utils/cooldown.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入投票資料，請稍後再試。';
const SAFE_SUBMIT_ERROR_MESSAGE = '目前無法儲存這筆紀錄，請稍後再試。';
const REASON_MAX_LENGTH = 200;

// 快速選取的常用原因；「其他」永遠加在最後，代表使用者要自己打字，不在這個清單裡。
const REASON_PRESETS = [
  { id: 'teams', label: '偷看teams', value: '偷看teams' },
  { id: 'meeting', label: '討論會議', value: '討論會議' },
  { id: 'assign', label: '分派任務', value: '分派任務' },
  { id: 'progress', label: '詢問進度', value: '詢問進度' },
];

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
  const navigate = useNavigate();
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const { tokens, loading: tokensLoading, error: tokensError } = useTokens(groupId, null);
  const [selectedId, setSelectedId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [modalError, setModalError] = useState('');
  const [feedback, setFeedback] = useState({ tone: null, message: '' });
  const reasonInputRef = useRef(null);

  const now = useNowTicker();
  const totalsByTargetId = useMemo(() => buildConfirmedTotals(tokens), [tokens]);
  const eligibleMembers = useMemo(
    () =>
      members
        .filter((member) => member?.active === true && member?.id !== currentMember?.id)
        .map((member) => ({
          ...member,
          confirmedCount: totalsByTargetId.get(member.id) ?? 0,
          cooldown: getCooldownStatus(tokens, member.id, now),
        })),
    [currentMember?.id, members, tokens, totalsByTargetId, now],
  );
  const selectedMember = eligibleMembers.find((member) => member.id === selectedId) ?? null;
  const selectedTargetMember =
    members.find((member) => member?.id === selectedId && member?.active === true) ?? null;
  const loading = groupLoading || tokensLoading;
  const loadError = groupError || tokensError;
  const trimmedReason = reason.trim();

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const stillEligible = eligibleMembers.find((member) => member.id === selectedId);
    if (!stillEligible || stillEligible.cooldown.inCooldown) {
      setSelectedId('');
    }
  }, [eligibleMembers, selectedId]);

  useEffect(() => {
    if (modalOpen) {
      reasonInputRef.current?.focus();
    }
  }, [modalOpen]);

  function handleSelect(member) {
    if (pending || member?.cooldown?.inCooldown) {
      return;
    }

    setSelectedId(member.id);
    setFeedback({ tone: null, message: '' });
  }

  function handleOpenReasonModal() {
    if (!selectedMember || pending) {
      return;
    }

    setReason('');
    setModalError('');
    setModalOpen(true);
  }

  function handleCloseModal() {
    if (pending) {
      return;
    }

    setModalOpen(false);
    setReason('');
    setModalError('');
  }

  async function handleSaveReason(event) {
    event.preventDefault();

    if (!selectedMember || !selectedTargetMember || !currentMember || !groupId || pending) {
      return;
    }

    if (!trimmedReason) {
      setModalError('請輸入違規原因。');
      return;
    }
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      setModalError(`原因請控制在 ${REASON_MAX_LENGTH} 字以內。`);
      return;
    }

    setPending(true);
    setModalError('');

    try {
      await reportAndConfirmToken({
        groupId,
        targetId: selectedMember.id,
        targetMember: selectedTargetMember,
        currentMember,
        reason: trimmedReason,
      });
      const memberName = getMemberName(selectedMember);
      setModalOpen(false);
      setReason('');
      setSelectedId('');
      setFeedback({
        tone: 'success',
        message: `已將一枚屬於${memberName}的 Token 投入豬公。`,
      });
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch {
      setModalError(SAFE_SUBMIT_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <section className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-brand text-sm font-medium uppercase tracking-[0.3em]">DaZhugong</p>
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="text-3xl leading-none">
              🗳️
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">投票</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                選擇一位違規的成員，填寫原因後直接投入代表他的 Token。
              </p>
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
                  <h2 className="text-lg font-semibold text-slate-900">選擇違規者</h2>
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
                    const { cooldown } = member;
                    const disabled = pending || cooldown.inCooldown;

                    return (
                      <button
                        key={member.id}
                        type="button"
                        disabled={disabled}
                        aria-pressed={selected}
                        aria-label={
                          cooldown.inCooldown
                            ? `${memberName}，冷卻中還剩 ${formatCooldownRemaining(cooldown.remainingMs)}，暫時無法再次投票`
                            : `${memberName}，已確認 ${member.confirmedCount} 票`
                        }
                        onClick={() => handleSelect(member)}
                        className={`flex min-h-44 flex-col items-center rounded-[1.75rem] border px-4 py-4 text-center transition focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#9f1239] disabled:cursor-not-allowed disabled:opacity-60 ${
                          selected
                            ? 'border-slate-900 bg-slate-50 shadow-md shadow-slate-200'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <MemberAvatar member={member} size="md" />
                        <span className="mt-3 text-base font-semibold text-slate-900">{memberName}</span>
                        {cooldown.inCooldown ? (
                          <span
                            role="timer"
                            aria-live="off"
                            className="mt-2 rounded-full bg-slate-200 px-3 py-1 text-sm font-bold tabular-nums text-slate-700"
                          >
                            冷卻中 {formatCooldownRemaining(cooldown.remainingMs)}
                          </span>
                        ) : (
                          <span className="bg-brand-soft text-brand mt-2 rounded-full px-3 py-1 text-sm font-medium">
                            已確認 {member.confirmedCount} 票
                          </span>
                        )}
                        <span className="mt-3 text-sm leading-6 text-slate-600">
                          {cooldown.inCooldown
                            ? '剛被投過票，需要等冷卻時間結束。'
                            : selected
                              ? '已選擇，準備填寫原因。'
                              : '點一下即可選擇。'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <p className="text-base font-semibold text-slate-900">目前沒有其他可投票的成員。</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">等待其他 active 成員加入後，就能在這裡選擇違規者。</p>
                </div>
              )}
            </section>

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div className="rounded-[1.5rem] bg-slate-50 px-4 py-4">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">目前選擇</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {selectedMember ? `目前選擇：${getMemberName(selectedMember)}` : '請先選擇一位成員'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  確認後會請你填寫違規原因，儲存後直接計入正式票數，不需要對方另外確認。
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
                type="button"
                disabled={!selectedMember || pending}
                onClick={handleOpenReasonModal}
                className={`mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-4 py-3 text-base font-semibold text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-500)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none ${
                  !selectedMember || pending ? '' : 'bg-brand-gradient shadow-lg'
                }`}
              >
                {selectedMember ? `確認：${getMemberName(selectedMember)}` : '請先選擇成員'}
              </button>
            </section>
          </>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reason-modal-title"
            className="my-auto w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
          >
            <h2 id="reason-modal-title" className="text-lg font-bold text-slate-900">
              違規原因
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {selectedMember ? `這一枚 Token 會記在${getMemberName(selectedMember)}名下。` : ''}
            </p>

            <form onSubmit={handleSaveReason} className="mt-4">
              <label htmlFor="violation-reason" className="text-sm font-medium text-slate-700">
                原因說明
              </label>

              <div className="mt-2 mb-3 flex flex-wrap gap-2">
                {REASON_PRESETS.map((opt) => {
                  const active = reason === opt.value;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={pending}
                      onClick={() => setReason(opt.value)}
                      className={`rounded-full px-3.5 py-2 text-xs font-semibold border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        active
                          ? 'bg-slate-950 text-white border-slate-950'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setReason('');
                    reasonInputRef.current?.focus();
                  }}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    !REASON_PRESETS.some((opt) => opt.value === reason)
                      ? 'bg-slate-950 text-white border-slate-950'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  其他
                </button>
              </div>

              <textarea
                id="violation-reason"
                ref={reasonInputRef}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={pending}
                maxLength={REASON_MAX_LENGTH}
                rows={3}
                placeholder="例如：午餐時間聊到deadline"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {trimmedReason.length}/{REASON_MAX_LENGTH}
              </p>

              {modalError ? (
                <p role="alert" aria-live="assertive" className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
                  {modalError}
                </p>
              ) : null}

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={pending}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending || !trimmedReason}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none ${
                    pending || !trimmedReason ? '' : 'bg-brand-gradient shadow-lg'
                  }`}
                >
                  {pending ? '儲存中…' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
