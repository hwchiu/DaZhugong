import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStockPrice } from './useStockPrice.js';

const originalFetch = global.fetch;

function buildResponse(msgArray) {
  return { ok: true, json: () => Promise.resolve({ msgArray }) };
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useStockPrice', () => {
  it('returns the latest transaction price (z) on a successful fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      buildResponse([{ c: '2330', n: '台積電', z: '1055.00', y: '1050.00' }]),
    );

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quote).not.toBe(null));

    expect(result.current.quote).toMatchObject({ price: 1055, isLastTradePrice: true, stockName: '台積電' });
    expect(result.current.quoteFailed).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ex_ch=tse_2330.tw'),
      expect.anything(),
    );
  });

  it("falls back to yesterday's close (y) when there is no live trade price (z is '-')", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      buildResponse([{ c: '2330', n: '台積電', z: '-', y: '1050.00' }]),
    );

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quote).not.toBe(null));

    expect(result.current.quote).toMatchObject({ price: 1050, isLastTradePrice: false });
  });

  it('marks quoteFailed when the response has no usable price in either z or y', async () => {
    global.fetch = vi.fn().mockResolvedValue(buildResponse([{ c: '2330', z: '-', y: '-' }]));

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quoteFailed).toBe(true));
    expect(result.current.quote).toBe(null);
  });

  it('marks quoteFailed when msgArray is empty (e.g. market holiday / invalid symbol)', async () => {
    global.fetch = vi.fn().mockResolvedValue(buildResponse([]));

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quoteFailed).toBe(true));
  });

  it('marks quoteFailed when the request itself fails (e.g. CORS/network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quoteFailed).toBe(true));
    expect(result.current.quote).toBe(null);
  });

  it('marks quoteFailed immediately when fetch is unavailable in the environment', () => {
    global.fetch = undefined;

    const { result } = renderHook(() => useStockPrice());

    expect(result.current.quoteFailed).toBe(true);
    expect(result.current.quote).toBe(null);
  });

  describe('30-second polling and the 14:00 auto-refresh cutoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('re-fetches every 30 seconds before the 14:00 cutoff', async () => {
      vi.setSystemTime(new Date(2024, 4, 22, 11, 0, 0));
      global.fetch = vi.fn().mockResolvedValue(
        buildResponse([{ c: '2330', n: '台積電', z: '1055.00', y: '1050.00' }]),
      );

      renderHook(() => useStockPrice());
      // advanceTimersByTimeAsync(0) 除了推進假時鐘，也會讓目前排隊中的microtask
      // (fetch的.then/.catch/.finally那條promise鏈)真的執行完、把state更新反映
      // 到React render裡；包在act()裡是專案既有慣例(見Vote.test.jsx)，避免
      // React印出「state update不是包在act裡」的警告。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('stops calling the API once local time passes 14:00, without ever un-mounting', async () => {
      vi.setSystemTime(new Date(2024, 4, 22, 13, 59, 45));
      global.fetch = vi.fn().mockResolvedValue(
        buildResponse([{ c: '2330', n: '台積電', z: '1055.00', y: '1050.00' }]),
      );

      const { result } = renderHook(() => useStockPrice());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.autoRefreshStopped).toBe(false);

      // 這一次tick跨過14:00這條線——應該是「這次tick發現已經過了14:00，
      // 所以這次不再打API」，而不是「已經打完API才發現過了14:00」。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.autoRefreshStopped).toBe(true);

      // 之後不管再過多久，都不應該再打API——不是「暫停一次」而已。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('still fetches once on mount even if the page is opened after 14:00, just without further auto-refresh', async () => {
      vi.setSystemTime(new Date(2024, 4, 22, 15, 30, 0));
      global.fetch = vi.fn().mockResolvedValue(
        buildResponse([{ c: '2330', n: '台積電', z: '1055.00', y: '1050.00' }]),
      );

      const { result } = renderHook(() => useStockPrice());
      // fetch本身的mock resolve、response.json()、async function包裝、
      // .then(setQuote)這幾層各自都要多一次microtask，光呼叫一次
      // advanceTimersByTimeAsync(0)不保證每一層都真的跑完——這裡多等幾輪
      // 確保整條promise鏈徹底解完，state真的反映到result.current上。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.quote).toMatchObject({ price: 1055 });
      expect(result.current.autoRefreshStopped).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
