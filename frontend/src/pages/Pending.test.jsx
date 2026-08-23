import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: null,
  groupId: 'main',
}));

const usePendingMock = vi.hoisted(() => vi.fn());
const useGroupMock = vi.hoisted(() => vi.fn());
const resolveTokenMock = vi.hoisted(() => vi.fn());

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/usePending.js', () => ({
  usePending: usePendingMock,
  default: usePendingMock,
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock,
  default: useGroupMock,
}));

vi.mock('../services/tokenService.js', () => ({
  resolveToken: resolveTokenMock,
}));

import Pending from './Pending.jsx';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function renderPending() {
  return render(<Pending />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  authState.currentMember = {
    id: 'member-1',
    name: '自己',
    active: true,
    authUid: 'uid-1',
  };
  authState.groupId = 'main';
  usePendingMock.mockReset();
  useGroupMock.mockReset();
  resolveTokenMock.mockReset();
  usePendingMock.mockReturnValue({
    pending: [],
    loading: false,
    error: null,
  });
  useGroupMock.mockReturnValue({
    members: [],
    loading: false,
    error: null,
  });
});

describe('Pending page', () => {
  it('shows accessible loading and cheerful empty states', () => {
    usePendingMock.mockReturnValueOnce({
      pending: [],
      loading: true,
      error: null,
    });

    renderPending();

    expect(screen.getByRole('status').textContent).toContain('載入待確認項目');

    cleanup();
    renderPending();

    expect(screen.getByRole('heading', { name: '待確認' })).toBeTruthy();
    expect(screen.getByText('目前沒有待確認的一票，太棒了！')).toBeTruthy();
  });

  it('maps reporter history from all members, formats time safely, and calls exact confirm/reject args', async () => {
    const user = userEvent.setup();

    usePendingMock.mockReturnValue({
      pending: [
        {
          id: 'token-1',
          reporterId: 'member-2',
          targetId: 'member-1',
          createdAt: '2026-08-23T10:20:00.000Z',
        },
        {
          id: 'token-2',
          reporterId: 'member-3',
          targetId: 'member-1',
          createdAt: 'not-a-real-date',
        },
      ],
      loading: false,
      error: null,
    });
    useGroupMock.mockReturnValue({
      members: [
        { id: 'member-2', name: '小華', avatar: 'cat', color: '#10b981', active: false },
        { id: 'member-3', name: '阿明', avatar: 'frog', color: '#6366f1', active: true },
      ],
      loading: false,
      error: null,
    });

    renderPending();

    expect(screen.getByText('小華')).toBeTruthy();
    expect(screen.getByText('阿明')).toBeTruthy();
    expect(screen.getByText('曾經送出待確認的一票')).toBeTruthy();
    expect(screen.getByText(/時間稍後同步/)).toBeTruthy();
    expect(screen.getAllByText('送票人')[0].className).toContain('text-slate-800');

    await user.click(screen.getAllByRole('button', { name: '確認 +1 Token' })[0]);

    expect(resolveTokenMock).toHaveBeenCalledWith({
      groupId: 'main',
      tokenId: 'token-1',
      action: 'confirm',
      currentMember: authState.currentMember,
    });

    await user.click(screen.getAllByRole('button', { name: '駁回' })[1]);

    expect(resolveTokenMock).toHaveBeenCalledWith({
      groupId: 'main',
      tokenId: 'token-2',
      action: 'reject',
      currentMember: authState.currentMember,
    });
  });

  it('disables actions when the signed-in member is not the target member', () => {
    usePendingMock.mockReturnValue({
      pending: [
        {
          id: 'token-1',
          reporterId: 'member-2',
          targetId: 'member-9',
          createdAt: '2026-08-23T10:20:00.000Z',
        },
      ],
      loading: false,
      error: null,
    });
    useGroupMock.mockReturnValue({
      members: [{ id: 'member-2', name: '小華', avatar: 'cat', color: '#10b981', active: true }],
      loading: false,
      error: null,
    });

    renderPending();

    expect(screen.getByRole('button', { name: '確認 +1 Token' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '駁回' }).disabled).toBe(true);
    expect(screen.getByText('只有被點名的成員可以處理這筆待確認。')).toBeTruthy();
  });

  it('prevents duplicate actions while resolving, then shows a polite success state until realtime removal', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();

    usePendingMock.mockReturnValue({
      pending: [
        {
          id: 'token-1',
          reporterId: 'member-2',
          targetId: 'member-1',
          createdAt: '2026-08-23T10:20:00.000Z',
        },
      ],
      loading: false,
      error: null,
    });
    useGroupMock.mockReturnValue({
      members: [{ id: 'member-2', name: '小華', avatar: 'cat', color: '#10b981', active: true }],
      loading: false,
      error: null,
    });
    resolveTokenMock.mockReturnValue(deferred.promise);

    const view = renderPending();

    const confirmButton = screen.getByRole('button', { name: '確認 +1 Token' });
    const rejectButton = screen.getByRole('button', { name: '駁回' });

    await user.click(confirmButton);
    await user.click(confirmButton);
    await user.click(rejectButton);

    expect(resolveTokenMock).toHaveBeenCalledTimes(1);
    expect(confirmButton.disabled).toBe(true);
    expect(rejectButton.disabled).toBe(true);

    deferred.resolve();

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已送出確認'));

    usePendingMock.mockReturnValue({
      pending: [],
      loading: false,
      error: null,
    });

    view.rerender(<Pending />);

    expect(screen.getByText('目前沒有待確認的一票，太棒了！')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('已送出確認');
  });

  it('shows safe load errors and safe action errors with retry', async () => {
    const user = userEvent.setup();

    usePendingMock.mockReturnValueOnce({
      pending: [],
      loading: false,
      error: new Error('listener exploded'),
    });

    renderPending();

    expect(screen.getByRole('alert').textContent).toContain('目前無法載入待確認項目');
    expect(screen.queryByText('listener exploded')).toBe(null);

    cleanup();

    usePendingMock.mockReturnValue({
      pending: [
        {
          id: 'token-1',
          reporterId: 'member-2',
          targetId: 'member-1',
          createdAt: '2026-08-23T10:20:00.000Z',
        },
      ],
      loading: false,
      error: null,
    });
    useGroupMock.mockReturnValue({
      members: [{ id: 'member-2', name: '小華', avatar: 'cat', color: '#10b981', active: true }],
      loading: false,
      error: null,
    });
    resolveTokenMock
      .mockRejectedValueOnce(new Error('do not leak'))
      .mockResolvedValueOnce(undefined);

    renderPending();

    await user.click(screen.getByRole('button', { name: '確認 +1 Token' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('目前無法更新這筆待確認'));
    expect(screen.queryByText('do not leak')).toBe(null);

    await user.click(screen.getByRole('button', { name: '確認 +1 Token' }));

    expect(resolveTokenMock).toHaveBeenCalledTimes(2);
  });
});
