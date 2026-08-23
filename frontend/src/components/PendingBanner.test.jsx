import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: null,
  groupId: 'main',
}));

const usePendingMock = vi.hoisted(() => vi.fn());

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/usePending.js', () => ({
  usePending: usePendingMock,
  default: usePendingMock,
}));

import PendingBanner from './PendingBanner.jsx';

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<PendingBanner />} />
        <Route path="/pending" element={<h1>待確認頁面</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  authState.currentMember = {
    id: 'member-1',
    name: '自己',
    active: true,
    authUid: 'uid-1',
  };
  authState.groupId = 'main';
  usePendingMock.mockReset();
  usePendingMock.mockReturnValue({
    pending: [],
    loading: false,
    error: null,
  });
});

describe('PendingBanner', () => {
  it('returns nothing while loading or when there is no current member or pending items', () => {
    const { rerender } = render(
      <MemoryRouter>
        <PendingBanner />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('alert')).toBe(null);

    usePendingMock.mockReturnValueOnce({
      pending: [{ id: 'token-1' }],
      loading: true,
      error: null,
    });

    rerender(
      <MemoryRouter>
        <PendingBanner />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('alert')).toBe(null);

    authState.currentMember = null;
    rerender(
      <MemoryRouter>
        <PendingBanner />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('alert')).toBe(null);
  });

  it('shows the pending count and navigates to /pending', async () => {
    const user = userEvent.setup();

    usePendingMock.mockReturnValue({
      pending: [{ id: 'token-1' }, { id: 'token-2' }],
      loading: false,
      error: null,
    });

    renderBanner();

    expect(screen.getByRole('alert').textContent).toContain('2 筆待確認');

    await user.click(screen.getByRole('link', { name: '查看待確認清單' }));

    expect(screen.getByRole('heading', { name: '待確認頁面' })).toBeTruthy();
  });

  it('shows only a safe listener error message', () => {
    usePendingMock.mockReturnValue({
      pending: [],
      loading: false,
      error: new Error('do not leak listener failure'),
    });

    render(
      <MemoryRouter>
        <PendingBanner />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert').textContent).toContain('待確認提醒暫時無法同步');
    expect(screen.queryByText('do not leak listener failure')).toBe(null);
  });
});
