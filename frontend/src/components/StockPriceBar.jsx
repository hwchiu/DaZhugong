// 首頁天氣氣泡列最前面的台積電(2330)股價氣泡，樣式刻意跟DateWeatherBar.jsx
// 完全對稱(同一套glass/非glass的class)，才能在同一列排在一起看起來像同一組
// 資訊chip，不會有一個特別突兀。資料來源見 ../hooks/useStockPrice.js。
export default function StockPriceBar({ quote, quoteFailed, autoRefreshStopped, glass = false }) {
  const ariaLabel = quote
    ? `台積電最新成交價 ${quote.price} 元${autoRefreshStopped ? '，已停止自動更新' : ''}`
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
          {/* 過了每天下午14:00不再自動輪詢後，用這個小標籤讓使用者知道畫面
              停在「最後一次抓到的價格」，不是還在即時跳動——只描述這個功能
              自己的行為(不再自動更新)，不去斷言證交所實際上是不是真的收盤了。 */}
          {autoRefreshStopped ? <span className="opacity-70">‧不再更新</span> : null}
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
