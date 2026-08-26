import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: null,
  groupId: 'main',
}));

const useGroupMock = vi.hoisted(() => vi.fn());
const useTokensMock = vi.hoisted(() => vi.fn());
const reportAndConfirmTokenMock = vi.hoisted(() => vi.fn());

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock,
  default: useGroupMock,
}));

vi.mock('../hooks/useTokens.js', () => ({
  useTokens: useTokensMock,
  default: useTokensMock,
}));

vi.mock('../services/tokenService.js', () => ({
  reportAndConfirmToken: reportAndConfirmTokenMock,
}));

import Vote from './Vote.jsx';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function renderVote() {
  return render(<Vote />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  authState.currentMember = {
    id: 'self',
    name: '自己',
    active: true,
    authUid: 'uid-self',
  };
  authState.groupId = 'main';
  useGroupMock.mockReset();
  useTokensMock.mockReset();
  reportAndConfirmTokenMock.mockReset();
  useGroupMock.mockReturnValue({
    members: [],
    loading: false,
    error: null,
  });
  useTokensMock.mockReturnValue({
    tokens: [],
    loading: false,
    error: null,
  });
});

describe('Vote page', () => {
  it('shows a loading state while members or report totals are still loading', () => {
    useGroupMock.mockReturnValue({
      members: [],
      loading: true,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [],
      loading: true,
      error: null,
    });

    renderVote();

    expect(screen.getByRole('heading', { name: '投票' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('載入可投票成員');
  });

  it('renders only active non-self members and derives totals from report documents', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true, totalTokens: 22 },
        { id: 'active-1', name: '小華', active: true, totalTokens: 99, avatar: 'cat' },
        { id: 'inactive', name: '小美', active: false, totalTokens: 88 },
        { id: 'active-2', name: '阿明', active: true, totalTokens: 77, avatar: 'frog' },
      ],
      loading: false,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [
        { id: 'report-1', targetId: 'active-1' },
        { id: 'report-2', targetId: 'active-1' },
        { id: 'report-3', targetId: 'active-2' },
      ],
      loading: false,
      error: null,
    });

    renderVote();

    expect(screen.queryByRole('button', { name: /自己/ })).toBe(null);
    expect(screen.queryByRole('button', { name: /小美/ })).toBe(null);
    expect(screen.getByRole('button', { name: /小華/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /阿明/ })).toBeTruthy();
    expect(screen.getByText('已確認 2 票')).toBeTruthy();
    expect(screen.getByText('已確認 1 票')).toBeTruthy();
    expect(screen.queryByText('已確認 99 票')).toBe(null);
  });

  it('uses the full report subscription so 101+ confirmed totals stay authoritative', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true, totalTokens: 22 },
        { id: 'active-1', name: '小華', active: true, totalTokens: 99, avatar: 'cat' },
        { id: 'active-2', name: '阿明', active: true, totalTokens: 77, avatar: 'frog' },
      ],
      loading: false,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [
        ...Array.from({ length: 101 }, (_, index) => ({ id: `report-a-${index + 1}`, targetId: 'active-1' })),
        { id: 'report-b-1', targetId: 'active-2' },
      ],
      loading: false,
      error: null,
    });

    renderVote();

    expect(useTokensMock).toHaveBeenCalledWith('main', null);
    expect(screen.getByText('已確認 101 票')).toBeTruthy();
    expect(screen.getByText('已確認 1 票')).toBeTruthy();
    expect(screen.queryByText('已確認 99 票')).toBe(null);
  });

  it('shows an empty state when there are no other active members to report', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true },
        { id: 'inactive', name: '小美', active: false },
      ],
      loading: false,
      error: null,
    });

    renderVote();

    expect(screen.getByText('目前沒有其他可投票的成員。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '請先選擇成員' }).disabled).toBe(true);
  });

  it('selecting a member enables the confirm button, which opens the reason modal', async () => {
    const user = userEvent.setup();

    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true },
        { id: 'active-1', name: '小華', active: true, avatar: 'cat' },
      ],
      loading: false,
      error: null,
    });

    renderVote();

    const huaButton = screen.getByRole('button', { name: /小華/ });
    await user.click(huaButton);

    expect(huaButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('目前選擇：小華')).toBeTruthy();

    const confirmButton = screen.getByRole('button', { name: '確認：小華' });
    expect(confirmButton.disabled).toBe(false);
    await user.click(confirmButton);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('這一枚 Token 會記在小華名下。')).toBeTruthy();
  });

  it('requires a non-empty reason before the save button is enabled, and cancel closes without saving', async () => {
    const user = userEvent.setup();

    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true },
        { id: 'active-1', name: '小華', active: true, avatar: 'cat' },
      ],
      loading: false,
      error: null,
    });

    renderVote();

    await user.click(screen.getByRole('button', { name: /小華/ }));
    await user.click(screen.getByRole('button', { name: '確認：小華' }));

    const saveButton = screen.getByRole('button', { name: '儲存' });
    expect(saveButton.disabled).toBe(true);

    await user.type(screen.getByLabelText('原因說明'), '聊到deadline');
    expect(saveButton.disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('dialog')).toBe(null);
    expect(reportAndConfirmTokenMock).not.toHaveBeenCalled();
  });

  it('saves the reason, calls reportAndConfirmToken, and resets selection on success', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();

    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true },
        { id: 'active-1', name: '小華', active: true, avatar: 'cat' },
        { id: 'active-2', name: '阿明', active: true, avatar: 'frog' },
      ],
      loading: false,
      error: null,
    });
    reportAndConfirmTokenMock.mockReturnValue(deferred.promise);

    renderVote();

    const huaButton = screen.getByRole('button', { name: /小華/ });
    const mingButton = screen.getByRole('button', { name: /阿明/ });

    await user.click(huaButton);
    await user.click(screen.getByRole('button', { name: '確認：小華' }));
    await user.type(screen.getByLabelText('原因說明'), '午餐時間聊到deadline');
    await user.click(screen.getByRole('button', { name: '儲存' }));

    expect(reportAndConfirmTokenMock).toHaveBeenCalledTimes(1);
    expect(reportAndConfirmTokenMock).toHaveBeenCalledWith({
      groupId: 'main',
      targetId: 'active-1',
      targetMember: { id: 'active-1', name: '小華', active: true, avatar: 'cat' },
      currentMember: authState.currentMember,
      reason: '午餐時間聊到deadline',
    });
    expect(screen.getByRole('button', { name: '儲存中…' }).disabled).toBe(true);

    deferred.resolve({ id: 'token-1' });

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已將一枚屬於小華的 Token 投入豬公'));

    expect(screen.queryByRole('dialog')).toBe(null);
    expect(screen.getByText('請先選擇一位成員')).toBeTruthy();
    expect(huaButton.getAttribute('aria-pressed')).toBe('false');
    expect(mingButton.disabled).toBe(false);
  });

  it('shows safe load and save errors without exposing raw failures', async () => {
    const user = userEvent.setup();

    useGroupMock.mockReturnValue({
      members: [],
      loading: false,
      error: new Error('secret member error'),
    });

    renderVote();

    expect(screen.getByRole('alert').textContent).toContain('目前無法載入投票資料');
    expect(screen.queryByText('secret member error')).toBe(null);

    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true },
        { id: 'active-1', name: '小華', active: true },
      ],
      loading: false,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: null,
    });
    reportAndConfirmTokenMock.mockRejectedValue(new Error('do not leak this'));

    cleanup();
    renderVote();

    await user.click(screen.getByRole('button', { name: /小華/ }));
    await user.click(screen.getByRole('button', { name: '確認：小華' }));
    await user.type(screen.getByLabelText('原因說明'), '聊到deadline');
    await user.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('目前無法儲存這筆紀錄'));

    expect(screen.queryByText('do not leak this')).toBe(null);
    // 失敗後modal要留著，讓使用者不用重打一次原因
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('原因說明').value).toBe('聊到deadline');
  });

  it('keeps the member card keyboard focus visible with a high-contrast outline', async () => {
    const user = userEvent.setup();

    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true },
        { id: 'active-1', name: '小華', active: true, avatar: 'cat' },
      ],
      loading: false,
      error: null,
    });

    renderVote();

    await user.tab();

    const huaButton = screen.getByRole('button', { name: /小華/ });
    expect(document.activeElement).toBe(huaButton);
    expect(huaButton.className).toContain('focus-visible:outline');
    expect(huaButton.className).toContain('focus-visible:outline-[3px]');
    expect(huaButton.className).toContain('focus-visible:outline-[#9f1239]');
    expect(huaButton.className).toContain('focus-visible:outline-offset-2');
    expect(huaButton.className).not.toContain('focus-visible:outline-none');
  });
});
