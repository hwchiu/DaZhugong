import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { useGroup } from '../hooks/useGroup.js';
import { useMemories } from '../hooks/useMemories.js';
import { useSettlements } from '../hooks/useSettlements.js';
import { useTokens } from '../hooks/useTokens.js';
import { createSettlement, resetSettlement } from '../services/settlementService.js';
import { createMemoryFromSettlement } from '../services/memoryService.js';
import { useAuthStore } from '../store/authStore.js';
import {
  buildSettlementPreview,
  formatAmount,
  formatSettlementDisplayId,
  formatTokenValue,
  isSettleableReport,
} from '../utils/settlement.js';
import { downloadSettlementReportImage, formatReportDate } from '../utils/settlementReport.js';

const SAFE_LOAD_ERROR_MESSAGE = '目前無法載入結算資料，請稍後再試。';
const SAFE_ACTION_ERROR_MESSAGE = '這個操作暫時無法完成，請稍後再試。';

function formatCreatedAt(timestamp) {
  if (!timestamp) return '';
  const millis = typeof timestamp.toMillis === 'function'
    ? timestamp.toMillis()
    : typeof timestamp.seconds === 'number'
      ? timestamp.seconds * 1000
      : null;
  if (!millis) return '';
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(millis));
}

// 每位成員的展開明細(spec section 6)：把一般/特殊/自首三種桶子拆開列出，
// 讓使用者看得到「為什麼我要付這個金額」的組成，而不是只看到一個總數。
// 這裡的unitPrice是「每一筆該類型Token換算成的金額」(spec section 2的Token Value表：
// Normal=NT$100、Special 5x=NT$500、自首0.5x=NT$50)，count是這個類型的Token筆數，
// 兩者相乘就是這個類型的小計金額，不需要額外的tokenValue換算。
function MemberDetailRows({ member }) {
  const rows = [
    { key: 'normal', label: '一般 Token', unitPrice: 100, count: member.normalCount },
    { key: 'special', label: '特殊 Token', unitPrice: 500, count: member.specialCount },
    { key: 'confession', label: '自首 Token', unitPrice: 50, count: member.confessionCount },
  ].filter((row) => row.count > 0);

  if (!rows.length) {
    return <p className="mt-3 text-sm text-slate-600">沒有可結算的 Token 組成。</p>;
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between text-sm">
          <span className="text-slate-700">
            {row.label}
            <span className="ml-2 text-xs text-slate-500">
              {row.count} × NT${row.unitPrice}
            </span>
          </span>
          <span className="font-bold tabular-nums text-slate-950">{formatAmount(row.count * row.unitPrice)}</span>
        </div>
      ))}
    </div>
  );
}

function MemberSettlementRow({ member, expanded, onToggle }) {
  return (
    <li className="rounded-[1.5rem] border border-slate-200 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 text-left"
      >
        <MemberAvatar member={{ id: member.memberId, name: member.memberName }} size="sm" />
        <span className="min-w-0 flex-1 truncate font-bold text-slate-950">{member.memberName}</span>
        <span className="shrink-0 text-right">
          <span className="block text-xs font-semibold text-slate-500">{formatTokenValue(member.totalTokenValue)} Token</span>
          <span className="block text-lg font-black tabular-nums text-rose-700">{formatAmount(member.amount)}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-slate-400">{expanded ? '⌃' : '⌄'}</span>
      </button>
      {expanded ? <MemberDetailRows member={member} /> : null}
    </li>
  );
}

export default function Settlement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewSettlementId = searchParams.get('settlementId');

  const currentMember = useAuthStore((state) => state.currentMember);
  const groupId = useAuthStore((state) => state.groupId);
  const { members, loading: groupLoading, error: groupError } = useGroup(groupId);
  const { tokens: reports, loading: reportsLoading, error: reportsError } = useTokens(groupId, 'all');
  const { settlements, loading: settlementsLoading, error: settlementsError } = useSettlements(groupId);
  const { memories } = useMemories(groupId);

  const [expandedMemberId, setExpandedMemberId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [redeemPending, setRedeemPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [redeemedSettlement, setRedeemedSettlement] = useState(null);

  const settleableReports = useMemo(() => reports.filter(isSettleableReport), [reports]);
  const preview = useMemo(() => buildSettlementPreview(settleableReports, members), [settleableReports, members]);

  // 如果之前已經有一筆結算完成、但使用者還沒按下「重新Reset豬公」，重新整理/離開再回來
  // 都應該直接看到完成畫面，而不是又跑一次Preview(spec section 13：兌換跟Reset是
  // 兩個獨立動作，中間狀態要能被還原)。
  const unresolvedSettlement = useMemo(
    () => settlements.find((settlement) => settlement.status === 'SETTLED') ?? null,
    [settlements],
  );

  const viewedSettlement = useMemo(
    () => (viewSettlementId ? settlements.find((settlement) => settlement.id === viewSettlementId) ?? null : null),
    [settlements, viewSettlementId],
  );

  const loading = groupLoading || reportsLoading || settlementsLoading;
  const loadError = groupError || reportsError || settlementsError;

  async function handleRedeem() {
    if (redeemPending) return;
    setActionError('');
    setRedeemPending(true);
    try {
      const { settlementId, preview: createdPreview } = await createSettlement({
        groupId,
        currentMember,
        members,
        reports: settleableReports,
        settlements,
      });
      setConfirmOpen(false);
      setRedeemedSettlement({
        id: settlementId,
        ...createdPreview,
        createdBy: currentMember?.id,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      });

      // 兌換成功就建立Memory Draft(spec section 9/10)：不是Reset才建立，因為Settlement
      // 本身已經是正式的immutable snapshot。這裡刻意不讓Memory建立失敗擋住兌換完成畫面——
      // 使用者仍然可以之後從History/Memories首頁補建立(createMemoryFromSettlement本身
      // 是idempotent的，稍後打開/memories時仍會需要這篇Memory，先靜默失敗即可)。
      try {
        await createMemoryFromSettlement({ groupId, settlement: { id: settlementId, ...createdPreview }, currentMember, members, memories });
      } catch {
        // 靜默失敗：不影響兌換本身已經完成的事實，之後補建立即可。
      }
    } catch {
      setActionError(SAFE_ACTION_ERROR_MESSAGE);
    } finally {
      setRedeemPending(false);
    }
  }

  async function handleReset(settlementId) {
    if (resetPending || !settlementId) return;
    setActionError('');
    setResetPending(true);
    try {
      await resetSettlement({ groupId, settlementId, currentMember });
      setResetConfirmOpen(false);
      setRedeemedSettlement(null);
      navigate('/settings');
    } catch {
      setActionError(SAFE_ACTION_ERROR_MESSAGE);
    } finally {
      setResetPending(false);
    }
  }

  function toggleMember(memberId) {
    setExpandedMemberId((current) => (current === memberId ? '' : memberId));
  }

  // ---- 讀取模式：從History點進來查看某一期已完成的Settlement Report ----
  if (viewSettlementId) {
    if (settlementsLoading) {
      return (
        <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
          <div role="status" aria-live="polite" className="mx-auto mt-8 w-full max-w-md rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
            <p className="font-semibold text-slate-950">載入結算報告中…</p>
          </div>
        </section>
      );
    }

    if (!viewedSettlement) {
      return (
        <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
          <div className="mx-auto mt-8 w-full max-w-md rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-8 text-center text-rose-950">
            <p className="font-semibold">找不到這筆結算報告</p>
            <Link to="/history" className="mt-4 inline-block text-sm font-bold text-rose-800 underline">
              返回歷史紀錄
            </Link>
          </div>
        </section>
      );
    }

    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">DaZhugong</p>
            <h1 className="mt-3 text-2xl font-black text-slate-950">結算報告 {formatSettlementDisplayId(viewedSettlement.id)}</h1>
            {viewedSettlement.periodStart && viewedSettlement.periodEnd ? (
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {formatReportDate(viewedSettlement.periodStart)} – {formatReportDate(viewedSettlement.periodEnd)}
              </p>
            ) : null}
          </header>

          <SettlementSummary settlement={viewedSettlement} />

          <ul aria-label="本期成員結算" className="space-y-3">
            {(viewedSettlement.members ?? []).map((member) => (
              <MemberSettlementRow
                key={member.memberId}
                member={member}
                expanded={expandedMemberId === member.memberId}
                onToggle={() => toggleMember(member.memberId)}
              />
            ))}
          </ul>

          <button
            type="button"
            onClick={() => downloadSettlementReportImage(viewedSettlement)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-base font-bold text-white transition hover:bg-slate-800"
          >
            <span aria-hidden="true">📄</span> 下載結算 Report
          </button>

          <Link to="/history" className="text-center text-sm font-bold text-rose-800 underline">
            返回歷史紀錄
          </Link>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div role="status" aria-live="polite" className="mx-auto mt-8 w-full max-w-md rounded-[2rem] bg-white px-6 py-8 text-center shadow-lg shadow-rose-100">
          <p className="font-semibold text-slate-950">載入結算資料中…</p>
          <p className="mt-2 text-sm text-slate-700">正在同步豬公與 Token 資料。</p>
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div role="alert" className="mx-auto mt-8 w-full max-w-md rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-5 text-rose-950">
          <p className="font-semibold">目前無法載入結算資料</p>
          <p className="mt-2 text-sm leading-6">{SAFE_LOAD_ERROR_MESSAGE}</p>
        </div>
      </section>
    );
  }

  // ---- 完成畫面(spec section 10)：redeem剛完成、或之前redeem過還沒按Reset ----
  const completedSettlement = redeemedSettlement ?? unresolvedSettlement;
  if (completedSettlement) {
    return (
      <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <div className="rounded-[2rem] bg-white/95 p-8 text-center shadow-lg shadow-rose-100">
            <p className="text-4xl">🎉</p>
            <h1 className="mt-3 text-2xl font-black text-slate-950">本期結算完成！</h1>
            <p className="mt-4 text-3xl font-black tabular-nums text-slate-950">{formatTokenValue(completedSettlement.totalTokenValue)} Token</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-rose-700">{formatAmount(completedSettlement.totalAmount)}</p>
            <p className="mt-4 text-sm font-bold text-slate-700">Settlement {formatSettlementDisplayId(completedSettlement.id)}</p>
            {formatCreatedAt(completedSettlement.createdAt) ? (
              <p className="mt-1 text-xs text-slate-500">{formatCreatedAt(completedSettlement.createdAt)}</p>
            ) : null}
          </div>

          {actionError ? (
            <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950">
              {actionError}
            </p>
          ) : null}

          <Link
            to={`/memories/${completedSettlement.id}/edit`}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-700 px-4 py-3 text-base font-bold text-white transition hover:bg-rose-800"
          >
            ❤️ 建立這次的回憶
          </Link>

          <button
            type="button"
            onClick={() => downloadSettlementReportImage(completedSettlement)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-base font-bold text-white transition hover:bg-slate-800"
          >
            <span aria-hidden="true">📄</span> 下載結算 Report
          </button>

          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-800 bg-white px-4 py-3 text-base font-bold text-rose-900 transition hover:bg-rose-50"
          >
            <span aria-hidden="true">🐷</span> 重新 Reset 豬公
          </button>
        </div>

        {resetConfirmOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 px-4" onClick={() => setResetConfirmOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="確認 Reset 豬公"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
            >
              <h2 className="text-lg font-bold text-slate-950">確定重新開始新的豬公嗎？</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                本期 {formatTokenValue(completedSettlement.totalTokenValue)} Token 已完成結算。
                <br />
                Reset 後首頁豬公將從 0 Token 重新開始。
                <br />
                過去紀錄仍會完整保留。
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(false)}
                  className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={resetPending}
                  onClick={() => handleReset(completedSettlement.id)}
                  className="flex-1 rounded-2xl bg-rose-700 py-3 text-sm font-bold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resetPending ? '處理中…' : '確認 Reset'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  // ---- Preview畫面(spec section 4-9) ----
  return (
    <section className="app-page bg-gradient-to-b from-[var(--brand-bg)] via-white to-[var(--brand-bg)] px-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[2rem] bg-white/95 p-6 shadow-lg shadow-rose-100">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-700">DaZhugong</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">豬公結算</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">將目前累積的 Token 換算成應繳金額</p>
        </header>

        <SettlementSummary settlement={preview} />

        {actionError ? (
          <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950">
            {actionError}
          </p>
        ) : null}

        <section className="rounded-[2rem] bg-white p-5 shadow-lg shadow-rose-100">
          <h2 className="text-lg font-bold text-slate-950">本期成員結算</h2>
          {preview.members.length ? (
            <ul aria-label="本期成員結算" className="mt-4 space-y-3">
              {preview.members.map((member) => (
                <MemberSettlementRow
                  key={member.memberId}
                  member={member}
                  expanded={expandedMemberId === member.memberId}
                  onToggle={() => toggleMember(member.memberId)}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-700">目前沒有可結算的 Token。</p>
          )}
        </section>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!preview.members.length}
            onClick={() => setConfirmOpen(true)}
            className="flex-1 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 py-3 text-sm font-bold text-white shadow-md shadow-rose-200 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">💰</span> 兌換 {formatAmount(preview.totalAmount)}
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 px-4" onClick={() => setConfirmOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="確認兌換"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-slate-950">確定要進行本期結算嗎？</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              本次將結算 {formatTokenValue(preview.totalTokenValue)} Token，共 {formatAmount(preview.totalAmount)}。
              <br />
              結算完成後將產生正式 Report。
              <br />
              本期 Token 將被標記為「已結算」，之後無法再進行申訴或確認。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300"
              >
                返回
              </button>
              <button
                type="button"
                disabled={redeemPending}
                onClick={handleRedeem}
                className="flex-1 rounded-2xl bg-rose-700 py-3 text-sm font-bold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {redeemPending ? '處理中…' : '確認兌換'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SettlementSummary({ settlement }) {
  return (
    <section className="rounded-[2rem] bg-slate-950 p-6 text-center text-white shadow-lg shadow-slate-300">
      <p className="text-3xl">🐷</p>
      <p className="mt-3 text-sm font-semibold uppercase tracking-[0.24em] text-rose-200">本期累積</p>
      <p className="mt-1 text-3xl font-black tabular-nums">{formatTokenValue(settlement.totalTokenValue)} Token</p>
      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.24em] text-rose-200">預計兌換</p>
      <p className="mt-1 text-3xl font-black tabular-nums">{formatAmount(settlement.totalAmount, settlement.currency)}</p>
      {settlement.periodStart && settlement.periodEnd ? (
        <p className="mt-3 text-xs text-slate-300">
          {formatReportDate(settlement.periodStart)} ～ {formatReportDate(settlement.periodEnd)}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-400">1 Token = {formatAmount(settlement.tokenUnitPrice ?? 100, settlement.currency)}</p>
    </section>
  );
}
