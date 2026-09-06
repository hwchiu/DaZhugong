import { useEffect, useRef, useState } from 'react';
import MemberAvatar from './MemberAvatar.jsx';
import { reportSpecialToken } from '../services/tokenService.js';
import { SPECIAL_TOKEN_MULTIPLIER } from '../utils/specialToken.js';

const SAFE_SUBMIT_ERROR_MESSAGE = '這顆特殊 Token 暫時投不出去，請稍後再試一次。';
const REASON_MAX_LENGTH = 200;
const DROP_ANIMATION_MS = 1300;

const REASON_PRESETS = [
  { id: 'teams', label: '偷看teams', value: '偷看teams' },
  { id: 'meeting', label: '討論會議', value: '討論會議' },
  { id: 'assign', label: '分派任務', value: '分派任務' },
  { id: 'progress', label: '詢問進度', value: '詢問進度' },
];

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

// 特殊Token(隱藏摩擦豬公彩蛋)召喚成功之後的完整流程，對應開發規格書畫面4~7：
// SUMMON_MODAL(成功召喚) -> MEMBER_SELECT(選成員) -> REASON_MODAL(選原因+確認) ->
// DROPPING(投入動畫) -> SUCCESS(投出成功)。整個流程是蓋在Home.jsx上面的全螢幕
// 彈窗，不是獨立路由——摩擦豬公這件事本來就應該留在首頁發生。
export default function SpecialTokenFlow({ open, groupId, currentMember, members = [], onClose }) {
  const [step, setStep] = useState('SUMMON_MODAL');
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);
  const reasonInputRef = useRef(null);
  const dropTimeoutRef = useRef(null);

  const eligibleMembers = members.filter(
    (member) => member?.active === true && member?.id !== currentMember?.id,
  );
  const selectedMember = eligibleMembers.find((member) => member.id === selectedId) ?? null;
  const trimmedReason = reason.trim();

  // 每次重新打開流程(新的一次召喚)都要從頭開始，不能保留上一次選的成員/原因。
  useEffect(() => {
    if (open) {
      setStep('SUMMON_MODAL');
      setSelectedId('');
      setReason('');
      setErrorMessage('');
      setSuccessInfo(null);
      setPending(false);
    }
  }, [open]);

  useEffect(() => {
    if (step === 'REASON_MODAL') {
      reasonInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => () => {
    if (dropTimeoutRef.current) {
      window.clearTimeout(dropTimeoutRef.current);
    }
  }, []);

  if (!open) {
    return null;
  }

  function handleSelectMember(member) {
    setSelectedId(member.id);
    setErrorMessage('');
    setStep('REASON_MODAL');
  }

  function handleBackToMemberSelect() {
    if (pending) {
      return;
    }
    setStep('MEMBER_SELECT');
    setErrorMessage('');
  }

  function handleCancel() {
    if (pending) {
      return;
    }
    onClose?.();
  }

  async function handleConfirmSubmit(event) {
    event.preventDefault();
    if (!selectedMember || !currentMember || !groupId || pending) {
      return;
    }
    if (!trimmedReason) {
      setErrorMessage('請輸入或選擇一個原因。');
      return;
    }
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      setErrorMessage(`原因請控制在 ${REASON_MAX_LENGTH} 字以內。`);
      return;
    }

    setPending(true);
    setErrorMessage('');

    try {
      await reportSpecialToken({
        groupId,
        targetId: selectedMember.id,
        targetMember: selectedMember,
        currentMember,
        reason: trimmedReason,
      });
      setSuccessInfo({ memberName: getMemberName(selectedMember) });
      setStep('DROPPING');
      // AC11：投出後先播放大型Token投入豬公的動畫，動畫結束才顯示成功畫面，
      // 不要一送出API成功就立刻跳成功畫面，讓「一顆巨大特殊Token被投入」這件事
      // 有被使用者實際看到的時間。
      dropTimeoutRef.current = window.setTimeout(() => {
        setStep('SUCCESS');
      }, DROP_ANIMATION_MS);
    } catch {
      setErrorMessage(SAFE_SUBMIT_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  function handleFinish() {
    onClose?.();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="特殊 Token 召喚流程"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"
    >
      {step === 'SUMMON_MODAL' && (
        <div className="w-full max-w-sm rounded-[1.75rem] bg-gradient-to-br from-rose-50 to-amber-50 p-6 text-center shadow-2xl">
          <div aria-hidden="true" className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-4xl shadow-lg">
            ⭐
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-rose-600">成功召喚特殊 Token！</h2>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white">
            {SPECIAL_TOKEN_MULTIPLIER}x 倍大
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            你喚醒了隱藏的能量！這是一顆 {SPECIAL_TOKEN_MULTIPLIER} 倍大的特殊 Token，投入後會一次累計 {SPECIAL_TOKEN_MULTIPLIER} 枚 Token。
          </p>
          <button
            type="button"
            onClick={() => setStep('MEMBER_SELECT')}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-rose-600 px-4 text-base font-bold text-white shadow-lg transition hover:bg-rose-700"
          >
            前往投票
          </button>
        </div>
      )}

      {step === 'MEMBER_SELECT' && (
        <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-slate-900">投下特殊 Token</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">選擇一位成員，投下這顆 {SPECIAL_TOKEN_MULTIPLIER} 倍大的特殊 Token。</p>

          {eligibleMembers.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {eligibleMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleSelectMember(member)}
                  aria-pressed={member.id === selectedId}
                  className="flex flex-col items-center rounded-[1.5rem] border border-slate-200 bg-white px-3 py-4 text-center transition hover:border-rose-300 hover:bg-rose-50"
                >
                  <MemberAvatar member={member} size="md" />
                  <span className="mt-2 text-sm font-semibold text-slate-900">{getMemberName(member)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              目前沒有其他成員可以投，晚點再來試試吧！
            </p>
          )}

          <button
            type="button"
            onClick={handleCancel}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
          >
            晚點再說
          </button>
        </div>
      )}

      {step === 'REASON_MODAL' && selectedMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="special-token-reason-title"
          className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
        >
          <h2 id="special-token-reason-title" className="text-lg font-bold text-slate-900">選擇原因</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            這顆 {SPECIAL_TOKEN_MULTIPLIER} 倍大的特殊 Token 會記在{getMemberName(selectedMember)}名下，累計 +{SPECIAL_TOKEN_MULTIPLIER} 枚 Token。
          </p>

          <form onSubmit={handleConfirmSubmit} className="mt-4">
            <div className="flex flex-wrap gap-2">
              {REASON_PRESETS.map((opt) => {
                const active = reason === opt.value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={pending}
                    onClick={() => setReason(opt.value)}
                    className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      active ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <textarea
              ref={reasonInputRef}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
              maxLength={REASON_MAX_LENGTH}
              rows={3}
              placeholder="或自己輸入原因"
              aria-label="原因說明"
              className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50"
            />

            {errorMessage ? (
              <p role="alert" aria-live="assertive" className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
                {errorMessage}
              </p>
            ) : null}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleBackToMemberSelect}
                disabled={pending}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                返回
              </button>
              <button
                type="submit"
                disabled={pending || !trimmedReason}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
              >
                {pending ? '投出中…' : '確認投出'}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'DROPPING' && (
        <div
          role="status"
          aria-live="polite"
          className="flex w-full max-w-sm flex-col items-center rounded-[1.75rem] bg-white p-8 text-center shadow-2xl"
        >
          <div
            aria-hidden="true"
            className="special-token-drop flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-rose-500 text-4xl font-black text-white shadow-xl"
          >
            ⭐
          </div>
          <p className="mt-5 text-sm font-semibold text-slate-700">正在投入特殊 Token…</p>
        </div>
      )}

      {step === 'SUCCESS' && successInfo && (
        <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 text-center shadow-2xl">
          <div aria-hidden="true" className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
            🎉
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-slate-900">已投出特殊 Token！</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">你投給了 {successInfo.memberName}</p>
          <p className="mt-1 text-2xl font-black text-rose-600">+{SPECIAL_TOKEN_MULTIPLIER} 枚 Token</p>
          <button
            type="button"
            onClick={handleFinish}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-rose-600 px-4 text-base font-bold text-white shadow-lg transition hover:bg-rose-700"
          >
            太棒了！
          </button>
        </div>
      )}
    </div>
  );
}
