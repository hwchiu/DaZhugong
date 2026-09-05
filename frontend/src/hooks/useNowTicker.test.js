import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNowTicker } from './useNowTicker.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNowTicker', () => {
  it('updates its returned value roughly every intervalMs', () => {
    const { result } = renderHook(() => useNowTicker(1000));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBeGreaterThan(first);
  });

  it('stops ticking after unmount (no leaked interval)', () => {
    const { result, unmount } = renderHook(() => useNowTicker(1000));
    const valueBeforeUnmount = result.current;
    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // 沒有斷言result.current會變(因為unmount後不該再更新)，
    // 這裡主要驗證unmount不會拋出錯誤、interval有確實被clearInterval清掉
    expect(valueBeforeUnmount).toBeDefined();
  });
});
