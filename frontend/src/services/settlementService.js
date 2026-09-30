import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import {
  buildSettlementId,
  buildSettlementPreview,
  isSettleableReport,
  TOKEN_UNIT_PRICE,
} from '../utils/settlement.js';

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

// 「本次要結算幾號」：用今天的日期前綴數已經存在幾筆Settlement，序號從001開始累加。
// 這裡刻意信任呼叫端傳進來的settlements清單(來自useSettlements()的realtime資料)，
// 不再另外多打一次查詢——跟「小型好友群組、極低機率同時有兩個人在同一秒鐘按下兌換」的
// 使用情境相符，屬於軟性防護(對照tokenService.js其他地方類似的取捨，例如每日召喚標記)。
export function getNextSettlementSequence(settlements, dateKey) {
  const count = (Array.isArray(settlements) ? settlements : []).filter((settlement) => (
    typeof settlement?.id === 'string' && settlement.id.startsWith(`${dateKey}-`)
  )).length;
  return count + 1;
}

// 建立結算：分成兩個各自獨立commit的Firestore寫入(Phase 1 / Phase 2)，刻意仿照
// tokenService.js confirmAppeal()的兩階段設計——firestore.rules裡「report要能把
// settlementId鎖上，必須先看到groups/{groupId}/settlements/{settlementId}這份文件
// 已經存在」，如果把「建立Settlement」跟「鎖定report」塞進同一個writeBatch，
// 同一個batch裡對方文件是否存在(exists())在規則評估時不保證能看到彼此，
// 所以兩步必須先後獨立送出、確定Phase 1已經commit，Phase 2才會通過規則。
//
// Phase 1失敗：整個結算沒有發生，reports維持未結算，使用者可以重試。
// Phase 2失敗(較罕見)：Settlement文件已經建立、但部分/全部report還沒被鎖上——
// 這是目前這個沒有後端伺服器的架構下，唯一還沒辦法做到完全原子的邊界情況，
// 跟這個app既有的其他多步驟寫入(例如markerId的軟性防護)風險等級相同。
export async function createSettlement({ groupId, currentMember, members, reports, settlements }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId) {
    throw new Error('A group is required.');
  }

  const settleableReports = (Array.isArray(reports) ? reports : []).filter(isSettleableReport);
  if (!settleableReports.length) {
    throw new Error('目前沒有可結算的 Token。');
  }

  const preview = buildSettlementPreview(settleableReports, members, { tokenUnitPrice: TOKEN_UNIT_PRICE });
  const now = new Date();
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const sequence = getNextSettlementSequence(settlements, dateKey);
  const settlementId = buildSettlementId(now, sequence);

  const periodStartTimestamps = settleableReports
    .map((report) => report?.timestamp)
    .filter((timestamp) => timestamp && (typeof timestamp.toMillis === 'function' || typeof timestamp.seconds === 'number'));
  const earliestTimestamp = periodStartTimestamps.length ? periodStartTimestamps[0] : null;

  const settlementRef = doc(db, 'groups', groupId, 'settlements', settlementId);

  // Phase 1：先建立Settlement快照文件本身，這一步commit之後，Phase 2的report更新
  // 才能透過firestore.rules的exists()檢查看到這份文件。
  await setDoc(settlementRef, {
    groupId,
    periodStart: earliestTimestamp,
    periodEnd: serverTimestamp(),
    tokenUnitPrice: preview.tokenUnitPrice,
    currency: preview.currency,
    totalTokenValue: preview.totalTokenValue,
    totalAmount: preview.totalAmount,
    members: preview.members,
    status: 'SETTLED',
    createdBy: currentMember.id,
    createdAt: serverTimestamp(),
  });

  // Phase 2：把這次結算涵蓋到的每一筆report都標上settlementId——這是spec section 14
  // 「Reset不是刪除、而是封存」的實際資料行為：reports文件本身完全沒有被刪除或改動
  // 內容，只多了一個settlementId欄位，History永久保留這些紀錄。
  const batch = writeBatch(db);
  settleableReports.forEach((report) => {
    batch.update(doc(db, 'groups', groupId, 'reports', report.id), { settlementId });
  });
  await batch.commit();

  return { settlementId, preview };
}

// Reset豬公：跟「兌換」是刻意分開的兩個動作(spec section 8/13)。這一步只是把
// Settlement文件的status從SETTLED改成RESET並記錄resetAt，純粹是狀態轉換，不會
// 再去動任何report——鎖定report這件事已經在createSettlement()的Phase 2做完了。
export async function resetSettlement({ groupId, settlementId, currentMember }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !settlementId) {
    throw new Error('A settlement is required.');
  }

  return updateDoc(doc(db, 'groups', groupId, 'settlements', settlementId), {
    status: 'RESET',
    resetAt: serverTimestamp(),
  });
}

// 依settlementId讀取單一Settlement快照(給結算Report頁面/History的「查看結算報告」連結用)。
export async function fetchSettlement({ groupId, settlementId }) {
  if (!groupId || !settlementId) {
    return null;
  }

  const snapshot = await getDoc(doc(db, 'groups', groupId, 'settlements', settlementId));
  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}
