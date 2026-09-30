import { describe, expect, it } from 'vitest';
import { buildSettlementReportLines, getSettlementReportFilename } from './settlementReport.js';

function buildSettlement(overrides = {}) {
  return {
    id: '20260930-001',
    periodStart: { seconds: Date.UTC(2026, 7, 1) / 1000, nanoseconds: 0 },
    periodEnd: { seconds: Date.UTC(2026, 8, 30) / 1000, nanoseconds: 0 },
    tokenUnitPrice: 100,
    currency: 'TWD',
    totalTokenValue: 48.5,
    totalAmount: 4850,
    members: [
      { memberName: '牛哥', totalTokenValue: 13, amount: 1300 },
      { memberName: 'Emily', totalTokenValue: 10.5, amount: 1050 },
    ],
    ...overrides,
  };
}

describe('buildSettlementReportLines', () => {
  it('formats the period, member rows, totals, and settlement id from a settlement snapshot', () => {
    const lines = buildSettlementReportLines(buildSettlement());

    expect(lines.period).toBe('2026/08/01 – 2026/09/30');
    expect(lines.members).toEqual([
      { name: '牛哥', tokenLabel: '13 Token', amountLabel: 'NT$1,300' },
      { name: 'Emily', tokenLabel: '10.5 Token', amountLabel: 'NT$1,050' },
    ]);
    expect(lines.totalTokenLabel).toBe('48.5 Token');
    expect(lines.totalAmountLabel).toBe('NT$4,850');
    expect(lines.unitPriceLabel).toBe('1 Token = NT$100');
    expect(lines.settlementIdLabel).toBe('#20260930-001');
    expect(lines.priceLegend).toEqual([
      '一般 Token\u3000\u3000100 元',
      '特殊 Token\u3000\u3000500 元',
      '自首 Token\u3000\u300050 元',
    ]);
  });

  it('omits the period line when timestamps are missing', () => {
    const lines = buildSettlementReportLines(buildSettlement({ periodStart: null, periodEnd: null }));
    expect(lines.period).toBe(null);
  });

  it('handles a settlement with no members', () => {
    const lines = buildSettlementReportLines(buildSettlement({ members: [], totalTokenValue: 0, totalAmount: 0 }));
    expect(lines.members).toEqual([]);
    expect(lines.totalTokenLabel).toBe('0 Token');
    expect(lines.totalAmountLabel).toBe('NT$0');
  });
});

describe('getSettlementReportFilename', () => {
  it('derives the filename from the date prefix of the settlement id', () => {
    expect(getSettlementReportFilename({ id: '20260930-001' })).toBe('DaZhugong_Settlement_20260930.png');
  });

  it('falls back to a safe default when the settlement id is missing', () => {
    expect(getSettlementReportFilename({})).toBe('DaZhugong_Settlement_00000000.png');
  });
});
