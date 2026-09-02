import { getMemberAvatarProfile } from '../data/memberAvatars.js';

const AVATAR_EMOJIS = {
  pig: '🐷',
  cat: '🐱',
  frog: '🐸',
  bear: '🐻',
  dog: '🐶',
};

const SIZE_CLASSES = {
  sm: 'h-12 w-12 text-2xl',
  md: 'h-16 w-16 text-3xl',
  lg: 'h-20 w-20 text-5xl',
};

// 圓形自訂頭像用的純尺寸class(不含字級，圖片不需要font-size)
const IMAGE_SIZE_CLASSES = {
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
};

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未命名成員';
}

function getAvatarEmoji(avatar) {
  return AVATAR_EMOJIS[avatar] ?? AVATAR_EMOJIS.pig;
}

function getAvatarStyle(member, selected) {
  if (!selected) {
    return undefined;
  }

  const accentColor = member?.color ?? '#f472b6';
  return {
    borderColor: accentColor,
    backgroundColor: `${accentColor}1A`,
  };
}

export default function MemberAvatar({ member, size = 'md', selected = false, onClick }) {
  const memberName = getMemberName(member);
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const customProfile = getMemberAvatarProfile(memberName);

  // 有對應真人角色卡的成員：直接顯示圓形照片頭像，不用emoji卡片那套設計
  if (customProfile) {
    const accentColor = member?.color ?? '#f472b6';
    const imageSizeClass = IMAGE_SIZE_CLASSES[size] ?? IMAGE_SIZE_CLASSES.md;
    const img = (
      <img
        src={customProfile.avatar}
        alt={memberName}
        title={memberName}
        className={`${imageSizeClass} rounded-full object-cover transition ${selected ? 'scale-[1.05]' : ''}`}
        style={{
          boxShadow: selected
            ? `0 0 0 3px #ffffff, 0 0 0 5px ${accentColor}`
            : '0 0 0 2px rgba(15, 23, 42, 0.08)',
        }}
      />
    );

    if (typeof onClick === 'function') {
      return (
        <button
          type="button"
          aria-label={memberName}
          title={memberName}
          aria-pressed={selected}
          onClick={onClick}
          className="inline-flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
        >
          {img}
        </button>
      );
    }

    // <img alt="..."> 本身就有隱含的role="img"+可存取名稱，不需要再包一層
    // role="img"的span——包了反而會出現「巢狀兩層img」的重複節點，測試也抓到了這個問題。
    return img;
  }

  const avatarEmoji = getAvatarEmoji(member?.avatar);
  const className = `inline-flex flex-col items-center justify-center rounded-3xl border-2 border-slate-200 px-4 py-3 text-center transition ${
    selected ? 'scale-[1.02] shadow-md shadow-rose-100' : 'bg-white'
  }`;
  const content = (
    <span
      aria-hidden="true"
      className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-rose-50 leading-none`}
    >
      {avatarEmoji}
    </span>
  );

  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        aria-label={memberName}
        title={memberName}
        aria-pressed={selected}
        onClick={onClick}
        className={className}
        style={getAvatarStyle(member, selected)}
      >
        {content}
      </button>
    );
  }

  return (
    <div role="img" aria-label={memberName} title={memberName} className={className} style={getAvatarStyle(member, selected)}>
      {content}
    </div>
  );
}
