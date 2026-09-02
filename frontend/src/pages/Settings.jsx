import { useMemo, useState } from 'react';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { getMemberAvatarProfile } from '../data/memberAvatars.js';
import { useGroup } from '../hooks/useGroup.js';
import { useAuthStore } from '../store/authStore.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入設定，請稍後再試。';
const SAFE_LOGOUT_ERROR_MESSAGE = '目前無法登出，請稍後再試。';

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

function getTokenCount(member) {
  return Number.isFinite(member?.totalTokens) && member.totalTokens > 0
    ? Math.floor(member.totalTokens)
    : 0;
}

function rankMembers(members) {
  return members.slice().sort((left, right) => (
    getTokenCount(right) - getTokenCount(left)
    || getMemberName(left).localeCompare(getMemberName(right), 'zh-TW')
    || String(left.id).localeCompare(String(right.id))
  ));
}

// 點成員的框跳出來的角色卡大圖彈窗，點背景關閉
function MemberCardModal({ member, profile, onClose }) {
  const memberName = getMemberName(member);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${memberName} 角色卡`}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-slate-950 shadow-2xl"
      >
        <img src={profile.full} alt={`${memberName}（${profile.label}）角色卡`} className="w-full" />
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="font-bold text-white">{memberName}・{profile.label}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const logout = useAuthStore((state) => state.logout);
  const { group, members, loading, error } = useGroup(groupId);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [cardMember, setCardMember] = useState(null);
  const activeMembers = useMemo(
    () => rankMembers(members.filter((member) => member.active === true)),
    [members],
  );
  const inactiveMembers = useMemo(
    () => rankMembers(members.filter((member) => member.active === false)),
    [members],
  );
  const totalTokens = useMemo(
    () => members.reduce((sum, member) => sum + getTokenCount(member), 0),
    [members],
  );
  const lunchTime = group?.lunchStart && group?.lunchEnd
    ? `${group.lunchStart}–${group.lunchEnd}`
    : '尚未設定';
  const currentMemberProfile = getMemberAvatarProfile(getMemberName(currentMember));
  const cardMemberProfile = cardMember ? getMemberAvatarProfile(getMemberName(cardMember)) : null;

  async function handleLogout() {
    if (logoutPending || typeof logout !== 'function') {
      return;
    }

    setLogoutPending(true);
    setLogoutError('');
    try {
      await logout();
    } catch {
      setLogoutError(SAFE_LOGOUT_ERROR_MESSAGE);
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <section className="app-page bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">DaZhugong</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">設定</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">檢視午餐群組狀態與目前登入身分。</p>
        </header>

        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-lg shadow-slate-300">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-200">帳號</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">目前登入：{getMemberName(currentMember)}</h2>
            {currentMemberProfile ? (
              <MemberAvatar member={currentMember} size="sm" />
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-200">此頁僅供檢視，不提供成員或群組管理。</p>
        </section>

        {loading ? (
          <section role="status" aria-live="polite" className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="font-semibold text-slate-950">載入設定中…</p>
            <p className="mt-2 text-sm text-slate-700">正在同步群組與成員資料。</p>
          </section>
        ) : error ? (
          <section role="alert" className="rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-5 text-rose-950">
            <p className="font-semibold">目前無法載入設定</p>
            <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3" aria-label="群組摘要">
              <div className="rounded-[1.75rem] bg-white p-5 shadow-lg shadow-rose-100">
                <p className="text-sm font-semibold text-slate-700">午餐時間</p>
                <p className="mt-2 text-lg font-black tabular-nums text-slate-950">{lunchTime}</p>
              </div>
              <div className="rounded-[1.75rem] bg-white p-5 shadow-lg shadow-rose-100">
                <p className="text-sm font-semibold text-slate-700">累計已確認</p>
                <p className="mt-2 text-lg font-black tabular-nums text-slate-950">{totalTokens} Token</p>
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-950">進行中成員</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800">{activeMembers.length} 人</span>
              </div>
              {activeMembers.length ? (
                <ol aria-label="進行中成員排名" className="mt-4 space-y-3">
                  {activeMembers.map((member, index) => {
                    const profile = getMemberAvatarProfile(getMemberName(member));
                    const rowContent = (
                      <>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">{index + 1}</span>
                        <MemberAvatar member={member} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-left font-bold text-slate-950">{getMemberName(member)}</span>
                        <span className="font-black tabular-nums text-slate-950">{getTokenCount(member)} Token</span>
                      </>
                    );

                    if (profile) {
                      return (
                        <li key={member.id}>
                          <button
                            type="button"
                            onClick={() => setCardMember(member)}
                            aria-label={`查看${getMemberName(member)}的角色卡`}
                            className="flex w-full items-center gap-3 rounded-[1.5rem] border border-slate-200 px-4 py-3 text-left transition hover:border-rose-300 hover:bg-rose-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
                          >
                            {rowContent}
                          </button>
                        </li>
                      );
                    }

                    return (
                      <li key={member.id} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 px-4 py-3">
                        {rowContent}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-700">目前沒有進行中成員。</p>
              )}
            </section>

            {inactiveMembers.length ? (
              <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
                <h2 className="text-lg font-bold text-slate-950">歷史成員</h2>
                <p className="mt-1 text-sm leading-6 text-slate-700">保留離隊成員的已確認 Token 總數。</p>
                <ul aria-label="歷史成員" className="mt-4 space-y-3">
                  {inactiveMembers.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-3 rounded-[1.5rem] bg-slate-100 px-4 py-3">
                      <span className="font-bold text-slate-950">{getMemberName(member)}</span>
                      <span className="font-black tabular-nums text-slate-950">{getTokenCount(member)} Token</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-rose-100">
          <h2 className="text-lg font-bold text-slate-950">登出</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">登出後需要重新選擇成員並驗證身分。</p>
          {logoutError ? (
            <p role="alert" className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950">
              {logoutError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={logoutPending}
            onClick={handleLogout}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-rose-800 bg-white px-4 py-3 text-base font-bold text-rose-900 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-rose-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-600"
          >
            {logoutPending ? '登出中…' : '登出'}
          </button>
        </section>
      </div>

      {cardMember && cardMemberProfile ? (
        <MemberCardModal
          member={cardMember}
          profile={cardMemberProfile}
          onClose={() => setCardMember(null)}
        />
      ) : null}
    </section>
  );
}
