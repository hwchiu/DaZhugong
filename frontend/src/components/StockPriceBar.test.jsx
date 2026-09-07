import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StockPriceBar from './StockPriceBar.jsx';

afterEach(() => {
  cleanup();
});

describe('StockPriceBar', () => {
  it('shows a loading message before the first quote arrives', () => {
    render(<StockPriceBar quote={null} quoteFailed={false} autoRefreshStopped={false} glass />);

    expect(screen.getByText('台積電股價讀取中…')).toBeTruthy();
  });

  it('shows the latest price with two decimal places while auto-refresh is still active', () => {
    render(
      <StockPriceBar
        quote={{ price: 1055, isLastTradePrice: true, stockName: '台積電' }}
        quoteFailed={false}
        autoRefreshStopped={false}
      />,
    );

    expect(screen.getByText('台積電 1055.00')).toBeTruthy();
    expect(screen.queryByText('‧不再更新')).toBe(null);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('台積電最新成交價 1055 元');
  });

  it('shows a subdued "no longer updating" suffix once auto-refresh has stopped (past the 14:00 cutoff)', () => {
    render(
      <StockPriceBar
        quote={{ price: 1055, isLastTradePrice: false, stockName: '台積電' }}
        quoteFailed={false}
        autoRefreshStopped
      />,
    );

    expect(screen.getByText('‧不再更新')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('台積電最新成交價 1055 元，已停止自動更新');
  });

  it('shows a failure message when the quote could not be fetched at all', () => {
    render(<StockPriceBar quote={null} quoteFailed autoRefreshStopped={false} />);

    expect(screen.getByText('台積電股價暫時無法取得')).toBeTruthy();
  });
});
