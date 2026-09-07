import { useEffect, useState } from 'react';

// TWSE(證交所)基本市況報導系統的個股即時行情端點。ex_ch=tse_2330.tw代表
// 「上市(tse)股票代號2330(台積電)」；json=1&delay=0是這個端點常見的建議寫法
// (實測不管json帶什麼值，回傳都是JSON，但保留這兩個參數維持跟外部文件/
// 範例一致，降低這個端點行為跟預期不同的風險)。
//
// 注意(重要)：這是台灣證交所提供給自家「基本市況報導網站」用的公開端點，
// 並不是設計給任意網域的前端直接fetch()使用的公開API，伺服器不一定會回傳
// Access-Control-Allow-Origin，瀏覽器可能會擋下這個跨來源請求(CORS)。這裡
// 依照使用者指定的端點原樣實作、並且做好失敗時的容錯(fetchLatestQuote失敗
// 就顯示「暫時無法取得」，不會讓整個首頁掛掉)，但如果部署後發現價格一直
// 顯示「暫時無法取得」，很可能就是被CORS擋下來，屆時需要另外架一個小型
// 後端/雲端函式轉發這個請求(幫回應加上Access-Control-Allow-Origin)。
const STOCK_SYMBOL = 'tse_2330.tw';
const STOCK_QUOTE_BASE_URL = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${STOCK_SYMBOL}&json=1&delay=0`;
const POLL_INTERVAL_MS = 30_000;
const STOCK_FETCH_TIMEOUT_MS = 5000;
// 每天下午2點(14:00)之後就不再自動打API更新——不論現在幾點打開頁面，只要
// 「現在」已經過了當天14:00，就停止自動輪詢；如果頁面一直開著跨過午夜，
// 隔天現在時間又會早於14:00，會自動恢復輪詢，不需要額外處理「跨日」的邏輯，
// 也不用管當天究竟是不是交易日——這裡只單純照使用者指定的時間規則判斷。
const AUTO_REFRESH_CUTOFF_HOUR = 14;

function isWithinAutoRefreshWindow(date = new Date()) {
  return date.getHours() < AUTO_REFRESH_CUTOFF_HOUR;
}

function parsePrice(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) ? price : null;
}

async function fetchLatestQuote(signal) {
  // 加上時間戳當cache-busting參數，避免瀏覽器或中間的快取伺服器把每30秒
  // 打的請求都擋成同一份舊回應——這是這個TWSE MIS端點文件常見的建議寫法。
  const response = await fetch(`${STOCK_QUOTE_BASE_URL}&_=${Date.now()}`, { signal });

  if (!response.ok) {
    throw new Error('stock quote request failed');
  }

  const payload = await response.json();
  const quote = payload?.msgArray?.[0];

  if (!quote) {
    throw new Error('stock quote payload missing msgArray entry');
  }

  // z是「當前盤中成交價」，但盤中偶爾會因為那個瞬間剛好沒有新成交而回傳"-"；
  // 這種情況退回用y(昨日收盤價)顯示，確保畫面上一定有一個有意義的價格可看，
  // 不會讓使用者看到一個沒有資訊量的"-"符號。
  const lastTradePrice = parsePrice(quote.z);
  const latestPrice = lastTradePrice ?? parsePrice(quote.y);

  if (latestPrice === null) {
    throw new Error('stock quote missing both z and y price fields');
  }

  return {
    price: latestPrice,
    isLastTradePrice: lastTradePrice !== null,
    stockName: quote.n || '台積電',
    updatedAt: Date.now(),
  };
}

// 首頁天氣氣泡列最前面的台積電(2330)股價：掛載時抓一次，之後只要還在當天
// 14:00之前，就每30秒自動重新打一次TWSE MIS API更新畫面——是重新抓資料、
// 換掉畫面上顯示的數字，不是對整個瀏覽器頁面做reload。過了14:00就停止繼續
// 打API，畫面會停在最後一次抓到的價格，不會再變動；autoRefreshStopped
// 就是給UI用來顯示「目前是不是還在自動更新」的旗標。
export function useStockPrice() {
  const [quote, setQuote] = useState(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [autoRefreshStopped, setAutoRefreshStopped] = useState(() => !isWithinAutoRefreshWindow());

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

    // 開頁時不管現在幾點都先抓一次——就算已經過了14:00不再自動更新，使用者
    // 一開頁還是應該看到「最後一次的成交價」，14:00規則管的是後續還要不要
    // 繼續自動輪詢，不是要不要顯示這個功能本身。
    runFetch();

    const intervalId = setInterval(() => {
      const withinWindow = isWithinAutoRefreshWindow();
      setAutoRefreshStopped(!withinWindow);
      if (withinWindow) {
        runFetch();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { quote, quoteFailed, autoRefreshStopped };
}

export default useStockPrice;
