// 從單一hex色票推算出深淺不同的版本，這樣30組色票不用各自手動配4個色階，
// 用HSL調整明度就能穩定地產生一致的深/淺色階。
function hexToHsl(hex) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h /= 6;

  return { h, s, l };
}

function hslToHex(h, s, l) {
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r;
  let g;
  let b;
  if (s === 0) {
    r = l;
    g = l;
    b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// 給定基準色，算出淺(用來當chip/badge底色)、基準、深(用來當hover/漸層終點)、
// 更深(用來當純文字色，確保跟白底有足夠對比)四個版本。
export function deriveColorShades(hex) {
  const { h, s } = hexToHsl(hex);
  return {
    50: hslToHex(h, clamp01(s * 0.55), 0.95),
    500: hex,
    600: hslToHex(h, clamp01(s * 1.05), 0.36),
    700: hslToHex(h, clamp01(s * 1.1), 0.28),
  };
}
