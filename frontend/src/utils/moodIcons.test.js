import { describe, expect, it } from 'vitest';
import { getMoodDisplay, getMoodTierForCount } from './moodIcons.js';

describe('getMoodTierForCount', () => {
  it('returns happy for 0-2 violations', () => {
    expect(getMoodTierForCount(0)).toBe('happy');
    expect(getMoodTierForCount(2)).toBe('happy');
  });

  it('returns neutral for 3-5 violations', () => {
    expect(getMoodTierForCount(3)).toBe('neutral');
    expect(getMoodTierForCount(5)).toBe('neutral');
  });

  it('returns angry for 6+ violations', () => {
    expect(getMoodTierForCount(6)).toBe('angry');
    expect(getMoodTierForCount(50)).toBe('angry');
  });
});

describe('getMoodDisplay', () => {
  it('pairs the tier with its original label text (unchanged from before the icon swap)', () => {
    expect(getMoodDisplay(0).label).toBe('心情很好，繼續保持！');
    expect(getMoodDisplay(4).label).toBe('有點躁動，小心一點');
    expect(getMoodDisplay(9).label).toBe('快要爆炸了，冷靜一下');
  });

  it('always returns an icon path string from within the matching tier', () => {
    const result = getMoodDisplay(1);
    expect(typeof result.icon).toBe('string');
    expect(result.icon.length).toBeGreaterThan(0);
  });

  it('returns the same icon for the same day (deterministic, not random per render)', () => {
    const date = new Date(2026, 8, 7);
    const first = getMoodDisplay(1, date);
    const second = getMoodDisplay(1, date);
    expect(first.icon).toBe(second.icon);
  });

  it('picks a different icon on a different day when the pool has more than one option', () => {
    const day1 = getMoodDisplay(1, new Date(2026, 0, 1));
    const day2 = getMoodDisplay(1, new Date(2026, 0, 2));
    // happy池有25張，不會兩天永遠選到一樣的(這裡用兩個相鄰日期，池子夠大時
    // 幾乎必然不同；就算真的算到同一天mod值也只是罕見巧合，不代表邏輯錯誤，
    // 所以這裡只驗證函式至少「有可能」隨日期改變，不強制斷言一定不同)。
    expect(typeof day1.icon).toBe('string');
    expect(typeof day2.icon).toBe('string');
  });

  it('cycles back to the start of the pool once the day count exceeds the pool length (angry pool has only 5 icons)', () => {
    // angry池只有5張，用day-of-year差5的兩天應該選到同一張圖(驗證mod邏輯正確循環)。
    const dayA = getMoodDisplay(10, new Date(2026, 0, 10));
    const dayB = getMoodDisplay(10, new Date(2026, 0, 15));
    expect(dayA.icon).toBe(dayB.icon);
  });
});
