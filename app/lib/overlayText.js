/**
 * TikTok-style overlay text: bold, tight tracking, multiline.
 */

const DEFAULT_COLOR = "#E91E63";

export function defaultOverlayText(scale = 1) {
  return {
    text: "bad bitch\npretty with",
    x: Math.round(72 * scale),
    y: Math.round(100 * scale),
    color: DEFAULT_COLOR,
    fontSize: Math.round(52 * scale),
  };
}

function parseLines(text) {
  const lines = String(text || "").split("\n");
  if (lines.every((l) => !l.trim())) return [];
  return lines;
}

export function measureOverlayText(ctx, block) {
  const lines = parseLines(block.text);
  if (lines.length === 0) {
    return { width: 0, height: 0, lines: [] };
  }

  const fontSize = block.fontSize || 48;
  const lineHeight = fontSize * 0.9;
  const tracking = -fontSize * 0.045;

  ctx.save();
  ctx.font = `900 ${fontSize}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;

  let maxW = 0;
  const lineWidths = lines.map((line) => {
    let w = 0;
    for (let i = 0; i < line.length; i++) {
      w += ctx.measureText(line[i]).width + (i > 0 ? tracking : 0);
    }
    maxW = Math.max(maxW, w);
    return w;
  });

  ctx.restore();

  return {
    width: maxW,
    height: lines.length * lineHeight,
    lineHeight,
    lines,
    lineWidths,
  };
}

function drawTightLine(ctx, line, x, y, fontSize, color) {
  const tracking = -fontSize * 0.045;
  ctx.fillStyle = color;
  let cx = x;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + (i < line.length - 1 ? tracking : 0);
  }
}

export function drawOverlayText(ctx, block) {
  const lines = parseLines(block.text);
  if (lines.length === 0) return;

  const fontSize = block.fontSize || 48;
  const lineHeight = fontSize * 0.9;
  const color = block.color || DEFAULT_COLOR;

  ctx.save();
  ctx.font = `900 ${fontSize}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    drawTightLine(ctx, line, block.x, block.y + i * lineHeight, fontSize, color);
  });

  ctx.restore();
}

/** Drag handle hit area with padding */
export function hitTestOverlayText(ctx, block, px, py, padding = 12) {
  const m = measureOverlayText(ctx, block);
  if (m.lines.length === 0) return false;

  return (
    px >= block.x - padding &&
    px <= block.x + m.width + padding &&
    py >= block.y - padding &&
    py <= block.y + m.height + padding
  );
}
