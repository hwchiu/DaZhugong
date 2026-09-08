import { useMemo, useState } from 'react';
import HistoryRecordCard from '../components/HistoryRecordCard.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useTokens } from '../hooks/useTokens.js';
import { confirmAppeal, fileAppeal } from '../services/tokenService.js';
import { useAuthStore } from '../store/authStore.js';
import { categorizeReason, REASON_CATEGORIES } from '../utils/reasonCategories.js';
import { isSpecialTokenReport } from '../utils/specialToken.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入歷史紀錄，請稍後再試。';
const SAFE_APPEAL_ERROR_MESSAGE = '這個操作暫時無法完成，請稍後再試。';
const APPEAL_CONFIRMATIONS_REQUIRED = 3;

// 這次改版的核心：「歷史紀錄」不再是單一個無限捲動的清單，而是Scope→Query→Result→Appeal
// 這4個步驟。SCOPES定義使用者最常用的3種情境，各自對應完全不同的資料範圍/UI，不是同一份
// 清單套3種filter外觀而已：
//   recent3        一鍵近三天：固定近3天，不出現任何查詢表單，開頁就能看，設為預設Scope。
//   all            進階查詢：使用者自訂日期範圍/對象/類型/原因，預設近3天，可以查更久以前的。
//   votedAgainstMe 我被投票：不受3天限制，固定撈「target是自己」的全部歷史，是申訴專區。
const SCOPES = [
  { id: 'recent3', label: '近三天' },
  { id: 'all', label: '全部' },
  { id: 'votedAgainstMe', label: '我被投票' },
];

const TOKEN_TYPE_OPTIONS = [
  { id: 'all', label: '全部' },
  { id: 'normal', label: 'Normal 1x' },
  { id: 'special', label: 'Special 5x' },
];

function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 「近3天」的起始時間：從2天前的00:00:00算起，到現在為止——「全部」scope的日期範圍
// 預設值也是用同一個函式算出來的，確保「近三天」跟「全部(用預設日期)」講的是同一件事，
// 只是一個要不要另外操作表單的差別。
function getRecent3DayStart(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - 2);
  return start;
}

function getDefaultAllScopeFilters() {
  const now = new Date();
  return {
    dateFrom: toDateInputValue(getRecent3DayStart(now)),
    dateTo: toDateInputValue(now),
    targetMemberId: 'all',
    tokenType: 'all',
    reasonCategory: 'all',
  };
}

function formatMemberName(member) {
  return member?.name ?? member?.displayName ?? '未知成員';
}

function MemberLabel({ member }) {
  return (
    <span className="font-semibold text-slate-950">
      {formatMemberName(member)}
      {member?.active === false ? (
        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">歷史成員</span>
      ) : null}
    </span>
  );
}

function formatTimestamp(timestamp) {
  const millis = toMillis(timestamp);
  if (!millis) {
    return '時間稍後同步';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(millis));
}

// Result區塊共用的「共N筆紀錄　依時間排序⇅」這一行，3個Scope都要顯示，維持同一套
// Result語言、不要各自寫一份。
function ResultSummaryBar({ count, sortDirection, onToggleSort, label = '筆紀錄' }) {
  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-sm font-bold text-slate-800">
        共 {count} {label}
      </p>
      <button
        type="button"
        onClick={onToggleSort}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
      >
        依時間排序 <span aria-hidden="true">⇅</span>
        <span className="sr-only">{sortDirection === 'desc' ? '目前最新在前，點擊改成最舊在前' : '目前最舊在前，點擊改成最新在前'}</span>
      </button>
    </div>
  );
}

export default function History() {
  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  // 三個Scope共用同一份「全部歷史」訂閱——「全部」跟「我被投票」都需要撈超過100筆的範圍，
  // 「近三天」則是這份完整資料的子集合，用同一份資料在前端各自篩選，不用切換Scope時
  // 重新建立/拆掉不同的Firestore訂閱(那樣切分頁籤會每次重新loading，體驗很差)。
  const { tokens, loading: tokensLoading, error: tokensError } = useTokens(groupId, 'all');

  const [scope, setScope] = useState('recent3');
  const [sortDirection, setSortDirection] = useState('desc');
  const [draftFilters, setDraftFilters] = useState(() => getDefaultAllScopeFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => getDefaultAllScopeFilters());

  const [pendingReportId, setPendingReportId] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const sortedTokens = useMemo(() => {
    const list = tokens.slice().sort((left, right) => {
      const timeDifference = toMillis(right?.timestamp) - toMillis(left?.timestamp);
      if (timeDifference) return timeDifference;
      return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
    });
    return sortDirection === 'asc' ? list.reverse() : list;
  }, [tokens, sortDirection]);

  const recent3Rows = useMemo(() => {
    const cutoffMs = getRecent3DayStart().getTime();
    return sortedTokens.filter((token) => toMillis(token.timestamp) >= cutoffMs);
  }, [sortedTokens]);

  const votedAgainstMeRows = useMemo(
    () => sortedTokens.filter((token) => token.targetId === currentMember?.id),
    [sortedTokens, currentMember?.id],
  );

  const allScopeRows = useMemo(() => {
    const fromMs = appliedFilters.dateFrom ? new Date(`${appliedFilters.dateFrom}T00:00:00`).getTime() : null;
    const toMs = appliedFilters.dateTo ? new Date(`${appliedFilters.dateTo}T23:59:59.999`).getTime() : null;

    return sortedTokens.filter((token) => {
      const millis = toMillis(token.timestamp);
      if (fromMs !== null && millis < fromMs) return false;
      if (toMs !== null && millis > toMs) return false;
      if (appliedFilters.targetMemberId !== 'all' && token.targetId !== appliedFilters.targetMemberId) return false;
      if (appliedFilters.tokenType === 'normal' && isSpecialTokenReport(token)) return false;
      if (appliedFilters.tokenType === 'special' && !isSpecialTokenReport(token)) return false;
      if (appliedFilters.reasonCategory !== 'all' && categorizeReason(token.reason) !== appliedFilters.reasonCategory) return false;
      return true;
    });
  }, [sortedTokens, appliedFilters]);

  const rows = scope === 'all' ? allScopeRows : scope === 'votedAgainstMe' ? votedAgainstMeRows : recent3Rows;
  const loading = groupLoading || tokensLoading;
  const loadError = groupError || tokensError;

  function updateDraftFilter(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function handleSearch() {
    setAppliedFilters(draftFilters);
  }

  function handleClearFilters() {
    const defaults = getDefaultAllScopeFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
  }

  function toggleSortDirection() {
    setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
  }

  async function handleFileAppeal(token) {
    if (pendingReportId) return;
    setActionError('');
    setPendingReportId(token.id);
    try {
      await fileAppeal({ groupId, reportId: token.id, currentMember });
    } catch {
      setActionError(SAFE_APPEAL_ERROR_MESSAGE);
    } finally {
      setPendingReportId('');
    }
  }

  async function handleConfirmAppeal(token) {
    if (pendingReportId) return;
    setActionError('');
    setPendingReportId(token.id);
    try {
      await confirmAppeal({ groupId, reportId: token.id, currentMember });
    } catch {
      setActionError(SAFE_APPEAL_ERROR_MESSAGE);
    } finally {
      setPendingReportId('');
    }
  }

  function openFileAppealDialog(token) {
    setConfirmDialog({ type: 'file', token });
  }

  function openConfirmAppealDialog(token) {
    setConfirmDialog({ type: 'confirm', token });
  }

  async function handleDialogConfirm() {
    if (!confirmDialog) return;
    const { type, token } = confirmDialog;
    setConfirmDialog(null);
    if (type === 'file') {
      await handleFileAppeal(token);
    } else {
      await handleConfirmAppeal(token);
    }
  }

  function renderRecordList(recordRows, perspective, emptyMessage) {
    if (!recordRows.length) {
      return (
        <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-9 text-center shadow-sm">
          <p className="text-sm leading-6 text-slate-700">{emptyMessage}</p>
        </section>
      );
    }

    return (
      <ol aria-label="已確認 Token 歷史紀錄" className="space-y-3">
        {recordRows.map((token) => (
          <HistoryRecordCard
            key={token.id}
            token={token}
            reporter={membersById.get(token.reporterId)}
            target={membersById.get(token.targetId)}
            currentMember={currentMember}
            perspective={perspective}
            isBusy={pendingReportId === token.id}
            onFileAppeal={openFileAppealDialog}
            onConfirmAppeal={openConfirmAppealDialog}
          />
        ))}
      </ol>
    );
  }

  return (
    <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">DaZhugong</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">歷史紀錄</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">查看所有 Token 記錄，或篩選特定條件。</p>
        </header>

        {/* ---- Scope：3種最常用的情境，不是普通filter ---- */}
        <div role="tablist" aria-label="歷史紀錄範圍" className="grid grid-cols-3 gap-2">
          {SCOPES.map((item) => {
            const active = scope === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setScope(item.id)}
                className={`rounded-2xl px-3 py-3 text-sm font-bold transition ${
                  active ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300' : 'bg-white text-slate-600 shadow-sm shadow-rose-100 hover:bg-rose-50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {actionError ? (
          <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950">
            {actionError}
          </p>
        ) : null}

        {/* ---- Query：只有「全部」這個Scope才有查詢表單，其他兩個Scope不佔畫面 ---- */}
        {scope === 'all' ? (
          <section className="flex flex-col gap-4 rounded-[2rem] bg-white/95 p-5 shadow-lg shadow-rose-100">
            <div>
              <label htmlFor="history-date-from" className="text-sm font-bold text-slate-800">
                日期範圍
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="history-date-from"
                  type="date"
                  value={draftFilters.dateFrom}
                  max={draftFilters.dateTo}
                  onChange={(event) => updateDraftFilter('dateFrom', event.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800"
                />
                <span aria-hidden="true" className="text-slate-400">〜</span>
                <input
                  id="history-date-to"
                  aria-label="日期範圍結束"
                  type="date"
                  value={draftFilters.dateTo}
                  min={draftFilters.dateFrom}
                  onChange={(event) => updateDraftFilter('dateTo', event.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="history-target-member" className="text-sm font-bold text-slate-800">
                  投票對象
                </label>
                <select
                  id="history-target-member"
                  value={draftFilters.targetMemberId}
                  onChange={(event) => updateDraftFilter('targetMemberId', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800"
                >
                  <option value="all">全部成員</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {formatMemberName(member)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="history-token-type" className="text-sm font-bold text-slate-800">
                  Token 類型
                </label>
                <select
                  id="history-token-type"
                  value={draftFilters.tokenType}
                  onChange={(event) => updateDraftFilter('tokenType', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800"
                >
                  {TOKEN_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="history-reason" className="text-sm font-bold text-slate-800">
                原因
              </label>
              <select
                id="history-reason"
                value={draftFilters.reasonCategory}
                onChange={(event) => updateDraftFilter('reasonCategory', event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800"
              >
                <option value="all">全部原因</option>
                {REASON_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClearFilters}
                className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300"
              >
                清除條件
              </button>
              <button
                type="button"
                onClick={handleSearch}
                className="flex-1 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 py-3 text-sm font-bold text-white shadow-md shadow-rose-200 transition hover:brightness-105"
              >
                🔍 搜尋
              </button>
            </div>
          </section>
        ) : null}

        {/* ---- 「我被投票」的說明卡：這是申訴專區，不是普通filter，要先講清楚這裡是什麼 ---- */}
        {scope === 'votedAgainstMe' ? (
          <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5">
            <p className="flex items-center gap-2 text-base font-bold text-rose-800">
              <span aria-hidden="true">👤</span> 我被投票的紀錄
            </p>
            <p className="mt-2 text-sm leading-6 text-rose-900">這些是其他成員投給你的 Token，你可以針對不合理的紀錄提出申訴。</p>
          </section>
        ) : null}

        {/* ---- Result：3個Scope共用同一套「共N筆／排序」呈現方式 ---- */}
        {loading ? (
          <section role="status" aria-live="polite" className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="font-semibold text-slate-950">載入歷史紀錄中…</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">正在同步已確認的 Token。</p>
          </section>
        ) : loadError ? (
          <section role="alert" className="rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-5 text-rose-950">
            <p className="font-semibold">目前無法載入歷史紀錄</p>
            <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
          </section>
        ) : (
          <>
            <ResultSummaryBar
              count={rows.length}
              sortDirection={sortDirection}
              onToggleSort={toggleSortDirection}
              label={scope === 'votedAgainstMe' ? '筆被投票紀錄' : '筆紀錄'}
            />
            {scope === 'all'
              ? renderRecordList(rows, 'general', '找不到符合條件的紀錄，試著調整篩選條件或按「清除條件」。')
              : scope === 'votedAgainstMe'
                ? renderRecordList(rows, 'votedAgainstMe', '目前還沒有其他成員投給你 Token。')
                : renderRecordList(rows, 'general', '最近三天還沒有已確認的 Token。')}
          </>
        )}

        {/* ---- 「我被投票」底部的申訴說明：文字內容對應這個app實際的3人peer confirm機制，
             不是「管理員審核」那種其他系統常見但這裡沒有的流程 ---- */}
        {scope === 'votedAgainstMe' ? (
          <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <span aria-hidden="true">💡</span> 申訴說明
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-6 text-slate-600">
              <li>• 若你認為這筆紀錄不合理，可以點選「申訴」提出申請。</li>
              <li>• 申訴後，需要有其他 {APPEAL_CONFIRMATIONS_REQUIRED} 位成員確認，這筆紀錄才會被移除。</li>
              <li>• 申訴或確認期間，這筆紀錄仍會計入統計，直到真的被移除為止。</li>
            </ul>
          </section>
        ) : null}
      </div>

      {confirmDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4" onClick={() => setConfirmDialog(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={confirmDialog.type === 'file' ? '確認提出申訴' : '確認這筆申訴'}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-slate-950">
              {confirmDialog.type === 'file' ? '確定要提出申訴嗎？' : '確定要確認這筆申訴嗎？'}
            </h2>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm leading-6 text-slate-800">
                <MemberLabel member={membersById.get(confirmDialog.token.reporterId)} />
                <span className="mx-2 text-slate-600">投給</span>
                <MemberLabel member={membersById.get(confirmDialog.token.targetId)} />
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                原因：
                {typeof confirmDialog.token.reason === 'string' && confirmDialog.token.reason.trim()
                  ? confirmDialog.token.reason
                  : '未填寫原因（舊版紀錄）'}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{formatTimestamp(confirmDialog.token.timestamp)}</p>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">
              {confirmDialog.type === 'file'
                ? `送出後，需要有其他 ${APPEAL_CONFIRMATIONS_REQUIRED} 位成員確認，這筆紀錄才會被移除。`
                : `滿 ${APPEAL_CONFIRMATIONS_REQUIRED} 人確認後，這筆紀錄會被移除，此動作無法復原。`}
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDialogConfirm}
                className={`flex-1 rounded-2xl py-3 text-sm font-bold text-white transition ${
                  confirmDialog.type === 'file' ? 'bg-slate-950 hover:bg-slate-800' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
