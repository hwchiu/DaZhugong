import { useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_ERROR_MESSAGE = 'Unable to load token history right now.';
const COUNT_ERROR_MESSAGE = 'Count must be between 1 and 100.';

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

function compareTokens(left, right) {
  const leftTime = toMillis(left?.timestamp);
  const rightTime = toMillis(right?.timestamp);

  if (leftTime > rightTime) return -1;
  if (leftTime < rightTime) return 1;
  if ((left?.id ?? '') < (right?.id ?? '')) return -1;
  if ((left?.id ?? '') > (right?.id ?? '')) return 1;
  return 0;
}

function toTokenDoc(docSnapshot) {
  const data = typeof docSnapshot?.data === 'function' ? docSnapshot.data() ?? {} : {};
  return {
    id: docSnapshot.id,
    ...data,
  };
}

function normalizeCount(count) {
  if (count === null || count === 'all') {
    return 'all';
  }

  if (typeof count !== 'number' || !Number.isFinite(count) || !Number.isInteger(count)) {
    return null;
  }

  if (count < 1 || count > 100) {
    return null;
  }

  return count;
}

export function useTokens(groupId, count = 30) {
  const subscriptionIdRef = useRef(0);
  const [state, setState] = useState({
    tokens: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const nextSubscriptionId = subscriptionIdRef.current + 1;
    subscriptionIdRef.current = nextSubscriptionId;

    if (!groupId) {
      setState({
        tokens: [],
        loading: false,
        error: null,
      });
      return undefined;
    }

    const normalizedCount = normalizeCount(count);
    if (!normalizedCount) {
      setState({
        tokens: [],
        loading: false,
        error: new Error(COUNT_ERROR_MESSAGE),
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
        tokens: [],
        loading: false,
        error: error instanceof Error ? new Error(SAFE_ERROR_MESSAGE) : toSafeError(),
      });
    };

    setState({
      tokens: [],
      loading: true,
      error: null,
    });

    try {
      const reportCollection = collection(db, 'groups', groupId, 'reports');
      const reportsQuery =
        normalizedCount === 'all'
          ? query(reportCollection, orderBy('timestamp', 'desc'))
          : query(reportCollection, orderBy('timestamp', 'desc'), limit(normalizedCount));

      unsubscribe = onSnapshot(
        reportsQuery,
        async (snapshot) => {
          try {
            if (!isCurrent()) {
              return;
            }

            const tokens = (snapshot?.docs ?? []).map(toTokenDoc).slice().sort(compareTokens);
            setState({
              tokens,
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
  }, [groupId, count]);

  return state;
}

export default useTokens;
