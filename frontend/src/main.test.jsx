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

    await act(async () => {
      await expect(
        startApplication({
          initializeFirebaseImpl: vi
            .fn()
            .mockRejectedValue(new Error('Missing required Firebase environment variables: secret-value')),
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
  });
});
