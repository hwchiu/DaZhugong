import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import VoteMemberCard from '../components/VoteMemberCard.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useNowTicker } from '../hooks/useNowTicker.js';
import { useTokens } from '../hooks/useTokens.js';
import { reportAndConfirmToken } from '../services/tokenService.js';
import { useAuthStore } from '../store/authStore.js';
import { getCooldownStatus } from '../utils/cooldown.js';

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

// 把「已確認票數」跟「冷卻狀態」這兩個衍生欄位加到一個成員物件上——不管是可以
// 點選的其他成員、還是唯讀顯示用的當前使用者自己，都是用同一套算法，確保兩邊
// 看到的「已確認幾票」「還剩多少冷卻時間」數字定義完全一致，不會各自維護一份
// 算法卻不小心兜不起來。
function decorateMemberWithVoteInfo(member, { totalsByTargetId, tokens, now }) {
  return {
    ...member,
    confirmedCount: totalsByTargetId.get(member.id) ?? 0,
    cooldown: getCooldownStatus(tokens, member.id, now),
  };
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
        .map((member) => decorateMemberWithVoteInfo(member, { totalsByTargetId, tokens, now })),
    [currentMember?.id, members, tokens, totalsByTargetId, now],
  );
  // 新增：把「當前使用者自己」也算成同一種形狀的物件(有confirmedCount/cooldown)，
  // 純粹是要讓使用者在這個頁面上看到自己的冷卻時間——不是拿來投票用的，所以
  // 特意跟eligibleMembers分開算，不會被selectedMember/handleSelect等既有的
  // 選人邏輯誤用到。
  const currentMemberCard = useMemo(
    () =>
      currentMember?.id
        ? decorateMemberWithVoteInfo(currentMember, { totalsByTargetId, tokens, now })
        : null,
    [currentMember, totalsByTargetId, tokens, now],
  );
  // 畫面上實際要排列的卡片：自己排在最前面(方便一進頁面就看到自己的冷卻資訊)，
  // 後面接其他可投票的成員。「有幾人可選」「還有沒有其他成員」這類文案，
  // 仍然只看eligibleMembers——自己不算在「可選」名單裡。
  const displayMembers = useMemo(
    () => (currentMemberCard ? [currentMemberCard, ...eligibleMembers] : eligibleMembers),
    [currentMemberCard, eligibleMembers],
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
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    也會顯示你自己的卡片方便查看冷卻時間，但不能選自己；其餘為其他 active 成員，票數依已確認紀錄計算。
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {eligibleMembers.length} 人可選
                </span>
              </div>

              {displayMembers.length ? (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {displayMembers.map((member) => {
                      const isSelf = member.id === currentMember?.id;
                      const selected = !isSelf && member.id === selectedMember?.id;
                      const memberName = getMemberName(member);

                      return (
                        <VoteMemberCard
                          key={member.id}
                          member={member}
                          memberName={memberName}
                          selected={selected}
                          pending={pending}
                          isSelf={isSelf}
                          onSelect={() => handleSelect(member)}
                        />
                      );
                    })}
                  </div>
                  {eligibleMembers.length === 0 ? (
                    <p className="mt-4 text-center text-sm leading-6 text-slate-500">
                      目前沒有其他可投票的成員，等待其他 active 成員加入後就能在這裡選擇違規者。
                    </p>
                  ) : null}
                </>
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
