import { useEffect, useRef, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useGroup } from '../hooks/useGroup.js';
import { auth } from '../firebase.js';
import { useAuthStore } from '../store/authStore.js';
import { deriveFirebasePassword } from '../auth/credentials.js';

const GROUP_ID = 'main';
const MIN_ACCESS_CODE_LENGTH = 12;
const MAX_ACCESS_CODE_LENGTH = 64;
const THROTTLED_ERROR_MESSAGE = '嘗試次數過多，請稍後再試。';
const GENERIC_ERROR_MESSAGE = '登入失敗，請確認通行碼後再試，或稍後重試。';
const MEMBERS_ERROR_MESSAGE = '成員資料暫時載入失敗，請重新整理頁面後再試。';
const MEMBER_EMOJIS = {
  pig: '🐷',
  cat: '🐱',
  frog: '🐸',
  bear: '🐻',
  dog: '🐶',
};

function getMemberEmoji(avatar) {
  return MEMBER_EMOJIS[avatar] ?? '🐷';
}

function getTokenCountLabel(totalTokens) {
  return `${Number.isFinite(totalTokens) ? totalTokens : 0} 枚代幣`;
}

function getLoginErrorMessage(error) {
  return error?.code === 'auth/too-many-requests' ? THROTTLED_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE;
}

function getSelectedCardStyle(member) {
  return {
    borderColor: member.color || '#f472b6',
    backgroundColor: `${member.color || '#f472b6'}18`,
  };
}

export default function Login() {
  const { members, loading: membersLoading, error: membersError } = useGroup(GROUP_ID);
  const authError = useAuthStore((state) => state.authError);
  const clearAuthError = useAuthStore((state) => state.clearAuthError);
  const accessCodeInputRef = useRef(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [pendingMember, setPendingMember] = useState(null);
  const [accessCodeLength, setAccessCodeLength] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasDismissedAuthError, setHasDismissedAuthError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const activeMembers = members.filter((member) => member.active !== false);
  const selectedMemberIsActive = Boolean(
    selectedMember && activeMembers.some((member) => member.id === selectedMember.id),
  );
  const isInteractionLocked = membersLoading || membersError || isLoggingIn;
  const visibleSelectedMemberId = pendingMember?.id ?? (selectedMemberIsActive ? selectedMember.id : undefined);
  const canSubmit = selectedMemberIsActive
    && accessCodeLength >= MIN_ACCESS_CODE_LENGTH
    && accessCodeLength <= MAX_ACCESS_CODE_LENGTH
    && !membersLoading
    && !membersError
    && !isLoggingIn;
  const visibleAuthError = hasDismissedAuthError ? '' : authError;

  useEffect(() => {
    setHasDismissedAuthError(false);
  }, [authError]);

  function handleSelectMember(member) {
    if (isInteractionLocked) {
      return;
    }

    setHasDismissedAuthError(true);
    clearAuthError?.();
    setSelectedMember(member);
    if (accessCodeInputRef.current) {
      accessCodeInputRef.current.value = '';
    }
    setAccessCodeLength(0);
    setErrorMessage('');
  }

  function handleAccessCodeChange(event) {
    if (isInteractionLocked) {
      return;
    }

    setHasDismissedAuthError(true);
    clearAuthError?.();
    setAccessCodeLength(event.target.value.length);
    setErrorMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const memberToSubmit = selectedMember;
    let accessCodeToSubmit = accessCodeInputRef.current?.value ?? '';
    let firebasePassword = '';
    if (accessCodeInputRef.current) {
      accessCodeInputRef.current.value = '';
    }
    setPendingMember(memberToSubmit);
    setIsLoggingIn(true);
    setAccessCodeLength(0);
    setErrorMessage('');

    try {
      firebasePassword = await deriveFirebasePassword(
        memberToSubmit.authUid,
        accessCodeToSubmit,
      );
      accessCodeToSubmit = '';
      await signInWithEmailAndPassword(
        auth,
        memberToSubmit.loginEmail,
        firebasePassword,
      );
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error));
    } finally {
      accessCodeToSubmit = '';
      firebasePassword = '';
      setPendingMember(null);
      setIsLoggingIn(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 py-8 text-slate-800">
      <section className="w-full max-w-sm rounded-[2rem] bg-white/95 p-6 shadow-xl shadow-rose-100">
        <header className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-4xl">
            🐷
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.35em] text-rose-400">DaZhugong</p>
          <h1 className="mt-2 text-3xl font-bold text-rose-500">大豬公</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">選擇成員並輸入私人通行碼，即可進入午餐禁聊公事罰金箱。</p>
        </header>

        <div className="mt-6 rounded-3xl bg-rose-50/70 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-700">選擇成員</h2>
            {membersLoading ? (
              <p role="status" aria-live="polite" className="text-xs font-medium text-rose-500">
                載入成員資料中…
              </p>
            ) : null}
          </div>

          {membersError ? (
            <p role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-600">
              {MEMBERS_ERROR_MESSAGE}
            </p>
          ) : null}

          {!membersLoading && !membersError ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {activeMembers.map((member) => {
                const isSelected = visibleSelectedMemberId === member.id;

                return (
                  <button
                    key={member.id}
                    type="button"
                    aria-label={`選擇成員 ${member.name}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectMember(member)}
                    disabled={isInteractionLocked}
                    className={`rounded-2xl border-2 bg-white px-4 py-3 text-left transition ${
                      isSelected ? 'scale-[1.02] shadow-md shadow-rose-100' : 'border-transparent'
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                    style={isSelected ? getSelectedCardStyle(member) : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-3xl leading-none">{getMemberEmoji(member.avatar)}</span>
                      <span
                        aria-hidden="true"
                        className="mt-1 inline-block h-3 w-3 rounded-full border border-white/70 shadow-sm"
                        style={{ backgroundColor: member.color || '#f472b6' }}
                      />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">{member.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{getTokenCountLabel(member.totalTokens)}</p>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {visibleAuthError ? (
          <p role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {visibleAuthError}
          </p>
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="login-access-code" className="block text-sm font-medium text-slate-700">
              通行碼
            </label>
            <input
              id="login-access-code"
              ref={accessCodeInputRef}
              type="password"
              autoComplete="current-password"
              minLength={MIN_ACCESS_CODE_LENGTH}
              maxLength={MAX_ACCESS_CODE_LENGTH}
              placeholder={selectedMemberIsActive ? '請輸入通行碼' : '請先選擇成員'}
              onChange={handleAccessCodeChange}
              disabled={!selectedMemberIsActive || isInteractionLocked}
              aria-label="通行碼"
              className="mt-2 w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-xl tracking-[0.2em] text-slate-700 outline-none transition placeholder:tracking-normal placeholder:text-sm placeholder:text-slate-400 focus:border-rose-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          {isLoggingIn ? (
            <p role="status" aria-live="polite" className="text-sm text-rose-500">
              {pendingMember ? `登入中，使用 ${pendingMember.name} 的通行碼驗證中…` : '登入中…'}
            </p>
          ) : null}

          {errorMessage ? (
            <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-pink-700 px-4 py-3 text-base font-semibold text-white transition hover:bg-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoggingIn ? '登入中' : '登入'}
          </button>
        </form>
      </section>
    </main>
  );
}
