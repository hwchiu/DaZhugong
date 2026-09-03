import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeather } from './useWeather.js';

const originalFetch = global.fetch;
const originalGeolocation = global.navigator.geolocation;

afterEach(() => {
  global.fetch = originalFetch;
  Object.defineProperty(global.navigator, 'geolocation', {
    value: originalGeolocation,
    configurable: true,
  });
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.defineProperty(global.navigator, 'geolocation', {
    value: undefined,
    configurable: true,
  });
});

describe('useWeather', () => {
  it('returns weather data on a successful fetch (falling back to Taipei coordinates without geolocation)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ current: { temperature_2m: 27.4, weather_code: 61 } }),
    });

    const { result } = renderHook(() => useWeather());

    await waitFor(() => expect(result.current.weather).not.toBe(null));

    expect(result.current.weather).toEqual({ temperature: 27.4, weatherCode: 61 });
    expect(result.current.weatherFailed).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('latitude=25.033'),
      expect.anything(),
    );
  });

  it('marks weatherFailed when the request fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useWeather());

    await waitFor(() => expect(result.current.weatherFailed).toBe(true));
    expect(result.current.weather).toBe(null);
  });

  it('marks weatherFailed when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useWeather());

    await waitFor(() => expect(result.current.weatherFailed).toBe(true));
  });

  it('marks weatherFailed immediately when fetch is unavailable in the environment', () => {
    global.fetch = undefined;

    const { result } = renderHook(() => useWeather());

    expect(result.current.weatherFailed).toBe(true);
    expect(result.current.weather).toBe(null);
  });
});
