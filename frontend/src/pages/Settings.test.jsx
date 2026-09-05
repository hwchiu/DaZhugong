import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: { id: 'self', name: '自己', active: true },
  groupId: 'main',
  logout: vi.fn(),
}));
const useGroupMock = vi.hoisted(() => vi.fn());
const useTokensMock = vi.hoisted(() => vi.fn());

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

import Settings from './Settings.jsx';

afterEach(cleanup);

beforeEach(() => {
  authState.logout.mockReset();
  authState.currentMember = { id: 'self', name: '自己', active: true };
  useGroupMock.mockReset();
  useGroupMock.mockReturnValue({
    group: { id: 'main', lunchStart: '12:00', lunchEnd: '13:00' },
    members: [
      { id: 'self', name: '自己', active: true, totalTokens: 2 },
      { id: 'friend', name: '阿明', active: true, totalTokens: 5 },
      { id: 'former', name: '小美', active: false, totalTokens: 3 },
    ],
    loading: false,
    error: null,
  });
  useTokensMock.mockReset();
  useTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
});

describe('Settings page', () => {
  it('shows signed-in identity, lunch time, report totals, active ranking, and inactive history without private credentials', () => {
    render(<Settings />);

    expect(screen.getByText('目前登入：自己')).toBeTruthy();
    expect(screen.getByText('12:00–13:00')).toBeTruthy();
    expect(screen.getByText('10 Token')).toBeTruthy();

    const activeRows = within(screen.getByRole('list', { name: '進行中成員排名' })).getAllByRole('listitem');
    expect(activeRows[0].textContent).toContain('阿明');
    expect(activeRows[1].textContent).toContain('自己');

    const inactive = screen.getByRole('list', { name: '歷史成員' });
    expect(within(inactive).getByText('小美')).toBeTruthy();
    expect(screen.queryByText(/通行碼|預設密碼/)).toBe(null);
  });

  it('disables logout while pending and restores the action after a failure', async () => {
    const user = userEvent.setup();
    let rejectLogout;
    authState.logout.mockReturnValue(new Promise((resolve, reject) => {
      rejectLogout = reject;
    }));

    render(<Settings />);

    const button = screen.getByRole('button', { name: '登出' });
    await user.click(button);

    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('登出中…');

    rejectLogout(new Error('private sign-out error'));

    expect((await screen.findByRole('alert')).textContent).toContain('目前無法登出，請稍後再試。');
    expect(screen.queryByText('private sign-out error')).toBe(null);
    expect(screen.getByRole('button', { name: '登出' }).disabled).toBe(false);
  });

  it('shows loading and safe group errors', () => {
    useGroupMock.mockReturnValue({ group: null, members: [], loading: true, error: null });
    const { rerender } = render(<Settings />);
    expect(screen.getByRole('status').textContent).toContain('載入設定');

    useGroupMock.mockReturnValue({ group: null, members: [], loading: false, error: new Error('secret') });
    rerender(<Settings />);
    expect(screen.getByRole('alert').textContent).toContain('目前無法載入設定');
    expect(screen.queryByText('secret')).toBe(null);
  });

  it('opens a popup with the matching member card image when clicking a member with a real avatar, and closes on backdrop click', async () => {
    const user = userEvent.setup();
    useGroupMock.mockReturnValue({
      group: { id: 'main', lunchStart: '12:00', lunchEnd: '13:00' },
      members: [
        { id: 'self', name: '自己', active: true, totalTokens: 2 },
        { id: 'huye', name: '虎爺', active: true, totalTokens: 9 },
      ],
      loading: false,
      error: null,
    });

    render(<Settings />);

    const huyeButton = screen.getByRole('button', { name: '查看虎爺的角色卡' });
    await user.click(huyeButton);

    const dialog = screen.getByRole('dialog', { name: '虎爺 角色卡' });
    expect(dialog.textContent).toContain('虎爺・虎爺');
    expect(dialog.querySelector('img')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '關閉' }));
    expect(screen.queryByRole('dialog')).toBe(null);
  });

  it('does not make a member row clickable when there is no matching real avatar', () => {
    useGroupMock.mockReturnValue({
      group: { id: 'main', lunchStart: '12:00', lunchEnd: '13:00' },
      members: [
        { id: 'self', name: '自己', active: true, totalTokens: 2 },
        { id: 'friend', name: '阿明', active: true, totalTokens: 5 },
      ],
      loading: false,
      error: null,
    });

    render(<Settings />);

    expect(screen.queryByRole('button', { name: '阿明' })).toBe(null);
    expect(screen.getByText('阿明')).toBeTruthy();
  });

  it('shows the account box avatar only for a signed-in identity with a matching real character card', () => {
    useGroupMock.mockReturnValue({
      group: { id: 'main', lunchStart: '12:00', lunchEnd: '13:00' },
      members: [{ id: 'sherry', name: '房產大亨', active: true, totalTokens: 1 }],
      loading: false,
      error: null,
    });
    authState.currentMember = { id: 'sherry', name: '房產大亨', active: true };

    render(<Settings />);

    const accountSection = screen.getByText('目前登入：房產大亨').closest('section');
    expect(within(accountSection).getByRole('img', { name: '房產大亨' })).toBeTruthy();
  });

  it('always shows the exempt members section (豁免成員), independent of Firestore members, with a clickable character card', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    const exemptSection = screen.getByRole('heading', { name: '豁免成員' }).closest('section');
    const list = within(exemptSection).getByRole('list', { name: '豁免成員' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Emily');
    expect(within(exemptSection).getByText('1 人')).toBeTruthy();

    // Emily已經有角色卡照片，點她的列一樣要能看到完整角色卡(跟其他成員一致)。
    const emilyButton = within(exemptSection).getByRole('button', { name: '查看Emily的角色卡' });
    await user.click(emilyButton);

    const dialog = screen.getByRole('dialog', { name: 'Emily 角色卡' });
    expect(dialog.textContent).toContain('Emily・Emily');
    expect(dialog.querySelector('img')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '關閉' }));
    expect(screen.queryByRole('dialog')).toBe(null);
  });

  describe('member cooldown badge', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2024, 4, 22, 12, 30, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows a cooldown badge next to a member reported less than 5 minutes ago', () => {
      useTokensMock.mockReturnValue({
        tokens: [{ id: 't1', targetId: 'friend', timestamp: new Date(2024, 4, 22, 12, 27, 0) }],
        loading: false,
        error: null,
      });

      render(<Settings />);

      const row = screen.getByText('阿明').closest('li');
      expect(within(row).getByText('冷卻中 2:00')).toBeTruthy();
    });

    it('does not show a cooldown badge for a member with no recent report', () => {
      useTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });

      render(<Settings />);

      const row = screen.getByText('阿明').closest('li');
      expect(within(row).queryByRole('timer')).toBe(null);
    });

    it("cooldown badges are independent per member", () => {
      useTokensMock.mockReturnValue({
        tokens: [{ id: 't1', targetId: 'friend', timestamp: new Date(2024, 4, 22, 12, 29, 0) }],
        loading: false,
        error: null,
      });

      render(<Settings />);

      const friendRow = screen.getByText('阿明').closest('li');
      const selfRow = screen.getByText('自己').closest('li');
      expect(within(friendRow).getByRole('timer')).toBeTruthy();
      expect(within(selfRow).queryByRole('timer')).toBe(null);
    });
  });
});
