import { describe, expect, it } from 'vitest';
import {
  clampPeriodOffset,
  getDaysInRange,
  getMonthlyBuckets,
  getPeriodRange,
  getPreviousPeriodRange,
  isWithinRange,
} from './statisticsPeriod.js';

describe('clampPeriodOffset', () => {
  it('never allows a positive (future) offset', () => {
    expect(clampPeriodOffset(1)).toBe(0);
    expect(clampPeriodOffset(5)).toBe(0);
  });

  it('keeps negative (past) offsets as-is', () => {
    expect(clampPeriodOffset(-1)).toBe(-1);
    expect(clampPeriodOffset(-10)).toBe(-10);
  });

  it('treats non-finite input as 0', () => {
    expect(clampPeriodOffset(NaN)).toBe(0);
    expect(clampPeriodOffset(undefined)).toBe(0);
  });
});

describe('getPeriodRange - week', () => {
  it('starts the week on Monday and ends on Sunday', () => {
    // 2024/05/22 是星期三
    const reference = new Date(2024, 4, 22, 15, 30);
    const period = getPeriodRange('week', 0, reference);

    expect(period.type).toBe('week');
    expect(period.start.getDay()).toBe(1); // Monday
    expect(period.end.getDay()).toBe(0); // Sunday
    expect(period.start.toDateString()).toBe(new Date(2024, 4, 20).toDateString());
    expect(period.end.toDateString()).toBe(new Date(2024, 4, 26).toDateString());
    expect(period.label).toBe('05/20 - 05/26');
  });

  it('handles a reference date that already falls on Sunday', () => {
    const reference = new Date(2024, 4, 26); // Sunday
    const period = getPeriodRange('week', 0, reference);
    expect(period.start.toDateString()).toBe(new Date(2024, 4, 20).toDateString());
    expect(period.end.toDateString()).toBe(new Date(2024, 4, 26).toDateString());
  });

  it('navigates to the previous week with a negative offset', () => {
    const reference = new Date(2024, 4, 22);
    const period = getPeriodRange('week', -1, reference);
    expect(period.start.toDateString()).toBe(new Date(2024, 4, 13).toDateString());
    expect(period.end.toDateString()).toBe(new Date(2024, 4, 19).toDateString());
  });

  it('clamps a future offset back to the current week', () => {
    const reference = new Date(2024, 4, 22);
    const period = getPeriodRange('week', 3, reference);
    expect(period.start.toDateString()).toBe(new Date(2024, 4, 20).toDateString());
  });
});

describe('getPeriodRange - month', () => {
  it('spans the full calendar month', () => {
    const reference = new Date(2024, 4, 22);
    const period = getPeriodRange('month', 0, reference);
    expect(period.start.toDateString()).toBe(new Date(2024, 4, 1).toDateString());
    expect(period.end.toDateString()).toBe(new Date(2024, 4, 31).toDateString());
    expect(period.label).toBe('2024/05');
  });

  it('navigates to the previous month, including year rollover', () => {
    const reference = new Date(2024, 0, 15); // January
    const period = getPeriodRange('month', -1, reference);
    expect(period.start.toDateString()).toBe(new Date(2023, 11, 1).toDateString());
    expect(period.end.toDateString()).toBe(new Date(2023, 11, 31).toDateString());
  });

  it('handles a leap-year February correctly', () => {
    const reference = new Date(2024, 1, 10); // Feb 2024 is a leap year
    const period = getPeriodRange('month', 0, reference);
    expect(period.end.getDate()).toBe(29);
  });
});

describe('getPeriodRange - all', () => {
  it('has no start/end boundary', () => {
    const period = getPeriodRange('all');
    expect(period.start).toBe(null);
    expect(period.end).toBe(null);
    expect(period.label).toBe('全部');
  });
});

describe('getPreviousPeriodRange', () => {
  it('returns the prior week for a week period', () => {
    const period = getPeriodRange('week', 0, new Date(2024, 4, 22));
    const previous = getPreviousPeriodRange(period);
    expect(previous.start.toDateString()).toBe(new Date(2024, 4, 13).toDateString());
  });

  it('returns the prior month for a month period', () => {
    const period = getPeriodRange('month', 0, new Date(2024, 4, 22));
    const previous = getPreviousPeriodRange(period);
    expect(previous.start.getMonth()).toBe(3); // April
  });

  it('returns null for the all period (no meaningful "previous all")', () => {
    const period = getPeriodRange('all');
    expect(getPreviousPeriodRange(period)).toBe(null);
  });
});

describe('getDaysInRange', () => {
  it('always returns exactly 7 days for a week period, even spanning a month boundary', () => {
    // 2024/05/27(一) ~ 2024/06/02(日)
    const period = getPeriodRange('week', 0, new Date(2024, 4, 30));
    const days = getDaysInRange(period);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe('2024-05-27');
    expect(days[6].date).toBe('2024-06-02');
    expect(days.map((d) => d.dayOfWeek)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });

  it('returns every day of the month for a month period', () => {
    const period = getPeriodRange('month', 0, new Date(2024, 3, 10)); // April has 30 days
    const days = getDaysInRange(period);
    expect(days).toHaveLength(30);
  });

  it('returns an empty array when the period has no boundaries (all)', () => {
    const period = getPeriodRange('all');
    expect(getDaysInRange(period)).toEqual([]);
  });
});

describe('getMonthlyBuckets', () => {
  it('produces one bucket per month from the earliest date to the reference date', () => {
    const earliest = new Date(2024, 1, 15); // Feb
    const reference = new Date(2024, 3, 20); // Apr
    const buckets = getMonthlyBuckets(earliest, reference);
    expect(buckets.map((b) => b.label)).toEqual(['2024/02', '2024/03', '2024/04']);
  });

  it('produces a single bucket for the reference month when there is no earliest date', () => {
    const reference = new Date(2024, 5, 1);
    const buckets = getMonthlyBuckets(null, reference);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].label).toBe('2024/06');
  });
});

describe('isWithinRange', () => {
  it('treats the all period (no boundaries) as always within range', () => {
    const period = getPeriodRange('all');
    expect(isWithinRange(Date.now(), period)).toBe(true);
  });

  it('includes timestamps anywhere within the end day, not just at midnight', () => {
    const period = getPeriodRange('week', 0, new Date(2024, 4, 22));
    const lateOnLastDay = new Date(2024, 4, 26, 23, 59, 59).getTime();
    expect(isWithinRange(lateOnLastDay, period)).toBe(true);
  });

  it('excludes timestamps before the start or after the end', () => {
    const period = getPeriodRange('week', 0, new Date(2024, 4, 22));
    const beforeStart = new Date(2024, 4, 19, 23, 59).getTime();
    const afterEnd = new Date(2024, 4, 27, 0, 0, 1).getTime();
    expect(isWithinRange(beforeStart, period)).toBe(false);
    expect(isWithinRange(afterEnd, period)).toBe(false);
  });
});
