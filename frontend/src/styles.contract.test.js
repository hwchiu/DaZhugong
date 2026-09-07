import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.css');
const css = readFileSync(cssPath, 'utf8');

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

describe('cooldown sweep mask CSS (index.css)', () => {
  // 回歸測試(2026-09-07)：這個扇形遮罩曾經把方向搞反過一次——用
  // `--cooldown-remaining * 360deg` 當深色扇形的結束角度，這個角度會隨時間
  // 「遞減」(1→0)，導致扇形邊界往逆時針方向掃動，跟需求要的「順時針收縮」
  // 相反。
  //
  // 正確算法：conic-gradient從12點鐘方向開始，角度「遞增」的方向才是順時針，
  // 所以必須用「已經過的比例」(1 - --cooldown-remaining)——這個值隨時間從0
  // 遞增到1，邊界角度才會跟著遞增、往順時針方向掃動。這裡直接讀取index.css
  // 原始文字，鎖定這個算式的方向，避免以後不小心又被改回相反的寫法。
  it('sweeps clockwise: the transparent (already-elapsed) wedge grows via (1 - --cooldown-remaining), not --cooldown-remaining directly', () => {
    const normalized = normalizeWhitespace(css);
    const expectedGradient = normalizeWhitespace(`
      conic-gradient(
        transparent calc((1 - var(--cooldown-remaining)) * 360deg),
        rgba(15, 23, 42, 0.62) calc((1 - var(--cooldown-remaining)) * 360deg)
      )
    `);

    expect(normalized).toContain(expectedGradient);
  });

  it('does not regress to the old counter-clockwise formula (remaining fraction used directly as the angle)', () => {
    const normalized = normalizeWhitespace(css);
    const oldBuggyGradient = normalizeWhitespace(`
      conic-gradient(
        rgba(15, 23, 42, 0.62) calc(var(--cooldown-remaining) * 360deg),
        transparent calc(var(--cooldown-remaining) * 360deg)
      )
    `);

    expect(normalized).not.toContain(oldBuggyGradient);
  });
});
