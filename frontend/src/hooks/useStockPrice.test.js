import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStockPrice } from './useStockPrice.js';

const originalFetch = global.fetch;

function buildResponse(rows) {
  return { ok: true, json: () => Promise.resolve(rows) };
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useStockPrice', () => {
  it('returns the closing price for code 2330 from the STOCK_DAY_ALL array', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      buildResponse([
        { Code: '2317', Name: '鴻海', ClosingPrice: '200.00', Date: '1150801' },
        { Code: '2330', Name: '台積電', ClosingPrice: '1055.00', Date: '1150801' },
      ]),
    );

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quote).not.toBe(null));

    expect(result.current.quote).toMatchObject({ price: 1055, stockName: '台積電', tradeDateLabel: '08/01' });
    expect(result.current.quoteFailed).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
      expect.anything(),
    );
  });

  it('falls back to the literal "台積電" label when the row has no Name field', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      buildResponse([{ Code: '2330', ClosingPrice: '1055.00', Date: '1150801' }]),
    );

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quote).not.toBe(null));

    expect(result.current.quote.stockName).toBe('台積電');
  });

  it('marks quoteFailed when 2330 is not present in the response rows', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      buildResponse([{ Code: '2317', Name: '鴻海', ClosingPrice: '200.00', Date: '1150801' }]),
    );

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quoteFailed).toBe(true));
    expect(result.current.quote).toBe(null);
  });

  it('marks quoteFailed when ClosingPrice is missing or not a number', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      buildResponse([{ Code: '2330', Name: '台積電', ClosingPrice: '---', Date: '1150801' }]),
    );

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quoteFailed).toBe(true));
  });

  it('marks quoteFailed when the response is not an array (unexpected payload shape)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ error: 'nope' }) });

    const { result } = renderHook(() => useStockPrice());

    await waitFor(() => expect(result.current.quoteFailed).toBe(true));
  });

  it('marks quoteFailed when the request itself fails (e.g. network/CORS error)', async () => {
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

  describe('30-second polling (no time-of-day cutoff: this dataset only changes once a day, but we keep checking so we catch whenever TWSE actually publishes it)', () => {
    it('re-fetches every 30 seconds indefinitely, including after 14:00', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 4, 22, 15, 0, 0)); // 刻意選在14:00之後，確認沒有任何停止機制
      global.fetch = vi.fn().mockResolvedValue(
        buildResponse([{ Code: '2330', Name: '台積電', ClosingPrice: '1055.00', Date: '1150801' }]),
      );

      renderHook(() => useStockPrice());
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
  });
});
