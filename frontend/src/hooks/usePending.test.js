import { act, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';

const firestoreMock = vi.hoisted(() => {
  const state = {
    subscriptions: [],
  };

  return {
    state,
    db: { service: 'firestore' },
    collection: vi.fn((db, ...path) => ({ kind: 'collection', db, path })),
    query: vi.fn((...args) => ({ kind: 'query', args })),
    where: vi.fn((...args) => ({ kind: 'where', args })),
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
  where: firestoreMock.where,
  onSnapshot: firestoreMock.onSnapshot,
}));

async function loadHook() {
  vi.resetModules();
  return import('./usePending.js');
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
  firestoreMock.where.mockClear();
  firestoreMock.onSnapshot.mockClear();
});

describe('usePending', () => {
  it('loads pending reports for the member and sorts them by createdAt descending', async () => {
    const { usePending } = await loadHook();
    const { result } = renderHook(() => usePending('group-1', 'member-1'));

    expect(result.current).toMatchObject({
      pending: [],
      loading: true,
      error: null,
    });

    expect(firestoreMock.collection).toHaveBeenCalledWith(firestoreMock.db, 'groups', 'group-1', 'tokens');
    expect(firestoreMock.where).toHaveBeenCalledWith('targetId', '==', 'member-1');
    expect(firestoreMock.where).toHaveBeenCalledWith('status', '==', 'pending');
    expect(firestoreMock.query).toHaveBeenCalledTimes(1);

    const [subscription] = firestoreMock.state.subscriptions;
    const createdEarlier = 1700000000000;
    const createdLater = 1700000005000;

    await act(async () => {
      subscription.next(
        makeSnapshot([
          makeDoc('late', { targetId: 'member-1', status: 'pending', createdAt: createdLater }),
          makeDoc('early', { targetId: 'member-1', status: 'pending', createdAt: createdEarlier }),
        ]),
      );
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toMatchObject({
      pending: [
        { id: 'late', targetId: 'member-1', status: 'pending', createdAt: createdLater },
        { id: 'early', targetId: 'member-1', status: 'pending', createdAt: createdEarlier },
      ],
      loading: false,
      error: null,
    });
  });

  it('skips subscription work when the groupId or memberId is missing', async () => {
    const { usePending } = await loadHook();
    const { result, rerender } = renderHook(({ groupId, memberId }) => usePending(groupId, memberId), {
      initialProps: { groupId: 'group-1', memberId: 'member-1' },
    });

    await act(async () => {
      rerender({ groupId: 'group-1', memberId: null });
    });

    expect(result.current).toEqual({
      pending: [],
      loading: false,
      error: null,
    });
    expect(firestoreMock.state.subscriptions).toHaveLength(1);
  });

  it('surfaces errors safely and ignores stale callbacks after dependency changes', async () => {
    const { usePending } = await loadHook();
    const { result, rerender } = renderHook(({ groupId, memberId }) => usePending(groupId, memberId), {
      initialProps: { groupId: 'group-1', memberId: 'member-1' },
    });

    const firstSubscription = firestoreMock.state.subscriptions[0];

    await act(async () => {
      firstSubscription.error?.(new Error('backend exploded'));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Unable to load pending reports right now.');

    rerender({ groupId: 'group-2', memberId: 'member-2' });

    const secondSubscription = firestoreMock.state.subscriptions[1];
    await act(async () => {
      secondSubscription.next(
        makeSnapshot([
          makeDoc('new', { targetId: 'member-2', status: 'pending', createdAt: 200 }),
        ]),
      );
      firstSubscription.next(
        makeSnapshot([
          makeDoc('stale', { targetId: 'member-1', status: 'pending', createdAt: 300 }),
        ]),
      );
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pending).toEqual([
      { id: 'new', targetId: 'member-2', status: 'pending', createdAt: 200 },
    ]);
  });

  it('clears stale pending data immediately when the member identity changes', async () => {
    const { usePending } = await loadHook();
    const renders = [];

    function Probe({ groupId, memberId }) {
      const state = usePending(groupId, memberId);
      renders.push({
        groupId,
        memberId,
        pendingIds: state.pending.map((item) => item.id),
        loading: state.loading,
      });
      return null;
    }

    const { rerender } = render(createElement(Probe, { groupId: 'group-1', memberId: 'member-1' }));

    const firstSubscription = firestoreMock.state.subscriptions[0];

    await act(async () => {
      firstSubscription.next(
        makeSnapshot([
          makeDoc('old', { targetId: 'member-1', status: 'pending', createdAt: 100 }),
        ]),
      );
    });

    await waitFor(() =>
      expect(renders.some((entry) => entry.memberId === 'member-1' && entry.loading === false && entry.pendingIds[0] === 'old')).toBe(true),
    );

    const renderCountBeforeSwitch = renders.length;
    rerender(createElement(Probe, { groupId: 'group-1', memberId: 'member-2' }));

    const switchRenders = renders.slice(renderCountBeforeSwitch);

    expect(switchRenders[0]).toMatchObject({
      groupId: 'group-1',
      memberId: 'member-2',
      pendingIds: [],
      loading: true,
    });
    expect(
      switchRenders.some((entry) => entry.memberId === 'member-2' && entry.pendingIds.includes('old')),
    ).toBe(false);
  });
});
