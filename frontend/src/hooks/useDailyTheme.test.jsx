import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDailyTheme } from './useDailyTheme.js';

function TestComponent() {
  useDailyTheme();
  return null;
}

afterEach(() => {
  for (const prop of ['--brand-bg', '--brand-50', '--brand-500', '--brand-600', '--brand-700', '--brand-name']) {
    document.documentElement.style.removeProperty(prop);
  }
});

describe('useDailyTheme', () => {
  it('sets all brand CSS custom properties on the document root, including the lighter bg shade', () => {
    render(<TestComponent />);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-bg')).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(root.style.getPropertyValue('--brand-50')).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(root.style.getPropertyValue('--brand-500')).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(root.style.getPropertyValue('--brand-600')).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(root.style.getPropertyValue('--brand-700')).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(root.style.getPropertyValue('--brand-name')).toContain('"');
  });

  it('removes the custom properties again on unmount', () => {
    const { unmount } = render(<TestComponent />);
    unmount();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-bg')).toBe('');
    expect(root.style.getPropertyValue('--brand-50')).toBe('');
    expect(root.style.getPropertyValue('--brand-500')).toBe('');
    expect(root.style.getPropertyValue('--brand-600')).toBe('');
    expect(root.style.getPropertyValue('--brand-700')).toBe('');
    expect(root.style.getPropertyValue('--brand-name')).toBe('');
  });
});
