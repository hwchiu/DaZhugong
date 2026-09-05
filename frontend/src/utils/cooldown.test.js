import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_DURATION_MS,
  formatCooldownRemaining,
  getCooldownStatus,
  getLastReportedAt,
} from './cooldown.js';

const NOW = new Date(2024, 4, 22, 12, 30, 0).getTime();

function makeReport(targetId, timestamp) {
  return { targetId, timestamp };
}

describe('getLastReportedAt', () => {
  it('finds the most recent timestamp for the given member, ignoring others', () => {
    const reports = [
      makeReport('huye', new Date(NOW - 10 * 60_000)),
      makeReport('niuge', new Date(NOW - 1 * 60_000)),
      makeReport('huye', new Date(NOW - 2 * 60_000)),
    ];
    expect(getLastReportedAt(reports, 'huye')).toBe(NOW - 2 * 60_000);
  });

  it('returns null when the member has never been reported', () => {
    const reports = [makeReport('niuge', new Date(NOW))];
    expect(getLastReportedAt(reports, 'huye')).toBe(null);
  });

  it('returns null for empty or malformed input', () => {
    expect(getLastReportedAt([], 'huye')).toBe(null);
    expect(getLastReportedAt(undefined, 'huye')).toBe(null);
    expect(getLastReportedAt([{ targetId: 'huye' }], 'huye')).toBe(null);
  });
});

describe('getCooldownStatus', () => {
  it('is in cooldown right after being reported', () => {
    const reports = [makeReport('huye', new Date(NOW - 1000))];
    const status = getCooldownStatus(reports, 'huye', NOW);
    expect(status.inCooldown).toBe(true);
    expect(status.remainingMs).toBe(COOLDOWN_DURATION_MS - 1000);
  });

  it('is not in cooldown once 5 minutes have fully passed', () => {
    const reports = [makeReport('huye', new Date(NOW - COOLDOWN_DURATION_MS))];
    const status = getCooldownStatus(reports, 'huye', NOW);
    expect(status.inCooldown).toBe(false);
    expect(status.remainingMs).toBe(0);
  });

  it('is not in cooldown one millisecond before the boundary is reached from the other side', () => {
    const reports = [makeReport('huye', new Date(NOW - COOLDOWN_DURATION_MS + 1))];
    const status = getCooldownStatus(reports, 'huye', NOW);
    expect(status.inCooldown).toBe(true);
    expect(status.remainingMs).toBe(1);
  });

  it('is never in cooldown for a member with no reports at all', () => {
    const status = getCooldownStatus([], 'huye', NOW);
    expect(status.inCooldown).toBe(false);
    expect(status.expiresAt).toBe(null);
  });

  it('cooldown is per-member and fully independent between members (AC from spec)', () => {
    const reports = [
      makeReport('niuge', new Date(NOW - 1000)), // 牛哥剛被記錄，還在冷卻中
    ];
    const niugeStatus = getCooldownStatus(reports, 'niuge', NOW);
    const alongStatus = getCooldownStatus(reports, 'along', NOW);
    expect(niugeStatus.inCooldown).toBe(true);
    expect(alongStatus.inCooldown).toBe(false);
  });

  it('only considers the most recent report, not older ones for the same member', () => {
    const reports = [
      makeReport('huye', new Date(NOW - COOLDOWN_DURATION_MS - 60_000)), // 很久以前，已過期
      makeReport('huye', new Date(NOW - 30_000)), // 剛剛，還在冷卻中
    ];
    const status = getCooldownStatus(reports, 'huye', NOW);
    expect(status.inCooldown).toBe(true);
  });
});

describe('formatCooldownRemaining', () => {
  it('formats minutes and seconds with zero-padding', () => {
    expect(formatCooldownRemaining(5 * 60_000)).toBe('5:00');
    expect(formatCooldownRemaining(4 * 60_000 + 7_000)).toBe('4:07');
    expect(formatCooldownRemaining(7_000)).toBe('0:07');
  });

  it('rounds up partial seconds so it never shows 0:00 while still in cooldown', () => {
    expect(formatCooldownRemaining(500)).toBe('0:01');
  });

  it('clamps negative input to 0:00', () => {
    expect(formatCooldownRemaining(-5000)).toBe('0:00');
  });
});
