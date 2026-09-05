import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ groupId: 'main', currentMember: null }));
const useGroupMock = vi.hoisted(() => vi.fn());
const useTokensMock = vi.hoisted(() => vi.fn());
const fileAppealMock = vi.hoisted(() => vi.fn());
const confirmAppealMock = vi.hoisted(() => vi.fn());

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
  fileAppeal: fileAppealMock,
  confirmAppeal: confirmAppealMock,
}));

import History from './History.jsx';

afterEach(cleanup);

beforeEach(() => {
  authState.currentMember = null;
  useGroupMock.mockReset();
  useTokensMock.mockReset();
  fileAppealMock.mockReset();
  confirmAppealMock.mockReset();
  useGroupMock.mockReturnValue({ members: [], loading: false, error: null });
  useTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
});

describe('History page', () => {
  it('loads at most 100 reports and renders the latest rows first with active and inactive names', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'reporter', name: '阿明', active: true },
        { id: 'target', name: '小美', active: false },
      ],
      loading: false,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [
        { id: 'older', reporterId: 'target', targetId: 'reporter', timestamp: Date.UTC(2026, 7, 22, 4, 0) },
        { id: 'newer', reporterId: 'reporter', targetId: 'target', timestamp: Date.UTC(2026, 7, 23, 4, 30) },
      ],
      loading: false,
      error: null,
    });

    render(<History />);

    expect(useTokensMock).toHaveBeenCalledWith('main', 100);
    const rows = within(screen.getByRole('list', { name: '已確認 Token 歷史紀錄' })).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('阿明');
    expect(rows[0].textContent).toContain('小美');
    expect(rows[0].textContent).toContain('歷史成員');
    expect(rows[1].textContent).toContain('小美');
    expect(rows[0].textContent).toMatch(/2026.*8.*23/);
  });

  it("shows each entry's reason, falling back to a legacy-record note when reason is missing", () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'reporter', name: '阿明', active: true },
        { id: 'target', name: '小美', active: true },
      ],
      loading: false,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [
        {
          id: 'with-reason',
          reporterId: 'reporter',
          targetId: 'target',
          timestamp: Date.UTC(2026, 7, 23, 4, 30),
          reason: '討論會議',
        },
        {
          id: 'legacy-no-reason',
          reporterId: 'target',
          targetId: 'reporter',
          timestamp: Date.UTC(2026, 7, 22, 4, 0),
        },
      ],
      loading: false,
      error: null,
    });

    render(<History />);

    const rows = within(screen.getByRole('list', { name: '已確認 Token 歷史紀錄' })).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('原因：討論會議');
    expect(rows[1].textContent).toContain('原因：未填寫原因（舊版紀錄）');
  });

  it('shows accessible loading and safe error feedback', () => {
    useTokensMock.mockReturnValue({ tokens: [], loading: true, error: null });
    const { rerender } = render(<History />);

    expect(screen.getByRole('status').textContent).toContain('載入歷史紀錄');

    useTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: new Error('private backend detail'),
    });
    rerender(<History />);

    expect(screen.getByRole('alert').textContent).toContain('目前無法載入歷史紀錄');
    expect(screen.queryByText('private backend detail')).toBe(null);
  });

  it('shows a useful empty state', () => {
    render(<History />);

    expect(screen.getByText('目前還沒有已確認的 Token。')).toBeTruthy();
  });

  describe('appeal flow', () => {
    beforeEach(() => {
      authState.currentMember = { id: 'target', name: '小美' };
      useGroupMock.mockReturnValue({
        members: [
          { id: 'reporter', name: '阿明', active: true },
          { id: 'target', name: '小美', active: true },
          { id: 'other-1', name: 'Kevin', active: true },
        ],
        loading: false,
        error: null,
      });
    });

    it('shows an 申訴 button only on the current user\'s own record, not on others\'', () => {
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'own-record', reporterId: 'reporter', targetId: 'target', timestamp: Date.UTC(2026, 7, 23) },
          { id: 'others-record', reporterId: 'reporter', targetId: 'other-1', timestamp: Date.UTC(2026, 7, 22) },
        ],
        loading: false,
        error: null,
      });

      render(<History />);

      const rows = within(screen.getByRole('list', { name: '已確認 Token 歷史紀錄' })).getAllByRole('listitem');
      expect(within(rows[0]).getByRole('button', { name: '申訴' })).toBeTruthy();
      expect(within(rows[1]).queryByRole('button', { name: '申訴' })).toBe(null);
    });

    it('clicking 申訴 opens a confirmation dialog showing which record it applies to, without calling fileAppeal yet', async () => {
      const user = userEvent.setup();
      useTokensMock.mockReturnValue({
        tokens: [{
          id: 'own-record', reporterId: 'reporter', targetId: 'target', reason: '討論會議', timestamp: Date.UTC(2026, 7, 23),
        }],
        loading: false,
        error: null,
      });

      render(<History />);
      await user.click(screen.getByRole('button', { name: '申訴' }));

      const dialog = screen.getByRole('dialog', { name: '確認提出申訴' });
      expect(dialog.textContent).toContain('阿明');
      expect(dialog.textContent).toContain('小美');
      expect(dialog.textContent).toContain('討論會議');
      expect(fileAppealMock).not.toHaveBeenCalled();
    });

    it('clicking 取消 in the file-appeal dialog closes it without calling fileAppeal', async () => {
      const user = userEvent.setup();
      useTokensMock.mockReturnValue({
        tokens: [{ id: 'own-record', reporterId: 'reporter', targetId: 'target', timestamp: Date.UTC(2026, 7, 23) }],
        loading: false,
        error: null,
      });

      render(<History />);
      await user.click(screen.getByRole('button', { name: '申訴' }));
      await user.click(screen.getByRole('button', { name: '取消' }));

      expect(screen.queryByRole('dialog')).toBe(null);
      expect(fileAppealMock).not.toHaveBeenCalled();
    });

    it('filing an appeal only calls fileAppeal after confirming in the dialog', async () => {
      const user = userEvent.setup();
      fileAppealMock.mockResolvedValue(undefined);
      useTokensMock.mockReturnValue({
        tokens: [{ id: 'own-record', reporterId: 'reporter', targetId: 'target', timestamp: Date.UTC(2026, 7, 23) }],
        loading: false,
        error: null,
      });

      render(<History />);
      await user.click(screen.getByRole('button', { name: '申訴' }));
      expect(fileAppealMock).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: '確定' }));

      await waitFor(() => {
        expect(fileAppealMock).toHaveBeenCalledWith({
          groupId: 'main',
          reportId: 'own-record',
          currentMember: { id: 'target', name: '小美' },
        });
      });
      expect(screen.queryByRole('dialog')).toBe(null);
    });

    it('shows appeal progress and a safe error message if filing fails', async () => {
      const user = userEvent.setup();
      fileAppealMock.mockRejectedValue(new Error('internal firestore detail'));
      useTokensMock.mockReturnValue({
        tokens: [{ id: 'own-record', reporterId: 'reporter', targetId: 'target', timestamp: Date.UTC(2026, 7, 23) }],
        loading: false,
        error: null,
      });

      render(<History />);
      await user.click(screen.getByRole('button', { name: '申訴' }));
      await user.click(screen.getByRole('button', { name: '確定' }));

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('這個操作暫時無法完成');
      });
      expect(screen.queryByText('internal firestore detail')).toBe(null);
    });

    it('shows confirmation progress and a 確認 button for other members once an appeal is active', () => {
      useTokensMock.mockReturnValue({
        tokens: [{
          id: 'appealed',
          reporterId: 'reporter',
          targetId: 'target',
          timestamp: Date.UTC(2026, 7, 23),
          appealedAt: Date.UTC(2026, 7, 23, 1),
          appealConfirmedBy: ['other-1'],
        }],
        loading: false,
        error: null,
      });

      render(<History />);

      expect(screen.getByText('申訴中（1/3 人確認）')).toBeTruthy();
      // 這筆紀錄的當事人(小美自己)不該看到確認按鈕，也不該再看到申訴按鈕(已經申訴過了)
      expect(screen.queryByRole('button', { name: '確認' })).toBe(null);
      expect(screen.queryByRole('button', { name: '申訴' })).toBe(null);
    });

    it('lets a different member confirm an active appeal, and hides the button once they already confirmed', () => {
      authState.currentMember = { id: 'other-1', name: 'Kevin' };
      useTokensMock.mockReturnValue({
        tokens: [{
          id: 'appealed',
          reporterId: 'reporter',
          targetId: 'target',
          timestamp: Date.UTC(2026, 7, 23),
          appealedAt: Date.UTC(2026, 7, 23, 1),
          appealConfirmedBy: [],
        }],
        loading: false,
        error: null,
      });

      const { rerender } = render(<History />);
      expect(screen.getByRole('button', { name: '確認' })).toBeTruthy();

      useTokensMock.mockReturnValue({
        tokens: [{
          id: 'appealed',
          reporterId: 'reporter',
          targetId: 'target',
          timestamp: Date.UTC(2026, 7, 23),
          appealedAt: Date.UTC(2026, 7, 23, 1),
          appealConfirmedBy: ['other-1'],
        }],
        loading: false,
        error: null,
      });
      rerender(<History />);

      expect(screen.queryByRole('button', { name: '確認' })).toBe(null);
      expect(screen.getByText('你已經確認過這筆申訴。')).toBeTruthy();
    });

    it('clicking 確認 opens a dialog naming the record before confirmAppeal is called', async () => {
      const user = userEvent.setup();
      authState.currentMember = { id: 'other-1', name: 'Kevin' };
      useTokensMock.mockReturnValue({
        tokens: [{
          id: 'appealed',
          reporterId: 'reporter',
          targetId: 'target',
          reason: '偷看teams',
          timestamp: Date.UTC(2026, 7, 23),
          appealedAt: Date.UTC(2026, 7, 23, 1),
          appealConfirmedBy: [],
        }],
        loading: false,
        error: null,
      });

      render(<History />);
      await user.click(screen.getByRole('button', { name: '確認' }));

      const dialog = screen.getByRole('dialog', { name: '確認這筆申訴' });
      expect(dialog.textContent).toContain('阿明');
      expect(dialog.textContent).toContain('小美');
      expect(dialog.textContent).toContain('偷看teams');
      expect(confirmAppealMock).not.toHaveBeenCalled();
    });

    it('confirming an appeal only calls confirmAppeal after confirming in the dialog', async () => {
      const user = userEvent.setup();
      authState.currentMember = { id: 'other-1', name: 'Kevin' };
      confirmAppealMock.mockResolvedValue({ deleted: false });
      useTokensMock.mockReturnValue({
        tokens: [{
          id: 'appealed',
          reporterId: 'reporter',
          targetId: 'target',
          timestamp: Date.UTC(2026, 7, 23),
          appealedAt: Date.UTC(2026, 7, 23, 1),
          appealConfirmedBy: [],
        }],
        loading: false,
        error: null,
      });

      render(<History />);
      await user.click(screen.getByRole('button', { name: '確認' }));
      await user.click(screen.getByRole('button', { name: '確定' }));

      await waitFor(() => {
        expect(confirmAppealMock).toHaveBeenCalledWith({
          groupId: 'main',
          reportId: 'appealed',
          currentMember: { id: 'other-1', name: 'Kevin' },
        });
      });
    });
  });
});
