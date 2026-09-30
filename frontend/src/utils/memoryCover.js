// 大豬公回憶錄封面產生器(spec section 36/37)：跟settlementReport.js同樣的取捨——
// 純Canvas 2D手繪，不引入html2canvas之類的新套件。輸出1080x1440(3:4)的PNG，
// 適合存進相簿或分享到限時動態。
import { formatMemoryAmount, formatMemoryDate, formatMemorySequence, resolveMemoryDisplayDate } from './memory.js';

const WIDTH = 1080;
const HEIGHT = 1440;

export function getMemoryCoverFilename(memory) {
  const sequence = Number.isFinite(memory?.sequenceNumber) ? memory.sequenceNumber : 0;
  return `DaZhugong_Memory_${String(sequence).padStart(3, '0')}.png`;
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const characters = Array.from(text ?? '');
  let line = '';
  let cursorY = y;

  characters.forEach((character) => {
    const testLine = `${line}${character}`;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, cursorY);
      line = character;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  });

  if (line) {
    context.fillText(line, x, cursorY);
  }

  return cursorY;
}

function drawMemoryCoverCanvas(memory, coverImage) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  // 底色：cream paper質感(spec section 36的scrapbook風格)。
  context.fillStyle = '#fdf6ec';
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.textAlign = 'center';
  context.fillStyle = '#be123c';
  context.font = '700 32px sans-serif';
  context.fillText('DAZHUGONG', WIDTH / 2, 100);

  context.fillStyle = '#0f172a';
  context.font = '800 48px sans-serif';
  context.fillText(formatMemorySequence(memory?.sequenceNumber), WIDTH / 2, 168);

  // Polaroid照片區塊：留白邊框模擬拍立得相片。
  const photoWidth = WIDTH - 200;
  const photoHeight = 780;
  const photoX = 100;
  const photoY = 210;

  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(15, 23, 42, 0.18)';
  context.shadowBlur = 24;
  context.fillRect(photoX, photoY, photoWidth, photoHeight);
  context.shadowBlur = 0;

  const innerPadding = 24;
  if (coverImage) {
    const innerWidth = photoWidth - innerPadding * 2;
    const innerHeight = photoHeight - innerPadding * 2 - 60;
    const scale = Math.max(innerWidth / coverImage.width, innerHeight / coverImage.height);
    const drawWidth = coverImage.width * scale;
    const drawHeight = coverImage.height * scale;
    context.save();
    context.beginPath();
    context.rect(photoX + innerPadding, photoY + innerPadding, innerWidth, innerHeight);
    context.clip();
    context.drawImage(
      coverImage,
      photoX + innerPadding - (drawWidth - innerWidth) / 2,
      photoY + innerPadding - (drawHeight - innerHeight) / 2,
      drawWidth,
      drawHeight,
    );
    context.restore();
  } else {
    context.fillStyle = '#fff1f2';
    context.fillRect(photoX + innerPadding, photoY + innerPadding, photoWidth - innerPadding * 2, photoHeight - innerPadding * 2 - 60);
    context.font = '80px sans-serif';
    context.fillStyle = '#f472b6';
    context.fillText('🐷', WIDTH / 2, photoY + photoHeight / 2);
  }

  context.font = '600 28px sans-serif';
  context.fillStyle = '#334155';
  context.fillText(memory?.title || '這次的聚會', WIDTH / 2, photoY + photoHeight - 24);

  let y = photoY + photoHeight + 70;
  context.font = '500 26px sans-serif';
  context.fillStyle = '#475569';
  const dateLabel = formatMemoryDate(resolveMemoryDisplayDate(memory));
  if (dateLabel) {
    context.fillText(dateLabel, WIDTH / 2, y);
    y += 44;
  }

  if (memory?.location?.placeName) {
    context.fillText(`📍 ${memory.location.placeName}`, WIDTH / 2, y);
    y += 44;
  }

  context.font = '700 30px sans-serif';
  context.fillStyle = '#be123c';
  context.fillText(formatMemoryAmount(memory), WIDTH / 2, y);
  y += 60;

  context.font = '400 24px sans-serif';
  context.fillStyle = '#64748b';
  context.textAlign = 'left';
  y = wrapText(context, memory?.story ?? '一起吃飯，一起變更好。', 100, y, WIDTH - 200, 34);
  context.textAlign = 'center';

  context.font = '40px sans-serif';
  context.fillStyle = '#111827';
  context.fillText('🐷', WIDTH / 2, HEIGHT - 60);

  return canvas;
}

function downloadCanvasAsPng(canvas, filename) {
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
}

// coverPhotoUrl可能是跨網域的Storage URL，先透過Image + crossOrigin載入成可以畫進
// Canvas的bitmap；載入失敗(CORS/網路)就直接退回沒有照片的版面，不讓整個下載失敗。
async function loadCoverImage(coverPhotoUrl) {
  if (!coverPhotoUrl) {
    return null;
  }

  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to load cover image.'));
      image.src = coverPhotoUrl;
    });
  } catch {
    return null;
  }
}

export async function downloadMemoryCoverImage(memory, coverPhotoUrl) {
  const coverImage = await loadCoverImage(coverPhotoUrl);
  const canvas = drawMemoryCoverCanvas(memory, coverImage);
  if (!canvas) {
    return false;
  }

  downloadCanvasAsPng(canvas, getMemoryCoverFilename(memory));
  return true;
}
