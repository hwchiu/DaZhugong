import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseState = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'uid-1' } },
  db: { service: 'firestore' },
}));

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn((db, ...path) => ({ kind: 'collection', db, path })),
  doc: vi.fn((db, ...path) => ({ kind: 'doc', db, path })),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ kind: 'server-timestamp' })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  mockBatch: {
    update: vi.fn(),
    commit: vi.fn(),
  },
}));

vi.mock('../firebase.js', () => firebaseState);
vi.mock('firebase/firestore', () => firestoreMock);

import { createSettlement, fetchSettlement, getNextSettlementSequence, resetSettlement } from './settlementService.js';

const currentMember = { id: 'member-1', authUid: 'uid-1', name: 'Member One', active: true };
const members = [
  { id: 'niuge', name: '牛哥' },
  { id: 'emily', name: 'Emily' },
];

beforeEach(() => {
  firebaseState.auth.currentUser = { uid: 'uid-1' };
  Object.values(firestoreMock).forEach((mock) => {
    if (typeof mock?.mockClear === 'function') {
      mock.mockClear();
    }
  });
  firestoreMock.mockBatch.update.mockReset();
  firestoreMock.mockBatch.commit.mockReset().mockResolvedValue(undefined);
  firestoreMock.writeBatch.mockReturnValue(firestoreMock.mockBatch);
  firestoreMock.setDoc.mockResolvedValue(undefined);
  firestoreMock.updateDoc.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getNextSettlementSequence', () => {
  it('回傳今天已經有幾筆settlement之後的下一個序號', () => {
    expect(getNextSettlementSequence([], '20260930')).toBe(1);
    expect(
      getNextSettlementSequence([{ id: '20260930-001' }, { id: '20260929-001' }], '20260930'),
    ).toBe(2);
  });
});

describe('createSettlement', () => {
  it('rejects when the current member identity does not match the authenticated user', async () => {
    firebaseState.auth.currentUser = { uid: 'someone-else' };
    await expect(createSettlement({
      groupId: 'group-1',
      currentMember,
      members,
      reports: [{ id: 'r1', targetId: 'niuge', tokenValue: 1 }],
      settlements: [],
    })).rejects.toThrow('The authenticated member identity is invalid.');
  });

  it('rejects when there are no settleable reports', async () => {
    await expect(createSettlement({
      groupId: 'group-1',
      currentMember,
      members,
      reports: [{ id: 'r1', targetId: 'niuge', tokenValue: 1, settlementId: 'S0' }],
      settlements: [],
    })).rejects.toThrow('目前沒有可結算的 Token。');
  });

  it('creates the settlement snapshot first, then locks each settleable report with the settlement id (two-phase commit)', async () => {
    const reports = [
      { id: 'r1', targetId: 'niuge', tokenType: 'NORMAL', tokenValue: 1 },
      { id: 'r2', targetId: 'niuge', tokenType: 'SPECIAL_5X', tokenValue: 5 },
      { id: 'r3', targetId: 'emily', tokenType: 'NORMAL', tokenValue: 1, appealedAt: { seconds: 1 } },
    ];

    const result = await createSettlement({
      groupId: 'group-1',
      currentMember,
      members,
      reports,
      settlements: [],
    });

    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
    const [, settlementPayload] = firestoreMock.setDoc.mock.calls[0];
    expect(settlementPayload).toMatchObject({
      groupId: 'group-1',
      tokenUnitPrice: 100,
      currency: 'TWD',
      totalTokenValue: 6,
      totalAmount: 600,
      status: 'SETTLED',
      createdBy: 'member-1',
    });

    // Phase 2只鎖定「可結算」的兩筆(r1、r2)，申訴中的r3不受影響。
    expect(firestoreMock.mockBatch.update).toHaveBeenCalledTimes(2);
    const lockedPaths = firestoreMock.mockBatch.update.mock.calls.map(([ref]) => ref.path.at(-1));
    expect(lockedPaths.sort()).toEqual(['r1', 'r2']);
    expect(firestoreMock.mockBatch.commit).toHaveBeenCalledTimes(1);

    expect(result.settlementId).toMatch(/^\d{8}-\d{3}$/);
    expect(result.preview.totalTokenValue).toBe(6);

    // setDoc(Phase 1)必須先resolve、batch.commit(Phase 2)才會被呼叫。
    expect(firestoreMock.setDoc.mock.invocationCallOrder[0])
      .toBeLessThan(firestoreMock.writeBatch.mock.invocationCallOrder[0]);
  });

  it('increments the sequence based on existing settlements from the same date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0));

    const result = await createSettlement({
      groupId: 'group-1',
      currentMember,
      members,
      reports: [{ id: 'r1', targetId: 'niuge', tokenType: 'NORMAL', tokenValue: 1 }],
      settlements: [{ id: '20260930-001' }],
    });

    expect(result.settlementId).toBe('20260930-002');
  });
});

describe('resetSettlement', () => {
  it('rejects invalid identities', async () => {
    firebaseState.auth.currentUser = null;
    await expect(resetSettlement({ groupId: 'group-1', settlementId: 'S1', currentMember }))
      .rejects.toThrow('The authenticated member identity is invalid.');
  });

  it('updates the settlement status to RESET with a resetAt timestamp', async () => {
    await resetSettlement({ groupId: 'group-1', settlementId: '20260930-001', currentMember });

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { kind: 'doc', db: firebaseState.db, path: ['groups', 'group-1', 'settlements', '20260930-001'] },
      { status: 'RESET', resetAt: { kind: 'server-timestamp' } },
    );
  });
});

describe('fetchSettlement', () => {
  it('returns null when the document does not exist', async () => {
    firestoreMock.getDoc.mockResolvedValue({ exists: () => false });
    const result = await fetchSettlement({ groupId: 'group-1', settlementId: 'missing' });
    expect(result).toBeNull();
  });

  it('returns the settlement data merged with its id', async () => {
    firestoreMock.getDoc.mockResolvedValue({
      exists: () => true,
      id: '20260930-001',
      data: () => ({ status: 'SETTLED' }),
    });

    const result = await fetchSettlement({ groupId: 'group-1', settlementId: '20260930-001' });
    expect(result).toEqual({ id: '20260930-001', status: 'SETTLED' });
  });
});
