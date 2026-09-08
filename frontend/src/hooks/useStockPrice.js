import { useEffect, useState } from 'react';

// 台灣證交所「官方」OpenAPI(開放資料平台)，跟mis.twse.com.tw是完全不同的兩個系統：
// mis.twse.com.tw是證交所自家「基本市況報導網站」在用的內部端點，沒有對外開放CORS，
// 部署到Firebase後瀏覽器直接fetch()會被擋下來(這是2026-09-07實際部署後踩到的問題)。
// openapi.twse.com.tw則是證交所刻意對外開放給第三方使用的公開資料平台，目前查到的
// 多筆第三方範例都是直接在瀏覽器/React端fetch()使用、沒有人另外提到CORS問題，
// 這裡改用這個端點來源。
//
// 代價(重要，這裡刻意換了功能定義，不是單純換個網址)：這個端點回傳的是「最近一個
// 交易日」的收盤資料，不是盤中逐筆跳動的即時成交價。STOCK_DAY_ALL這份資料集本身
// 一天只會更新一次(通常在收盤後的下午)，而且它不支援查詢過去特定日期——不管什麼
// 時間點打這支API，拿到的永遠是「目前最新的那一個交易日」的整批資料，不會是「今天
// 這一秒的成交價」。所以這裡顯示的文案是「收盤」而不是「最新成交」，畫面上也會帶一個
// 月/日標示，讓使用者看得出來這個數字是哪一天的(如果現在是還沒收盤的交易日上午，
// 或今天剛好不是交易日，這裡本來就會顯示「最近一個交易日」的收盤價，不一定是今天)。
const STOCK_CODE = '2330';
const STOCK_QUOTE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const POLL_INTERVAL_MS = 30_000;
const STOCK_FETCH_TIMEOUT_MS = 8000;

function parsePrice(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) ? price : null;
}

// 把民國(ROC)日期字串("1150731")轉成"07/31"這種好讀的月/日格式，純粹是給畫面上
// 一個標示用，不需要換算成西元年——TWSE這個資料集本來就不支援指定日期查詢，換算
// 年份對這裡的顯示需求沒有實質幫助。
function formatRocDateAsMonthDay(rocDate) {
  if (typeof rocDate !== 'string' || rocDate.length < 5) {
    return null;
  }
  const month = rocDate.slice(-4, -2);
  const day = rocDate.slice(-2);
  return `${month}/${day}`;
}

async function fetchLatestQuote(signal) {
  const response = await fetch(STOCK_QUOTE_URL, { signal });

  if (!response.ok) {
    throw new Error('stock quote request failed');
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows.find((item) => item?.Code === STOCK_CODE) : null;

  if (!row) {
    throw new Error('stock quote row not found for 2330');
  }

  const price = parsePrice(row.ClosingPrice);
  if (price === null) {
    throw new Error('stock quote missing ClosingPrice');
  }

  return {
    price,
    stockName: row.Name || '台積電',
    tradeDateLabel: formatRocDateAsMonthDay(row.Date),
    updatedAt: Date.now(),
  };
}

// 首頁天氣氣泡列最前面的台積電(2330)收盤價：掛載時抓一次，之後每30秒重新打一次
// TWSE OpenAPI更新畫面——是重新抓資料、換掉畫面上顯示的數字，不是對整個瀏覽器頁面
// 做reload。
//
// 沒有「過了14:00停止自動更新」這個機制了(舊版mis.twse.com.tw即時價那個版本才有)：
// 這份資料本來就一天只會真的變一次，繼續每30秒檢查一次的代價微乎其微，反而拿掉
// 這個機制可以確保「當天真正收盤、資料上線」的那個時間點(通常在下午，可能早於或
// 晚於14:00，證交所沒有公告精確時間)一定會被抓到，不會因為抓取視窗已經關閉而
// 錯過當天的更新、一直顯示前一個交易日的價格直到使用者手動重新整理頁面。
export function useStockPrice() {
  const [quote, setQuote] = useState(null);
  const [quoteFailed, setQuoteFailed] = useState(false);

  useEffect(() => {
    if (typeof fetch !== 'function') {
      setQuoteFailed(true);
      return undefined;
    }

    let cancelled = false;

    function runFetch() {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = setTimeout(() => controller?.abort(), STOCK_FETCH_TIMEOUT_MS);

      fetchLatestQuote(controller?.signal)
        .then((result) => {
          if (!cancelled) {
            setQuote(result);
            setQuoteFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setQuoteFailed(true);
          }
        })
        .finally(() => {
          clearTimeout(timeoutId);
        });
    }

    runFetch();
    const intervalId = setInterval(runFetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { quote, quoteFailed };
}

export default useStockPrice;
