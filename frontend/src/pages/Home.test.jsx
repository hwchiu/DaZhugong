import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: null,
  groupId: 'main',
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

vi.mock('../components/PendingBanner.jsx', () => ({
  default: () => <div>保留中的待確認提醒</div>,
}));

vi.mock('../components/DateWeatherBar.jsx', () => ({
  default: () => <div>天氣資訊</div>,
}));

vi.mock('../components/LiveClock.jsx', () => ({
  default: () => <div>時間資訊</div>,
}));

vi.mock('../data/greetings.js', () => ({
  pickRandomGreeting: () => '測試用招呼語',
  LUNCH_GREETINGS: ['測試用招呼語'],
}));

vi.mock('../components/PiggyBank3D.jsx', () => ({
  default: ({ members }) => (
    <div data-testid="piggy-bank-3d">
      3D 小豬：{members.length} 位成員，共{' '}
      {members.reduce((sum, member) => sum + (member.totalTokens ?? 0), 0)} Token
    </div>
  ),
}));

import Home from './Home.jsx';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/vote" element={<h1>投票頁面</h1>} />
        <Route path="/history" element={<h1>歷史紀錄頁面</h1>} />
        <Route path="/settings" element={<h1>設定頁面</h1>} />
        <Route path="/stats" element={<h1>統計頁面</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  authState.currentMember = {
    id: 'self',
    name: '自己',
    active: true,
    color: '#ec4899',
  };
  authState.groupId = 'main';
  useGroupMock.mockReset();
  useTokensMock.mockReset();
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

describe('Home page', () => {
  it('keeps the pending banner and shows loading feedback without misleading zero totals', () => {
    useGroupMock.mockReturnValue({
      members: [],
      loading: true,
      error: null,
    });

    renderHome();

    expect(screen.getByText('保留中的待確認提醒')).toBeTruthy();
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('同步中');
    expect(screen.queryByText('0 Token')).toBe(null);
  });

  it('shows a safe error state without rendering fake zero totals', () => {
    useGroupMock.mockReturnValue({
      members: [],
      loading: false,
      error: new Error('hidden group failure'),
    });

    renderHome();

    expect(screen.getByRole('alert').textContent).toContain('目前無法同步首頁資料');
    expect(screen.queryByText('hidden group failure')).toBe(null);
    expect(screen.queryByText('0 Token')).toBe(null);
  });

  it('also treats a report-subscription failure as a load error', () => {
    useTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: new Error('hidden report failure'),
    });

    renderHome();

    expect(screen.getByRole('alert').textContent).toContain('目前無法同步首頁資料');
    expect(screen.queryByText('hidden report failure')).toBe(null);
  });

  it('shows the header, a random greeting bubble, and sums confirmed totals across active and inactive historical members', async () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'inactive', name: '小美', active: false, color: '#0ea5e9', totalTokens: 999 },
        { id: 'self', name: '自己', active: true, color: '#ec4899', totalTokens: 101, avatar: 'pig' },
        { id: 'ming', name: '阿明', active: true, color: '#14b8a6', totalTokens: 2, avatar: 'frog' },
      ],
      loading: false,
      error: null,
    });

    renderHome();

    expect(screen.getByRole('heading', { name: '午餐禁聊公事罰金箱' })).toBeTruthy();
    expect(screen.getByText('測試用招呼語')).toBeTruthy();
    expect(screen.getByText('總罰金 Token 數').parentElement?.textContent).toContain('1102');
    expect((await screen.findByTestId('piggy-bank-3d')).textContent).toContain('1102 Token');
    expect(screen.queryByText('NT$')).toBe(null);
    expect(screen.queryByText('元')).toBe(null);
  });

  it("counts only today's confirmed reports for the mood chip and per-member stats", () => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMillis = startOfToday.getTime() + 60_000;
    const yesterdayMillis = startOfToday.getTime() - 60_000;

    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true, color: '#ec4899', totalTokens: 5, avatar: 'pig' },
        { id: 'ming', name: '阿明', active: true, color: '#14b8a6', totalTokens: 3, avatar: 'frog' },
      ],
      loading: false,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [
        { id: 'r1', targetId: 'self', timestamp: { toMillis: () => todayMillis } },
        { id: 'r2', targetId: 'self', timestamp: { toMillis: () => todayMillis } },
        { id: 'r3', targetId: 'ming', timestamp: { toMillis: () => todayMillis } },
        { id: 'r4', targetId: 'ming', timestamp: { toMillis: () => yesterdayMillis } },
      ],
      loading: false,
      error: null,
    });

    renderHome();

    expect(screen.getByText('今日已投入 3 枚', { exact: false })).toBeTruthy();
    expect(screen.getByText('你')).toBeTruthy();
    expect(screen.getByText('阿明')).toBeTruthy();
    void now;
  });

  it('shows the calmest mood copy when nobody has been reported today', () => {
    useGroupMock.mockReturnValue({
      members: [{ id: 'self', name: '自己', active: true, color: '#ec4899', totalTokens: 0 }],
      loading: false,
      error: null,
    });

    renderHome();

    expect(screen.getByText('心情很好，繼續保持！')).toBeTruthy();
  });

  it('navigates to the vote page from the primary CTA', async () => {
    const user = userEvent.setup();

    renderHome();

    await user.click(screen.getByRole('link', { name: /投入一枚 Token/ }));

    expect(screen.getByRole('heading', { name: '投票頁面' })).toBeTruthy();
  });

  it('navigates to the history page from the header icon button', async () => {
    const user = userEvent.setup();

    renderHome();

    await user.click(screen.getByRole('link', { name: '歷史紀錄' }));

    expect(screen.getByRole('heading', { name: '歷史紀錄頁面' })).toBeTruthy();
  });

  it('navigates to settings from the header gear icon', async () => {
    const user = userEvent.setup();

    renderHome();

    await user.click(screen.getByRole('link', { name: '設定' }));

    expect(screen.getByRole('heading', { name: '設定頁面' })).toBeTruthy();
  });

  it('opens and closes the rules info modal', async () => {
    const user = userEvent.setup();

    renderHome();

    expect(screen.queryByRole('dialog')).toBe(null);

    await user.click(screen.getByRole('button', { name: '規則說明' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/午餐時間（12:00–13:00）/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '知道了' }));

    expect(screen.queryByRole('dialog')).toBe(null);
  });

  it('opens the nav drawer with links to every bottom-nav destination and closes it', async () => {
    const user = userEvent.setup();

    renderHome();

    await user.click(screen.getByRole('button', { name: '開啟選單' }));

    const drawer = screen.getByRole('navigation', { name: '主選單' });
    expect(drawer).toBeTruthy();
    expect(screen.getByRole('link', { name: /投票/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /統計/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '關閉選單' }));

    expect(screen.queryByRole('navigation', { name: '主選單' })).toBe(null);
  });

  it('only lists active members in the today stats row, labelling the current member as 你', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true, color: '#ec4899', totalTokens: 1 },
        { id: 'inactive', name: '小美', active: false, color: '#0ea5e9', totalTokens: 1 },
        { id: 'ming', name: '阿明', active: true, color: '#14b8a6', totalTokens: 1 },
      ],
      loading: false,
      error: null,
    });

    renderHome();

    expect(screen.getByText('你')).toBeTruthy();
    expect(screen.queryByText('自己')).toBe(null);
    expect(screen.getByText('阿明')).toBeTruthy();
    expect(screen.queryByText('小美')).toBe(null);
  });
});
