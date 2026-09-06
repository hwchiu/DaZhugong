import { describe, expect, it } from 'vitest';
import {
  buildSpecialTokenSummonMarkerId,
  getTodayDateKey,
  hasSummonedSpecialTokenToday,
  isSpecialTokenReport,
  reportTokenValue,
  SPECIAL_TOKEN_MULTIPLIER,
  SPECIAL_TOKEN_TYPE,
} from './specialToken.js';

describe('reportTokenValue', () => {
  it('舊資料(沒有tokenValue欄位)一律視為1，不影響既有統計', () => {
    expect(reportTokenValue({ targetId: 'a', reporterId: 'b' })).toBe(1);
  });

  it('一般Token的新資料明確標示tokenValue=1', () => {
    expect(reportTokenValue({ tokenValue: 1 })).toBe(1);
  });

  it('特殊Token的tokenValue=5', () => {
    expect(reportTokenValue({ tokenValue: 5 })).toBe(5);
  });

  it('非法/負數/0一律當作1，避免髒資料把統計弄成負的或0', () => {
    expect(reportTokenValue({ tokenValue: 0 })).toBe(1);
    expect(reportTokenValue({ tokenValue: -5 })).toBe(1);
    expect(reportTokenValue({ tokenValue: 'x' })).toBe(1);
    expect(reportTokenValue(null)).toBe(1);
  });
});

describe('isSpecialTokenReport', () => {
  it('tokenType為SPECIAL_5X才算特殊', () => {
    expect(isSpecialTokenReport({ tokenType: SPECIAL_TOKEN_TYPE })).toBe(true);
    expect(isSpecialTokenReport({ tokenType: 'NORMAL' })).toBe(false);
    expect(isSpecialTokenReport({})).toBe(false);
    expect(isSpecialTokenReport(null)).toBe(false);
  });
});

describe('getTodayDateKey', () => {
  it('格式為YYYY-MM-DD', () => {
    expect(getTodayDateKey(new Date(2026, 8, 5))).toBe('2026-09-05');
  });

  it('補零', () => {
    expect(getTodayDateKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('buildSpecialTokenSummonMarkerId', () => {
  it('同一人同一天算出同一個ID(決定性)', () => {
    const id1 = buildSpecialTokenSummonMarkerId('main', 'user-a', '2026-09-05');
    const id2 = buildSpecialTokenSummonMarkerId('main', 'user-a', '2026-09-05');
    expect(id1).toBe(id2);
  });

  it('不同人或不同天算出不同ID', () => {
    const base = buildSpecialTokenSummonMarkerId('main', 'user-a', '2026-09-05');
    expect(buildSpecialTokenSummonMarkerId('main', 'user-b', '2026-09-05')).not.toBe(base);
    expect(buildSpecialTokenSummonMarkerId('main', 'user-a', '2026-09-06')).not.toBe(base);
  });
});

describe('hasSummonedSpecialTokenToday', () => {
  const now = new Date(2026, 8, 5, 15, 0);

  it('今天已有一筆該使用者的特殊token report時回傳true', () => {
    const reports = [
      { reporterId: 'user-a', tokenType: SPECIAL_TOKEN_TYPE, timestamp: new Date(2026, 8, 5, 12, 0) },
    ];
    expect(hasSummonedSpecialTokenToday(reports, 'user-a', now)).toBe(true);
  });

  it('不同使用者的特殊token不算', () => {
    const reports = [
      { reporterId: 'user-b', tokenType: SPECIAL_TOKEN_TYPE, timestamp: new Date(2026, 8, 5, 12, 0) },
    ];
    expect(hasSummonedSpecialTokenToday(reports, 'user-a', now)).toBe(false);
  });

  it('昨天的特殊token不算今天已召喚過', () => {
    const reports = [
      { reporterId: 'user-a', tokenType: SPECIAL_TOKEN_TYPE, timestamp: new Date(2026, 8, 4, 12, 0) },
    ];
    expect(hasSummonedSpecialTokenToday(reports, 'user-a', now)).toBe(false);
  });

  it('一般token(非特殊)不算', () => {
    const reports = [
      { reporterId: 'user-a', tokenType: 'NORMAL', timestamp: new Date(2026, 8, 5, 12, 0) },
    ];
    expect(hasSummonedSpecialTokenToday(reports, 'user-a', now)).toBe(false);
  });

  it('支援Firestore Timestamp物件(有toMillis())', () => {
    const reports = [
      {
        reporterId: 'user-a',
        tokenType: SPECIAL_TOKEN_TYPE,
        timestamp: { toMillis: () => new Date(2026, 8, 5, 9, 0).getTime() },
      },
    ];
    expect(hasSummonedSpecialTokenToday(reports, 'user-a', now)).toBe(true);
  });

  it('空陣列或缺少reporterId回傳false', () => {
    expect(hasSummonedSpecialTokenToday([], 'user-a', now)).toBe(false);
    expect(hasSummonedSpecialTokenToday(null, 'user-a', now)).toBe(false);
    expect(hasSummonedSpecialTokenToday([{ reporterId: 'user-a' }], null, now)).toBe(false);
  });
});

describe('常數對應spec的Server Config', () => {
  it('倍率為5', () => {
    expect(SPECIAL_TOKEN_MULTIPLIER).toBe(5);
  });
});
