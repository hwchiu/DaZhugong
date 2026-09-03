import { describe, expect, it } from 'vitest';
import { TRADITIONAL_COLORS, getTodayColor, getTodayColorIndex } from './traditionalColors.js';

describe('getTodayColorIndex', () => {
  it('returns the same index for the same calendar day', () => {
    const a = getTodayColorIndex(new Date(2026, 5, 15, 9, 0));
    const b = getTodayColorIndex(new Date(2026, 5, 15, 22, 30));
    expect(a).toBe(b);
  });

  it('returns a different index on a different day (usually)', () => {
    const day1 = getTodayColorIndex(new Date(2026, 0, 1));
    const day2 = getTodayColorIndex(new Date(2026, 0, 2));
    expect(day1).not.toBe(day2);
  });

  it('always returns a valid index within the palette bounds', () => {
    for (let month = 0; month < 12; month += 1) {
      const index = getTodayColorIndex(new Date(2026, month, 10));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(TRADITIONAL_COLORS.length);
    }
  });

  it('wraps around after the palette length in days', () => {
    const first = getTodayColorIndex(new Date(2026, 0, 1));
    const wrapped = getTodayColorIndex(new Date(2026, 0, 1 + TRADITIONAL_COLORS.length));
    expect(wrapped).toBe(first);
  });
});

describe('getTodayColor', () => {
  it('returns a color object with name, reading, and a valid hex value', () => {
    const color = getTodayColor(new Date(2026, 3, 5));
    expect(TRADITIONAL_COLORS).toContainEqual(color);
    expect(color.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(typeof color.name).toBe('string');
    expect(typeof color.reading).toBe('string');
  });
});
