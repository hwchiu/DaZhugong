import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useGroupMock = vi.hoisted(() => ({
  useGroup: vi.fn(),
}));

const firebaseState = vi.hoisted(() => ({
  auth: { service: 'auth' },
  signInWithEmailAndPassword: vi.fn(),
}));

const authStoreState = vi.hoisted(() => ({
  authError: null,
  clearAuthError: vi.fn(),
  useAuthStore: vi.fn(),
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock.useGroup,
}));

vi.mock('../firebase.js', () => ({
  auth: firebaseState.auth,
}));

vi.mock('../store/authStore.js', () => ({
  useAuthStore: authStoreState.useAuthStore,
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: firebaseState.signInWithEmailAndPassword,
}));

import Login from './Login.jsx';

function renderLogin({
  members = [
    {
      id: 'member-1',
      authUid: 'dazhugong_main_member1',
      loginEmail: 'dazhugong_main_member1@dazhugong.invalid',
      name: '你',
      avatar: 'pig',
      color: '#FF6B8A',
      totalTokens: 3,
      active: true,
    },
    {
      id: 'member-2',
      authUid: 'dazhugong_main_member2',
      loginEmail: 'dazhugong_main_member2@dazhugong.invalid',
      name: 'Kevin',
      avatar: 'cat',
      color: '#4A90E2',
      totalTokens: 8,
      active: true,
    },
  ],
  loading = false,
  error = null,
  authError = null,
} = {}) {
  useGroupMock.useGroup.mockReturnValue({
    group: { id: 'main', name: '大豬公' },
    members,
    loading,
    error,
  });
  authStoreState.authError = authError;

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
  firebaseState.signInWithEmailAndPassword.mockReset();
  authStoreState.authError = null;
  authStoreState.clearAuthError = vi.fn();
  authStoreState.useAuthStore.mockImplementation((selector) =>
    selector({
      authError: authStoreState.authError,
      clearAuthError: authStoreState.clearAuthError,
    }),
  );
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

  it('hides inactive members from login selection', () => {
    renderLogin({
      members: [
        {
          id: 'active-member',
          authUid: 'active-uid',
          loginEmail: 'active-uid@dazhugong.invalid',
          name: 'Active Member',
          active: true,
        },
        {
          id: 'inactive-member',
          authUid: 'inactive-uid',
          loginEmail: 'inactive-uid@dazhugong.invalid',
          name: 'Inactive Member',
          active: false,
        },
      ],
    });

    expect(screen.getByRole('button', { name: '選擇成員 Active Member' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '選擇成員 Inactive Member' })).toBe(null);
  });

  it('locks member selection and PIN input while the login request is pending', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    firebaseState.signInWithEmailAndPassword.mockReturnValue(deferred.promise);

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));
    const pinInput = screen.getByLabelText('PIN 碼');

    await user.type(pinInput, '2468');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(screen.getByRole('status').textContent).toContain('你');
    expect(screen.getByRole('button', { name: '選擇成員 你' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '選擇成員 Kevin' }).disabled).toBe(true);
    expect(screen.getByLabelText('PIN 碼').disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));

    expect(screen.getByRole('button', { name: '選擇成員 你' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '選擇成員 Kevin' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('PIN 碼').value).toBe('2468');

    deferred.resolve({ user: { uid: 'dazhugong_main_member1' } });

    await waitFor(() => expect(firebaseState.signInWithEmailAndPassword).toHaveBeenCalledTimes(1));
  });

  it('clears the PIN and any visible error when the selected member changes', async () => {
    const user = userEvent.setup();
    firebaseState.signInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/invalid-credential',
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

  it('shows the signed-out auth error as an alert and clears it independently from PIN errors', async () => {
    const user = userEvent.setup();
    firebaseState.signInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/invalid-credential',
      message: 'pinHash comparison failed for member-1',
    });

    renderLogin({ authError: 'Unable to verify your account access right now.' });

    expect(screen.getByRole('alert').textContent).toContain('Unable to verify your account access right now.');

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));

    expect(authStoreState.clearAuthError).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unable to verify your account access right now.')).toBe(null);

    await user.type(screen.getByLabelText('PIN 碼'), '9999');
    await user.click(screen.getByRole('button', { name: '登入' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('登入失敗');
    expect(alerts[0].textContent).not.toContain('Unable to verify your account access right now.');
  });

  it('derives the selected member credential and signs in with email/password on enter', async () => {
    const user = userEvent.setup();
    firebaseState.signInWithEmailAndPassword.mockResolvedValue({
      user: { uid: 'dazhugong_main_member2' },
    });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));
    await user.type(screen.getByLabelText('PIN 碼'), '2468{Enter}');

    await waitFor(() => expect(firebaseState.signInWithEmailAndPassword).toHaveBeenCalledTimes(1));
    expect(firebaseState.signInWithEmailAndPassword).toHaveBeenCalledWith(
      firebaseState.auth,
      'dazhugong_main_member2@dazhugong.invalid',
      'dazhugong.firebase-auth.v1:dazhugong_main_member2:2468',
    );
    expect(screen.queryByRole('alert')).toBe(null);
  });

  it('uses a fixed accessible login button style regardless of member color', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));
    await user.type(screen.getByLabelText('PIN 碼'), '2468');

    const submitButton = screen.getByRole('button', { name: '登入' });

    expect(submitButton.className).toContain('bg-pink-700');
    expect(submitButton.className).toContain('text-white');
    expect(submitButton.getAttribute('style')).toBe(null);
  });

  it('shows a safe generic error for a wrong PIN without leaking backend details', async () => {
    const user = userEvent.setup();
    firebaseState.signInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/wrong-password',
      message: 'pinHash comparison failed for member-1',
    });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));
    await user.type(screen.getByLabelText('PIN 碼'), '9999');
    await user.click(screen.getByRole('button', { name: '登入' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('登入失敗');
    expect(alert.textContent).not.toContain('pinHash');
    expect(firebaseState.signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });

  it('shows the throttled message when the backend locks out repeated attempts', async () => {
    const user = userEvent.setup();
    firebaseState.signInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/too-many-requests',
      message: 'too many attempts',
    });

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 你' }));
    await user.type(screen.getByLabelText('PIN 碼'), '9999');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect((await screen.findByRole('alert')).textContent).toContain('嘗試次數過多');
  });

  it('prevents duplicate submit attempts while the login request is still pending', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    firebaseState.signInWithEmailAndPassword.mockReturnValue(deferred.promise);

    renderLogin();

    await user.click(screen.getByRole('button', { name: '選擇成員 Kevin' }));
    await user.type(screen.getByLabelText('PIN 碼'), '2468');

    const submitButton = screen.getByRole('button', { name: '登入' });
    await user.click(submitButton);
    await user.click(submitButton);

    expect(firebaseState.signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('登入中');
    expect(screen.getByRole('button', { name: '登入中' }).disabled).toBe(true);

    deferred.resolve({ user: { uid: 'dazhugong_main_member2' } });

    await waitFor(() => expect(firebaseState.signInWithEmailAndPassword).toHaveBeenCalledTimes(1));
  });
});
