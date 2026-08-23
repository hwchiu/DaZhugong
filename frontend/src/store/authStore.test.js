import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMock = vi.hoisted(() => {
  const state = {
    subscriptions: [],
  };

  return {
    state,
    auth: { service: 'auth' },
    db: { service: 'firestore' },
    onAuthStateChanged: vi.fn((authInstance, callback) => {
      const unsubscribe = vi.fn();
      state.subscriptions.push({ authInstance, callback, unsubscribe });
      return unsubscribe;
    }),
    signOut: vi.fn(),
    collection: vi.fn((...args) => ({ kind: 'collection', args })),
    query: vi.fn((...args) => ({ kind: 'query', args })),
    where: vi.fn((...args) => ({ kind: 'where', args })),
    limit: vi.fn((...args) => ({ kind: 'limit', args })),
    getDocs: vi.fn(),
  };
});

vi.mock('../firebase.js', () => ({
  auth: firebaseMock.auth,
  db: firebaseMock.db,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: firebaseMock.onAuthStateChanged,
  signOut: firebaseMock.signOut,
}));

vi.mock('firebase/firestore', () => ({
  collection: firebaseMock.collection,
  query: firebaseMock.query,
  where: firebaseMock.where,
  limit: firebaseMock.limit,
  getDocs: firebaseMock.getDocs,
}));

async function loadAuthStore() {
  vi.resetModules();
  return import('./authStore.js');
}

function getLatestSubscription() {
  return firebaseMock.state.subscriptions.at(-1);
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  firebaseMock.state.subscriptions = [];
  firebaseMock.onAuthStateChanged.mockClear();
  firebaseMock.signOut.mockReset();
  firebaseMock.collection.mockClear();
  firebaseMock.query.mockClear();
  firebaseMock.where.mockClear();
  firebaseMock.limit.mockClear();
  firebaseMock.getDocs.mockReset();
});

describe('authStore', () => {
  it('does not touch localStorage or persistence APIs', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
    firebaseMock.signOut.mockResolvedValue(undefined);

    const { startAuthObserver, logout } = await loadAuthStore();
    const cleanup = startAuthObserver();
    cleanup();
    await logout();

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it('attaches only one auth observer until cleaned up', async () => {
    const { startAuthObserver } = await loadAuthStore();

    const cleanup1 = startAuthObserver();
    const cleanup2 = startAuthObserver();

    expect(firebaseMock.onAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(cleanup1).toBe(cleanup2);

    cleanup1();

    expect(getLatestSubscription()?.unsubscribe).toHaveBeenCalledTimes(1);

    const cleanup3 = startAuthObserver();
    expect(firebaseMock.onAuthStateChanged).toHaveBeenCalledTimes(2);

    cleanup3();
    expect(getLatestSubscription()?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('clears auth state for signed-out users', async () => {
    const { startAuthObserver, useAuthStore } = await loadAuthStore();
    startAuthObserver();

    getLatestSubscription().callback(null);

    expect(useAuthStore.getState()).toMatchObject({
      authReady: true,
      firebaseUser: null,
      currentMember: null,
      groupId: 'main',
      authError: null,
    });
    expect(firebaseMock.getDocs).not.toHaveBeenCalled();
    expect(firebaseMock.signOut).not.toHaveBeenCalled();
  });

  it('maps a single member document to currentMember', async () => {
    const user = { uid: 'user-123', email: 'ada@example.com' };
    firebaseMock.getDocs.mockResolvedValue({
      docs: [
        {
          id: 'member-7',
          data: () => ({ authUid: 'user-123', displayName: 'Ada Lovelace' }),
        },
      ],
    });

    const { startAuthObserver, useAuthStore } = await loadAuthStore();
    startAuthObserver();

    getLatestSubscription().callback(user);
    await flushMicrotasks();

    expect(firebaseMock.collection).toHaveBeenCalledWith(firebaseMock.db, 'groups', 'main', 'members');
    expect(firebaseMock.where).toHaveBeenCalledWith('authUid', '==', 'user-123');
    expect(firebaseMock.limit).toHaveBeenCalledWith(2);
    expect(firebaseMock.query).toHaveBeenCalledTimes(1);
    expect(firebaseMock.getDocs).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      authReady: true,
      firebaseUser: user,
      currentMember: {
        id: 'member-7',
        authUid: 'user-123',
        displayName: 'Ada Lovelace',
      },
      groupId: 'main',
      authError: null,
    });
    expect(firebaseMock.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', []],
    [
      'multiple',
      [
        { id: 'member-a', data: () => ({ authUid: 'user-123', displayName: 'Ada' }) },
        { id: 'member-b', data: () => ({ authUid: 'user-123', displayName: 'Grace' }) },
      ],
    ],
  ])('signs out when there is a %s member mapping', async (_, docs) => {
    const user = { uid: 'user-123' };
    firebaseMock.getDocs.mockResolvedValue({ docs });

    const { startAuthObserver, useAuthStore } = await loadAuthStore();
    startAuthObserver();

    getLatestSubscription().callback(user);
    await flushMicrotasks();

    expect(firebaseMock.signOut).toHaveBeenCalledWith(firebaseMock.auth);
    expect(useAuthStore.getState()).toMatchObject({
      authReady: true,
      firebaseUser: null,
      currentMember: null,
      groupId: 'main',
      authError: 'Unable to verify your account access right now.',
    });
  });

  it('signs out and reports a safe error when the membership query fails', async () => {
    const user = { uid: 'user-123' };
    firebaseMock.getDocs.mockRejectedValue(new Error('backend exploded with secrets'));
    firebaseMock.signOut.mockResolvedValue(undefined);

    const { startAuthObserver, useAuthStore } = await loadAuthStore();
    startAuthObserver();

    getLatestSubscription().callback(user);
    await flushMicrotasks();

    expect(firebaseMock.signOut).toHaveBeenCalledWith(firebaseMock.auth);
    expect(useAuthStore.getState()).toMatchObject({
      authReady: true,
      firebaseUser: null,
      currentMember: null,
      groupId: 'main',
      authError: 'Unable to verify your account access right now.',
    });
  });

  it('rejects logout failures instead of pretending success', async () => {
    const failure = new Error('sign-out failed');
    firebaseMock.signOut.mockRejectedValue(failure);

    const { logout } = await loadAuthStore();

    await expect(logout()).rejects.toBe(failure);
    expect(firebaseMock.signOut).toHaveBeenCalledWith(firebaseMock.auth);
  });
});
