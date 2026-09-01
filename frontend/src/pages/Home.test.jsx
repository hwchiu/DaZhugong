import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: null,
  groupId: 'main',
}));

const useGroupMock = vi.hoisted(() => vi.fn());

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock,
  default: useGroupMock,
}));

vi.mock('../components/PendingBanner.jsx', () => ({
  default: () => <div>保留中的待確認提醒</div>,
}));

vi.mock('../components/DateWeatherBar.jsx', () => ({
  default: () => <div>日期天氣資訊</div>,
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
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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
  useGroupMock.mockReturnValue({
    members: [],
    loading: false,
    error: null,
  });
  window.localStorage.clear();
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
    expect(screen.getByRole('status').textContent).toContain('同步中');
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

  it('sums confirmed totals across active and inactive historical members, lazy-loads the 3D pig, and keeps currency text out', async () => {
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

    expect(screen.getByText('嗨，自己，午餐禁聊公事罰金箱')).toBeTruthy();
    expect(screen.getByText('本期已確認').parentElement?.textContent).toContain('1102 Token');
    expect((await screen.findByTestId('piggy-bank-3d')).textContent).toContain('1102 Token');
    expect(screen.queryByText('NT$')).toBe(null);
    expect(screen.queryByText('元')).toBe(null);
  });

  it('navigates to the vote page from the primary CTA', async () => {
    const user = userEvent.setup();

    renderHome();

    await user.click(screen.getByRole('link', { name: '投 Token' }));

    expect(screen.getByRole('heading', { name: '投票頁面' })).toBeTruthy();
  });

  it('lets a member set a goal token target and shows remaining progress', async () => {
    const user = userEvent.setup();
    useGroupMock.mockReturnValue({
      members: [{ id: 'self', name: '自己', active: true, color: '#ec4899', totalTokens: 30 }],
      loading: false,
      error: null,
    });

    renderHome();
    await screen.findByTestId('piggy-bank-3d');

    await user.click(screen.getByRole('button', { name: /設定目標/ }));
    await user.type(screen.getByLabelText('目標 Token 數量'), '100');
    await user.click(screen.getByRole('button', { name: '儲存' }));

    expect(screen.getByText('距離 100 還差 70 Token')).toBeTruthy();
  });

  it('navigates to the history page from the header link', async () => {
    const user = userEvent.setup();

    renderHome();

    await user.click(screen.getByRole('link', { name: '歷史紀錄 ›' }));

    expect(screen.getByRole('heading', { name: '歷史紀錄頁面' })).toBeTruthy();
  });
});
