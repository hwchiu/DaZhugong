import { describe, expect, it } from 'vitest';
import { REASON_CATEGORIES, categorizeReason, getReasonCategory } from './reasonCategories.js';

describe('categorizeReason', () => {
  it("maps the 4 existing Vote.jsx presets to a sensible category", () => {
    expect(categorizeReason('偷看teams')).toBe('reply_message');
    expect(categorizeReason('討論會議')).toBe('meeting_schedule');
    expect(categorizeReason('分派任務')).toBe('work_project');
    expect(categorizeReason('詢問進度')).toBe('handoff_progress');
  });

  it('is case-insensitive for English keywords', () => {
    expect(categorizeReason('checking Teams messages')).toBe('reply_message');
    expect(categorizeReason('urgent EMAIL reply')).toBe('reply_message');
  });

  it('falls back to other for unmatched free text', () => {
    expect(categorizeReason('聊八卦')).toBe('other');
    expect(categorizeReason('')).toBe('other');
    expect(categorizeReason(undefined)).toBe('other');
    expect(categorizeReason(null)).toBe('other');
  });

  it('matches keywords for custom free-text reasons beyond the 4 presets', () => {
    expect(categorizeReason('討論新專案的需求')).toBe('work_project');
    expect(categorizeReason('回客戶的信')).toBe('reply_message');
    expect(categorizeReason('安排下週開會時間')).toBe('meeting_schedule');
    expect(categorizeReason('交接離職同事的工作')).toBe('handoff_progress');
  });

  it('is not confused by non-string input', () => {
    expect(categorizeReason(123)).toBe('other');
    expect(categorizeReason({})).toBe('other');
  });
});

describe('REASON_CATEGORIES', () => {
  it('has exactly the 5 categories defined in the spec, in order', () => {
    expect(REASON_CATEGORIES.map((c) => c.id)).toEqual([
      'work_project',
      'reply_message',
      'meeting_schedule',
      'handoff_progress',
      'other',
    ]);
    expect(REASON_CATEGORIES.map((c) => c.name)).toEqual([
      '討論工作專案',
      '回覆訊息 / 郵件',
      '安排會議 / 行程',
      '交接工作 / 進度',
      '其他',
    ]);
  });

  it('gives every category a distinct color', () => {
    const colors = REASON_CATEGORIES.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('never contains traffic-violation wording (AC06)', () => {
    const forbidden = ['超速', '闖紅燈', '違規停車', '安全帶'];
    const allText = REASON_CATEGORIES.map((c) => c.name).join('');
    for (const word of forbidden) {
      expect(allText).not.toContain(word);
    }
  });
});

describe('getReasonCategory', () => {
  it('returns the matching category by id', () => {
    expect(getReasonCategory('work_project').name).toBe('討論工作專案');
  });

  it('falls back to "other" for an unknown id', () => {
    expect(getReasonCategory('not-a-real-id').id).toBe('other');
  });
});
