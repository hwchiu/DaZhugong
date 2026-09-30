import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const firestoreMock = vi.hoisted(() => {
  const state = { subscriptions: [] };

  return {
    state,
    db: { service: 'firestore' },
    collection: vi.fn((db, ...path) => ({ kind: 'collection', db, path })),
    query: vi.fn((...args) => ({ kind: 'query', args })),
    orderBy: vi.fn((...args) => ({ kind: 'orderBy', args })),
    onSnapshot: vi.fn((target, next, error) => {
      const unsubscribe = vi.fn();
      state.subscriptions.push({ target, next, error, unsubscribe });
      return unsubscribe;
    }),
  };
});

vi.mock('../firebase.js', () => ({ db: firestoreMock.db }));
vi.mock('firebase/firestore', () => ({
  collection: firestoreMock.collection,
  query: firestoreMock.query,
  orderBy: firestoreMock.orderBy,
  onSnapshot: firestoreMock.onSnapshot,
}));

async function loadHook() {
  vi.resetModules();
  return import('./useSettlements.js');
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
  firestoreMock.onSnapshot.mockClear();
});

describe('useSettlements', () => {
  it('subscribes to the group settlements collection ordered by createdAt desc', async () => {
    const { useSettlements } = await loadHook();
    const { result } = renderHook(() => useSettlements('group-1'));

    expect(result.current).toMatchObject({ settlements: [], loading: true, error: null });
    expect(firestoreMock.collection).toHaveBeenCalledWith(firestoreMock.db, 'groups', 'group-1', 'settlements');
    expect(firestoreMock.orderBy).toHaveBeenCalledWith('createdAt', 'desc');

    const [subscription] = firestoreMock.state.subscriptions;

    await act(async () => {
      subscription.next(makeSnapshot([makeDoc('s1', { status: 'SETTLED' })]));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settlements).toEqual([{ id: 's1', status: 'SETTLED' }]);
  });

  it('returns an empty, non-loading state when there is no groupId', async () => {
    const { useSettlements } = await loadHook();
    const { result } = renderHook(() => useSettlements(null));

    expect(result.current).toEqual({ settlements: [], loading: false, error: null });
    expect(firestoreMock.onSnapshot).not.toHaveBeenCalled();
  });

  it('turns subscription errors into a safe, generic error message', async () => {
    const { useSettlements } = await loadHook();
    const { result } = renderHook(() => useSettlements('group-1'));

    const [subscription] = firestoreMock.state.subscriptions;
    await act(async () => {
      subscription.error(new Error('permission-denied'));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.settlements).toEqual([]);
  });
});
