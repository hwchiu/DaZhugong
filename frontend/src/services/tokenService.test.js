import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseState = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'uid-1' } },
  db: { service: 'firestore' },
}));

const firestoreMock = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn((db, ...path) => ({ kind: 'collection', db, path })),
  // 支援兩種呼叫方式：doc(db, ...path) 原本的多段路徑寫法，
  // 以及 doc(collectionRef) 單一參數、自動產生ID的寫法(reportAndConfirmToken用這個
  // 讓同一個token跟report共用同一組自動產生的id)。
  doc: vi.fn((first, ...rest) => {
    if (rest.length === 0 && first && first.kind === 'collection') {
      return { kind: 'doc', db: first.db, path: [...first.path, 'generated-id'], id: 'generated-id' };
    }
    return { kind: 'doc', db: first, path: rest };
  }),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ kind: 'server-timestamp' })),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  // runTransaction的mock：實際呼叫傳進來的updateFunction，並把下面這個共用的
  // mockTransaction物件(get/update/delete都是vi.fn())傳給它，讓每個測試可以自己
  // 設定transaction.get()要回傳什麼、再檢查transaction.update()/delete()有沒有被正確呼叫。
  runTransaction: vi.fn((db, updateFunction) => updateFunction(firestoreMock.mockTransaction)),
  mockTransaction: {
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../firebase.js', () => firebaseState);
vi.mock('firebase/firestore', () => firestoreMock);

import { confirmAppeal, fileAppeal, reportAndConfirmToken, reportToken, resolveToken } from './tokenService.js';

const currentMember = {
  id: 'member-1',
  authUid: 'uid-1',
  name: 'Member One',
  active: true,
};

beforeEach(() => {
  firebaseState.auth.currentUser = { uid: 'uid-1' };
  Object.values(firestoreMock).forEach((mock) => {
    if (typeof mock?.mockClear === 'function') {
      mock.mockClear();
    }
  });
  firestoreMock.mockTransaction.get.mockReset();
  firestoreMock.mockTransaction.update.mockReset();
  firestoreMock.mockTransaction.delete.mockReset();
});

describe('reportToken', () => {
  it('rejects an inactive current member before writing', async () => {
    await expect(reportToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember: { ...currentMember, active: false },
    })).rejects.toThrow(/inactive/i);

    expect(firestoreMock.addDoc).not.toHaveBeenCalled();
  });

  it('rejects an inactive target member when target data is available', async () => {
    await expect(reportToken({
      groupId: 'main',
      targetId: 'member-2',
      targetMember: { id: 'member-2', active: false },
      currentMember,
    })).rejects.toThrow(/inactive/i);

    expect(firestoreMock.addDoc).not.toHaveBeenCalled();
  });

  it('prevents spoofing when Firebase Auth does not match the current member', async () => {
    firebaseState.auth.currentUser = { uid: 'attacker' };

    await expect(reportToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember,
    })).rejects.toThrow(/authenticated member/i);

    expect(firestoreMock.addDoc).not.toHaveBeenCalled();
  });

  it('creates a pending token using only the authenticated current member identity', async () => {
    firestoreMock.addDoc.mockResolvedValue({ id: 'token-1' });

    await expect(reportToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember,
    })).resolves.toEqual({ id: 'token-1' });

    expect(firestoreMock.addDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'tokens'] }),
      {
        targetId: 'member-2',
        reporterId: 'member-1',
        status: 'pending',
        createdAt: { kind: 'server-timestamp' },
        confirmedAt: null,
        resolvedAt: null,
      },
    );
  });
});

describe('reportAndConfirmToken', () => {
  it('rejects an inactive current member before writing', async () => {
    await expect(reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember: { ...currentMember, active: false },
      reason: '聊到deadline',
    })).rejects.toThrow(/inactive/i);

    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('rejects targeting self', async () => {
    await expect(reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-1',
      currentMember,
      reason: '聊到deadline',
    })).rejects.toThrow(/different target/i);

    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('rejects an inactive target member when target data is available', async () => {
    await expect(reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-2',
      targetMember: { id: 'member-2', active: false },
      currentMember,
      reason: '聊到deadline',
    })).rejects.toThrow(/inactive/i);

    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('prevents spoofing when Firebase Auth does not match the current member', async () => {
    firebaseState.auth.currentUser = { uid: 'attacker' };

    await expect(reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember,
      reason: '聊到deadline',
    })).rejects.toThrow(/authenticated member/i);

    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('rejects a missing or whitespace-only reason without writing', async () => {
    await expect(reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember,
      reason: '   ',
    })).rejects.toThrow(/reason is required/i);

    await expect(reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember,
    })).rejects.toThrow(/reason is required/i);

    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('rejects a reason longer than 200 characters without writing', async () => {
    await expect(reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember,
      reason: 'x'.repeat(201),
    })).rejects.toThrow(/200 characters/i);

    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('writes one atomic batch that creates a confirmed token and matching report sharing the same id', async () => {
    const batch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    firestoreMock.writeBatch.mockReturnValue(batch);

    const result = await reportAndConfirmToken({
      groupId: 'main',
      targetId: 'member-2',
      currentMember,
      reason: '  午餐時間聊到deadline  ',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'generated-id' }));
    expect(batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'tokens', 'generated-id'] }),
      {
        targetId: 'member-2',
        reporterId: 'member-1',
        status: 'confirmed',
        reason: '午餐時間聊到deadline',
        createdAt: { kind: 'server-timestamp' },
        confirmedAt: { kind: 'server-timestamp' },
        resolvedAt: { kind: 'server-timestamp' },
      },
    );
    expect(batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'reports', 'generated-id'] }),
      {
        targetId: 'member-2',
        reporterId: 'member-1',
        reason: '午餐時間聊到deadline',
        timestamp: { kind: 'server-timestamp' },
      },
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('resolveToken', () => {
  it('rejects an inactive resolving member before writing', async () => {
    await expect(resolveToken({
      groupId: 'main',
      tokenId: 'token-1',
      action: 'reject',
      currentMember: { ...currentMember, active: false },
    })).rejects.toThrow(/inactive/i);

    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('confirms with one atomic batch that updates the token and creates report/tokenId', async () => {
    const batch = { update: vi.fn(), set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    firestoreMock.writeBatch.mockReturnValue(batch);
    firestoreMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        targetId: 'member-1',
        reporterId: 'member-2',
        status: 'pending',
      }),
    });

    await resolveToken({
      groupId: 'main',
      tokenId: 'token-1',
      action: 'confirm',
      currentMember,
    });

    expect(batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'tokens', 'token-1'] }),
      {
        status: 'confirmed',
        confirmedAt: { kind: 'server-timestamp' },
        resolvedAt: { kind: 'server-timestamp' },
      },
    );
    expect(batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'reports', 'token-1'] }),
      {
        targetId: 'member-1',
        reporterId: 'member-2',
        timestamp: { kind: 'server-timestamp' },
      },
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects by updating only the token', async () => {
    await resolveToken({
      groupId: 'main',
      tokenId: 'token-1',
      action: 'reject',
      currentMember,
    });

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'tokens', 'token-1'] }),
      {
        status: 'rejected',
        resolvedAt: { kind: 'server-timestamp' },
      },
    );
    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });
});

describe('fileAppeal', () => {
  const existingReport = {
    targetId: 'member-1',
    reporterId: 'member-2',
    reason: '討論會議',
    timestamp: { kind: 'server-timestamp' },
  };

  it('rejects when the record does not exist', async () => {
    firestoreMock.getDoc.mockResolvedValue({ exists: () => false });

    await expect(fileAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember,
    })).rejects.toThrow(/no longer exists/i);

    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects when the current member is not the owner of the record', async () => {
    firestoreMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...existingReport, targetId: 'someone-else' }),
    });

    await expect(fileAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember,
    })).rejects.toThrow(/only the record owner/i);

    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects when the record already has an active appeal', async () => {
    firestoreMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...existingReport, appealedAt: { kind: 'server-timestamp' } }),
    });

    await expect(fileAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember,
    })).rejects.toThrow(/already has an active appeal/i);

    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
  });

  it('sets appealedAt and an empty confirmation list when the owner files a valid appeal', async () => {
    firestoreMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => existingReport,
    });

    await fileAppeal({ groupId: 'main', reportId: 'report-1', currentMember });

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'reports', 'report-1'] }),
      { appealedAt: { kind: 'server-timestamp' }, appealConfirmedBy: [] },
    );
  });

  it('rejects an inactive current member before touching Firestore', async () => {
    await expect(fileAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember: { ...currentMember, active: false },
    })).rejects.toThrow(/inactive/i);

    expect(firestoreMock.getDoc).not.toHaveBeenCalled();
  });
});

describe('confirmAppeal', () => {
  const appealedReport = {
    targetId: 'member-2',
    reporterId: 'member-3',
    reason: '討論會議',
    timestamp: { kind: 'server-timestamp' },
    appealedAt: { kind: 'server-timestamp' },
    appealConfirmedBy: [],
  };

  it('rejects when there is no active appeal on the record', async () => {
    firestoreMock.mockTransaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...appealedReport, appealedAt: null }),
    });

    await expect(confirmAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember,
    })).rejects.toThrow(/does not have an active appeal/i);

    expect(firestoreMock.mockTransaction.update).not.toHaveBeenCalled();
    expect(firestoreMock.mockTransaction.delete).not.toHaveBeenCalled();
  });

  it('rejects the record owner trying to confirm their own appeal', async () => {
    firestoreMock.mockTransaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...appealedReport, targetId: currentMember.id }),
    });

    await expect(confirmAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember,
    })).rejects.toThrow(/cannot confirm their own appeal/i);
  });

  it('rejects a member who already confirmed this appeal', async () => {
    firestoreMock.mockTransaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...appealedReport, appealConfirmedBy: [currentMember.id] }),
    });

    await expect(confirmAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember,
    })).rejects.toThrow(/already confirmed/i);
  });

  it('appends the confirming member without deleting when under the required threshold', async () => {
    firestoreMock.mockTransaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...appealedReport, appealConfirmedBy: ['member-a'] }),
    });

    const result = await confirmAppeal({ groupId: 'main', reportId: 'report-1', currentMember });

    expect(firestoreMock.mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'reports', 'report-1'] }),
      { appealConfirmedBy: ['member-a', currentMember.id] },
    );
    expect(firestoreMock.mockTransaction.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: false, confirmedBy: ['member-a', currentMember.id] });
  });

  it('deletes the record once the 3rd confirmation is reached (AC: 3+ confirmations removes the record)', async () => {
    firestoreMock.mockTransaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...appealedReport, appealConfirmedBy: ['member-a', 'member-b'] }),
    });

    const result = await confirmAppeal({ groupId: 'main', reportId: 'report-1', currentMember });

    expect(firestoreMock.mockTransaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['groups', 'main', 'reports', 'report-1'] }),
    );
    expect(firestoreMock.mockTransaction.update).not.toHaveBeenCalled();
    expect(result.deleted).toBe(true);
  });

  it('rejects when the record no longer exists', async () => {
    firestoreMock.mockTransaction.get.mockResolvedValue({ exists: () => false });

    await expect(confirmAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember,
    })).rejects.toThrow(/no longer exists/i);
  });

  it('rejects an inactive current member before starting a transaction', async () => {
    await expect(confirmAppeal({
      groupId: 'main',
      reportId: 'report-1',
      currentMember: { ...currentMember, active: false },
    })).rejects.toThrow(/inactive/i);

    expect(firestoreMock.runTransaction).not.toHaveBeenCalled();
  });
});
