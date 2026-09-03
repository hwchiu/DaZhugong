// 日本傳統色票——本地內建資料，不是即時從外部網站抓的。
// 原因見交付說明：nipponcolors.com是純靜態頁面(javascript:void(0) 連結)，沒有API、
// 沒有「今日色」端點，瀏覽器端直接fetch該網域大機率會被CORS擋下，而且對方站點的
// 「今日色」邏輯本來就無法從外部得知或保證穩定。這裡改用一組同樣具知名度、
// 廣泛見於多方日本傳統色資料的色票，自己內建、自己決定每天輪替到哪一個，
// 兼顧「每天不同色」的效果，同時不依賴任何第三方網站的可用性。
export const TRADITIONAL_COLORS = [
  { name: '藍', reading: 'AI', hex: '#1B5C82' },
  { name: '紅', reading: 'KURENAI', hex: '#D9333F' },
  { name: '山吹', reading: 'YAMABUKI', hex: '#F8B500' },
  { name: '若竹', reading: 'WAKATAKE', hex: '#68BE8D' },
  { name: '桜', reading: 'SAKURA', hex: '#FDBFC7' },
  { name: '藤', reading: 'FUJI', hex: '#B3A0C7' },
  { name: '萌黄', reading: 'MOEGI', hex: '#A8CB3E' },
  { name: '朱', reading: 'SHU', hex: '#EB6238' },
  { name: '瑠璃', reading: 'RURI', hex: '#1E50A2' },
  { name: '桃', reading: 'MOMO', hex: '#F09199' },
  { name: '鴇', reading: 'TOKI', hex: '#EE9EA0' },
  { name: '群青', reading: 'GUNJYO', hex: '#4C6CB3' },
  { name: '常磐', reading: 'TOKIWA', hex: '#00754A' },
  { name: '蘇芳', reading: 'SUOH', hex: '#9E3D3F' },
  { name: '芥子', reading: 'KARASHI', hex: '#D9A824' },
  { name: '鉄紺', reading: 'TETSUKON', hex: '#21314D' },
  { name: '檜皮', reading: 'HIWADA', hex: '#965042' },
  { name: '深緑', reading: 'FUKAMIDORI', hex: '#00552E' },
  { name: '柑子', reading: 'KOJI', hex: '#F3944E' },
  { name: '花浅葱', reading: 'HANAASAGI', hex: '#0F7B8A' },
  { name: '牡丹', reading: 'BOTAN', hex: '#B94A6C' },
  { name: '菖蒲', reading: 'AYAME', hex: '#8B4A9C' },
  { name: '鶯', reading: 'UGUISU', hex: '#6C7C59' },
  { name: '珊瑚', reading: 'SANGO', hex: '#F4795B' },
  { name: '空色', reading: 'SORAIRO', hex: '#4CA6C7' },
  { name: '弁柄', reading: 'BENGARA', hex: '#9C3C2E' },
  { name: '若草', reading: 'WAKAKUSA', hex: '#8FBC3F' },
  { name: '紫', reading: 'MURASAKI', hex: '#71578A' },
  { name: '琥珀', reading: 'KOHAKU', hex: '#CA8429' },
  { name: '浅葱', reading: 'ASAGI', hex: '#1C8B85' },
];

// 依「今年第幾天」決定今天輪到哪個顏色——同一天全部使用者看到的顏色一致，
// 每天固定變化，純本地計算不需要打任何API。
export function getTodayColorIndex(date = new Date(), paletteLength = TRADITIONAL_COLORS.length) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diffMs = date - startOfYear;
  const dayOfYear = Math.floor(diffMs / 86_400_000);
  return ((dayOfYear % paletteLength) + paletteLength) % paletteLength;
}

export function getTodayColor(date = new Date()) {
  return TRADITIONAL_COLORS[getTodayColorIndex(date)];
}
