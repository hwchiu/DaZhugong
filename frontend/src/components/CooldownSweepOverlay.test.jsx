import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CooldownSweepOverlay from './CooldownSweepOverlay.jsx';
import { COOLDOWN_DURATION_MS } from '../utils/cooldown.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CooldownSweepOverlay', () => {
  it('renders a decorative, click-through mask (not announced by screen readers, does not block interaction)', () => {
    const { container } = render(
      <CooldownSweepOverlay expiresAt={Date.now() + 60_000} remainingMs={60_000} />,
    );

    const overlay = container.querySelector('.cooldown-sweep-mask');
    expect(overlay).toBeTruthy();
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.style.borderRadius).toBe('inherit');
  });

  it('always drives the animation off the shared COOLDOWN_DURATION_MS constant, not a locally guessed number', () => {
    const { container } = render(
      <CooldownSweepOverlay expiresAt={Date.now() + 60_000} remainingMs={60_000} />,
    );

    const overlay = container.querySelector('.cooldown-sweep-mask');
    expect(overlay.style.animationDuration).toBe(`${COOLDOWN_DURATION_MS}ms`);
  });

  it('sets a negative animation-delay equal to how far into the cooldown we already are, so the sweep resumes mid-way instead of restarting from full', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 4, 22, 12, 30, 0));

    const remainingMs = 60_000; // 還剩1分鐘 -> 已經過了(總長-1分鐘)
    const expiresAt = Date.now() + remainingMs;
    const { container } = render(<CooldownSweepOverlay expiresAt={expiresAt} remainingMs={remainingMs} />);

    const overlay = container.querySelector('.cooldown-sweep-mask');
    const expectedElapsedMs = COOLDOWN_DURATION_MS - remainingMs;
    expect(overlay.style.animationDelay).toBe(`-${expectedElapsedMs}ms`);
  });

  it('sets the static --cooldown-remaining fallback fraction from remainingMs, for prefers-reduced-motion (see index.css)', () => {
    const halfway = COOLDOWN_DURATION_MS / 2;
    const { container } = render(
      <CooldownSweepOverlay expiresAt={Date.now() + halfway} remainingMs={halfway} />,
    );

    const overlay = container.querySelector('.cooldown-sweep-mask');
    expect(overlay.style.getPropertyValue('--cooldown-remaining')).toBe('0.5');
  });

  it('clamps the static fallback fraction to [0, 1] even if remainingMs is out of range', () => {
    const { container: over } = render(
      <CooldownSweepOverlay expiresAt={Date.now() + COOLDOWN_DURATION_MS * 2} remainingMs={COOLDOWN_DURATION_MS * 2} />,
    );
    expect(over.querySelector('.cooldown-sweep-mask').style.getPropertyValue('--cooldown-remaining')).toBe('1');

    const { container: under } = render(<CooldownSweepOverlay expiresAt={Date.now()} remainingMs={-500} />);
    expect(under.querySelector('.cooldown-sweep-mask').style.getPropertyValue('--cooldown-remaining')).toBe('0');
  });

  it('keeps the same animation-delay across re-renders within the same cooldown period, so the CSS animation is never restarted by a tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 4, 22, 12, 30, 0));

    const expiresAt = Date.now() + COOLDOWN_DURATION_MS;
    const { container, rerender } = render(
      <CooldownSweepOverlay expiresAt={expiresAt} remainingMs={COOLDOWN_DURATION_MS} />,
    );
    const overlay = container.querySelector('.cooldown-sweep-mask');
    const firstDelay = overlay.style.animationDelay;

    // 模擬useNowTicker一秒後的tick：remainingMs變了，但expiresAt(同一段冷卻
    // 期間內固定不變)沒變——animation-delay不應該跟著重算/改變。
    rerender(<CooldownSweepOverlay expiresAt={expiresAt} remainingMs={COOLDOWN_DURATION_MS - 1000} />);
    expect(overlay.style.animationDelay).toBe(firstDelay);
  });

  it('recomputes animation-delay when expiresAt changes (a genuinely new cooldown period starting)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 4, 22, 12, 30, 0));

    const firstExpiresAt = Date.now() + 60_000;
    const { container, rerender } = render(
      <CooldownSweepOverlay expiresAt={firstExpiresAt} remainingMs={60_000} />,
    );
    const overlay = container.querySelector('.cooldown-sweep-mask');
    const firstDelay = overlay.style.animationDelay;

    const secondExpiresAt = Date.now() + COOLDOWN_DURATION_MS;
    rerender(<CooldownSweepOverlay expiresAt={secondExpiresAt} remainingMs={COOLDOWN_DURATION_MS} />);
    expect(overlay.style.animationDelay).not.toBe(firstDelay);
    expect(overlay.style.animationDelay).toBe('0ms');
  });
});
