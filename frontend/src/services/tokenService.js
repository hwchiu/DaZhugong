import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';

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
  });

  await batch.commit();
  return tokenRef;
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
