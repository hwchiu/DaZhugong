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
  const avatarEmoji = getAvatarEmoji(member?.avatar);
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
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
    <div aria-label={memberName} title={memberName} className={className} style={getAvatarStyle(member, selected)}>
      {content}
    </div>
  );
}
