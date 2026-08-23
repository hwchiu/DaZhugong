import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const firestoreMock = vi.hoisted(() => {
  const state = {
    subscriptions: [],
  };

  return {
    state,
    db: { service: 'firestore' },
    collection: vi.fn((db, ...path) => ({ kind: 'collection', db, path })),
    query: vi.fn((...args) => ({ kind: 'query', args })),
    orderBy: vi.fn((...args) => ({ kind: 'orderBy', args })),
    limit: vi.fn((...args) => ({ kind: 'limit', args })),
    onSnapshot: vi.fn((target, next, error) => {
      const unsubscribe = vi.fn();
      state.subscriptions.push({ target, next, error, unsubscribe });
      return unsubscribe;
    }),
  };
});

vi.mock('../firebase.js', () => ({
  db: firestoreMock.db,
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMock.collection,
  query: firestoreMock.query,
  orderBy: firestoreMock.orderBy,
  limit: firestoreMock.limit,
  onSnapshot: firestoreMock.onSnapshot,
}));

async function loadHook() {
  vi.resetModules();
  return import('./useTokens.js');
}

function makeDoc(id, data) {
  return { id, data: () => data };
}

function makeSnapshot(docs) {
  return { docs };
}

beforeEach(() => {
  firestoreMock.state.subscriptions = [];
  firestoreMock.collection.mockClear();
  firestoreMock.query.mockClear();
  firestoreMock.orderBy.mockClear();
  firestoreMock.limit.mockClear();
  firestoreMock.onSnapshot.mockClear();
});

describe('useTokens', () => {
  it('loads token reports with a bounded limit and sorts them by timestamp descending', async () => {
    const { useTokens } = await loadHook();
    const { result } = renderHook(() => useTokens('group-1', 30));

    expect(result.current).toMatchObject({
      tokens: [],
      loading: true,
      error: null,
    });

    expect(firestoreMock.collection).toHaveBeenCalledWith(firestoreMock.db, 'groups', 'group-1', 'reports');
    expect(firestoreMock.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(firestoreMock.limit).toHaveBeenCalledWith(30);
    expect(firestoreMock.query).toHaveBeenCalledTimes(1);

    const [subscription] = firestoreMock.state.subscriptions;

    await act(async () => {
      subscription.next(
        makeSnapshot([
          makeDoc('older', { timestamp: 1000, targetId: 'member-1' }),
          makeDoc('newer', { timestamp: 2000, targetId: 'member-1' }),
        ]),
      );
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toMatchObject({
      tokens: [
        { id: 'newer', timestamp: 2000, targetId: 'member-1' },
        { id: 'older', timestamp: 1000, targetId: 'member-1' },
      ],
      loading: false,
      error: null,
    });
  });

  it('rejects invalid counts and skips subscription work when the group is missing', async () => {
    const { useTokens } = await loadHook();
    const { result, rerender } = renderHook(({ groupId, count }) => useTokens(groupId, count), {
      initialProps: { groupId: 'group-1', count: 0 },
    });

    expect(result.current.tokens).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Count must be between 1 and 100.');
    expect(firestoreMock.state.subscriptions).toHaveLength(0);

    rerender({ groupId: null, count: 30 });

    expect(result.current).toEqual({
      tokens: [],
      loading: false,
      error: null,
    });
  });

  it('surfaces errors safely and ignores stale callbacks after dependency changes', async () => {
    const { useTokens } = await loadHook();
    const { result, rerender } = renderHook(({ groupId, count }) => useTokens(groupId, count), {
      initialProps: { groupId: 'group-1', count: 30 },
    });

    const firstSubscription = firestoreMock.state.subscriptions[0];

    await act(async () => {
      firstSubscription.error?.(new Error('backend exploded'));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Unable to load token history right now.');

    rerender({ groupId: 'group-2', count: 30 });

    const secondSubscription = firestoreMock.state.subscriptions[1];
    await act(async () => {
      secondSubscription.next(makeSnapshot([makeDoc('fresh', { timestamp: 200 })]));
      firstSubscription.next(makeSnapshot([makeDoc('stale', { timestamp: 300 })]));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tokens).toEqual([{ id: 'fresh', timestamp: 200 }]);
  });
});
