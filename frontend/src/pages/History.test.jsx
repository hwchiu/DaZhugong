import { cleanup, render, screen, within } from '@testing-library/react';
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

// 固定「現在」時間，讓「近三天」/「我被投票不受三天限制」這類跟日期有關的行為
// 可以用明確的相對天數算出來、不必依賴測試執行當下的真實日期。
const NOW = new Date(2026, 8, 8, 12, 0, 0);

function daysAgo(days, hour = 12) {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  authState.currentMember = { id: 'self', name: '自己' };
  useGroupMock.mockReset();
  useTokensMock.mockReset();
  fileAppealMock.mockReset();
  confirmAppealMock.mockReset();
  useGroupMock.mockReturnValue({ members: [], loading: false, error: null });
  useTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
});

function findResultSection() {
  return screen.getByRole('list', { name: '已確認 Token 歷史紀錄' });
}

describe('History page', () => {
  it('subscribes to the full token history once (not a capped count), reused across all three scopes', () => {
    render(<History />);
    expect(useTokensMock).toHaveBeenCalledWith('main', 'all');
  });

  describe('default scope: 近三天', () => {
    it('shows only records from the last 3 days, hiding older ones, and shows the result count', () => {
      useGroupMock.mockReturnValue({
        members: [
          { id: 'reporter', name: '牛哥', active: true },
          { id: 'target', name: '房產大亨', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'recent', reporterId: 'reporter', targetId: 'target', timestamp: daysAgo(1) },
          { id: 'old', reporterId: 'reporter', targetId: 'target', timestamp: daysAgo(10) },
        ],
        loading: false,
        error: null,
      });

      render(<History />);

      expect(screen.getByText('共 1 筆紀錄')).toBeTruthy();
      const rows = within(findResultSection()).getAllByRole('listitem');
      expect(rows).toHaveLength(1);
      // 沒有查詢表單佔畫面：這個scope不應該出現日期/成員/類型/原因這些欄位。
      expect(screen.queryByLabelText('日期範圍')).toBe(null);
    });

    it("shows the target member's avatar in front of each record, not the reporter's", () => {
      useGroupMock.mockReturnValue({
        members: [
          { id: 'reporter', name: '牛哥', active: true },
          { id: 'target', name: '房產大亨', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [{ id: 'r1', reporterId: 'reporter', targetId: 'target', timestamp: daysAgo(1) }],
        loading: false,
        error: null,
      });

      render(<History />);

      const row = within(findResultSection()).getByRole('listitem');
      expect(within(row).getByRole('img', { name: '房產大亨' })).toBeTruthy();
      expect(within(row).queryByRole('img', { name: '牛哥' })).toBe(null);
    });
  });

  describe('appeal button domain rule: only records voted against the current user show 申訴', () => {
    it('shows 申訴 only on the record where I am the target, not on records I reported against someone else', () => {
      authState.currentMember = { id: 'niuge', name: '牛哥' };
      useGroupMock.mockReturnValue({
        members: [
          { id: 'niuge', name: '牛哥', active: true },
          { id: 'tycoon', name: '房產大亨', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'niuge-reports-tycoon', reporterId: 'niuge', targetId: 'tycoon', timestamp: daysAgo(1) },
          { id: 'tycoon-reports-niuge', reporterId: 'tycoon', targetId: 'niuge', timestamp: daysAgo(1) },
        ],
        loading: false,
        error: null,
      });

      render(<History />);

      const rows = within(findResultSection()).getAllByRole('listitem');
      const rowAgainstTycoon = rows.find((row) => row.textContent.includes('房產大亨'));
      const rowAgainstMe = rows.find((row) => row !== rowAgainstTycoon);

      expect(within(rowAgainstTycoon).queryByRole('button', { name: '申訴' })).toBe(null);
      expect(within(rowAgainstMe).getByRole('button', { name: '申訴' })).toBeTruthy();
    });
  });

  describe('全部 scope: advanced query', () => {
    async function switchToAllScope(user) {
      await user.click(screen.getByRole('tab', { name: '全部' }));
    }

    it('shows the query form with the four filter fields and defaults the date range to the last 3 days', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({ members: [{ id: 'a', name: 'Amy', active: true }], loading: false, error: null });

      render(<History />);
      await switchToAllScope(user);

      expect(screen.getByLabelText('日期範圍')).toBeTruthy();
      expect(screen.getByLabelText('投票對象')).toBeTruthy();
      expect(screen.getByLabelText('Token 類型')).toBeTruthy();
      expect(screen.getByLabelText('原因')).toBeTruthy();
      expect(screen.getByLabelText('日期範圍').value).toBe('2026-09-06');
      expect(screen.getByLabelText('日期範圍結束').value).toBe('2026-09-08');
      expect(screen.getByRole('button', { name: '清除條件' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '🔍 搜尋' })).toBeTruthy();
    });

    it('filters results by target member only after clicking 搜尋 (not live while adjusting the dropdown)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'amy', name: 'Amy', active: true },
          { id: 'jamie', name: 'Jamie', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'to-amy', reporterId: 'jamie', targetId: 'amy', timestamp: daysAgo(1) },
          { id: 'to-jamie', reporterId: 'amy', targetId: 'jamie', timestamp: daysAgo(1) },
        ],
        loading: false,
        error: null,
      });

      render(<History />);
      await switchToAllScope(user);
      expect(screen.getByText('共 2 筆紀錄')).toBeTruthy();

      await user.selectOptions(screen.getByLabelText('投票對象'), 'amy');
      // 還沒按搜尋，結果不應該變。
      expect(screen.getByText('共 2 筆紀錄')).toBeTruthy();

      await user.click(screen.getByRole('button', { name: '🔍 搜尋' }));
      expect(screen.getByText('共 1 筆紀錄')).toBeTruthy();
      const row = within(findResultSection()).getByRole('listitem');
      expect(within(row).getByRole('img', { name: 'Amy' })).toBeTruthy();
    });

    it('filters by token type (Special 5x)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'amy', name: 'Amy', active: true },
          { id: 'jamie', name: 'Jamie', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'normal', reporterId: 'jamie', targetId: 'amy', timestamp: daysAgo(1) },
          {
            id: 'special',
            reporterId: 'jamie',
            targetId: 'amy',
            timestamp: daysAgo(1),
            tokenType: 'SPECIAL_5X',
            tokenValue: 5,
            source: 'PIG_RUB_EASTER_EGG',
          },
        ],
        loading: false,
        error: null,
      });

      render(<History />);
      await switchToAllScope(user);
      await user.selectOptions(screen.getByLabelText('Token 類型'), 'special');
      await user.click(screen.getByRole('button', { name: '🔍 搜尋' }));

      expect(screen.getByText('共 1 筆紀錄')).toBeTruthy();
      expect(screen.getByText('特殊 5x')).toBeTruthy();
    });

    it('清除條件 resets both the form fields and the results back to the default 3-day window', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'amy', name: 'Amy', active: true },
          { id: 'jamie', name: 'Jamie', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'to-amy', reporterId: 'jamie', targetId: 'amy', timestamp: daysAgo(1) },
          { id: 'to-jamie', reporterId: 'amy', targetId: 'jamie', timestamp: daysAgo(1) },
        ],
        loading: false,
        error: null,
      });

      render(<History />);
      await switchToAllScope(user);
      await user.selectOptions(screen.getByLabelText('投票對象'), 'amy');
      await user.click(screen.getByRole('button', { name: '🔍 搜尋' }));
      expect(screen.getByText('共 1 筆紀錄')).toBeTruthy();

      await user.click(screen.getByRole('button', { name: '清除條件' }));

      expect(screen.getByLabelText('投票對象').value).toBe('all');
      expect(screen.getByText('共 2 筆紀錄')).toBeTruthy();
    });

    it('does not include records outside the applied date range', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({ members: [{ id: 'a', name: 'Amy', active: true }], loading: false, error: null });
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'within', reporterId: 'a', targetId: 'a', timestamp: daysAgo(1) },
          { id: 'outside', reporterId: 'a', targetId: 'a', timestamp: daysAgo(30) },
        ],
        loading: false,
        error: null,
      });

      render(<History />);
      await switchToAllScope(user);

      expect(screen.getByText('共 1 筆紀錄')).toBeTruthy();
    });
  });

  describe('我被投票 scope', () => {
    async function switchToVotedAgainstMeScope(user) {
      await user.click(screen.getByRole('tab', { name: '我被投票' }));
    }

    it('shows the explanation banner and is not limited to the last 3 days', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'self', name: '自己', active: true },
          { id: 'amy', name: 'Amy', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [{ id: 'old-against-me', reporterId: 'amy', targetId: 'self', timestamp: daysAgo(60) }],
        loading: false,
        error: null,
      });

      render(<History />);
      await switchToVotedAgainstMeScope(user);

      expect(screen.getByText('我被投票的紀錄')).toBeTruthy();
      expect(screen.getByText('這些是其他成員投給你的 Token，你可以針對不合理的紀錄提出申訴。')).toBeTruthy();
      expect(screen.getByText('共 1 筆被投票紀錄')).toBeTruthy();
    });

    it('phrases each record as "{reporter} 投給 我" instead of naming the target again', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'self', name: '自己', active: true },
          { id: 'amy', name: 'Amy', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [{ id: 't1', reporterId: 'amy', targetId: 'self', timestamp: daysAgo(1), reason: '仗著有錢' }],
        loading: false,
        error: null,
      });

      render(<History />);
      await switchToVotedAgainstMeScope(user);

      const row = within(findResultSection()).getByRole('listitem');
      expect(row.textContent).toContain('Amy');
      expect(row.textContent).toContain('投給');
      expect(row.textContent).toContain('我');
      expect(row.textContent).not.toContain('自己'); // 不會再多顯示一次target名字
      expect(within(row).getByRole('button', { name: '申訴' })).toBeTruthy();
    });

    it('still highlights Special 5x tokens distinctly', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'self', name: '自己', active: true },
          { id: 'amy', name: 'Amy', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [
          {
            id: 'special',
            reporterId: 'amy',
            targetId: 'self',
            timestamp: daysAgo(1),
            tokenType: 'SPECIAL_5X',
            tokenValue: 5,
            source: 'PIG_RUB_EASTER_EGG',
          },
        ],
        loading: false,
        error: null,
      });

      render(<History />);
      await switchToVotedAgainstMeScope(user);

      expect(screen.getByText('特殊 5x')).toBeTruthy();
      expect(screen.getByText('+5')).toBeTruthy();
    });

    it('explains the real 3-peer-confirmation appeal mechanism (not an admin-review flow)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<History />);
      await switchToVotedAgainstMeScope(user);

      expect(screen.getByText('申訴說明')).toBeTruthy();
      expect(screen.getByText(/需要有其他 3 位成員確認/)).toBeTruthy();
      expect(screen.queryByText(/管理員審核/)).toBe(null);
    });

    it('shows an empty-state message when nobody has reported the current user', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<History />);
      await switchToVotedAgainstMeScope(user);

      expect(screen.getByText('目前還沒有其他成員投給你 Token。')).toBeTruthy();
    });
  });

  describe('sort toggle', () => {
    it('reverses the order of records when the sort control is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({ members: [{ id: 'a', name: 'Amy', active: true }], loading: false, error: null });
      useTokensMock.mockReturnValue({
        tokens: [
          { id: 'older', reporterId: 'a', targetId: 'a', timestamp: daysAgo(2) },
          { id: 'newer', reporterId: 'a', targetId: 'a', timestamp: daysAgo(1) },
        ],
        loading: false,
        error: null,
      });

      render(<History />);
      let rows = within(findResultSection()).getAllByRole('listitem');
      expect(rows[0].querySelector('time').textContent).toContain('7'); // daysAgo(1) from Sep 8 = Sep 7
      expect(rows[1].querySelector('time').textContent).toContain('6'); // daysAgo(2) = Sep 6

      await user.click(screen.getByRole('button', { name: /依時間排序/ }));

      rows = within(findResultSection()).getAllByRole('listitem');
      expect(rows[0].querySelector('time').textContent).toContain('6');
      expect(rows[1].querySelector('time').textContent).toContain('7');
    });
  });

  describe('appeal flow', () => {
    it('opens a confirm dialog before filing an appeal, and calls fileAppeal only after confirming', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'self', name: '自己', active: true },
          { id: 'amy', name: 'Amy', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [{ id: 't1', reporterId: 'amy', targetId: 'self', timestamp: daysAgo(1), reason: '原因A' }],
        loading: false,
        error: null,
      });
      fileAppealMock.mockResolvedValue(undefined);

      render(<History />);
      await user.click(screen.getByRole('button', { name: '申訴' }));

      const dialog = screen.getByRole('dialog', { name: '確認提出申訴' });
      expect(fileAppealMock).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: '確定' }));

      expect(fileAppealMock).toHaveBeenCalledWith({ groupId: 'main', reportId: 't1', currentMember: authState.currentMember });
    });

    it('shows a safe error message when the appeal action fails', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      useGroupMock.mockReturnValue({
        members: [
          { id: 'self', name: '自己', active: true },
          { id: 'amy', name: 'Amy', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [{ id: 't1', reporterId: 'amy', targetId: 'self', timestamp: daysAgo(1) }],
        loading: false,
        error: null,
      });
      fileAppealMock.mockRejectedValue(new Error('boom'));

      render(<History />);
      await user.click(screen.getByRole('button', { name: '申訴' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確定' }));

      expect(await screen.findByRole('alert')).toHaveProperty('textContent', '這個操作暫時無法完成，請稍後再試。');
    });

    it('shows the 確認 button for an active appeal only to members other than the record owner', async () => {
      authState.currentMember = { id: 'jamie', name: 'Jamie' };
      useGroupMock.mockReturnValue({
        members: [
          { id: 'self', name: '自己', active: true },
          { id: 'amy', name: 'Amy', active: true },
          { id: 'jamie', name: 'Jamie', active: true },
        ],
        loading: false,
        error: null,
      });
      useTokensMock.mockReturnValue({
        tokens: [
          {
            id: 't1',
            reporterId: 'amy',
            targetId: 'self',
            timestamp: daysAgo(1),
            appealedAt: daysAgo(0),
            appealConfirmedBy: [],
          },
        ],
        loading: false,
        error: null,
      });

      render(<History />);

      expect(screen.getByText('申訴中（0/3 人確認）')).toBeTruthy();
      expect(screen.getByRole('button', { name: '確認' })).toBeTruthy();
    });
  });

  describe('loading and error states', () => {
    it('shows a loading indicator while group or token data is loading', () => {
      useGroupMock.mockReturnValue({ members: [], loading: true, error: null });
      render(<History />);
      expect(screen.getByRole('status')).toHaveProperty('textContent', expect.stringContaining('載入歷史紀錄中'));
    });

    it('shows a safe error message when loading fails', () => {
      useTokensMock.mockReturnValue({ tokens: [], loading: false, error: new Error('boom') });
      render(<History />);
      expect(screen.getByRole('alert').textContent).toContain('目前無法載入歷史紀錄，請稍後再試。');
    });
  });
});
