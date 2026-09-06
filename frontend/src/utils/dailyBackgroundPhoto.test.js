import { describe, expect, it, vi } from 'vitest';
import { getDailyBackgroundPhotoUrl } from './dailyBackgroundPhoto.js';

describe('getDailyBackgroundPhotoUrl', () => {
  it("builds a Picsum seed URL from today's date so it stays stable within a day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 15, 0));

    const url = getDailyBackgroundPhotoUrl();

    expect(url).toBe('https://picsum.photos/seed/2026-09-03/800/1200');

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
    expect(day2).toBe('https://picsum.photos/seed/2026-09-04/800/1200');

    vi.useRealTimers();
  });

  it('accepts a custom width and height', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5));

    expect(getDailyBackgroundPhotoUrl(400, 300)).toBe('https://picsum.photos/seed/2026-01-05/400/300');

    vi.useRealTimers();
  });

  // 這個測試就是這次要修的bug本身：預設值如果哪天不小心又被改回橫式(寬>高)，
  // 用在手機直式的固定背景區塊時，object-cover會需要裁掉將近一半的照片寬度才能
  // 填滿畫面——這裡直接鎖住「預設一定是直式(高>寬)」，避免再度回歸。
  it('defaults to a portrait (taller-than-wide) ratio, matching the mobile hero container it fills', () => {
    const url = getDailyBackgroundPhotoUrl();
    const [width, height] = url.split('/').slice(-2).map(Number);
    expect(height).toBeGreaterThan(width);
  });
});
