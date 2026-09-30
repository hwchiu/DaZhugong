import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentMember: { id: 'niu', name: '牛哥', active: true },
  groupId: 'main',
}));
const useGroupMock = vi.hoisted(() => vi.fn());
const useTokensMock = vi.hoisted(() => vi.fn());
const useSettlementsMock = vi.hoisted(() => vi.fn());
const createSettlementMock = vi.hoisted(() => vi.fn());
const resetSettlementMock = vi.hoisted(() => vi.fn());
const downloadSettlementReportImageMock = vi.hoisted(() => vi.fn());

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../hooks/useGroup.js', () => ({
  useGroup: useGroupMock,
  default: useGroupMock,
}));

vi.mock('../hooks/useTokens.js', () => ({
  useTokens: useTokensMock,
  default: useTokensMock,
}));

vi.mock('../hooks/useSettlements.js', () => ({
  useSettlements: useSettlementsMock,
  default: useSettlementsMock,
}));

vi.mock('../services/settlementService.js', () => ({
  createSettlement: createSettlementMock,
  resetSettlement: resetSettlementMock,
}));

vi.mock('../utils/settlementReport.js', async () => {
  const actual = await vi.importActual('../utils/settlementReport.js');
  return {
    ...actual,
    downloadSettlementReportImage: downloadSettlementReportImageMock,
  };
});

import Settlement from './Settlement.jsx';

afterEach(cleanup);

const members = [
  { id: 'niu', name: '牛哥', active: true, totalTokens: 13 },
  { id: 'emily', name: 'Emily', active: true, totalTokens: 10.5 },
];

function buildReport(overrides = {}) {
  return {
    id: 'r1',
    reporterId: 'emily',
    targetId: 'niu',
    tokenType: 'NORMAL',
    tokenValue: 1,
    timestamp: { seconds: Date.UTC(2026, 7, 15) / 1000, nanoseconds: 0 },
    reason: '討論會議',
    ...overrides,
  };
}

function renderSettlement(initialPath = '/settings/settlement') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/settings/settlement" element={<Settlement />} />
        <Route path="/settings" element={<div>設定頁</div>} />
        <Route path="/history" element={<div>歷史頁</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.currentMember = { id: 'niu', name: '牛哥', active: true };
  useGroupMock.mockReset();
  useGroupMock.mockReturnValue({ members, loading: false, error: null });
  useTokensMock.mockReset();
  useTokensMock.mockReturnValue({
    tokens: [
      buildReport({ id: 'r1', targetId: 'niu', tokenValue: 13, reason: '牛哥被投' }),
      buildReport({ id: 'r2', targetId: 'emily', tokenValue: 10.5, reason: 'emily被投' }),
    ],
    loading: false,
    error: null,
  });
  useSettlementsMock.mockReset();
  useSettlementsMock.mockReturnValue({ settlements: [], loading: false, error: null });
  createSettlementMock.mockReset();
  resetSettlementMock.mockReset();
  downloadSettlementReportImageMock.mockReset();
});

describe('Settlement preview', () => {
  it('shows the summary card and per-member breakdown, with 兌換 disabled state reflecting the amount', () => {
    renderSettlement();

    expect(screen.getByText('豬公結算')).toBeTruthy();
    expect(screen.getAllByText('23.5 Token')[0]).toBeTruthy();
    expect(screen.getByRole('button', { name: /兌換 NT\$2,350/ })).toBeTruthy();

    const list = screen.getByRole('list', { name: '本期成員結算' });
    expect(within(list).getByText('牛哥')).toBeTruthy();
    expect(within(list).getByText('Emily')).toBeTruthy();
  });

  it('expands a member row to show the token type breakdown', async () => {
    const user = userEvent.setup();
    renderSettlement();

    await user.click(screen.getByRole('button', { name: /牛哥/ }));
    expect(screen.getByText((_, element) => element?.textContent === '1 × NT$100')).toBeTruthy();
  });

  it('navigates back to /settings when 取消 is clicked without creating a settlement', async () => {
    const user = userEvent.setup();
    renderSettlement();

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(await screen.findByText('設定頁')).toBeTruthy();
    expect(createSettlementMock).not.toHaveBeenCalled();
  });

  it('requires confirmation before redeeming, then shows the completion screen after confirming', async () => {
    const user = userEvent.setup();
    createSettlementMock.mockResolvedValue({
      settlementId: '20260930-001',
      preview: { totalTokenValue: 23.5, totalAmount: 2350, currency: 'TWD', tokenUnitPrice: 100, members: [] },
    });

    renderSettlement();

    await user.click(screen.getByRole('button', { name: /兌換 NT\$2,350/ }));
    const dialog = screen.getByRole('dialog', { name: '確認兌換' });
    expect(within(dialog).getByText(/本次將結算 23.5 Token，共 NT\$2,350/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: '確認兌換' }));

    await waitFor(() => expect(createSettlementMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('本期結算完成！')).toBeTruthy();
    expect(screen.getByText('Settlement #20260930-001')).toBeTruthy();
  });
});

describe('Settlement completion screen', () => {
  it('shows an unresolved SETTLED settlement directly (e.g. after navigating away and back) with download and reset actions', () => {
    useSettlementsMock.mockReturnValue({
      settlements: [
        {
          id: '20260930-001',
          status: 'SETTLED',
          totalTokenValue: 23.5,
          totalAmount: 2350,
          currency: 'TWD',
          tokenUnitPrice: 100,
          members: [],
        },
      ],
      loading: false,
      error: null,
    });

    renderSettlement();

    expect(screen.getByText('本期結算完成！')).toBeTruthy();
    expect(screen.getByRole('button', { name: /下載結算 Report/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /重新 Reset 豬公/ })).toBeTruthy();
  });

  it('downloads the report snapshot when 下載結算 Report is clicked', async () => {
    const user = userEvent.setup();
    const settlement = {
      id: '20260930-001',
      status: 'SETTLED',
      totalTokenValue: 23.5,
      totalAmount: 2350,
      currency: 'TWD',
      tokenUnitPrice: 100,
      members: [],
    };
    useSettlementsMock.mockReturnValue({ settlements: [settlement], loading: false, error: null });

    renderSettlement();
    await user.click(screen.getByRole('button', { name: /下載結算 Report/ }));

    expect(downloadSettlementReportImageMock).toHaveBeenCalledWith(expect.objectContaining({ id: '20260930-001' }));
  });

  it('requires a confirmation dialog before resetting, then calls resetSettlement and navigates to /settings', async () => {
    const user = userEvent.setup();
    resetSettlementMock.mockResolvedValue(undefined);
    useSettlementsMock.mockReturnValue({
      settlements: [
        {
          id: '20260930-001',
          status: 'SETTLED',
          totalTokenValue: 23.5,
          totalAmount: 2350,
          currency: 'TWD',
          tokenUnitPrice: 100,
          members: [],
        },
      ],
      loading: false,
      error: null,
    });

    renderSettlement();

    await user.click(screen.getByRole('button', { name: /重新 Reset 豬公/ }));
    const dialog = screen.getByRole('dialog', { name: '確認 Reset 豬公' });
    expect(within(dialog).getByText(/確定重新開始新的豬公嗎/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: '確認 Reset' }));

    await waitFor(() => expect(resetSettlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'main', settlementId: '20260930-001' }),
    ));
    expect(await screen.findByText('設定頁')).toBeTruthy();
  });
});

describe('Settlement report viewed from History', () => {
  it('shows a read-only report for a past settlement id from the query string, without redeem/reset actions', () => {
    useSettlementsMock.mockReturnValue({
      settlements: [
        {
          id: '20260918-001',
          status: 'RESET',
          totalTokenValue: 5,
          totalAmount: 500,
          currency: 'TWD',
          tokenUnitPrice: 100,
          members: [{ memberId: 'niu', memberName: '牛哥', normalCount: 5, specialCount: 0, confessionCount: 0, totalTokenValue: 5, amount: 500 }],
        },
      ],
      loading: false,
      error: null,
    });

    renderSettlement('/settings/settlement?settlementId=20260918-001');

    expect(screen.getByText(/結算報告 #20260918-001/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /兌換/ })).toBe(null);
    expect(screen.queryByRole('button', { name: /重新 Reset 豬公/ })).toBe(null);
  });

  it('shows a not-found message when the settlement id from the query string does not exist', () => {
    renderSettlement('/settings/settlement?settlementId=missing');
    expect(screen.getByText('找不到這筆結算報告')).toBeTruthy();
  });
});
