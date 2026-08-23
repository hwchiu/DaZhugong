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
    doc: vi.fn((db, ...path) => ({ kind: 'doc', db, path })),
    collection: vi.fn((db, ...path) => ({ kind: 'collection', db, path })),
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
  doc: firestoreMock.doc,
  collection: firestoreMock.collection,
  onSnapshot: firestoreMock.onSnapshot,
}));

async function loadHook() {
  vi.resetModules();
  return import('./useGroup.js');
}

function makeDoc(id, data) {
  return { id, data: () => data };
}

function makeSnapshot({ id, exists = true, data = {}, docs = [] } = {}) {
  return {
    id,
    exists: () => exists,
    data: () => data,
    docs,
  };
}

beforeEach(() => {
  firestoreMock.state.subscriptions = [];
  firestoreMock.doc.mockClear();
  firestoreMock.collection.mockClear();
  firestoreMock.onSnapshot.mockClear();
});

describe('useGroup', () => {
  it('loads a group and sorts members without mutating the snapshot', async () => {
    const { useGroup } = await loadHook();

    const originalDocs = [makeDoc('zeta', { name: 'Zeta' }), makeDoc('alpha', { name: 'Alpha' })];
    const { result } = renderHook(() => useGroup('group-1'));

    expect(result.current).toMatchObject({
      group: null,
      members: [],
      loading: true,
      error: null,
    });

    const [groupListener, membersListener, reportsListener] = firestoreMock.state.subscriptions;
    await act(async () => {
      groupListener.next(makeSnapshot({ id: 'group-1', data: { name: 'Lunch Crew' } }));
      membersListener.next(makeSnapshot({ docs: originalDocs }));
      reportsListener.next(makeSnapshot({
        docs: [
          makeDoc('report-1', { targetId: 'alpha' }),
          makeDoc('report-2', { targetId: 'alpha' }),
          makeDoc('report-3', { targetId: 'zeta' }),
        ],
      }));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toMatchObject({
      group: { id: 'group-1', name: 'Lunch Crew' },
      members: [
        { id: 'alpha', name: 'Alpha', totalTokens: 2 },
        { id: 'zeta', name: 'Zeta', totalTokens: 1 },
      ],
      loading: false,
      error: null,
    });
    expect(originalDocs.map((doc) => doc.id)).toEqual(['zeta', 'alpha']);
    expect(firestoreMock.doc).toHaveBeenCalledWith(firestoreMock.db, 'groups', 'group-1');
    expect(firestoreMock.collection).toHaveBeenCalledWith(firestoreMock.db, 'groups', 'group-1', 'members');
    expect(firestoreMock.collection).toHaveBeenCalledWith(firestoreMock.db, 'groups', 'group-1', 'reports');
  });

  it('returns a null group when the document does not exist', async () => {
    const { useGroup } = await loadHook();
    const { result } = renderHook(() => useGroup('missing-group'));

    const [groupListener, membersListener, reportsListener] = firestoreMock.state.subscriptions;
    await act(async () => {
      groupListener.next(makeSnapshot({ id: 'missing-group', exists: false }));
      membersListener.next(makeSnapshot({ docs: [] }));
      reportsListener.next(makeSnapshot({ docs: [] }));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toMatchObject({
      group: null,
      members: [],
      loading: false,
      error: null,
    });
  });

  it('surfaces listener errors safely', async () => {
    const { useGroup } = await loadHook();
    const { result } = renderHook(() => useGroup('group-1'));

    const [groupListener] = firestoreMock.state.subscriptions;
    await act(async () => {
      groupListener.error?.(new Error('internal secrets'));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.group).toBe(null);
    expect(result.current.members).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Unable to load group data right now.');
    expect(firestoreMock.state.subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores stale callbacks after the groupId changes and cleans up both listeners', async () => {
    const { useGroup } = await loadHook();
    const { result, rerender, unmount } = renderHook(({ groupId }) => useGroup(groupId), {
      initialProps: { groupId: 'group-a' },
    });

    const firstGroupListener = firestoreMock.state.subscriptions[0];
    const firstMembersListener = firestoreMock.state.subscriptions[1];
    const firstReportsListener = firestoreMock.state.subscriptions[2];

    rerender({ groupId: 'group-b' });

    const secondGroupListener = firestoreMock.state.subscriptions[3];
    const secondMembersListener = firestoreMock.state.subscriptions[4];
    const secondReportsListener = firestoreMock.state.subscriptions[5];

    await act(async () => {
      secondGroupListener.next(makeSnapshot({ id: 'group-b', data: { name: 'Fresh Group' } }));
      secondMembersListener.next(makeSnapshot({ docs: [makeDoc('b', { name: 'Bravo' })] }));
      secondReportsListener.next(makeSnapshot({ docs: [makeDoc('r-b', { targetId: 'b' })] }));
      firstGroupListener.next(makeSnapshot({ id: 'group-a', data: { name: 'Stale Group' } }));
      firstMembersListener.next(makeSnapshot({ docs: [makeDoc('a', { name: 'Alpha' })] }));
      firstReportsListener.next(makeSnapshot({ docs: [makeDoc('r-a', { targetId: 'a' })] }));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.group).toMatchObject({ id: 'group-b', name: 'Fresh Group' });
    expect(result.current.members).toEqual([{ id: 'b', name: 'Bravo', totalTokens: 1 }]);

    unmount();

    expect(secondGroupListener.unsubscribe).toHaveBeenCalledTimes(1);
    expect(secondMembersListener.unsubscribe).toHaveBeenCalledTimes(1);
    expect(secondReportsListener.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
