import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ groupId: 'main' }));
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

import History from './History.jsx';

afterEach(cleanup);

beforeEach(() => {
  useGroupMock.mockReset();
  useTokensMock.mockReset();
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
});
