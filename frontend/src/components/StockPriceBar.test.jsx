import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StockPriceBar from './StockPriceBar.jsx';

afterEach(() => {
  cleanup();
});

describe('StockPriceBar', () => {
  it('shows a loading message before the first quote arrives', () => {
    render(<StockPriceBar quote={null} quoteFailed={false} glass />);

    expect(screen.getByText('台積電股價讀取中…')).toBeTruthy();
  });

  it('shows the closing price with two decimal places plus the trade date label', () => {
    render(
      <StockPriceBar quote={{ price: 1055, stockName: '台積電', tradeDateLabel: '08/01' }} quoteFailed={false} />,
    );

    expect(screen.getByText('台積電 1055.00')).toBeTruthy();
    expect(screen.getByText('08/01收盤')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('台積電 08/01收盤價 1055 元');
  });

  it('omits the date suffix gracefully when tradeDateLabel could not be parsed', () => {
    render(
      <StockPriceBar quote={{ price: 1055, stockName: '台積電', tradeDateLabel: null }} quoteFailed={false} />,
    );

    expect(screen.getByText('台積電 1055.00')).toBeTruthy();
    expect(screen.queryByText(/收盤$/)).toBe(null);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('台積電收盤價 1055 元');
  });

  it('shows a failure message when the quote could not be fetched at all', () => {
    render(<StockPriceBar quote={null} quoteFailed />);

    expect(screen.getByText('台積電股價暫時無法取得')).toBeTruthy();
  });
});
