import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PiggyBank3D, { getDailyBackgroundPhotoUrl, samplePiggyTokens } from './PiggyBank3D.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('samplePiggyTokens', () => {
  it('caps rendered tokens while preserving proportional member color mapping', () => {
    const sample = samplePiggyTokens(
      [
        { id: 'pink', color: '#ec4899', totalTokens: 8 },
        { id: 'blue', color: '#0ea5e9', totalTokens: 2 },
        { id: 'ignored', color: '#22c55e', totalTokens: -4 },
      ],
      5,
    );

    expect(sample.totalCount).toBe(10);
    expect(sample.renderedCount).toBe(5);
    expect(sample.tokens.filter((token) => token.memberId === 'pink')).toHaveLength(4);
    expect(sample.tokens.filter((token) => token.memberId === 'blue')).toHaveLength(1);
  });

  it('uses a safe color and returns no objects when the total is zero', () => {
    expect(samplePiggyTokens([{ id: 'none', totalTokens: 0 }], 80)).toEqual({
      totalCount: 0,
      renderedCount: 0,
      tokens: [],
    });

    const sample = samplePiggyTokens([{ id: 'member', color: 'not-a-color', totalTokens: 1 }], 80);
    expect(sample.tokens[0].color).toBe('#f472b6');
  });
});

describe('getDailyBackgroundPhotoUrl', () => {
  it("builds a Picsum seed URL from today's date so it stays stable within a day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 15, 0));

    const url = getDailyBackgroundPhotoUrl();

    expect(url).toBe('https://picsum.photos/seed/2026-09-03/1000/700');

    vi.setSystemTime(new Date(2026, 8, 3, 23, 59));
    expect(getDailyBackgroundPhotoUrl()).toBe(url);

    vi.useRealTimers();
  });

  it('changes to a new seed on the next calendar day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 23, 59));
    const day1 = getDailyBackgroundPhotoUrl();

    vi.setSystemTime(new Date(2026, 8, 4, 0, 1));
    const day2 = getDailyBackgroundPhotoUrl();

    expect(day2).not.toBe(day1);
    expect(day2).toBe('https://picsum.photos/seed/2026-09-04/1000/700');

    vi.useRealTimers();
  });

  it('accepts a custom width and height', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5));

    expect(getDailyBackgroundPhotoUrl(400, 300)).toBe('https://picsum.photos/seed/2026-01-05/400/300');

    vi.useRealTimers();
  });
});

describe('PiggyBank3D', () => {
  it('shows an accessible static pig when WebGL is unavailable and notes reduced motion', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    render(
      <PiggyBank3D
        members={[{ id: 'member', name: '小美', color: '#ec4899', totalTokens: 12 }]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /小豬撲滿.*12 Token/ })).toBeTruthy();
    });
    expect(screen.getByText('已依系統設定關閉動態效果。')).toBeTruthy();
  });
});
