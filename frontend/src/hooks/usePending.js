import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_ERROR_MESSAGE = 'Unable to load pending reports right now.';

function toSafeError() {
  return new Error(SAFE_ERROR_MESSAGE);
}

function toMillis(timestamp) {
  if (!timestamp) {
    return 0;
  }

  if (typeof timestamp === 'number') {
    return timestamp;
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  if (typeof timestamp.toMillis === 'function') {
    return timestamp.toMillis();
  }

  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function comparePending(left, right) {
  const leftTime = toMillis(left?.createdAt);
  const rightTime = toMillis(right?.createdAt);

  if (leftTime > rightTime) return -1;
  if (leftTime < rightTime) return 1;
  if ((left?.id ?? '') < (right?.id ?? '')) return -1;
  if ((left?.id ?? '') > (right?.id ?? '')) return 1;
  return 0;
}

function toPendingDoc(docSnapshot) {
  const data = typeof docSnapshot?.data === 'function' ? docSnapshot.data() ?? {} : {};
  return {
    id: docSnapshot.id,
    ...data,
  };
}

export function usePending(groupId, memberId) {
  const subscriptionIdRef = useRef(0);
  const [state, setState] = useState({
    pending: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const nextSubscriptionId = subscriptionIdRef.current + 1;
    subscriptionIdRef.current = nextSubscriptionId;

    if (!groupId || !memberId) {
      setState({
        pending: [],
        loading: false,
        error: null,
      });
      return undefined;
    }

    let active = true;
    let unsubscribe = null;

    const isCurrent = () => active && subscriptionIdRef.current === nextSubscriptionId;
    const clearSubscription = () => {
      unsubscribe?.();
      unsubscribe = null;
    };
    const fail = (error) => {
      if (!isCurrent()) {
        return;
      }

      active = false;
      clearSubscription();
      setState({
        pending: [],
        loading: false,
        error: error instanceof Error ? new Error(SAFE_ERROR_MESSAGE) : toSafeError(),
      });
    };

    setState({
      pending: [],
      loading: true,
      error: null,
    });

    try {
      const pendingQuery = query(
        collection(db, 'groups', groupId, 'tokens'),
        where('targetId', '==', memberId),
        where('status', '==', 'pending'),
      );

      unsubscribe = onSnapshot(
        pendingQuery,
        async (snapshot) => {
          try {
            if (!isCurrent()) {
              return;
            }

            const pending = (snapshot?.docs ?? []).map(toPendingDoc).slice().sort(comparePending);
            setState({
              pending,
              loading: false,
              error: null,
            });
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
      clearSubscription();
    };
  }, [groupId, memberId]);

  return state;
}

export default usePending;
