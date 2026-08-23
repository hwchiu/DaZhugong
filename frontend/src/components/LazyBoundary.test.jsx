import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LazyBoundary from './LazyBoundary.jsx';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LazyBoundary', () => {
  it('retries a rejected lazy loader through the boundary fallback', async () => {
    const user = userEvent.setup();
    const loader = vi.fn(async () => {
      if (loader.mock.calls.length === 1) {
        throw new Error('lazy import failed');
      }

      return {
        default: ({ label }) => <div>{label}</div>,
      };
    });

    render(
      <LazyBoundary
        loader={loader}
        loadingFallback={<div>準備中</div>}
        errorFallback={({ retry }) => (
          <button type="button" onClick={retry}>
            重試 lazy
          </button>
        )}
      >
        {(LazyComponent) => <LazyComponent label="載入完成" />}
      </LazyBoundary>,
    );

    expect(await screen.findByRole('button', { name: '重試 lazy' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '重試 lazy' }));

    expect(await screen.findByText('載入完成')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
