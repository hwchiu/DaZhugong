// 大豬公回憶錄(Memories)的純函式：Settlement快照/成員快照的組裝、封面照片解析優先序、
// 顯示用格式化。對應「DaZhugong Memories 大豬公回憶錄 Development Specification v1.0」。
//
// 核心規則(spec section 22/35)：Memory不自己重新計算Token，settlementSnapshot必須
// 忠實複製當時的Settlement文件，往後即使全域tokenUnitPrice調整，這篇Memory顯示的
// 金額也不會被重新算出不同結果。
import { formatAmount, formatTokenValue } from './settlement.js';

export const MEMORY_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
};

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未知成員';
}

// 參與者Snapshot(spec section 26)：把當時的成員名字/頭像凍結下來，避免未來成員
// 改名字/離開Group之後，舊回憶跟著被改寫。
export function buildParticipantSnapshot(settlementMembers, members) {
  const membersById = new Map((Array.isArray(members) ? members : []).map((member) => [member.id, member]));
  return (Array.isArray(settlementMembers) ? settlementMembers : []).map((settlementMember) => {
    const member = membersById.get(settlementMember.memberId);
    return {
      memberId: settlementMember.memberId,
      displayName: settlementMember.memberName ?? getMemberName(member),
      avatarSnapshot: member?.avatar ?? null,
    };
  });
}

// Settlement Snapshot(spec section 29)：直接複製Settlement文件本身的金額欄位，
// 不重新計算，欄位名稱對齊Memory資料模型(displayName/tokenValue而非memberName/totalTokenValue)。
export function buildSettlementSnapshot(settlement) {
  const members = Array.isArray(settlement?.members) ? settlement.members : [];
  return {
    totalTokenValue: settlement?.totalTokenValue ?? 0,
    totalAmount: settlement?.totalAmount ?? 0,
    tokenUnitPrice: settlement?.tokenUnitPrice ?? 0,
    currency: settlement?.currency ?? 'TWD',
    members: members.map((member) => ({
      memberId: member.memberId,
      displayName: getMemberName({ name: member.memberName }),
      tokenValue: member.totalTokenValue ?? 0,
      amount: member.amount ?? 0,
    })),
  };
}

// 封面照片優先序(spec section 8)：coverPhoto指定的照片 -> 第一張上傳的照片 ->
// Settlement Report圖 -> 預設DaZhugong Memory封面，永遠不能出現broken image。
export function resolveCoverPhotoUrl(memory, photos, defaultCoverUrl) {
  const list = Array.isArray(photos) ? photos : [];
  if (memory?.coverPhotoId) {
    const cover = list.find((photo) => photo.id === memory.coverPhotoId);
    if (cover?.downloadUrl) {
      return cover.downloadUrl;
    }
  }

  const firstUploaded = list.slice().sort((left, right) => (left.order ?? 0) - (right.order ?? 0))[0];
  if (firstUploaded?.downloadUrl) {
    return firstUploaded.downloadUrl;
  }

  return defaultCoverUrl ?? null;
}

export function formatMemorySequence(sequenceNumber) {
  return Number.isFinite(sequenceNumber) ? `#${sequenceNumber}` : '';
}

export function formatMemoryTokenValue(memory) {
  return `${formatTokenValue(memory?.settlementSnapshot?.totalTokenValue ?? 0)} Token`;
}

export function formatMemoryAmount(memory) {
  return formatAmount(memory?.settlementSnapshot?.totalAmount ?? 0, memory?.settlementSnapshot?.currency);
}

function toMillis(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp === 'number') return timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  }
  return null;
}

// 顯示用日期：優先用使用者補上的eventDate(實際聚會日期)，沒有就退回Settlement
// 建立時間，讓Timeline在Draft階段也能排序/顯示日期(spec section 12)。
export function resolveMemoryDisplayDate(memory) {
  return memory?.eventDate ?? memory?.createdAt ?? null;
}

export function formatMemoryDate(timestamp) {
  const millis = toMillis(timestamp);
  if (!millis) return '';
  return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(millis));
}

export function isDraftMemory(memory) {
  return memory?.status === MEMORY_STATUS.DRAFT;
}

// Memories Hero Summary(spec section 6)：只是很簡單的累積感，不要做成dashboard，
// 因此故意只回傳3個數字，不做任何額外的統計拆解。
export function buildMemoriesSummary(memories) {
  const list = Array.isArray(memories) ? memories : [];
  const totalPhotoCount = list.reduce((sum, memory) => sum + (memory?.photoCount ?? 0), 0);
  const totalAmount = list.reduce((sum, memory) => sum + (memory?.settlementSnapshot?.totalAmount ?? 0), 0);
  return {
    gatheringCount: list.length,
    photoCount: totalPhotoCount,
    totalAmountLabel: formatAmount(totalAmount),
  };
}
