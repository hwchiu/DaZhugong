import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import {
  buildSpecialTokenSummonMarkerId,
  getTodayDateKey,
  NORMAL_TOKEN_SOURCE,
  SPECIAL_TOKEN_MULTIPLIER,
  SPECIAL_TOKEN_SOURCE,
  SPECIAL_TOKEN_TYPE,
} from '../utils/specialToken.js';

export const APPEAL_CONFIRMATIONS_REQUIRED = 3;

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

export async function reportToken({ groupId, targetId, targetMember, currentMember }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !targetId || targetId === currentMember.id) {
    throw new Error('A different target member is required.');
  }
  if (targetMember && targetMember.id !== targetId) {
    throw new Error('The target member identity is invalid.');
  }
  if (targetMember?.active === false) {
    throw new Error('The target member is inactive.');
  }

  return addDoc(collection(db, 'groups', groupId, 'tokens'), {
    targetId,
    reporterId: currentMember.id,
    status: 'pending',
    createdAt: serverTimestamp(),
    confirmedAt: null,
    resolvedAt: null,
  });
}

// 新流程：報告人直接選人+填原因，一次寫入就是「已確認」，跳過原本「對方需另外確認」的步驟。
// 跟 reportToken 是兩條並存的路線：reportToken 保留給舊的pending/confirm/reject流程
// (例如還沒處理完的既有pending token)，這支是Vote.jsx往後預設會用的新路徑。
export async function reportAndConfirmToken({ groupId, targetId, targetMember, currentMember, reason }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !targetId || targetId === currentMember.id) {
    throw new Error('A different target member is required.');
  }
  if (targetMember && targetMember.id !== targetId) {
    throw new Error('The target member identity is invalid.');
  }
  if (targetMember?.active === false) {
    throw new Error('The target member is inactive.');
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw new Error('A reason is required.');
  }
  if (trimmedReason.length > 200) {
    throw new Error('The reason must be 200 characters or fewer.');
  }

  const tokenRef = doc(collection(db, 'groups', groupId, 'tokens'));
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(tokenRef, {
    targetId,
    reporterId: currentMember.id,
    status: 'confirmed',
    reason: trimmedReason,
    createdAt: timestamp,
    confirmedAt: timestamp,
    resolvedAt: timestamp,
  });
  batch.set(doc(db, 'groups', groupId, 'reports', tokenRef.id), {
    targetId,
    reporterId: currentMember.id,
    reason: trimmedReason,
    timestamp,
    tokenType: 'NORMAL',
    displayTokenCount: 1,
    tokenValue: 1,
    source: NORMAL_TOKEN_SOURCE,
  });

  await batch.commit();
  return tokenRef;
}

// ---- 特殊Token(隱藏摩擦豬公彩蛋)：spec見「隱藏特殊Token系統開發規格」----
// 核心資料規則(spec section 2.2)：這是「一筆」交易紀錄(displayTokenCount=1)，
// 但帳面價值是5(tokenValue=5)，兩者分開存，不能寫成5筆一般Token去模擬總數。
//
// 這個app沒有獨立後端伺服器，spec裡的「Summon API驗證session」在這裡對應成：
// 一次性、原子性地直接寫入report+每日限制標記文件(batch)，不另外開session
// collection、不做兩段式「建立session→核銷session」——這樣可以少一層「session
// 過期沒被清理」的維運問題，同時仍然達到「這一份寫入不能被重複送出兩次」的效果:
// 見下方markerRef，firestore.rules只允許「建立」這個決定性ID的文件、不允許之後
// 更新/覆蓋，所以同一人同一天絕對只能成功寫入一次。
//
// AC19要求「Server驗證tokenValue，不接受前端自行傳任意倍率」：這裡tokenValue、
// tokenType、displayTokenCount、source全部是常數，前端呼叫端完全無法從外部
// 傳入覆蓋這幾個欄位的值；firestore.rules那邊也會再次驗證這幾個欄位的值
// (雙重防護：就算之後有人改了這支函式的呼叫方式，rules還是會擋下不合法的寫入)。
export async function reportSpecialToken({ groupId, targetId, targetMember, currentMember, reason }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !targetId || targetId === currentMember.id) {
    throw new Error('A different target member is required.');
  }
  if (targetMember && targetMember.id !== targetId) {
    throw new Error('The target member identity is invalid.');
  }
  if (targetMember?.active === false) {
    throw new Error('The target member is inactive.');
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw new Error('A reason is required.');
  }
  if (trimmedReason.length > 200) {
    throw new Error('The reason must be 200 characters or fewer.');
  }

  const dateKey = getTodayDateKey();
  const markerId = buildSpecialTokenSummonMarkerId(groupId, currentMember.id, dateKey);
  const reportRef = doc(collection(db, 'groups', groupId, 'reports'));
  const markerRef = doc(db, 'groups', groupId, 'specialTokenSummons', markerId);
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(reportRef, {
    targetId,
    reporterId: currentMember.id,
    reason: trimmedReason,
    timestamp,
    tokenType: SPECIAL_TOKEN_TYPE,
    displayTokenCount: 1,
    tokenValue: SPECIAL_TOKEN_MULTIPLIER,
    source: SPECIAL_TOKEN_SOURCE,
  });
  // 每日限制標記：markerId是「groupId+reporterId+日期」決定性算出來的，
  // 同一人同一天第二次呼叫這支函式會產生一模一樣的markerId，而firestore.rules
  // 只允許對這個路徑「create」、不允許後續update，所以第二次寫入會被Firestore
  // 直接判定成一次不被允許的update而拒絕——不需要規則語言自己算日期區間比對。
  batch.set(markerRef, {
    reporterId: currentMember.id,
    reportId: reportRef.id,
    createdAt: timestamp,
  });

  await batch.commit();
  return reportRef;
}

export async function resolveToken({ groupId, tokenId, action, currentMember }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !tokenId || !['confirm', 'reject'].includes(action)) {
    throw new Error('A valid token resolution is required.');
  }

  const tokenRef = doc(db, 'groups', groupId, 'tokens', tokenId);

  if (action === 'reject') {
    return updateDoc(tokenRef, {
      status: 'rejected',
      resolvedAt: serverTimestamp(),
    });
  }

  const tokenSnapshot = await getDoc(tokenRef);
  const token = tokenSnapshot.exists() ? tokenSnapshot.data() : null;

  if (!token || token.status !== 'pending' || token.targetId !== currentMember.id) {
    throw new Error('The pending token cannot be confirmed by this member.');
  }

  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(tokenRef, {
    status: 'confirmed',
    confirmedAt: timestamp,
    resolvedAt: timestamp,
  });
  batch.set(doc(db, 'groups', groupId, 'reports', tokenId), {
    targetId: token.targetId,
    reporterId: token.reporterId,
    timestamp,
  });

  return batch.commit();
}

// ---- 申訴功能：用來撤銷不合理或記錯的紀錄 ----
// 資料模型：在既有的report文件上「額外」加兩個欄位(appealedAt, appealConfirmedBy)，
// 不新增collection、不動原本的建立流程——一筆report在被申訴之前完全不會有這兩個欄位，
// 舊資料、還沒被申訴過的資料都不受影響。
// 達到APPEAL_CONFIRMATIONS_REQUIRED(3)人確認後直接刪除該report文件；
// 豬公的硬幣數/成員總Token數是從reports collection即時算出來的(useGroup.js的
// withReportTotals)，文件一刪除，該成員的totalTokens、3D豬公裡的硬幣數會自動跟著減少，
// 不需要另外處理「消除硬幣」這件事。

// 只有這筆紀錄的當事人(被記錄的那個人，targetId本人)能對自己的紀錄提出申訴。
export async function fileAppeal({ groupId, reportId, currentMember }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !reportId) {
    throw new Error('A report is required.');
  }

  const reportRef = doc(db, 'groups', groupId, 'reports', reportId);
  const snapshot = await getDoc(reportRef);
  if (!snapshot.exists()) {
    throw new Error('The report no longer exists.');
  }

  const data = snapshot.data();
  if (data.targetId !== currentMember.id) {
    throw new Error('Only the record owner can appeal this record.');
  }
  if (data.appealedAt) {
    throw new Error('This record already has an active appeal.');
  }

  return updateDoc(reportRef, {
    appealedAt: serverTimestamp(),
    appealConfirmedBy: [],
  });
}

// ---- 確認申訴：分成兩個獨立的Firestore寫入動作(重要設計決定，請勿合併回單一transaction) ----
//
// 背景(2026-09-07修正)：舊版把「新增這筆確認」跟「湊滿3人就刪除」放在同一個
// transaction裡——湊滿3人時直接transaction.delete()，並不會先把第3人這筆確認
// transaction.update()回文件。firestore.rules的validAppealDelete檢查的
// resource.data，指的是「這次寫入之前、伺服器上已經commit的文件內容」，同一個
// transaction裡稍早的update在evaluate這次delete的規則時並不會被看見——所以無論
// 把update/delete兩步塞在同一個transaction裡的順序怎麼調整，delete那一刻
// resource.data.appealConfirmedBy永遠只有2筆，validAppealDelete永遠是false，
// 第3次確認100%會拿到permission-denied。
//
// 修正方式：讓「新增確認」與「達標後刪除」變成兩次分開送出、各自independently commit
// 的Firestore寫入。Phase 2的delete送出時，Phase 1的update已經真的落地在伺服器上，
// 這時候resource.data.appealConfirmedBy就是「已經3筆」的狀態，規則才會如預期通過。

// Phase 1：原子地把目前這位成員的確認加進appealConfirmedBy。
// 沿用原本的transaction讀取+檢查+寫入，保留「兩個人幾乎同時確認」時的原子性保證
// (不會有一次確認被覆蓋掉、或誰是第3個人的判斷跟實際寫入不同步)。
// 這一步無論湊到幾人都只做update，絕對不在這裡做delete——delete留給Phase 2。
async function appendAppealConfirmation({ reportRef, currentMember }) {
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reportRef);
    if (!snapshot.exists()) {
      throw new Error('The report no longer exists.');
    }

    const data = snapshot.data();
    if (!data.appealedAt) {
      throw new Error('This record does not have an active appeal.');
    }
    if (data.targetId === currentMember.id) {
      throw new Error('The record owner cannot confirm their own appeal.');
    }

    const confirmedBy = Array.isArray(data.appealConfirmedBy) ? data.appealConfirmedBy : [];
    if (confirmedBy.includes(currentMember.id)) {
      throw new Error('This member has already confirmed the appeal.');
    }
    // 正常流程下，一旦湊滿APPEAL_CONFIRMATIONS_REQUIRED人，Phase 2會緊接著把
    // 文件刪除，所以「文件還存在、但已經有>=3筆確認」理論上只會是極短暫的過渡狀態
    // (例如Phase 2那次網路請求剛好失敗)。這裡明確擋下來、給一個講得清楚的錯誤，
    // 呼應firestore.rules那邊同樣新增的size() < APPEAL_CONFIRMATIONS_REQUIRED防線，
    // 避免無限疊加確認人數，也避免行為跟規則兩邊各說各話。
    if (confirmedBy.length >= APPEAL_CONFIRMATIONS_REQUIRED) {
      throw new Error('This appeal has already reached the required confirmations.');
    }

    const nextConfirmedBy = [...confirmedBy, currentMember.id];
    transaction.update(reportRef, { appealConfirmedBy: nextConfirmedBy });
    return nextConfirmedBy;
  });
}

// Phase 2：Phase 1已經確定commit之後，才視情況發出一次獨立的刪除請求。
// 用一般的deleteDoc()而不是transaction——這裡本來就不需要transaction的原子性
// (該加的那一筆確認在Phase 1已經確定寫入)，重點只是要讓這次delete是一個
// 全新的、resource.data會反映Phase 1最新結果的Firestore寫入。
// 如果文件在這之間已經被幾乎同時湊滿3人的另一位confirmer刪除了，deleteDoc()
// 對已經不存在的文件是Firestore的正常行為、不會丟錯，這裡視為「申訴已經解決」，
// 不需要特別處理成錯誤。
async function resolveAppealIfThresholdReached({ reportRef, confirmedBy }) {
  if (confirmedBy.length < APPEAL_CONFIRMATIONS_REQUIRED) {
    return false;
  }

  await deleteDoc(reportRef);
  return true;
}

// 其他成員(不能是這筆紀錄的當事人)對申訴中的紀錄按下「確認」。
export async function confirmAppeal({ groupId, reportId, currentMember }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !reportId) {
    throw new Error('A report is required.');
  }

  const reportRef = doc(db, 'groups', groupId, 'reports', reportId);
  const confirmedBy = await appendAppealConfirmation({ reportRef, currentMember });
  const deleted = await resolveAppealIfThresholdReached({ reportRef, confirmedBy });

  return { deleted, confirmedBy };
}
