import darrenAvatar from '../assets/avatars/darren.png';
import dragonAvatar from '../assets/avatars/dragon.png';
import emilyAvatar from '../assets/avatars/emily.png';
import huyeAvatar from '../assets/avatars/huye.png';
import sherryAvatar from '../assets/avatars/sherry.png';
import siliconbullAvatar from '../assets/avatars/siliconbull.png';
import sweetieAvatar from '../assets/avatars/sweetie.png';

import darrenFull from '../assets/avatars/full/darren.jpg';
import dragonFull from '../assets/avatars/full/dragon.jpg';
import emilyFull from '../assets/avatars/full/emily.jpg';
import huyeFull from '../assets/avatars/full/huye.jpg';
import sherryFull from '../assets/avatars/full/sherry.jpg';
import siliconbullFull from '../assets/avatars/full/siliconbull.jpg';
import sweetieFull from '../assets/avatars/full/sweetie.jpg';

// 成員本名 -> 對應的角色卡身分。這組對照是使用者指定的，不是用avatar欄位(pig/cat/frog...)配對，
// 是直接用「成員本名」字串比對，找不到的成員維持原本的emoji頭像設計。
// color是使用者指定要固定下來的代表色，用來覆蓋Firestore members文件裡原本的color欄位，
// 這樣不用真的去改MEMBERS_CONFIG那份外部設定，六個人裡沒指定顏色的(目前是小心肝)維持原樣不覆蓋。
const MEMBER_AVATAR_PROFILES = {
  牛哥: { avatar: siliconbullAvatar, full: siliconbullFull, label: '矽谷牛', color: '#ec4899' },
  阿龍: { avatar: dragonAvatar, full: dragonFull, label: '龍哥', color: '#eab308' },
  虎爺: { avatar: huyeAvatar, full: huyeFull, label: '虎爺', color: '#2563eb' },
  小心肝: { avatar: sweetieAvatar, full: sweetieFull, label: '小心肝' },
  Darren: { avatar: darrenAvatar, full: darrenFull, label: 'DARREN', color: '#f97316' },
  房產大亨: { avatar: sherryAvatar, full: sherryFull, label: 'SHERRY', color: '#16a34a' },
  // Emily是豁免成員(不是Firestore members，不參與登入/token系統)，這裡一樣用本名比對，
  // 讓Settings頁的豁免成員區塊可以直接共用MemberAvatar跟MemberCardModal，不用另外寫一套。
  Emily: { avatar: emilyAvatar, full: emilyFull, label: 'Emily', color: '#8b5cf6' },
};

export function getMemberAvatarProfile(name) {
  if (typeof name !== 'string') {
    return null;
  }
  return MEMBER_AVATAR_PROFILES[name.trim()] ?? null;
}

// 找不到對照或該成員沒指定固定色時回傳null，呼叫端要自己決定fallback
// (通常是繼續用member原本的color，或是一個預設色)。
export function getMemberColorOverride(name) {
  const profile = getMemberAvatarProfile(name);
  return profile?.color ?? null;
}

// 給useGroup/authStore這類「組出member物件」的地方用：有指定固定色的成員，color欄位
// 會被覆蓋成固定色；沒有指定的維持原本傳進來的物件不變(包含原本的color)。
export function applyMemberColorOverride(memberLike) {
  if (!memberLike || typeof memberLike !== 'object') {
    return memberLike;
  }

  const override = getMemberColorOverride(memberLike.name ?? memberLike.displayName);
  if (!override) {
    return memberLike;
  }

  return { ...memberLike, color: override };
}

export default MEMBER_AVATAR_PROFILES;
