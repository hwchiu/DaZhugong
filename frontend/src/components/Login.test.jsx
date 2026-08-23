import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useGroupMock = vi.hoisted(() => ({
  useGroup: vi.fn(),
}));

const firebaseState = vi.hoisted(() => ({
  auth: { service: 'auth' },
  functions: { service: 'functions' },
  loginCallable: vi.fn(),
  signInWithCustomToken: vi.fn(),
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock.useGroup,
}));

vi.mock('../firebase.js', () => ({
  auth: firebaseState.auth,
  functions: firebaseState.functions,
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: firebaseState.signInWithCustomToken,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => firebaseState.loginCallable),
}));

import Login from './Login.jsx';

function renderLogin({
  members = [
    { id: 'member-1', name: '你', avatar: 'pig', color: '#FF6B8A', totalTokens: 3 },
    { id: 'member-2', name: 'Kevin', avatar: 'cat', color: '#4A90E2', totalTokens: 8 },
  ],
  loading = false,
  error = null,
} = {}) {
  useGroupMock.useGroup.mockReturnValue({
    group: { id: 'main', name: '大豬公' },
    members,
    loading,
    error,
  });

  return render(<Login />);
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  useGroupMock.useGroup.mockReset();
  firebaseState.loginCallable = vi.fn();
  firebaseState.signInWithCustomToken.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Login', () => {
  it('renders the loading and listener error states safely', () => {
    const { rerender } = renderLogin({ members: [], loading: true });

    expect(screen.getByRole('status').textContent).toContain('載入成員資料中');
    expect(screen.getByText('大豬公')).toBeTruthy();

    useGroupMock.useGroup.mockReturnValue({
      group: { id: 'main', name: '大豬公' },
      members: [],
      loading: false,
      error: new Error('internal secret'),
    });

    rerender(<Login />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('成員資料暫時載入失敗');
    expect(alert.textContent).toContain('重新整理');
    expect(alert.textContent).not.toContain('internal secret');
  });

  it('renders member cards with token counts and filters PIN input to four digits', async () => {
    const user = userEvent.setup();
    renderLogin();

    expect(screen.getByRole('button', { name: '選擇成員 你' }).textContent).toContain('3 枚代幣');
    expect(screen.getByRole('button', { name: '選擇成員 Kevin' }).textContent).toContain('8 枚代幣');

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));

    const pinInput = screen.getByLabelText('PIN 碼');
    const submitButton = screen.getByRole('button', { name: '登入' });

    expect(submitButton.disabled).toBe(true);

    await user.type(pinInput, '12ab345');

    expect(pinInput.value).toBe('1234');
    expect(submitButton.disabled).toBe(false);
  });

  it('clears the PIN and any visible error when the selected member changes', async () => {
    const user = userEvent.setup();
    firebaseState.loginCallable.mockRejectedValue({
      code: 'functions/invalid-argument',
      message: 'backend should stay hidden',
    });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));
    const pinInput = screen.getByLabelText('PIN 碼');

    await user.type(pinInput, '1234');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(screen.getByRole('alert').textContent).toContain('登入失敗');

    await user.type(pinInput, '5678');
    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));

    expect(screen.getByLabelText('PIN 碼').value).toBe('');
    expect(screen.queryByRole('alert')).toBe(null);
  });

  it('submits the selected member PIN and signs in with the custom token on enter', async () => {
    const user = userEvent.setup();
    firebaseState.loginCallable.mockResolvedValue({
      data: { customToken: 'custom-token-123' },
    });
    firebaseState.signInWithCustomToken.mockResolvedValue({ uid: 'auth-1' });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));
    await user.type(screen.getByLabelText('PIN 碼'), '2468{Enter}');

    await waitFor(() => expect(firebaseState.loginCallable).toHaveBeenCalledTimes(1));
    expect(firebaseState.loginCallable).toHaveBeenCalledWith({
      groupId: 'main',
      memberId: 'member-2',
      pin: '2468',
    });
    expect(firebaseState.signInWithCustomToken).toHaveBeenCalledWith(firebaseState.auth, 'custom-token-123');
    expect(screen.queryByRole('alert')).toBe(null);
  });

  it('shows a safe generic error for a wrong PIN without leaking backend details', async () => {
    const user = userEvent.setup();
    firebaseState.loginCallable.mockRejectedValue({
      code: 'functions/permission-denied',
      message: 'pinHash comparison failed for member-1',
    });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));
    await user.type(screen.getByLabelText('PIN 碼'), '9999');
    await user.click(screen.getByRole('button', { name: '登入' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('登入失敗');
    expect(alert.textContent).not.toContain('pinHash');
    expect(firebaseState.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('shows the throttled message when the backend locks out repeated attempts', async () => {
    const user = userEvent.setup();
    firebaseState.loginCallable.mockRejectedValue({
      code: 'functions/resource-exhausted',
      message: 'too many attempts',
    });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));
    await user.type(screen.getByLabelText('PIN 碼'), '9999');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect((await screen.findByRole('alert')).textContent).toContain('嘗試次數過多');
  });

  it('rejects malformed callable responses with a safe generic error', async () => {
    const user = userEvent.setup();
    firebaseState.loginCallable.mockResolvedValue({
      data: { customToken: '' },
    });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));
    await user.type(screen.getByLabelText('PIN 碼'), '2468');
    await user.click(screen.getByRole('button', { name: '登入' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('登入失敗');
    expect(firebaseState.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('prevents duplicate submit attempts while the login request is still pending', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    firebaseState.loginCallable.mockReturnValue(deferred.promise);
    firebaseState.signInWithCustomToken.mockResolvedValue({ uid: 'auth-1' });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));
    await user.type(screen.getByLabelText('PIN 碼'), '2468');

    const submitButton = screen.getByRole('button', { name: '登入' });
    await user.click(submitButton);
    await user.click(submitButton);

    expect(firebaseState.loginCallable).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('登入中');
    expect(screen.getByRole('button', { name: '登入中' }).disabled).toBe(true);

    deferred.resolve({ data: { customToken: 'custom-token-123' } });

    await waitFor(() => expect(firebaseState.signInWithCustomToken).toHaveBeenCalledWith(firebaseState.auth, 'custom-token-123'));
  });
});
