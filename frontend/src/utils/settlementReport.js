// Settlement Report PNG產生器(spec section 11/12)。刻意用瀏覽器原生Canvas 2D API手繪，
// 不引入html2camera/html2canvas之類的新套件——package.json目前沒有這類依賴，這個報表
// 版面也單純到不需要「把DOM截圖」，直接畫文字/線條即可。
//
// 圖片內容(可測試、不依賴Canvas的部分)跟「畫布繪製+下載」(依賴瀏覽器API、不易在jsdom
// 下驗證像素) 刻意拆成兩個函式：buildSettlementReportLines()負責組資料，
// downloadSettlementReportImage()才真的碰Canvas/下載。測試只驗證前者跟「有沒有呼叫
// 下載」，不驗證畫出來的像素長什麼樣子。
import { formatAmount, formatSettlementDisplayId, formatTokenValue } from './settlement.js';

const TOKEN_PRICE_LEGEND = [
  { label: '一般 Token', amount: 100 },
  { label: '特殊 Token', amount: 500 },
  { label: '自首 Token', amount: 50 },
];

function toMillis(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp === 'number') return timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  }
  return null;
}

export function formatReportDate(timestamp) {
  const millis = toMillis(timestamp);
  if (!millis) return null;
  return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(millis));
}

// Report不能每次重新讀取現在的Token算(spec section 12)，一律吃Settlement快照本身的
// members/totalTokenValue/totalAmount，不重新計算。
export function buildSettlementReportLines(settlement) {
  const members = Array.isArray(settlement?.members) ? settlement.members : [];
  const periodStart = formatReportDate(settlement?.periodStart);
  const periodEnd = formatReportDate(settlement?.periodEnd);

  return {
    title: 'DAZHUGONG',
    subtitle: '🐷 豬公結算報告',
    period: periodStart && periodEnd ? `${periodStart} – ${periodEnd}` : null,
    members: members.map((member) => ({
      name: member.memberName,
      tokenLabel: `${formatTokenValue(member.totalTokenValue)} Token`,
      amountLabel: formatAmount(member.amount, settlement?.currency),
    })),
    totalTokenLabel: `${formatTokenValue(settlement?.totalTokenValue ?? 0)} Token`,
    totalAmountLabel: formatAmount(settlement?.totalAmount, settlement?.currency),
    unitPriceLabel: `1 Token = ${formatAmount(settlement?.tokenUnitPrice ?? 0, settlement?.currency)}`,
    priceLegend: TOKEN_PRICE_LEGEND.map((entry) => `${entry.label}\u3000\u3000${entry.amount} 元`),
    settlementIdLabel: formatSettlementDisplayId(settlement?.id),
  };
}

export function getSettlementReportFilename(settlement) {
  const dateKey = typeof settlement?.id === 'string' ? settlement.id.split('-')[0] : '00000000';
  return `DaZhugong_Settlement_${dateKey}.png`;
}

function drawReportCanvas(settlement) {
  const lines = buildSettlementReportLines(settlement);
  const width = 720;
  const rowHeight = 56;
  const height = 420 + lines.members.length * rowHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.fillStyle = '#fff1f2';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#881337';
  context.textAlign = 'center';
  context.font = '700 22px sans-serif';
  context.fillText(lines.title, width / 2, 56);

  context.font = '700 32px sans-serif';
  context.fillStyle = '#0f172a';
  context.fillText(lines.subtitle, width / 2, 100);

  if (lines.period) {
    context.font = '500 20px sans-serif';
    context.fillStyle = '#475569';
    context.fillText(lines.period, width / 2, 134);
  }

  let y = 176;
  context.strokeStyle = '#cbd5f5';
  context.beginPath();
  context.moveTo(48, y);
  context.lineTo(width - 48, y);
  context.stroke();

  context.textAlign = 'left';
  y += 44;
  lines.members.forEach((member) => {
    context.font = '700 22px sans-serif';
    context.fillStyle = '#0f172a';
    context.fillText(member.name, 48, y);
    context.font = '500 18px sans-serif';
    context.fillStyle = '#64748b';
    context.fillText(member.tokenLabel, 48, y + 24);

    context.textAlign = 'right';
    context.font = '700 24px sans-serif';
    context.fillStyle = '#be123c';
    context.fillText(member.amountLabel, width - 48, y + 8);
    context.textAlign = 'left';

    y += rowHeight;
  });

  context.beginPath();
  context.moveTo(48, y);
  context.lineTo(width - 48, y);
  context.stroke();
  y += 44;

  context.font = '800 24px sans-serif';
  context.fillStyle = '#0f172a';
  context.fillText('TOTAL', 48, y);
  context.fillText(lines.totalTokenLabel, 48, y + 30);

  context.textAlign = 'right';
  context.font = '800 30px sans-serif';
  context.fillStyle = '#be123c';
  context.fillText(lines.totalAmountLabel, width - 48, y + 10);
  context.textAlign = 'left';

  y += 70;
  context.font = '500 16px sans-serif';
  context.fillStyle = '#475569';
  context.fillText(lines.unitPriceLabel, 48, y);

  y += 30;
  lines.priceLegend.forEach((legendLine) => {
    context.fillText(legendLine, 48, y);
    y += 24;
  });

  y += 20;
  context.font = '600 16px sans-serif';
  context.fillStyle = '#64748b';
  context.fillText(`Settlement ${lines.settlementIdLabel}`, 48, y);

  context.textAlign = 'center';
  context.font = '32px sans-serif';
  context.fillText('🐷', width / 2, height - 32);

  return canvas;
}

// 觸發下載：把畫好的Canvas轉成PNG blob，用暫時的<a download>連結觸發瀏覽器下載，
// 手機上等同「下載/儲存照片」。
export function downloadSettlementReportImage(settlement) {
  const canvas = drawReportCanvas(settlement);
  if (!canvas) {
    return false;
  }

  const filename = getSettlementReportFilename(settlement);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');

  return true;
}
