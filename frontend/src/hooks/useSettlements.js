import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_ERROR_MESSAGE = 'Unable to load settlement history right now.';

function toSafeError() {
  return new Error(SAFE_ERROR_MESSAGE);
}

function toSettlementDoc(docSnapshot) {
  const data = typeof docSnapshot?.data === 'function' ? docSnapshot.data() ?? {} : {};
  return {
    id: docSnapshot.id,
    ...data,
  };
}

// 讀取一個群組全部的Settlement紀錄(realtime)：History頁面的「結算狀態」篩選器、
// Settlement首頁判斷「目前是不是還有一筆結算完成、但還沒Reset」都共用這份資料，
// 不重複各自訂閱一次。跟useTokens.js的實作方式刻意保持一致的風格(同一個安全錯誤訊息、
// 同一種訂閱/取消訂閱的生命週期管理)。
export function useSettlements(groupId) {
  const subscriptionIdRef = useRef(0);
  const [state, setState] = useState({
    settlements: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const nextSubscriptionId = subscriptionIdRef.current + 1;
    subscriptionIdRef.current = nextSubscriptionId;

    if (!groupId) {
      setState({ settlements: [], loading: false, error: null });
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
        settlements: [],
        loading: false,
        error: error instanceof Error ? new Error(SAFE_ERROR_MESSAGE) : toSafeError(),
      });
    };

    setState({ settlements: [], loading: true, error: null });

    try {
      const settlementsQuery = query(
        collection(db, 'groups', groupId, 'settlements'),
        orderBy('createdAt', 'desc'),
      );

      unsubscribe = onSnapshot(
        settlementsQuery,
        (snapshot) => {
          if (!isCurrent()) {
            return;
          }

          setState({
            settlements: (snapshot?.docs ?? []).map(toSettlementDoc),
            loading: false,
            error: null,
          });
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

export default useSettlements;
