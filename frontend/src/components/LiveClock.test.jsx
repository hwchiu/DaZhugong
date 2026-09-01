import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveClock from './LiveClock.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useRealTimers();
});

describe('LiveClock', () => {
  it('renders the current time and updates on an interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 5));

    render(<LiveClock />);

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('9:05');

    vi.setSystemTime(new Date(2026, 0, 1, 9, 20));
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByRole('status').textContent).toContain('9:20');
  });
});
