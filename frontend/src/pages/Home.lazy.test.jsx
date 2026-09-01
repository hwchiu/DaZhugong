import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: null,
  groupId: 'main',
}));

const useGroupMock = vi.hoisted(() => vi.fn());
const piggyState = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock,
  default: useGroupMock,
}));

vi.mock('../components/PendingBanner.jsx', () => ({
  default: () => null,
}));

vi.mock('../components/DateWeatherBar.jsx', () => ({
  default: () => <div>日期天氣資訊</div>,
}));

vi.mock('../components/PiggyBank3D.jsx', () => ({
  default: ({ members }) => {
    if (piggyState.shouldThrow) {
      throw new Error('piggy render failed');
    }

    return (
      <div data-testid="piggy-bank-3d">
        3D 小豬：{members.length} 位成員
      </div>
    );
  },
}));

import Home from './Home.jsx';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.currentMember = {
    id: 'self',
    name: '自己',
    active: true,
    color: '#ec4899',
  };
  authState.groupId = 'main';
  piggyState.shouldThrow = false;
  useGroupMock.mockReset();
  useGroupMock.mockReturnValue({
    members: [
      { id: 'self', name: '自己', active: true, color: '#ec4899', totalTokens: 1 },
    ],
    loading: false,
    error: null,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Home page lazy fallback', () => {
  it('shows an accessible static pig fallback and retries after a lazy component render error', async () => {
    const user = userEvent.setup();
    piggyState.shouldThrow = true;

    renderHome();

    expect(await screen.findByRole('img', { name: '3D 小豬暫時無法顯示' })).toBeTruthy();

    piggyState.shouldThrow = false;
    await user.click(screen.getByRole('button', { name: '重試 3D 小豬' }));

    expect(await screen.findByTestId('piggy-bank-3d')).toBeTruthy();
  });
});
