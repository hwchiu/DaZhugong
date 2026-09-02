import darrenAvatar from '../assets/avatars/darren.png';
import dragonAvatar from '../assets/avatars/dragon.png';
import huyeAvatar from '../assets/avatars/huye.png';
import sherryAvatar from '../assets/avatars/sherry.png';
import siliconbullAvatar from '../assets/avatars/siliconbull.png';
import sweetieAvatar from '../assets/avatars/sweetie.png';

import darrenFull from '../assets/avatars/full/darren.jpg';
import dragonFull from '../assets/avatars/full/dragon.jpg';
import huyeFull from '../assets/avatars/full/huye.jpg';
import sherryFull from '../assets/avatars/full/sherry.jpg';
import siliconbullFull from '../assets/avatars/full/siliconbull.jpg';
import sweetieFull from '../assets/avatars/full/sweetie.jpg';

// 成員本名 -> 對應的角色卡身分。這組對照是使用者指定的，不是用avatar欄位(pig/cat/frog...)配對，
// 是直接用「成員本名」字串比對，找不到的成員維持原本的emoji頭像設計。
const MEMBER_AVATAR_PROFILES = {
  牛哥: { avatar: siliconbullAvatar, full: siliconbullFull, label: '矽谷牛' },
  阿龍: { avatar: dragonAvatar, full: dragonFull, label: '龍哥' },
  虎爺: { avatar: huyeAvatar, full: huyeFull, label: '虎爺' },
  小心肝: { avatar: sweetieAvatar, full: sweetieFull, label: '小心肝' },
  Darren: { avatar: darrenAvatar, full: darrenFull, label: 'DARREN' },
  房產大亨: { avatar: sherryAvatar, full: sherryFull, label: 'SHERRY' },
};

export function getMemberAvatarProfile(name) {
  if (typeof name !== 'string') {
    return null;
  }
  return MEMBER_AVATAR_PROFILES[name.trim()] ?? null;
}

export default MEMBER_AVATAR_PROFILES;
