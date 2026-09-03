import { useEffect } from 'react';
import { getTodayColor } from '../data/traditionalColors.js';
import { deriveColorShades } from '../utils/colorShades.js';

// 進入app時計算「今天」對應的傳統色，套用成CSS自訂屬性讓全站的品牌色跟著變。
// 只在掛載時算一次：同一次瀏覽期間顏色維持穩定，不會使用者用到一半忽然變色；
// 隔天重新整理/重新進入app才會換到下一個顏色。
export function useDailyTheme() {
  useEffect(() => {
    const color = getTodayColor();
    const shades = deriveColorShades(color.hex);
    const root = document.documentElement;

    root.style.setProperty('--brand-50', shades[50]);
    root.style.setProperty('--brand-500', shades[500]);
    root.style.setProperty('--brand-600', shades[600]);
    root.style.setProperty('--brand-700', shades[700]);
    root.style.setProperty('--brand-name', `"${color.name} ${color.reading}"`);

    return () => {
      root.style.removeProperty('--brand-50');
      root.style.removeProperty('--brand-500');
      root.style.removeProperty('--brand-600');
      root.style.removeProperty('--brand-700');
      root.style.removeProperty('--brand-name');
    };
  }, []);
}
