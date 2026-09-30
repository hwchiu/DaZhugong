// 大豬公回憶錄留言服務(spec section 27/28)：MVP支援新增留言、刪除自己的留言、
// 按讚。讚的資料模型故意用一個子collection(likes/{memberId})而不是在comment文件上
// 累加likeCount數字——doc ID本身就是memberId，天生保證「每個人最多只能按一次讚」，
// 也讓firestore.rules可以用最單純的isMember(groupId, memberId)驗證，不需要在
// 規則語言裡去算「陣列多了誰、少了誰」這種較複雜的diff邏輯。
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase.js';

function assertAuthenticatedMember(currentMember) {
  if (!currentMember?.id) {
    throw new Error('The authenticated member identity is invalid.');
  }
}

function getMemberName(member) {
  return member?.name ?? member?.displayName ?? '未知成員';
}

export async function addMemoryComment({ groupId, memoryId, currentMember, content }) {
  assertAuthenticatedMember(currentMember);

  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!groupId || !memoryId || !trimmed) {
    throw new Error('Comment content is required.');
  }

  const commentRef = doc(collection(db, 'groups', groupId, 'memories', memoryId, 'comments'));
  const payload = {
    memoryId,
    authorId: currentMember.id,
    authorNameSnapshot: getMemberName(currentMember),
    avatarSnapshot: currentMember.avatar ?? null,
    content: trimmed,
    createdAt: serverTimestamp(),
    likeCount: 0,
  };

  await setDoc(commentRef, payload);
  return { id: commentRef.id, ...payload };
}

export async function deleteMemoryComment({ groupId, memoryId, commentId }) {
  if (!groupId || !memoryId || !commentId) {
    throw new Error('A comment is required.');
  }

  return deleteDoc(doc(db, 'groups', groupId, 'memories', memoryId, 'comments', commentId));
}

export async function toggleMemoryCommentLike({ groupId, memoryId, commentId, currentMember, liked }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !memoryId || !commentId) {
    throw new Error('A comment is required.');
  }

  const likeRef = doc(db, 'groups', groupId, 'memories', memoryId, 'comments', commentId, 'likes', currentMember.id);
  if (liked) {
    return deleteDoc(likeRef);
  }

  return setDoc(likeRef, { likedAt: serverTimestamp() });
}

export async function countMemoryCommentLikes({ groupId, memoryId, commentId }) {
  const snapshot = await getDocs(
    collection(db, 'groups', groupId, 'memories', memoryId, 'comments', commentId, 'likes'),
  );
  return snapshot.size;
}
