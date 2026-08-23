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
