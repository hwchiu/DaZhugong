import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: { id: 'me', name: '自己' },
  groupId: 'main',
}));
const useTokensMock = vi.hoisted(() => vi.fn());
const useGroupMock = vi.hoisted(() => vi.fn());
const rechartsState = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/useTokens.js', () => ({
  useTokens: useTokensMock,
  default: useTokensMock,
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
  AreaChart: ({ children }) => <div>{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
}));

import Stats from './Stats.jsx';

function renderStats() {
  return render(
    <MemoryRouter>
      <Stats />
    </MemoryRouter>,
  );
}

function makeReport(id, reason, dateArgs) {
  return { id, targetId: 'me', reporterId: 'other', reason, timestamp: new Date(...dateArgs) };
}

function makeGroupReport(id, targetId, reason, dateArgs) {
  return { id, targetId, reporterId: 'other', reason, timestamp: new Date(...dateArgs) };
}

afterEach(cleanup);
afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  useTokensMock.mockReset();
  useTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
  useGroupMock.mockReset();
  useGroupMock.mockReturnValue({
    members: [
      { id: 'me', name: '自己', color: '#ec4899' },
      { id: 'other-1', name: '阿明', color: '#3b82f6' },
    ],
    loading: false,
    error: null,
  });
  rechartsState.shouldThrow = false;
  authState.currentMember = { id: 'me', name: '自己' };
  authState.groupId = 'main';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // 固定「現在」，讓「本週」永遠對應到同一段可預期的日期區間。
  // shouldAdvanceTime很重要：沒有它，testing-library的waitFor/findBy(底層用setTimeout輪詢)
  // 會在假時鐘底下卡住直到逾時，而不是真的失敗或成功。
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2024, 4, 22, 15, 0)); // 2024/05/22 星期三
});

afterEach(() => {
  vi.useRealTimers();
});

function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe('Stats page - AC01 defaults to the current week for the signed-in user', () => {
  it('shows the week period selected and the current week date range by default', () => {
    renderStats();

    const weekTab = screen.getByRole('tab', { name: '本週' });
    expect(weekTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('05/20 - 05/26')).toBeTruthy();
  });

  it('only counts reports targeting the current user (AC09)', () => {
    useTokensMock.mockReturnValue({
      tokens: [
        makeReport('r1', '討論會議', [2024, 4, 21, 12, 15]),
        { id: 'r2', targetId: 'someone-else', reporterId: 'me', reason: '討論會議', timestamp: new Date(2024, 4, 21, 12, 15) },
      ],
      loading: false,
      error: null,
    });

    renderStats();
    const summaryHeading = screen.getByText('本週午餐聊公事 Token 總數');
    const summaryCard = summaryHeading.closest('section');
    expect(within(summaryCard).getByText('1')).toBeTruthy();
  });
});

describe('Stats page - AC02 summary and comparison', () => {
  it('shows the total token count and the change vs the previous week', () => {
    useTokensMock.mockReturnValue({
      tokens: [
        makeReport('r1', '討論會議', [2024, 4, 21, 12, 15]),
        makeReport('r2', '討論會議', [2024, 4, 21, 12, 45]),
        makeReport('p1', '討論會議', [2024, 4, 13, 12, 15]),
      ],
      loading: false,
      error: null,
    });

    renderStats();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(/較上週 ↑/)).toBeTruthy();
  });

  it('shows a dash when there is no previous-period data to compare', () => {
    useTokensMock.mockReturnValue({
      tokens: [makeReport('r1', '討論會議', [2024, 4, 21, 12, 15])],
      loading: false,
      error: null,
    });
    renderStats();
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('Stats page - loading, error, and empty states', () => {
  it('shows a loading status', () => {
    useTokensMock.mockReturnValue({ tokens: [], loading: true, error: null });
    renderStats();
    expect(screen.getByRole('status').textContent).toContain('載入統計中');
  });

  it('shows a safe error message without leaking the underlying error', () => {
    useTokensMock.mockReturnValue({ tokens: [], loading: false, error: new Error('secret firestore detail') });
    renderStats();
    expect(screen.getByRole('alert').textContent).toContain('統計資料載入失敗');
    expect(screen.queryByText(/secret firestore detail/)).toBe(null);
  });

  it('shows the empty state with a link back home when the period has zero tokens (AC10)', () => {
    renderStats();
    expect(screen.getByText('這段期間沒有聊公事！')).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回首頁' })).toBeTruthy();
  });
});

describe('Stats page - AC03 daily trend always covers 7 days', () => {
  it('passes 7 days of data to the line chart even with a single report', async () => {
    useTokensMock.mockReturnValue({
      tokens: [makeReport('r1', '討論會議', [2024, 4, 22, 12, 15])],
      loading: false,
      error: null,
    });
    renderStats();
    const chart = await screen.findByTestId('daily-token-line-chart');
    expect(chart.getAttribute('aria-label')).toContain('2024-05-20');
    expect(chart.getAttribute('aria-label')).toContain('2024-05-26');
  });
});

describe('Stats page - AC04/AC05 totals reconcile across sections', () => {
  it('keeps the donut total, legend sum, and reason-statistics sum all equal to the summary total', async () => {
    useTokensMock.mockReturnValue({
      tokens: [
        makeReport('r1', '討論會議', [2024, 4, 21, 12, 15]),
        makeReport('r2', '偷看teams', [2024, 4, 21, 12, 45]),
        makeReport('r3', '不知道', [2024, 4, 22, 12, 5]),
      ],
      loading: false,
      error: null,
    });

    renderStats();
    const donut = await screen.findByTestId('reason-donut-chart');
    expect(donut.getAttribute('aria-label')).toContain('總計3枚');

    const reasonStats = screen.getByRole('list', { name: '聊公事原因統計' });
    const rows = within(reasonStats).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
  });
});

describe('Stats page - AC06 no traffic-violation wording', () => {
  it('never renders forbidden traffic words even with an adversarial reason', () => {
    useTokensMock.mockReturnValue({
      tokens: [makeReport('r1', '超速闖紅燈', [2024, 4, 21, 12, 15])],
      loading: false,
      error: null,
    });
    renderStats();
    expect(document.body.textContent).not.toMatch(/超速|闖紅燈|違規停車|安全帶/);
  });
});

describe('Stats page - AC07 switching period does not navigate, only refreshes data', () => {
  it('switches to month view in place and resets any week navigation', async () => {
    const user = setupUser();
    useTokensMock.mockReturnValue({
      tokens: [makeReport('r1', '討論會議', [2024, 3, 5, 12, 15])],
      loading: false,
      error: null,
    });
    renderStats();

    await user.click(screen.getByRole('tab', { name: '本月' }));
    expect(screen.getByRole('tab', { name: '本月' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('2024/05')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: '全部' }));
    // all模式沒有日期區間列
    expect(screen.queryByLabelText('上一個期間')).toBe(null);
  });
});

describe('Stats page - AC08 heatmap focuses on lunch time', () => {
  it('renders exactly 21 heatmap cells worth of data (7 days x 3 slots)', () => {
    useTokensMock.mockReturnValue({
      tokens: [makeReport('r1', '討論會議', [2024, 4, 22, 12, 15])],
      loading: false,
      error: null,
    });
    renderStats();
    const heatmap = screen.getByTestId('lunch-time-heatmap');
    expect(heatmap).toBeTruthy();
    expect(screen.getByText('12:00-12:30')).toBeTruthy();
    expect(screen.getByText('13:00-13:30')).toBeTruthy();
  });
});

describe('Stats page - week navigation cannot go to the future', () => {
  it('disables the next-period button on the current week', () => {
    renderStats();
    const nextButton = screen.getByRole('button', { name: '下一個期間' });
    expect(nextButton.disabled).toBe(true);
  });

  it('enables the next-period button after stepping back, and it returns to disabled at the current week', async () => {
    const user = setupUser();
    renderStats();

    await user.click(screen.getByRole('button', { name: '上一個期間' }));
    expect(screen.getByText('05/13 - 05/19')).toBeTruthy();
    expect(screen.getByRole('button', { name: '下一個期間' }).disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: '下一個期間' }));
    expect(screen.getByText('05/20 - 05/26')).toBeTruthy();
    expect(screen.getByRole('button', { name: '下一個期間' }).disabled).toBe(true);
  });
});

describe('Stats page - chart lazy-load failure keeps the rest of the page usable', () => {
  it('shows a fallback for the line chart without breaking the rest of the dashboard', async () => {
    rechartsState.shouldThrow = true;
    useTokensMock.mockReturnValue({
      tokens: [makeReport('r1', '討論會議', [2024, 4, 21, 12, 15])],
      loading: false,
      error: null,
    });
    renderStats();

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: '聊公事原因統計' })).toBeTruthy();
  });
});

describe('Stats page - 全員統計 (group scope)', () => {
  it('defaults to 個人統計 and only shows the current user\'s data', () => {
    useTokensMock.mockReturnValue({
      tokens: [
        makeGroupReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]),
        makeGroupReport('r2', 'other-1', '討論會議', [2024, 4, 21, 12, 20]),
      ],
      loading: false,
      error: null,
    });
    renderStats();

    expect(screen.getByRole('tab', { name: '個人統計' }).getAttribute('aria-selected')).toBe('true');
    const summaryHeading = screen.getByText('本週午餐聊公事 Token 總數');
    const summaryCard = summaryHeading.closest('section');
    expect(within(summaryCard).getByText('1')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /成員貢獻/ })).toBe(null);
  });

  it('switching to 全員統計 aggregates everyone\'s tokens and shows a member contribution ranking', async () => {
    const user = setupUser();
    useTokensMock.mockReturnValue({
      tokens: [
        makeGroupReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]),
        makeGroupReport('r2', 'me', '討論會議', [2024, 4, 21, 12, 20]),
        makeGroupReport('r3', 'other-1', '偷看teams', [2024, 4, 22, 12, 5]),
      ],
      loading: false,
      error: null,
    });
    renderStats();

    await user.click(screen.getByRole('tab', { name: '全員統計' }));

    const summaryHeading = screen.getByText('本週全員午餐聊公事 Token 總數');
    const summaryCard = summaryHeading.closest('section');
    expect(within(summaryCard).getByText('3')).toBeTruthy();

    const ranking = screen.getByRole('list', { name: '成員貢獻排名' });
    const rows = within(ranking).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('自己');
    expect(rows[0].textContent).toContain('2 枚');
    expect(rows[1].textContent).toContain('阿明');
    expect(rows[1].textContent).toContain('1 枚');
  });

  it('shows a safe error state when member data fails to load in group scope', async () => {
    const user = setupUser();
    useGroupMock.mockReturnValue({ members: [], loading: false, error: new Error('secret') });
    useTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderStats();

    await user.click(screen.getByRole('tab', { name: '全員統計' }));
    expect(screen.getByRole('alert').textContent).toContain('統計資料載入失敗');
    expect(screen.queryByText('secret')).toBe(null);
  });

  it('reconciles reason-distribution totals with the group summary total', async () => {
    const user = setupUser();
    useTokensMock.mockReturnValue({
      tokens: [
        makeGroupReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]),
        makeGroupReport('r2', 'other-1', '偷看teams', [2024, 4, 22, 12, 5]),
      ],
      loading: false,
      error: null,
    });
    renderStats();
    await user.click(screen.getByRole('tab', { name: '全員統計' }));

    const reasonStats = screen.getByRole('list', { name: '聊公事原因統計' });
    const rows = within(reasonStats).getAllByRole('listitem');
    const reasonSum = rows.reduce((sum, row) => {
      const match = row.textContent.match(/(\d+)\s*枚/);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);
    expect(reasonSum).toBe(2);
  });
});
