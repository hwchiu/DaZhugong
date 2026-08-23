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
    let unsubscribeGroup = null;
    let unsubscribeMembers = null;

    const isCurrent = () => active && subscriptionIdRef.current === nextSubscriptionId;
    const updateLoading = () => {
      if (!isCurrent()) {
        return;
      }

      setState((current) => ({
        ...current,
        loading: !(groupLoaded && membersLoaded),
      }));
    };
    const clearSubscriptions = () => {
      unsubscribeGroup?.();
      unsubscribeMembers?.();
      unsubscribeGroup = null;
      unsubscribeMembers = null;
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

            const members = (membersSnapshot?.docs ?? []).map(toMemberDoc).slice().sort(compareMembers);
            membersLoaded = true;
            setState((current) => ({
              ...current,
              members,
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
