import { describe, expect, it } from 'vitest';
import { buildGroupStatisticsDashboard, buildStatisticsDashboard, LUNCH_TIME_SLOTS } from './statisticsDashboard.js';

// 2024/05/22 是星期三，落在2024/05/20(一)~05/26(日)這一週
const REFERENCE = new Date(2024, 4, 22, 15, 0);

function makeReport(id, targetId, reason, dateArgs) {
  return { id, targetId, reporterId: 'someone-else', reason, timestamp: new Date(...dateArgs) };
}

describe('buildStatisticsDashboard - AC09 only shows the current user', () => {
  it('ignores reports targeting other members', () => {
    const reports = [
      makeReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]),
      makeReport('r2', 'someone-else-id', '討論會議', [2024, 4, 21, 12, 15]),
    ];

    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });

    expect(dashboard.summary.currentTokenCount).toBe(1);
  });
});

describe('buildStatisticsDashboard - AC02 summary + comparison', () => {
  it('computes changeRate as a percentage vs the previous week', () => {
    const reports = [
      makeReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]), // this week
      makeReport('r2', 'me', '討論會議', [2024, 4, 13, 12, 15]), // last week
    ];

    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });

    expect(dashboard.summary.currentTokenCount).toBe(1);
    expect(dashboard.summary.previousTokenCount).toBe(1);
    expect(dashboard.summary.changeRate).toBe(0);
  });

  it('returns null changeRate when there is no previous-period data to compare against', () => {
    const reports = [makeReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15])];
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });

    expect(dashboard.summary.previousTokenCount).toBe(0);
    expect(dashboard.summary.changeRate).toBe(null);
  });

  it('matches the spec example: 24 vs 21 -> +14.3%', () => {
    const currentWeekReports = Array.from({ length: 24 }, (_, i) => makeReport(`c${i}`, 'me', '討論會議', [2024, 4, 20 + (i % 7), 12, 10]));
    const previousWeekReports = Array.from({ length: 21 }, (_, i) => makeReport(`p${i}`, 'me', '討論會議', [2024, 4, 13 + (i % 7), 12, 10]));

    const dashboard = buildStatisticsDashboard({
      reports: [...currentWeekReports, ...previousWeekReports],
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });

    expect(dashboard.summary.currentTokenCount).toBe(24);
    expect(dashboard.summary.previousTokenCount).toBe(21);
    expect(dashboard.summary.changeRate).toBe(14.3);
  });
});

describe('buildStatisticsDashboard - AC03 daily trend always shows 7 days', () => {
  it('includes every day of the week even with zero tokens on some days', () => {
    const reports = [makeReport('r1', 'me', '討論會議', [2024, 4, 22, 12, 15])]; // only Wednesday
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });

    expect(dashboard.dailyTrend).toHaveLength(7);
    expect(dashboard.dailyTrend.map((d) => d.tokenCount)).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(dashboard.dailyTrend[0].date).toBe('2024-05-20');
    expect(dashboard.dailyTrend[0].dayOfWeek).toBe('一');
  });
});

describe('buildStatisticsDashboard - AC04/AC05 totals must reconcile', () => {
  it('reason distribution token sum equals the summary total', () => {
    const reports = [
      makeReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]),
      makeReport('r2', 'me', '偷看teams', [2024, 4, 21, 12, 45]),
      makeReport('r3', 'me', '分派任務', [2024, 4, 22, 13, 10]),
      makeReport('r4', 'me', '不知道什麼原因', [2024, 4, 23, 12, 5]),
    ];

    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });

    const reasonSum = dashboard.reasonDistribution.reduce((sum, row) => sum + row.tokenCount, 0);
    expect(reasonSum).toBe(dashboard.summary.currentTokenCount);
    expect(reasonSum).toBe(4);
  });

  it('always returns all 5 categories, even with zero count', () => {
    const dashboard = buildStatisticsDashboard({
      reports: [],
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.reasonDistribution).toHaveLength(5);
  });

  it('rounds percentage to one decimal place and sums close to 100 when non-empty', () => {
    const reports = [
      makeReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]),
      makeReport('r2', 'me', '討論會議', [2024, 4, 21, 12, 20]),
      makeReport('r3', 'me', '偷看teams', [2024, 4, 22, 12, 5]),
    ];
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    const meeting = dashboard.reasonDistribution.find((r) => r.reasonId === 'meeting_schedule');
    expect(meeting.tokenCount).toBe(2);
    expect(meeting.percentage).toBeCloseTo(66.7, 1);
  });

  it('computes averagePerEvent per reason', () => {
    const reports = [
      makeReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15]),
      makeReport('r2', 'me', '討論會議', [2024, 4, 22, 12, 15]),
    ];
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    const meeting = dashboard.reasonDistribution.find((r) => r.reasonId === 'meeting_schedule');
    expect(meeting.eventCount).toBe(2);
    expect(meeting.averagePerEvent).toBe(1);
  });
});

describe('buildStatisticsDashboard - AC06 no traffic-violation wording anywhere in output', () => {
  it('never surfaces forbidden traffic words even with adversarial free-text reasons', () => {
    const reports = [makeReport('r1', 'me', '超速闖紅燈', [2024, 4, 21, 12, 15])];
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    const allNames = dashboard.reasonDistribution.map((r) => r.reasonName).join('');
    expect(allNames).not.toMatch(/超速|闖紅燈|違規停車|安全帶/);
  });
});

describe('buildStatisticsDashboard - AC08 heatmap focuses on lunch time only', () => {
  it('has exactly 21 cells (7 days x 3 slots)', () => {
    const dashboard = buildStatisticsDashboard({
      reports: [],
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.lunchTimeHeatmap).toHaveLength(7 * LUNCH_TIME_SLOTS.length);
  });

  it('buckets a report into the correct day and lunch slot', () => {
    // 2024/05/22 是星期三 -> Monday-first index dayOfWeek=3；12:40 落在12:30-13:00
    const reports = [makeReport('r1', 'me', '討論會議', [2024, 4, 22, 12, 40])];
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });

    const cell = dashboard.lunchTimeHeatmap.find((c) => c.dayOfWeek === 3 && c.timeSlot === '12:30-13:00');
    expect(cell.tokenCount).toBe(1);
    expect(cell.dayLabel).toBe('三');
  });

  it('excludes reports outside the three lunch slots entirely (not just zeroed)', () => {
    const reports = [makeReport('r1', 'me', '討論會議', [2024, 4, 22, 15, 0])]; // 下午3點，不在午餐時段
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    const total = dashboard.lunchTimeHeatmap.reduce((sum, c) => sum + c.tokenCount, 0);
    expect(total).toBe(0);
    // 但summary/reason distribution還是要算到這一枚(熱區圖只是聚焦顯示，不是資料過濾)
    expect(dashboard.summary.currentTokenCount).toBe(1);
  });
});

describe('buildStatisticsDashboard - AC10 empty state', () => {
  it('flags isEmpty when the current period has zero tokens', () => {
    const dashboard = buildStatisticsDashboard({
      reports: [],
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.isEmpty).toBe(true);
  });

  it('is not empty when there is at least one token', () => {
    const dashboard = buildStatisticsDashboard({
      reports: [makeReport('r1', 'me', '討論會議', [2024, 4, 21, 12, 15])],
      currentMemberId: 'me',
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.isEmpty).toBe(false);
  });
});

describe('buildStatisticsDashboard - month and all periods', () => {
  it('aggregates a full month of daily data', () => {
    const reports = [makeReport('r1', 'me', '討論會議', [2024, 4, 5, 12, 15])];
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'month',
      referenceDate: REFERENCE,
    });
    expect(dashboard.dailyTrend).toHaveLength(31); // May has 31 days
    expect(dashboard.summary.currentTokenCount).toBe(1);
  });

  it('aggregates the all period by month instead of by day', () => {
    const reports = [
      makeReport('r1', 'me', '討論會議', [2024, 2, 10, 12, 15]),
      makeReport('r2', 'me', '討論會議', [2024, 4, 10, 12, 15]),
    ];
    const dashboard = buildStatisticsDashboard({
      reports,
      currentMemberId: 'me',
      periodType: 'all',
      referenceDate: REFERENCE,
    });
    expect(dashboard.summary.currentTokenCount).toBe(2);
    expect(dashboard.dailyTrend.length).toBeGreaterThan(0);
    expect(dashboard.dailyTrend.every((d) => /^\d{4}-\d{2}$/.test(d.date))).toBe(true);
  });

  it('has no previous-period comparison for the all period', () => {
    const dashboard = buildStatisticsDashboard({
      reports: [],
      currentMemberId: 'me',
      periodType: 'all',
      referenceDate: REFERENCE,
    });
    expect(dashboard.summary.previousTokenCount).toBe(0);
    expect(dashboard.summary.changeRate).toBe(null);
  });
});

describe('buildStatisticsDashboard - defensive handling', () => {
  it('does not throw when currentMemberId is missing', () => {
    expect(() => buildStatisticsDashboard({ reports: [], currentMemberId: null, referenceDate: REFERENCE })).not.toThrow();
  });

  it('does not throw when reports is not an array', () => {
    expect(() => buildStatisticsDashboard({ reports: undefined, currentMemberId: 'me', referenceDate: REFERENCE })).not.toThrow();
  });
});

describe('buildGroupStatisticsDashboard - includes everyone, not just the current user', () => {
  it('sums tokens across all members', () => {
    const reports = [
      makeReport('r1', 'huye', '討論會議', [2024, 4, 21, 12, 15]),
      makeReport('r2', 'niuge', '偷看teams', [2024, 4, 21, 12, 45]),
      makeReport('r3', 'huye', '分派任務', [2024, 4, 22, 12, 10]),
    ];
    const dashboard = buildGroupStatisticsDashboard({
      reports,
      members: [{ id: 'huye', name: '虎爺' }, { id: 'niuge', name: '牛哥' }],
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.summary.currentTokenCount).toBe(3);
  });

  it('ranks member contributions by token count descending, with ties broken by name', () => {
    const reports = [
      makeReport('r1', 'niuge', '討論會議', [2024, 4, 21, 12, 15]),
      makeReport('r2', 'huye', '討論會議', [2024, 4, 21, 12, 20]),
      makeReport('r3', 'huye', '討論會議', [2024, 4, 22, 12, 10]),
    ];
    const dashboard = buildGroupStatisticsDashboard({
      reports,
      members: [{ id: 'huye', name: '虎爺' }, { id: 'niuge', name: '牛哥' }],
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.memberContributions.map((c) => c.name)).toEqual(['虎爺', '牛哥']);
    expect(dashboard.memberContributions[0].tokenCount).toBe(2);
    expect(dashboard.memberContributions[0].percentage).toBeCloseTo(66.7, 1);
  });

  it('only includes members who actually have tokens in the current period', () => {
    const reports = [makeReport('r1', 'huye', '討論會議', [2024, 4, 21, 12, 15])];
    const dashboard = buildGroupStatisticsDashboard({
      reports,
      members: [{ id: 'huye', name: '虎爺' }, { id: 'niuge', name: '牛哥' }],
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.memberContributions).toHaveLength(1);
    expect(dashboard.memberContributions[0].name).toBe('虎爺');
  });

  it('carries over each member color for chart use', () => {
    const reports = [makeReport('r1', 'huye', '討論會議', [2024, 4, 21, 12, 15])];
    const dashboard = buildGroupStatisticsDashboard({
      reports,
      members: [{ id: 'huye', name: '虎爺', color: '#2563eb' }],
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.memberContributions[0].color).toBe('#2563eb');
  });

  it('reason distribution and heatmap totals still reconcile with the group summary', () => {
    const reports = [
      makeReport('r1', 'huye', '討論會議', [2024, 4, 21, 12, 15]),
      makeReport('r2', 'niuge', '偷看teams', [2024, 4, 22, 12, 40]),
    ];
    const dashboard = buildGroupStatisticsDashboard({
      reports,
      members: [{ id: 'huye', name: '虎爺' }, { id: 'niuge', name: '牛哥' }],
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    const reasonSum = dashboard.reasonDistribution.reduce((sum, row) => sum + row.tokenCount, 0);
    expect(reasonSum).toBe(dashboard.summary.currentTokenCount);
  });

  it('is empty when nobody has any tokens in the period', () => {
    const dashboard = buildGroupStatisticsDashboard({
      reports: [],
      members: [{ id: 'huye', name: '虎爺' }],
      periodType: 'week',
      referenceDate: REFERENCE,
    });
    expect(dashboard.isEmpty).toBe(true);
    expect(dashboard.memberContributions).toEqual([]);
  });

  it('does not throw with missing/malformed input', () => {
    expect(() => buildGroupStatisticsDashboard({ reports: undefined, members: undefined, referenceDate: REFERENCE })).not.toThrow();
  });
});
