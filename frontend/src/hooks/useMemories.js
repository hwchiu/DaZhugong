// 回憶錄首頁清單(Realtime)：依sequenceNumber由新到舊排序(spec section 7 Reverse
// Chronological Timeline)。跟useSettlements.js刻意保持一致的風格(同一種訂閱/取消
// 訂閱生命週期管理、同一種安全錯誤訊息)。
import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_ERROR_MESSAGE = 'Unable to load memories right now.';

function toSafeError() {
  return new Error(SAFE_ERROR_MESSAGE);
}

function toMemoryDoc(docSnapshot) {
  const data = typeof docSnapshot?.data === 'function' ? docSnapshot.data() ?? {} : {};
  return { id: docSnapshot.id, ...data };
}

export function useMemories(groupId) {
  const subscriptionIdRef = useRef(0);
  const [state, setState] = useState({ memories: [], loading: false, error: null });

  useEffect(() => {
    const nextSubscriptionId = subscriptionIdRef.current + 1;
    subscriptionIdRef.current = nextSubscriptionId;

    if (!groupId) {
      setState({ memories: [], loading: false, error: null });
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
      if (!isCurrent()) return;
      active = false;
      clearSubscription();
      setState({ memories: [], loading: false, error: error instanceof Error ? new Error(SAFE_ERROR_MESSAGE) : toSafeError() });
    };

    setState({ memories: [], loading: true, error: null });

    try {
      const memoriesQuery = query(
        collection(db, 'groups', groupId, 'memories'),
        orderBy('sequenceNumber', 'desc'),
      );

      unsubscribe = onSnapshot(
        memoriesQuery,
        (snapshot) => {
          if (!isCurrent()) return;
          setState({ memories: (snapshot?.docs ?? []).map(toMemoryDoc), loading: false, error: null });
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
  }, [groupId]);

  return state;
}

export default useMemories;
