import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('startApplication', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('renders a configuration error instead of the app shell when Firebase initialization fails', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const { startApplication } = await import('./main.jsx');
    const logger = vi.fn();
    const startAuthObserverImpl = vi.fn();

    await act(async () => {
      await expect(
        startApplication({
          initializeFirebaseImpl: vi
            .fn()
            .mockRejectedValue(new Error('Missing required Firebase environment variables: secret-value')),
          startAuthObserverImpl,
          rootElement: document.getElementById('root'),
          logger,
        }),
      ).resolves.toBeUndefined();
    });

    expect(document.body.textContent).toContain('Configuration error');
    expect(document.body.textContent).toContain('required Firebase settings');
    expect(document.body.textContent).not.toContain('大豬公');
    expect(logger).toHaveBeenCalledWith(
      'Firebase initialization failed:',
      'Missing required Firebase environment variables.',
    );
    expect(startAuthObserverImpl).not.toHaveBeenCalled();
  });

  it('starts the auth observer only after Firebase initializes, then renders the app', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const { startApplication } = await import('./main.jsx');
    const render = vi.fn();
    const createRootImpl = vi.fn(() => ({ render }));
    const order = [];
    const startAuthObserverImpl = vi.fn(() => {
      order.push('observer');
      return vi.fn();
    });

    const cleanup = await act(async () =>
      startApplication({
        initializeFirebaseImpl: vi.fn(async () => {
          order.push('firebase');
        }),
        startAuthObserverImpl,
        rootElement: document.getElementById('root'),
        createRootImpl,
      }),
    );

    expect(order).toEqual(['firebase', 'observer']);
    expect(render).toHaveBeenCalledTimes(1);
    expect(startAuthObserverImpl).toHaveBeenCalledTimes(1);
    expect(typeof cleanup).toBe('function');
  });

  it('cleans up the auth observer on unload and HMR dispose without double-unsubscribing', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const { startApplication } = await import('./main.jsx');
    const observerCleanup = vi.fn();
    const listeners = new Map();
    const hot = {
      dispose: vi.fn((callback) => {
        hot.disposeCallback = callback;
      }),
    };

    await act(async () => {
      await startApplication({
        initializeFirebaseImpl: vi.fn().mockResolvedValue(undefined),
        startAuthObserverImpl: vi.fn(() => observerCleanup),
        rootElement: document.getElementById('root'),
        createRootImpl: () => ({ render: vi.fn() }),
        addWindowListener: vi.fn((eventName, handler) => {
          listeners.set(eventName, handler);
        }),
        removeWindowListener: vi.fn((eventName) => {
          listeners.delete(eventName);
        }),
        hot,
      });
    });

    listeners.get('beforeunload')?.();
    hot.disposeCallback?.();

    expect(observerCleanup).toHaveBeenCalledTimes(1);
  });

  it('does not tear down the auth observer for pagehide-style bfcache transitions', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const { startApplication } = await import('./main.jsx');
    const observerCleanup = vi.fn();
    const listeners = new Map();

    await act(async () => {
      await startApplication({
        initializeFirebaseImpl: vi.fn().mockResolvedValue(undefined),
        startAuthObserverImpl: vi.fn(() => observerCleanup),
        rootElement: document.getElementById('root'),
        createRootImpl: () => ({ render: vi.fn() }),
        addWindowListener: vi.fn((eventName, handler) => {
          listeners.set(eventName, handler);
        }),
        removeWindowListener: vi.fn((eventName) => {
          listeners.delete(eventName);
        }),
      });
    });

    listeners.get('pagehide')?.({ persisted: true });

    expect(observerCleanup).toHaveBeenCalledTimes(0);
  });

  it('reuses the existing React root when startApplication runs again for the same container', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const { startApplication } = await import('./main.jsx');
    const render = vi.fn();
    const createRootImpl = vi.fn(() => ({ render }));

    await act(async () => {
      await startApplication({
        initializeFirebaseImpl: vi.fn().mockResolvedValue(undefined),
        startAuthObserverImpl: vi.fn(() => vi.fn()),
        rootElement: document.getElementById('root'),
        createRootImpl,
      });
    });

    await act(async () => {
      await startApplication({
        initializeFirebaseImpl: vi.fn().mockResolvedValue(undefined),
        startAuthObserverImpl: vi.fn(() => vi.fn()),
        rootElement: document.getElementById('root'),
        createRootImpl,
      });
    });

    expect(createRootImpl).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
