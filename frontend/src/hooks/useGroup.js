import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_ERROR_MESSAGE = 'Unable to load group data right now.';

function toSafeError() {
  return new Error(SAFE_ERROR_MESSAGE);
}

function getMemberSortKey(member) {
  const name = member?.name ?? member?.displayName ?? '';
  return [name.toLocaleLowerCase(), member?.id ?? ''];
}

function compareMembers(left, right) {
  const [leftName, leftId] = getMemberSortKey(left);
  const [rightName, rightId] = getMemberSortKey(right);

  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
}

function toMemberDoc(docSnapshot) {
  const data = typeof docSnapshot?.data === 'function' ? docSnapshot.data() ?? {} : {};
  return {
    id: docSnapshot.id,
    ...data,
  };
}

function toGroupDoc(groupSnapshot) {
  if (!groupSnapshot?.exists?.()) {
    return null;
  }

  const data = typeof groupSnapshot.data === 'function' ? groupSnapshot.data() ?? {} : {};
  return {
    id: groupSnapshot.id,
    ...data,
  };
}

function withReportTotals(members, reports) {
  const totals = new Map();

  for (const report of reports) {
    const targetId = report?.targetId;
    if (typeof targetId === 'string') {
      totals.set(targetId, (totals.get(targetId) ?? 0) + 1);
    }
  }

  return members.map((member) => ({
    ...member,
    totalTokens: totals.get(member.id) ?? 0,
  }));
}

export function useGroup(groupId) {
  return {
    group: { id: 'main', name: '午餐禁公事團', lunchStart: '12:00', lunchEnd: '13:00' },
    members: [
      { id: 'member1', name: '你', avatar: 'pig', color: '#ec4899', active: true, totalTokens: 12 },
      { id: 'member2', name: 'Kevin', avatar: 'cat', color: '#3b82f6', active: true, totalTokens: 8 },
      { id: 'member3', name: 'Amy', avatar: 'frog', color: '#10b981', active: true, totalTokens: 15 },
      { id: 'member4', name: 'Jamie', avatar: 'bear', color: '#f59e0b', active: true, totalTokens: 6 },
    ],
    loading: false,
    error: null,
  };
}

export default useGroup;
