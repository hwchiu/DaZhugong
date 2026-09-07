import CooldownSweepOverlay from './CooldownSweepOverlay.jsx';
import MemberAvatar from './MemberAvatar.jsx';
import { formatCooldownRemaining } from '../utils/cooldown.js';

// 投票頁「選擇違規者」的單張成員卡片，抽成獨立元件是因為Vote.jsx要用同一份
// UI畫兩種情境：
//   1. 可以點選的其他成員(原本就有的行為)
//   2. 當前使用者自己(新增：只是要讓使用者看到自己的冷卻時間，永遠不能點選)
// 兩者除了disabled的原因、說明文字、aria-label不同之外，卡片外觀(頭像/姓名/
// 冷卻徽章/冷卻扇形遮罩)完全一樣，抽出來才不用維護兩份幾乎一樣的JSX。
//
// 冷卻中的倒數計時文字(下面那個「冷卻中 X:XX」的徽章)刻意保持原本樣式不變，
// 只在卡片外層多疊一層CooldownSweepOverlay(z-0)，徽章跟頭像/文字都用
// relative z-10蓋在遮罩上面，確保深色扇形只會蓋住卡片底色、不會讓文字變得
// 難以閱讀。
export default function VoteMemberCard({ member, memberName, selected, pending, isSelf, onSelect }) {
  const { cooldown } = member;
  const disabled = isSelf || pending || cooldown.inCooldown;

  const ariaLabel = isSelf
    ? `${memberName}（你），${
        cooldown.inCooldown
          ? `冷卻中還剩 ${formatCooldownRemaining(cooldown.remainingMs)}`
          : `已確認 ${member.confirmedCount} 票`
      }，無法選擇自己`
    : cooldown.inCooldown
      ? `${memberName}，冷卻中還剩 ${formatCooldownRemaining(cooldown.remainingMs)}，暫時無法再次投票`
      : `${memberName}，已確認 ${member.confirmedCount} 票`;

  const description = isSelf
    ? '這是你自己，僅顯示冷卻時間，無法選擇。'
    : cooldown.inCooldown
      ? '剛被投過票，需要等冷卻時間結束。'
      : selected
        ? '已選擇，準備填寫原因。'
        : '點一下即可選擇。';

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={isSelf ? undefined : selected}
      aria-label={ariaLabel}
      onClick={isSelf ? undefined : onSelect}
      className={`relative flex min-h-44 flex-col items-center rounded-[1.75rem] border px-4 py-4 text-center transition focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#9f1239] disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-slate-900 bg-slate-50 shadow-md shadow-slate-200'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {cooldown.inCooldown ? (
        <CooldownSweepOverlay expiresAt={cooldown.expiresAt} remainingMs={cooldown.remainingMs} />
      ) : null}

      <span className="relative z-10 flex flex-col items-center">
        <MemberAvatar member={member} size="md" />
        <span className="mt-3 text-base font-semibold text-slate-900">
          {memberName}
          {isSelf ? <span className="text-brand ml-1 text-xs font-bold">（你）</span> : null}
        </span>
      </span>

      {cooldown.inCooldown ? (
        <span
          role="timer"
          aria-live="off"
          className="relative z-10 mt-2 rounded-full bg-slate-200 px-3 py-1 text-sm font-bold tabular-nums text-slate-700"
        >
          冷卻中 {formatCooldownRemaining(cooldown.remainingMs)}
        </span>
      ) : (
        <span className="bg-brand-soft text-brand relative z-10 mt-2 rounded-full px-3 py-1 text-sm font-medium">
          已確認 {member.confirmedCount} 票
        </span>
      )}

      <span className="relative z-10 mt-3 text-sm leading-6 text-slate-600">{description}</span>
    </button>
  );
}
