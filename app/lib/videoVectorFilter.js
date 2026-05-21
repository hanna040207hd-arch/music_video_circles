/**
 * Video background: white + halftone on bright areas + threshold silhouette (black).
 * Ported from video_silhouette_beat.html
 */

const DOT_GRID_BASE = 22;
const REF_WIDTH = 680;

function parseHexRgb(hex) {
  const raw = String(hex || "#ffffff").replace(/^#/, "");
  const h =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function ensureWorkSize(work, width, height) {
  if (work.canvas.width !== width || work.canvas.height !== height) {
    work.canvas.width = width;
    work.canvas.height = height;
  }
}

/** Cover-crop source rect (matches reference HTML). */
function videoSourceCrop(video, canvasW, canvasH) {
  const vr = video.videoWidth / video.videoHeight;
  const cr = canvasW / canvasH;
  let sx = 0;
  let sy = 0;
  let sw = video.videoWidth;
  let sh = video.videoHeight;
  if (vr > cr) {
    sw = Math.round(video.videoHeight * cr);
    sx = Math.round((video.videoWidth - sw) / 2);
  } else {
    sh = Math.round(video.videoWidth / cr);
    sy = Math.round((video.videoHeight - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

export function createVideoWorkSurface(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return {
    canvas,
    ctx: canvas.getContext("2d", { willReadFrequently: true }),
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx - main canvas
 * @param {HTMLVideoElement} video
 * @param {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }} work
 * @param {{ width: number, height: number, threshold?: number, halftone?: boolean, bgColor?: string }} opts
 * threshold: 0–255 (default 120), same as reference #thresh slider
 * bgColor: bright-area fill (default #ffffff) — e.g. mint #d4f5ef
 */
export function drawVectorVideoBackground(ctx, video, work, opts) {
  const {
    width: W,
    height: H,
    threshold = 120,
    halftone = true,
    bgColor = "#ffffff",
  } = opts;
  const bg = parseHexRgb(bgColor);

  if (!video || video.readyState < 2 || !video.videoWidth) return false;

  ensureWorkSize(work, W, H);
  const { sx, sy, sw, sh } = videoSourceCrop(video, W, H);

  work.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);

  const imageData = work.ctx.getImageData(0, 0, W, H);
  const data = imageData.data;
  const thresh = threshold;
  const dotGrid = Math.max(14, Math.round((DOT_GRID_BASE * W) / REF_WIDTH));

  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, W, H);

  if (halftone) {
    const dotR = Math.round(bg.r * 0.62);
    const dotG = Math.round(bg.g * 0.62);
    const dotB = Math.round(bg.b * 0.62);
    for (let y = dotGrid / 2; y < H; y += dotGrid) {
      for (let x = dotGrid / 2; x < W; x += dotGrid) {
        const px = Math.floor(x);
        const py = Math.floor(y);
        const i = (py * W + px) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum >= thresh) {
          const maxR = dotGrid * 0.48;
          const dotRadius = maxR * (1 - lum / 255) * 2.2;
          if (dotRadius > 0.5) {
            ctx.beginPath();
            ctx.arc(x, y, Math.min(dotRadius, maxR), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${dotR},${dotG},${dotB},${0.18 + (1 - lum / 255) * 0.5})`;
            ctx.fill();
          }
        }
      }
    }
  }

  const maskData = work.ctx.createImageData(W, H);
  const mask = maskData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < thresh) {
      mask[i] = 0;
      mask[i + 1] = 0;
      mask[i + 2] = 0;
      mask[i + 3] = 220;
    } else {
      mask[i + 3] = 0;
    }
  }
  work.ctx.putImageData(maskData, 0, 0);
  ctx.drawImage(work.canvas, 0, 0);

  return true;
}

/** Idle background when no video (reference idle state). */
export function drawIdleBackground(ctx, width, height, opts = {}) {
  const bg = parseHexRgb(opts.bgColor || "#f4f5f7");
  const dotGrid = Math.max(14, Math.round((DOT_GRID_BASE * width) / REF_WIDTH));
  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, width, height);
  const dotR = Math.round(bg.r * 0.55);
  const dotG = Math.round(bg.g * 0.55);
  const dotB = Math.round(bg.b * 0.55);
  ctx.fillStyle = `rgba(${dotR},${dotG},${dotB},0.22)`;
  for (let x = dotGrid / 2; x < width; x += dotGrid) {
    for (let y = dotGrid / 2; y < height; y += dotGrid) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
