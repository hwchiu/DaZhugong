import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ groupId: 'main' }));
const useGroupMock = vi.hoisted(() => vi.fn());
const rechartsState = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock,
  default: useGroupMock,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => {
    if (rechartsState.shouldThrow) {
      throw new Error('chart render failed');
    }

    return <div>{children}</div>;
  },
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
}));

import Stats from './Stats.jsx';

afterEach(cleanup);

beforeEach(() => {
  useGroupMock.mockReset();
  useGroupMock.mockReturnValue({ members: [], loading: false, error: null });
  rechartsState.shouldThrow = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Stats page', () => {
  it('shows report-derived totals and ranks active plus inactive historical members', async () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'active', name: '阿明', active: true, color: '#0ea5e9', totalTokens: 2 },
        { id: 'inactive', name: '小美', active: false, color: '#ec4899', totalTokens: 7 },
      ],
      loading: false,
      error: null,
    });

    render(<Stats />);

    expect(screen.getByText('9 Token')).toBeTruthy();
    const ranking = screen.getByRole('list', { name: '成員 Token 排名' });
    const rows = within(ranking).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('小美');
    expect(rows[0].textContent).toContain('歷史成員');
    expect(rows[0].textContent).toContain('7 Token');
    expect(rows[1].textContent).toContain('阿明');
    expect(await screen.findByTestId('stats-pie-chart')).toBeTruthy();
    expect(screen.queryByText(/NT\\$|元/)).toBe(null);
  });

  it('shows loading, safe errors, and a no-data state', () => {
    useGroupMock.mockReturnValue({ members: [], loading: true, error: null });
    const { rerender } = render(<Stats />);
    expect(screen.getByRole('status').textContent).toContain('載入統計');

    useGroupMock.mockReturnValue({ members: [], loading: false, error: new Error('secret') });
    rerender(<Stats />);
    expect(screen.getByRole('alert').textContent).toContain('目前無法載入統計');
    expect(screen.queryByText('secret')).toBe(null);

    useGroupMock.mockReturnValue({ members: [], loading: false, error: null });
    rerender(<Stats />);
    expect(screen.getByText('目前還沒有可統計的 Token 資料。')).toBeTruthy();
  });

  it('shows a non-chart fallback when the lazy chart render fails and keeps ranking usable', async () => {
    rechartsState.shouldThrow = true;
    useGroupMock.mockReturnValue({
      members: [
        { id: 'active', name: '阿明', active: true, color: '#0ea5e9', totalTokens: 2 },
        { id: 'inactive', name: '小美', active: false, color: '#ec4899', totalTokens: 7 },
      ],
      loading: false,
      error: null,
    });

    render(<Stats />);

    expect((await screen.findByRole('alert')).textContent).toContain('統計圖表暫時無法顯示');
    expect(screen.getByText('請先參考下方排名與總 Token。')).toBeTruthy();
    expect(screen.queryByTestId('stats-pie-chart')).toBe(null);

    const ranking = screen.getByRole('list', { name: '成員 Token 排名' });
    expect(within(ranking).getByText('小美')).toBeTruthy();
    expect(within(ranking).getByText('阿明')).toBeTruthy();
  });
});
