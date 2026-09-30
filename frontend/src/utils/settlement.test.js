import { describe, expect, it } from 'vitest';
import {
  buildSettlementId,
  buildSettlementMembers,
  buildSettlementPreview,
  formatAmount,
  formatSettlementDisplayId,
  formatTokenValue,
  getSettlementDateKey,
  isSettleableReport,
  TOKEN_UNIT_PRICE,
} from './settlement.js';

const members = [
  { id: 'niuge', name: '牛哥' },
  { id: 'emily', name: 'Emily' },
];

describe('isSettleableReport', () => {
  it('已確認且未結算、無申訴中的紀錄可以進入結算', () => {
    expect(isSettleableReport({ targetId: 'a' })).toBe(true);
  });

  it('已經有settlementId的紀錄不能再被結算', () => {
    expect(isSettleableReport({ targetId: 'a', settlementId: 'S1' })).toBe(false);
  });

  it('申訴中(appealedAt有值)的紀錄不能被結算，避免錢結算了申訴又成功', () => {
    expect(isSettleableReport({ targetId: 'a', appealedAt: { seconds: 1 } })).toBe(false);
  });
});

describe('buildSettlementMembers', () => {
  it('SUM tokenValue而不是COUNT筆數：牛哥 一般x7 + 特殊5x x1 + 自首0.5x x2 = 13', () => {
    const reports = [
      ...Array.from({ length: 7 }, () => ({ targetId: 'niuge', tokenType: 'NORMAL', tokenValue: 1 })),
      { targetId: 'niuge', tokenType: 'SPECIAL_5X', tokenValue: 5 },
      { targetId: 'niuge', tokenType: 'CONFESSION_05X', tokenValue: 0.5 },
      { targetId: 'niuge', tokenType: 'CONFESSION_05X', tokenValue: 0.5 },
    ];

    const [niuge] = buildSettlementMembers(reports, members);
    expect(niuge.normalCount).toBe(7);
    expect(niuge.specialCount).toBe(1);
    expect(niuge.confessionCount).toBe(2);
    expect(niuge.totalTokenValue).toBe(13);
    expect(niuge.amount).toBe(13 * TOKEN_UNIT_PRICE);
  });

  it('已結算或申訴中的紀錄會被排除在結算組成之外', () => {
    const reports = [
      { targetId: 'niuge', tokenType: 'NORMAL', tokenValue: 1 },
      { targetId: 'niuge', tokenType: 'NORMAL', tokenValue: 1, settlementId: 'S1' },
      { targetId: 'niuge', tokenType: 'NORMAL', tokenValue: 1, appealedAt: { seconds: 1 } },
    ];

    const [niuge] = buildSettlementMembers(reports, members);
    expect(niuge.normalCount).toBe(1);
    expect(niuge.totalTokenValue).toBe(1);
  });

  it('依總Token值由高到低排序', () => {
    const reports = [
      { targetId: 'emily', tokenType: 'NORMAL', tokenValue: 1 },
      { targetId: 'niuge', tokenType: 'SPECIAL_5X', tokenValue: 5 },
    ];

    const result = buildSettlementMembers(reports, members);
    expect(result.map((entry) => entry.memberId)).toEqual(['niuge', 'emily']);
  });
});

describe('buildSettlementPreview', () => {
  it('彙總所有成員的總Token與總金額', () => {
    const reports = [
      { targetId: 'niuge', tokenType: 'NORMAL', tokenValue: 1 },
      { targetId: 'emily', tokenType: 'SPECIAL_5X', tokenValue: 5 },
    ];

    const preview = buildSettlementPreview(reports, members);
    expect(preview.totalTokenValue).toBe(6);
    expect(preview.totalAmount).toBe(600);
    expect(preview.tokenUnitPrice).toBe(TOKEN_UNIT_PRICE);
    expect(preview.currency).toBe('TWD');
    expect(preview.members).toHaveLength(2);
  });
});

describe('formatAmount / formatTokenValue', () => {
  it('金額格式化為NT$千分位', () => {
    expect(formatAmount(4850)).toBe('NT$4,850');
  });

  it('Token數值去除多餘的.0，保留有意義的小數', () => {
    expect(formatTokenValue(13)).toBe('13');
    expect(formatTokenValue(48.5)).toBe('48.5');
  });
});

describe('settlement id helpers', () => {
  it('依日期產生YYYYMMDD格式的date key', () => {
    expect(getSettlementDateKey(new Date(2026, 8, 30))).toBe('20260930');
  });

  it('依日期+序號組成settlementId', () => {
    expect(buildSettlementId(new Date(2026, 8, 30), 1)).toBe('20260930-001');
  });

  it('顯示用的settlementId前面加上#', () => {
    expect(formatSettlementDisplayId('20260930-001')).toBe('#20260930-001');
  });
});
