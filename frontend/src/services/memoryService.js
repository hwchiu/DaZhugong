// 大豬公回憶錄(Memories)服務層：對應settlementService.js的風格與信任模型
// (authenticated + active member才能寫入、公開讀取)。
//
// 核心設計(spec section 9/10/49)：Memory的doc ID直接等於它所屬的settlementId，
// 「兌換Settlement成功就建立一篇Memory Draft」因此天生idempotent——同一個settlementId
// 不管呼叫createMemoryFromSettlement()幾次，都只會建立/命中同一份文件，不會出現
// 「同一次結算對應兩篇回憶」的情況(spec section 5「同一Settlement不會產生兩個Memory」)。
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { buildParticipantSnapshot, buildSettlementSnapshot, MEMORY_STATUS } from '../utils/memory.js';

function assertAuthenticatedMember(currentMember) {
  if (currentMember?.active === false) {
    throw new Error('The current member is inactive.');
  }

  if (
    !currentMember?.id
    || !currentMember?.authUid
    || !auth.currentUser
    || auth.currentUser.uid !== currentMember.authUid
  ) {
    throw new Error('The authenticated member identity is invalid.');
  }
}

function memoryDocRef(groupId, memoryId) {
  return doc(db, 'groups', groupId, 'memories', memoryId);
}

function toMemoryDoc(docSnapshot) {
  if (!docSnapshot?.exists?.()) {
    return null;
  }

  const data = typeof docSnapshot.data === 'function' ? docSnapshot.data() ?? {} : {};
  return { id: docSnapshot.id, ...data };
}

// 這個群組目前總共有幾篇Memory就是下一篇的序號(spec section 50：Sequence
// Number必須group-scoped，累積感"我們已經吃到第18次了")——跟
// settlementService.js getNextSettlementSequence()同樣屬於軟性防護，信任呼叫端
// 傳進來的memories清單(來自useMemories()的realtime資料)。
export function getNextMemorySequence(memories) {
  return (Array.isArray(memories) ? memories : []).length + 1;
}

// 建立(或取得既有)Memory Draft：Settlement兌換完成後呼叫。是idempotent的——
// 已存在就直接回傳既有Memory，不會重複建立或覆寫使用者已經補上的內容。
export async function createMemoryFromSettlement({ groupId, settlement, currentMember, members, memories }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !settlement?.id) {
    throw new Error('A settlement is required.');
  }

  const memoryRef = memoryDocRef(groupId, settlement.id);
  const existing = await getDoc(memoryRef);
  if (existing.exists()) {
    return toMemoryDoc(existing);
  }

  const payload = {
    groupId,
    settlementId: settlement.id,
    sequenceNumber: getNextMemorySequence(memories),
    status: MEMORY_STATUS.DRAFT,
    title: '',
    story: null,
    eventDate: null,
    coverPhotoId: null,
    location: null,
    participants: buildParticipantSnapshot(settlement.members, members),
    settlementSnapshot: buildSettlementSnapshot(settlement),
    photoCount: 0,
    commentCount: 0,
    createdBy: currentMember.id,
    createdAt: serverTimestamp(),
  };

  await setDoc(memoryRef, payload);
  return { id: settlement.id, ...payload };
}

// 補上可編輯欄位(spec section 13/35)：title/story/eventDate/location/coverPhotoId，
// 以及Draft -> Published的狀態轉換。Settlement Snapshot/參與者名單/序號一律不動。
export async function updateMemory({ groupId, memoryId, currentMember, patch }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !memoryId) {
    throw new Error('A memory is required.');
  }

  const editableFields = ['title', 'story', 'eventDate', 'location', 'coverPhotoId', 'status', 'photoCount', 'commentCount'];
  const safePatch = {};
  editableFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(patch ?? {}, field)) {
      safePatch[field] = patch[field];
    }
  });

  return updateDoc(memoryDocRef(groupId, memoryId), {
    ...safePatch,
    updatedBy: currentMember.id,
    updatedAt: serverTimestamp(),
  });
}

// 把Memory從Draft發佈成Published——本質上就是updateMemory的一個薄封裝，
// 讓呼叫端(MemoryEdit)的意圖更清楚(spec section 32：只有Group members看得到Draft)。
export async function publishMemory({ groupId, memoryId, currentMember }) {
  return updateMemory({ groupId, memoryId, currentMember, patch: { status: MEMORY_STATUS.PUBLISHED } });
}

export async function fetchMemory({ groupId, memoryId }) {
  if (!groupId || !memoryId) {
    return null;
  }

  return toMemoryDoc(await getDoc(memoryDocRef(groupId, memoryId)));
}
