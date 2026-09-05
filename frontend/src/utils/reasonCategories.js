// 這支app實際的違規原因是Vote.jsx裡使用者自己填的自由文字(或選一個快速選項：
// 偷看teams / 討論會議 / 分派任務 / 詢問進度)，不是統計規格文件裡定義的5個固定分類。
// 這裡是我自己做的「關鍵字對應」決定，把既有的自由文字歸類進規格要求的5類，
// 這是一個詮釋選擇、不是規格文件本身定義的，之後如果實際使用情況跟預期分類差很多，
// 這份關鍵字表是唯一需要調整的地方。

export const REASON_CATEGORIES = [
  { id: 'work_project', name: '討論工作專案', color: '#ec4899' },
  { id: 'reply_message', name: '回覆訊息 / 郵件', color: '#3b82f6' },
  { id: 'meeting_schedule', name: '安排會議 / 行程', color: '#22c55e' },
  { id: 'handoff_progress', name: '交接工作 / 進度', color: '#f97316' },
  { id: 'other', name: '其他', color: '#8b5cf6' },
];

const REASON_CATEGORY_BY_ID = new Map(REASON_CATEGORIES.map((category) => [category.id, category]));

// 依序比對，符合第一個命中的關鍵字就歸類，找不到任何關鍵字歸進「其他」。
// 對應到目前Vote.jsx既有的4個快速選項：
//   偷看teams   -> reply_message (teams是通訊軟體，歸類成查看訊息)
//   討論會議    -> meeting_schedule (直接對應)
//   分派任務    -> work_project (指派/討論任務屬於專案工作討論)
//   詢問進度    -> handoff_progress (進度/交接類)
const KEYWORD_RULES = [
  { id: 'reply_message', keywords: ['teams', 'mail', '信', '訊息', '郵件', 'email', '簡訊', 'line', 'slack'] },
  { id: 'meeting_schedule', keywords: ['會議', '開會', '行程', '約時間', '排會', 'meeting'] },
  { id: 'handoff_progress', keywords: ['進度', '交接', '狀態', 'status', 'update', '回報'] },
  { id: 'work_project', keywords: ['任務', '專案', 'project', 'task', '需求', '開發', '指派', '分派'] },
];

export function categorizeReason(reasonText) {
  const text = typeof reasonText === 'string' ? reasonText.trim().toLowerCase() : '';

  if (text) {
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
        return rule.id;
      }
    }
  }

  return 'other';
}

export function getReasonCategory(id) {
  return REASON_CATEGORY_BY_ID.get(id) ?? REASON_CATEGORY_BY_ID.get('other');
}
