import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { applyMemberColorOverride } from '../data/memberAvatars.js';
import { reportTokenValue } from '../utils/specialToken.js';

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
  return applyMemberColorOverride({
    id: docSnapshot.id,
    ...data,
  });
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

// AC14/AC41：豬公硬幣數、成員總Token數要用SUM(tokenValue)計算，不能只COUNT筆數，
// 否則一顆價值5的特殊Token在畫面上只會被算成1。reportTokenValue()對舊資料
// (沒有tokenValue欄位、這次功能上線之前寫入的紀錄)一律視為1，維持原本的計算結果不變。
function withReportTotals(members, reports) {
  const totals = new Map();

  for (const report of reports) {
    const targetId = report?.targetId;
    if (typeof targetId === 'string') {
      totals.set(targetId, (totals.get(targetId) ?? 0) + reportTokenValue(report));
    }
  }

  return members.map((member) => ({
    ...member,
    totalTokens: totals.get(member.id) ?? 0,
  }));
}

export function useGroup(groupId) {
  const subscriptionIdRef = useRef(0);
  const [state, setState] = useState({
    group: null,
    members: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const nextSubscriptionId = subscriptionIdRef.current + 1;
    subscriptionIdRef.current = nextSubscriptionId;

    if (!groupId) {
      setState({
        group: null,
        members: [],
        loading: false,
        error: null,
      });
      return undefined;
    }

    let active = true;
    let groupLoaded = false;
    let membersLoaded = false;
    let reportsLoaded = false;
    let latestMembers = [];
    let latestReports = [];
    let unsubscribeGroup = null;
    let unsubscribeMembers = null;
    let unsubscribeReports = null;

    const isCurrent = () => active && subscriptionIdRef.current === nextSubscriptionId;
    const updateLoading = () => {
      if (!isCurrent()) {
        return;
      }

      setState((current) => ({
        ...current,
        loading: !(groupLoaded && membersLoaded && reportsLoaded),
      }));
    };
    const clearSubscriptions = () => {
      unsubscribeGroup?.();
      unsubscribeMembers?.();
      unsubscribeReports?.();
      unsubscribeGroup = null;
      unsubscribeMembers = null;
      unsubscribeReports = null;
    };
    const fail = (error) => {
      if (!isCurrent()) {
        return;
      }

      active = false;
      clearSubscriptions();
      setState({
        group: null,
        members: [],
        loading: false,
        error: error instanceof Error ? new Error(SAFE_ERROR_MESSAGE) : toSafeError(),
      });
    };

    setState({
      group: null,
      members: [],
      loading: true,
      error: null,
    });

    try {
      unsubscribeGroup = onSnapshot(
        doc(db, 'groups', groupId),
        async (groupSnapshot) => {
          try {
            if (!isCurrent()) {
              return;
            }

            groupLoaded = true;
            setState((current) => ({
              ...current,
              group: toGroupDoc(groupSnapshot),
            }));
            updateLoading();
          } catch (error) {
            fail(error);
          }
        },
        (error) => fail(error),
      );

      unsubscribeMembers = onSnapshot(
        collection(db, 'groups', groupId, 'members'),
        async (membersSnapshot) => {
          try {
            if (!isCurrent()) {
              return;
            }

            latestMembers = (membersSnapshot?.docs ?? []).map(toMemberDoc).slice().sort(compareMembers);
            membersLoaded = true;
            setState((current) => ({
              ...current,
              members: withReportTotals(latestMembers, latestReports),
            }));
            updateLoading();
          } catch (error) {
            fail(error);
          }
        },
        (error) => fail(error),
      );

      unsubscribeReports = onSnapshot(
        collection(db, 'groups', groupId, 'reports'),
        async (reportsSnapshot) => {
          try {
            if (!isCurrent()) {
              return;
            }

            latestReports = (reportsSnapshot?.docs ?? []).map(toMemberDoc);
            reportsLoaded = true;
            setState((current) => ({
              ...current,
              members: withReportTotals(latestMembers, latestReports),
            }));
            updateLoading();
          } catch (error) {
            fail(error);
          }
        },
        (error) => fail(error),
      );
    } catch (error) {
      fail(error);
    }

    return () => {
      active = false;
      clearSubscriptions();
    };
  }, [groupId]);

  return state;
}

export default useGroup;
