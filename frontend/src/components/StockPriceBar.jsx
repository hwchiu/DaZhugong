// 首頁天氣氣泡列最前面的台積電(2330)股價氣泡，樣式刻意跟DateWeatherBar.jsx
// 完全對稱(同一套glass/非glass的class)，才能在同一列排在一起看起來像同一組
// 資訊chip，不會有一個特別突兀。資料來源見 ../hooks/useStockPrice.js。
//
// 2026-09-07改版：資料來源從「盤中即時成交價」換成TWSE官方OpenAPI的「當日收盤價」
// (原因：mis.twse.com.tw那個即時價端點部署到Firebase後被CORS擋下來，詳見
// useStockPrice.js的說明)。文案跟著從「最新成交」改成「收盤」，並且帶一個月/日
// 標示，讓使用者看得出來這個數字是哪一天的收盤價——不再有「自動更新已停止」這個
// 狀態了，因為現在的資料本來就是一天只變一次的收盤價，沒有「即時/已停止即時」的
// 分別可言。
export default function StockPriceBar({ quote, quoteFailed, glass = false }) {
  const ariaLabel = quote
    ? `台積電${quote.tradeDateLabel ? ` ${quote.tradeDateLabel}` : ''}收盤價 ${quote.price} 元`
    : quoteFailed
      ? '台積電股價暫時無法取得'
      : '台積電股價讀取中';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={
        glass
          ? 'flex items-center gap-1.5 rounded-full bg-white/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md'
          : 'flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm shadow-stone-200'
      }
    >
      {quote ? (
        <>
          <span aria-hidden="true">📈</span>
          <span>
            {quote.stockName} {quote.price.toFixed(2)}
          </span>
          {quote.tradeDateLabel ? (
            <span className="opacity-70">{quote.tradeDateLabel}收盤</span>
          ) : null}
        </>
      ) : quoteFailed ? (
        <>
          <span aria-hidden="true">📉</span>
          <span>台積電股價暫時無法取得</span>
        </>
      ) : (
        <span>台積電股價讀取中…</span>
      )}
    </div>
  );
}
