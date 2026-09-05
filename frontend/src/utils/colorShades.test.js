import { describe, expect, it } from 'vitest';
import { deriveColorShades } from './colorShades.js';

describe('deriveColorShades', () => {
  it('keeps the 500 shade identical to the input hex', () => {
    const shades = deriveColorShades('#1B5C82');
    expect(shades[500]).toBe('#1B5C82');
  });

  it('produces valid hex strings for every shade', () => {
    const shades = deriveColorShades('#D9333F');
    for (const value of Object.values(shades)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('makes the 50 shade lighter and the 700 shade darker than the base color', () => {
    const shades = deriveColorShades('#D9333F');
    const toLuma = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    expect(toLuma(shades[50])).toBeGreaterThan(toLuma(shades[500]));
    expect(toLuma(shades[700])).toBeLessThan(toLuma(shades[500]));
    expect(toLuma(shades[600])).toBeLessThan(toLuma(shades[500]));
  });

  it('makes the bg shade several steps lighter than 50, for full-page background gradients', () => {
    const shades = deriveColorShades('#2563eb');
    const toLuma = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    expect(toLuma(shades.bg)).toBeGreaterThan(toLuma(shades[50]));
    // bg還是要看得出跟基準色同一個色相家族，不是純灰/純白
    expect(shades.bg).not.toBe('#ffffff');
  });

  it('handles a grayscale input (zero saturation) without throwing', () => {
    expect(() => deriveColorShades('#808080')).not.toThrow();
  });
});
