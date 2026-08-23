import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  authReady: false,
  currentMember: null,
}));

vi.mock('./store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('./components/Login.jsx', () => ({
  default: () => (
    <main>
      <h1>登入頁面</h1>
      <p>請先登入</p>
    </main>
  ),
}));

import App from './App.jsx';

function renderAppAt(pathname, nextAuthState) {
  Object.assign(authState, nextAuthState);
  window.history.pushState({}, '', pathname);
  return render(<App />);
}

afterEach(() => {
  cleanup();
  document.title = '';
  window.history.pushState({}, '', '/');
});

beforeEach(() => {
  authState.authReady = false;
  authState.currentMember = null;
});

describe('App', () => {
  it('shows an accessible loading screen while auth is still resolving', () => {
    renderAppAt('/', { authReady: false, currentMember: null });

    expect(screen.getByRole('status').textContent).toContain('登入狀態載入中');
  });

  it('renders the login page after auth is ready without a member', () => {
    renderAppAt('/vote', { authReady: true, currentMember: null });

    expect(screen.getByRole('heading', { name: '登入頁面' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '主要功能導覽' })).toBe(null);
  });

  it('renders the authenticated home shell and falls back unknown routes to home', () => {
    renderAppAt('/unknown', {
      authReady: true,
      currentMember: { id: 'member-1', name: '你' },
    });

    expect(screen.getByRole('heading', { name: '午餐禁聊公事罰金箱' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '首頁' }).getAttribute('aria-current')).toBe('page');
  });

  it('uses accessible inactive and active bottom-nav states', () => {
    renderAppAt('/history', {
      authReady: true,
      currentMember: { id: 'member-1', name: '你' },
    });

    const historyLink = screen.getByRole('link', { name: '歷史紀錄' });
    const homeLink = screen.getByRole('link', { name: '首頁' });

    expect(historyLink.getAttribute('aria-current')).toBe('page');
    expect(historyLink.className).toContain('text-pink-700');
    expect(homeLink.getAttribute('aria-current')).toBe(null);
    expect(homeLink.className).toContain('text-slate-600');
  });

  it('renders the pending route without forcing a bottom-nav tab active', () => {
    renderAppAt('/pending', {
      authReady: true,
      currentMember: { id: 'member-1', name: '你' },
    });

    expect(screen.getByRole('heading', { name: '待確認' })).toBeTruthy();
    expect(screen.queryByRole('link', { current: 'page' })).toBe(null);
  });

  it('updates the active bottom-nav tab when navigating between authenticated routes', async () => {
    const user = userEvent.setup();
    renderAppAt('/history', {
      authReady: true,
      currentMember: { id: 'member-1', name: '你' },
    });

    expect(screen.getByRole('heading', { name: '歷史紀錄' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '歷史紀錄' }).getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('link', { name: '設定' }));

    expect(screen.getByRole('heading', { name: '設定' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '設定' }).getAttribute('aria-current')).toBe('page');
  });

  it('updates the route title, focuses the shell main region, and announces authenticated route changes', async () => {
    const user = userEvent.setup();
    renderAppAt('/history', {
      authReady: true,
      currentMember: { id: 'member-1', name: '你' },
    });

    const mainRegion = screen.getByRole('main', { name: '主要內容' });

    await waitFor(() => expect(document.title).toBe('歷史紀錄 · 大豬公'));
    expect(document.activeElement).not.toBe(mainRegion);
    expect(screen.getByRole('status').textContent).toBe('');

    await user.click(screen.getByRole('link', { name: '設定' }));

    await waitFor(() => expect(document.title).toBe('設定 · 大豬公'));
    await waitFor(() => expect(document.activeElement).toBe(mainRegion));
    expect(screen.getByRole('status').textContent).toContain('已切換至設定');
    expect(screen.getByRole('status').className).toContain('sr-only');
  });
});
