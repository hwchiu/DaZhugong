// 單篇回憶(Memory Detail)的Realtime資料：Memory本身 + 照片回憶 + 留言，三個各自
// 獨立的subscription，跟useGroup.js「group + members + reports」的合併loading模式
// 刻意保持一致。
import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_ERROR_MESSAGE = 'Unable to load this memory right now.';

function toSafeError() {
  return new Error(SAFE_ERROR_MESSAGE);
}

function toDocWithId(docSnapshot) {
  const data = typeof docSnapshot?.data === 'function' ? docSnapshot.data() ?? {} : {};
  return { id: docSnapshot.id, ...data };
}

export function useMemory(groupId, memoryId) {
  const subscriptionIdRef = useRef(0);
  const [state, setState] = useState({
    memory: null,
    photos: [],
    comments: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const nextSubscriptionId = subscriptionIdRef.current + 1;
    subscriptionIdRef.current = nextSubscriptionId;

    if (!groupId || !memoryId) {
      setState({ memory: null, photos: [], comments: [], loading: false, error: null });
      return undefined;
    }

    let active = true;
    let memoryLoaded = false;
    let photosLoaded = false;
    let commentsLoaded = false;
    let unsubscribeMemory = null;
    let unsubscribePhotos = null;
    let unsubscribeComments = null;

    const isCurrent = () => active && subscriptionIdRef.current === nextSubscriptionId;
    const clearSubscriptions = () => {
      unsubscribeMemory?.();
      unsubscribePhotos?.();
      unsubscribeComments?.();
      unsubscribeMemory = null;
      unsubscribePhotos = null;
      unsubscribeComments = null;
    };
    const updateLoading = () => {
      if (!isCurrent()) return;
      setState((current) => ({ ...current, loading: !(memoryLoaded && photosLoaded && commentsLoaded) }));
    };
    const fail = (error) => {
      if (!isCurrent()) return;
      active = false;
      clearSubscriptions();
      setState({
        memory: null,
        photos: [],
        comments: [],
        loading: false,
        error: error instanceof Error ? new Error(SAFE_ERROR_MESSAGE) : toSafeError(),
      });
    };

    setState({ memory: null, photos: [], comments: [], loading: true, error: null });

    try {
      unsubscribeMemory = onSnapshot(
        doc(db, 'groups', groupId, 'memories', memoryId),
        (snapshot) => {
          if (!isCurrent()) return;
          memoryLoaded = true;
          setState((current) => ({ ...current, memory: snapshot?.exists?.() ? toDocWithId(snapshot) : null }));
          updateLoading();
        },
        (error) => fail(error),
      );

      unsubscribePhotos = onSnapshot(
        query(collection(db, 'groups', groupId, 'memories', memoryId, 'photos'), orderBy('order', 'asc')),
        (snapshot) => {
          if (!isCurrent()) return;
          photosLoaded = true;
          setState((current) => ({ ...current, photos: (snapshot?.docs ?? []).map(toDocWithId) }));
          updateLoading();
        },
        (error) => fail(error),
      );

      unsubscribeComments = onSnapshot(
        query(collection(db, 'groups', groupId, 'memories', memoryId, 'comments'), orderBy('createdAt', 'asc')),
        (snapshot) => {
          if (!isCurrent()) return;
          commentsLoaded = true;
          setState((current) => ({ ...current, comments: (snapshot?.docs ?? []).map(toDocWithId) }));
          updateLoading();
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
  }, [groupId, memoryId]);

  return state;
}

export default useMemory;
