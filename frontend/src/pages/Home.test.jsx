import { cleanup, render, screen, within } from '@testing-library/react';
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

import Home from './Home.jsx';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/vote" element={<h1>投票頁面</h1>} />
        <Route path="/history" element={<h1>歷史紀錄頁面</h1>} />
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
    useTokensMock.mockReturnValue({
      tokens: [],
      loading: true,
      error: null,
    });

    renderHome();

    expect(screen.getByText('保留中的待確認提醒')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '午餐禁聊公事罰金箱' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('同步午餐 Token');
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

  it('derives total and per-member counts solely from reports, keeps currency text out, and greets the current member', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'inactive', name: '小美', active: false, color: '#0ea5e9', totalTokens: 999 },
        { id: 'self', name: '自己', active: true, color: '#ec4899', totalTokens: 888, avatar: 'pig' },
        { id: 'ming', name: '阿明', active: true, color: '#14b8a6', totalTokens: 777, avatar: 'frog' },
      ],
      loading: false,
      error: null,
    });
    useTokensMock.mockReturnValue({
      tokens: [
        ...Array.from({ length: 101 }, (_, index) => ({ id: `report-self-${index + 1}`, targetId: 'self' })),
        { id: 'report-ming-1', targetId: 'ming' },
        { id: 'report-ming-2', targetId: 'ming' },
        { id: 'report-inactive-1', targetId: 'inactive' },
      ],
      loading: false,
      error: null,
    });

    renderHome();

    expect(useTokensMock).toHaveBeenCalledWith('main', null);
    expect(screen.getByText('嗨，自己')).toBeTruthy();
    expect(screen.getByText('104 Token')).toBeTruthy();
    expect(screen.getByText('中午先吃飯，公事晚點再說也可以。')).toBeTruthy();
    expect(screen.getByText('3D 小豬展示區，下一個任務會換成正式模型。')).toBeTruthy();

    const memberSummary = screen.getByRole('list', { name: '成員 Token 總覽' });
    expect(within(memberSummary).getByText('自己')).toBeTruthy();
    expect(within(memberSummary).getByText('101 Token')).toBeTruthy();
    expect(within(memberSummary).getByText('阿明')).toBeTruthy();
    expect(within(memberSummary).getByText('2 Token')).toBeTruthy();
    expect(within(memberSummary).getByText('小美')).toBeTruthy();
    expect(within(memberSummary).getByText('1 Token')).toBeTruthy();
    expect(screen.queryByText('999 Token')).toBe(null);
    expect(screen.queryByText('NT$')).toBe(null);
    expect(screen.queryByText('元')).toBe(null);
  });

  it('orders active members ahead of inactive ones while keeping inactive history in the full summary', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'inactive-z', name: '小美', active: false, avatar: 'cat', color: '#0ea5e9' },
        { id: 'active-b', name: '小華', active: true, avatar: 'dog', color: '#f97316' },
        { id: 'self', name: '自己', active: true, avatar: 'pig', color: '#ec4899' },
      ],
      loading: false,
      error: null,
    });

    renderHome();

    const activeStrip = screen.getByRole('list', { name: '活躍成員 Token 摘要' });
    expect(within(activeStrip).getByText('自己')).toBeTruthy();
    expect(within(activeStrip).getByText('小華')).toBeTruthy();
    expect(within(activeStrip).queryByText('小美')).toBe(null);

    const summaryItems = within(screen.getByRole('list', { name: '成員 Token 總覽' })).getAllByRole('listitem');
    expect(summaryItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining('自己'),
      expect.stringContaining('小華'),
      expect.stringContaining('小美'),
    ]);
  });

  it('navigates to the vote page from the primary CTA', async () => {
    const user = userEvent.setup();

    renderHome();

    await user.click(screen.getByRole('link', { name: '去投一票' }));

    expect(screen.getByRole('heading', { name: '投票頁面' })).toBeTruthy();
  });

  it('shows a cheerful empty state once the dashboard loads with no reports yet', () => {
    useGroupMock.mockReturnValue({
      members: [
        { id: 'self', name: '自己', active: true, avatar: 'pig', color: '#ec4899' },
        { id: 'friend', name: '阿明', active: true, avatar: 'frog', color: '#14b8a6' },
      ],
      loading: false,
      error: null,
    });

    renderHome();

    expect(screen.getByText('今天大家都很克制，還沒有人被記 Token。')).toBeTruthy();
    expect(screen.getByText('第一票還沒出現，先好好吃飯最重要。')).toBeTruthy();
    expect(screen.getAllByText('0 Token').length).toBeGreaterThan(0);
  });
});
