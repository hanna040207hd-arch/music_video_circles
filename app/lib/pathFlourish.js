/**
 * Hand-drawn stroke → wavy vector flourish (pink/cyan/lime reference style).
 */

const PALETTE = [
  { dark: "#0066CC", light: "#00D4FF", name: "cyan" },
  { dark: "#FF1493", light: "#FF69B4", name: "pink" },
  { dark: "#5CB800", light: "#B8FF3C", name: "lime" },
  { dark: "#E6A800", light: "#FFE566", name: "yellow" },
  { dark: "#FF6B00", light: "#FFAA55", name: "orange" },
];

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPt(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function seeded(seed, i) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function sampleAtDistance(pts, distance) {
  let rem = Math.max(0, distance);
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (seg < 0.001) continue;
    if (rem <= seg) return lerpPt(pts[i - 1], pts[i], rem / seg);
    rem -= seg;
  }
  const end = pts[pts.length - 1];
  return { x: end.x, y: end.y };
}

function resamplePath(pts, step) {
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const total = pathLength(pts);
  if (total < step) return pts.map((p) => ({ x: p.x, y: p.y }));
  const count = Math.max(2, Math.ceil(total / step));
  const out = [];
  for (let k = 0; k <= count; k++) {
    out.push(sampleAtDistance(pts, (k / count) * total));
  }
  return out;
}

function smoothChaikin(pts, passes) {
  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < passes; pass++) {
    if (cur.length < 2) break;
    const next = [{ x: cur[0].x, y: cur[0].y }];
    for (let i = 0; i < cur.length - 1; i++) {
      const p0 = cur[i];
      const p1 = cur[i + 1];
      next.push({
        x: p0.x * 0.72 + p1.x * 0.28,
        y: p0.y * 0.72 + p1.y * 0.28,
      });
      next.push({
        x: p0.x * 0.28 + p1.x * 0.72,
        y: p0.y * 0.28 + p1.y * 0.72,
      });
    }
    const end = cur[cur.length - 1];
    next.push({ x: end.x, y: end.y });
    cur = next;
  }
  return cur;
}

/** 구불구불한 파형 변위 (법선 방향) */
function addWavyDisplacement(pts, seed, amp) {
  const total = pathLength(pts);
  let acc = 0;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const mag = Math.hypot(tx, ty) || 1;
    const nx = -ty / mag;
    const ny = tx / mag;
    const t = total > 1 ? acc / total : i / Math.max(1, pts.length - 1);
    const w1 = Math.sin(t * Math.PI * 5.2 + seed * 0.7) * 0.55;
    const w2 = Math.sin(t * Math.PI * 9.1 + seed * 1.4) * 0.35;
    const w3 = Math.sin(t * Math.PI * 2.3 + seed * 2.1) * 0.25;
    const wobble = (w1 + w2 + w3) * amp;
    out.push({ x: pts[i].x + nx * wobble, y: pts[i].y + ny * wobble });
    if (i > 0) acc += dist(pts[i - 1], pts[i]);
  }
  return out;
}

function attachNormals(pts) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const mag = Math.hypot(tx, ty) || 1;
    tx /= mag;
    ty /= mag;
    out.push({ x: pts[i].x, y: pts[i].y, nx: -ty, ny: tx, t: i / Math.max(1, n - 1) });
  }
  return out;
}

function safeRadius(r) {
  return Math.max(0.5, r);
}

function rgbaFromHex(hex, alpha) {
  const h = hex.replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function pickPalette(seed) {
  const idx = Math.floor(seeded(seed, 0) * PALETTE.length);
  const secondary = (idx + 1 + Math.floor(seeded(seed, 1) * 3)) % PALETTE.length;
  const tertiary = (idx + 2 + Math.floor(seeded(seed, 2) * 2)) % PALETTE.length;
  return {
    main: PALETTE[idx],
    second: PALETTE[secondary],
    third: PALETTE[tertiary],
  };
}

function buildSpirals(curve, seed, s) {
  const spirals = [];
  const anchors = [
    { t: 0, size: 1.15 },
    { t: 0.38 + seeded(seed, 10) * 0.2, size: 0.75 },
    { t: 1, size: 1.05 },
  ];
  const colors = (pal, i) =>
    seeded(seed, 20 + i) < 0.5 ? pal.main.light : pal.second.light;

  anchors.forEach((anc, i) => {
    const idx = Math.min(
      curve.length - 1,
      Math.max(0, Math.floor(anc.t * (curve.length - 1)))
    );
    const p = curve[idx];
    spirals.push({
      x: p.x + p.nx * 4 * s * anc.size,
      y: p.y + p.ny * 4 * s * anc.size,
      nx: p.nx,
      ny: p.ny,
      radius: (10 + seeded(seed, 30 + i) * 14) * s * anc.size,
      turns: 1.6 + seeded(seed, 40 + i) * 1.2,
      color: colors(pickPalette(seed + i), i),
      idx: i,
    });
  });
  return spirals;
}

function buildPetals(curve, seed, s, len) {
  const petals = [];
  const count = Math.min(14, Math.max(5, Math.floor(len / (55 * s))));
  const pal = pickPalette(seed);
  for (let i = 0; i < count; i++) {
    const t = seeded(seed, 50 + i);
    const idx = Math.floor(t * (curve.length - 1));
    const p = curve[idx];
    const side = seeded(seed, 60 + i) < 0.5 ? 1 : -1;
    const size = (6 + seeded(seed, 70 + i) * 12) * s;
    petals.push({
      x: p.x + p.nx * side * (8 + seeded(seed, 80 + i) * 18) * s,
      y: p.y + p.ny * side * (8 + seeded(seed, 80 + i) * 18) * s,
      nx: p.nx * side,
      ny: p.ny * side,
      size,
      angle: Math.atan2(p.ny, p.nx) + side * 0.6,
      color: seeded(seed, 90 + i) < 0.4 ? pal.third.light : pal.main.light,
      dark: pal.main.dark,
    });
  }
  return petals;
}

function buildBokehAndSparkles(curve, seed, s, len) {
  const bokeh = [];
  const sparkles = [];
  const bokehN = Math.min(22, Math.max(8, Math.floor(len / (70 * s))));
  const sparkN = Math.min(16, Math.max(6, Math.floor(len / (90 * s))));

  for (let i = 0; i < bokehN; i++) {
    const t = seeded(seed, 100 + i);
    const idx = Math.floor(t * (curve.length - 1));
    const p = curve[idx];
    const ang = seeded(seed, 110 + i) * Math.PI * 2;
    const d = (20 + seeded(seed, 120 + i) * 45) * s;
    bokeh.push({
      x: p.x + Math.cos(ang) * d,
      y: p.y + Math.sin(ang) * d,
      r: (8 + seeded(seed, 130 + i) * 22) * s,
      a: 0.08 + seeded(seed, 140 + i) * 0.14,
    });
  }
  for (let i = 0; i < sparkN; i++) {
    const t = seeded(seed, 150 + i);
    const idx = Math.floor(t * (curve.length - 1));
    const p = curve[idx];
    sparkles.push({
      x: p.x + (seeded(seed, 160 + i) - 0.5) * 30 * s,
      y: p.y + (seeded(seed, 170 + i) - 0.5) * 30 * s,
      size: (2 + seeded(seed, 180 + i) * 4) * s,
      rot: seeded(seed, 190 + i) * Math.PI,
    });
  }
  return { bokeh, sparkles };
}

export function buildFlourishFromStroke(rawPoints, scale = 1) {
  if (!rawPoints || rawPoints.length < 2) return null;

  const seed =
    rawPoints[0].x * 0.17 +
    rawPoints[0].y * 0.31 +
    rawPoints.length * 0.9;
  const s = scale;
  const step = Math.max(6, 10 * s);
  const waveAmp = Math.max(14, 22 * s);

  let pts = resamplePath(rawPoints, step);
  pts = smoothChaikin(pts, 3);
  pts = resamplePath(pts, step * 0.85);
  pts = addWavyDisplacement(pts, seed, waveAmp);
  pts = smoothChaikin(pts, 1);
  pts = resamplePath(pts, step * 0.9);
  if (pts.length < 3) return null;

  const curve = attachNormals(pts);
  const len = pathLength(curve);
  const pal = pickPalette(seed);

  const ribbons = [
    {
      offset: -14 * s,
      colorStart: pal.main.dark,
      colorEnd: pal.main.light,
      widthStart: 1.4 * s,
      widthEnd: 0.35 * s,
      alphaMul: 0.75,
    },
    {
      offset: -5 * s,
      colorStart: pal.second.dark,
      colorEnd: pal.second.light,
      widthStart: 3.4 * s,
      widthEnd: 0.55 * s,
      alphaMul: 0.92,
    },
    {
      offset: 5 * s,
      colorStart: pal.third.dark,
      colorEnd: pal.third.light,
      widthStart: 2.6 * s,
      widthEnd: 0.45 * s,
      alphaMul: 0.85,
    },
    {
      offset: 14 * s,
      colorStart: pal.main.light,
      colorEnd: "#ffffff",
      widthStart: 1.2 * s,
      widthEnd: 0.3 * s,
      alphaMul: 0.65,
    },
  ];

  const splatters = [];
  const splatCount = Math.min(56, Math.max(14, Math.floor(len / (28 * s))));
  for (let i = 0; i < splatCount; i++) {
    const t = seeded(seed, i * 3);
    const idx = Math.floor(t * (curve.length - 1));
    const p = curve[idx];
    const spread = (10 + seeded(seed, i * 3 + 1) * 28) * s;
    const ang = seeded(seed, i * 3 + 2) * Math.PI * 2;
    const driftNx = Math.cos(ang);
    const driftNy = Math.sin(ang);
    const distMul = 0.3 + seeded(seed, i + 40) * 0.9;
    const colors = [pal.main.light, pal.second.light, pal.third.light, "#ffffff"];
    splatters.push({
      x: p.x + driftNx * spread * distMul,
      y: p.y + driftNy * spread * distMul,
      driftNx,
      driftNy,
      r: (1.2 + seeded(seed, i + 50) * 4) * s,
      color: colors[Math.floor(seeded(seed, i + 60) * colors.length)],
      a: 0.2 + seeded(seed, i + 70) * 0.5,
    });
  }

  const start = curve[0];
  const end = curve[curve.length - 1];

  return {
    seed,
    scale: s,
    palette: pal,
    curve,
    ribbons,
    splatters,
    spirals: buildSpirals(curve, seed, s),
    petals: buildPetals(curve, seed, s, len),
    ...buildBokehAndSparkles(curve, seed, s, len),
    endCap: {
      x: end.x + end.nx * 3 * s,
      y: end.y + end.ny * 3 * s,
      r: 5 * s,
      color: pal.main.light,
      dark: pal.main.dark,
    },
    startCurl: {
      x: start.x,
      y: start.y,
      nx: start.nx,
      ny: start.ny,
      radius: 10 * s,
      color: pal.second.light,
      dark: pal.second.dark,
    },
  };
}

function animatedCurve(base, wobble, age) {
  if (wobble <= 0.01) return base;
  return base.map((p, i) => {
    const x =
      p.x +
      Math.sin(age / 720 + i * 0.52) * wobble +
      Math.sin(age / 1100 + i * 0.2) * wobble * 0.4;
    const y =
      p.y +
      Math.cos(age / 680 + i * 0.48) * wobble +
      Math.cos(age / 950 + i * 0.25) * wobble * 0.4;
    const prev = base[Math.max(0, i - 1)];
    const next = base[Math.min(base.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const mag = Math.hypot(tx, ty) || 1;
    return { x, y, nx: -ty / mag, ny: tx / mag, t: p.t };
  });
}

function ribbonStrokeColors(ribbon) {
  return {
    start: ribbon.colorStart || ribbon.color || "#00D4FF",
    end: ribbon.colorEnd || ribbon.color || "#FF69B4",
  };
}

/** 한 리본을 곡선 전체에 이어 그림 (세그먼트 분할 stroke 제거) */
function drawRibbonPath(ctx, curve, ribbon, alpha, reveal, spread) {
  const n = curve.length;
  if (n < 2 || reveal <= 0) return;

  const off = ribbon.offset * spread;
  const endIdx = Math.max(1, Math.min(n - 1, Math.ceil(reveal * (n - 1))));
  const colors = ribbonStrokeColors(ribbon);
  const strokeA = Math.min(1, alpha * (ribbon.alphaMul ?? 0.9) * Math.min(1, reveal * 1.15));
  if (strokeA <= 0.02) return;

  const pts = [];
  for (let i = 0; i <= endIdx; i++) {
    const p = curve[i];
    pts.push({ x: p.x + p.nx * off, y: p.y + p.ny * off });
  }
  if (pts.length < 2) return;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const midT = 0.5;
  const lineW = Math.max(
    2.5,
    lerp(ribbon.widthStart, ribbon.widthEnd, midT) * (0.95 + spread * 0.08)
  );

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const mx = (p0.x + p1.x) * 0.5;
    const my = (p0.y + p1.y) * 0.5;
    ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
  }
  ctx.lineTo(last.x, last.y);

  const grd = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
  grd.addColorStop(0, rgbaFromHex(colors.start, strokeA));
  grd.addColorStop(0.55, rgbaFromHex(colors.end, strokeA * 0.95));
  grd.addColorStop(1, rgbaFromHex(colors.end, strokeA * 0.75));
  ctx.strokeStyle = grd;
  ctx.lineWidth = lineW;
  ctx.stroke();
  ctx.restore();
}

function drawSpiral(ctx, sp, alpha, reveal, spread) {
  if (reveal < 0.35) return;
  const a = alpha * Math.min(1, (reveal - 0.35) / 0.5) * 0.9;
  const rBase = safeRadius(sp.radius * (0.85 + spread * 0.2));

  ctx.save();
  ctx.translate(sp.x, sp.y);
  ctx.rotate(Math.atan2(sp.ny, sp.nx) + Math.PI * 0.45);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.2, rBase * 0.14);

  const steps = Math.floor(18 + sp.turns * 14);
  let first = true;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const ang = t * Math.PI * 2 * sp.turns;
    const rad = rBase * (0.15 + t * 0.95);
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    if (first) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      first = false;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.strokeStyle = rgbaFromHex(sp.color, a);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, safeRadius(rBase * 0.12), 0, Math.PI * 2);
  ctx.fillStyle = rgbaFromHex("#ffffff", a * 0.7);
  ctx.fill();
  ctx.restore();
}

function drawPetal(ctx, petal, alpha, reveal, spread) {
  const born = Math.max(0, Math.min(1, reveal * 1.1 - 0.05));
  if (born <= 0) return;
  const a = alpha * born * 0.88;
  const sz = petal.size * (0.7 + spread * 0.25);

  ctx.save();
  ctx.translate(petal.x, petal.y);
  ctx.rotate(petal.angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(sz * 0.35, -sz * 0.5, sz * 0.9, -sz * 0.35, 0, -sz);
  ctx.bezierCurveTo(-sz * 0.9, -sz * 0.35, -sz * 0.35, -sz * 0.5, 0, 0);
  const grd = ctx.createLinearGradient(0, -sz, 0, 0);
  grd.addColorStop(0, rgbaFromHex(petal.color, a));
  grd.addColorStop(1, rgbaFromHex(petal.dark, a * 0.5));
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.restore();
}

function drawBokeh(ctx, orb, alpha, reveal) {
  const a = alpha * orb.a * Math.min(1, reveal * 1.2);
  if (a <= 0.01) return;
  const grd = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
  grd.addColorStop(0, `rgba(255,255,255,${a})`);
  grd.addColorStop(0.45, `rgba(255,220,255,${a * 0.35})`);
  grd.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.beginPath();
  ctx.arc(orb.x, orb.y, safeRadius(orb.r), 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
}

function drawSparkle(ctx, sp, alpha, reveal, age) {
  const tw = 0.5 + Math.sin(age / 400 + sp.rot * 10) * 0.5;
  const a = alpha * tw * Math.min(1, reveal * 1.3);
  if (a <= 0.05) return;

  ctx.save();
  ctx.translate(sp.x, sp.y);
  ctx.rotate(sp.rot + age / 2000);
  ctx.strokeStyle = `rgba(255,255,255,${a})`;
  ctx.lineWidth = Math.max(0.8, sp.size * 0.2);
  ctx.lineCap = "round";
  const s = sp.size;
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.lineTo(s, 0);
  ctx.moveTo(0, -s);
  ctx.lineTo(0, s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, safeRadius(s * 0.25), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
  ctx.fill();
  ctx.restore();
}

function drawEndCap(ctx, cap, alpha, reveal) {
  if (reveal < 0.8) return;
  const a = alpha * Math.min(1, (reveal - 0.8) / 0.2);
  const capR = safeRadius(cap.r);
  const grd = ctx.createRadialGradient(cap.x, cap.y, 0, cap.x, cap.y, capR);
  grd.addColorStop(0, rgbaFromHex("#ffffff", a * 0.9));
  grd.addColorStop(0.5, rgbaFromHex(cap.color, a));
  grd.addColorStop(1, rgbaFromHex(cap.dark || cap.color, a * 0.6));
  ctx.beginPath();
  ctx.arc(cap.x, cap.y, capR, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
}

function drawStartCurl(ctx, curl, alpha, reveal) {
  if (reveal < 0.15) return;
  const a = alpha * Math.min(1, reveal * 1.1);
  ctx.save();
  ctx.translate(curl.x, curl.y);
  ctx.rotate(Math.atan2(curl.ny, curl.nx) + Math.PI * 0.5);
  const r = safeRadius(curl.radius);
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.lineCap = "round";
  const grd = ctx.createLinearGradient(-r, 0, r, 0);
  grd.addColorStop(0, rgbaFromHex(curl.dark || curl.color, a * 0.7));
  grd.addColorStop(1, rgbaFromHex(curl.color, a));
  ctx.strokeStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 0.15, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.7, -r * 0.1, safeRadius(r * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = rgbaFromHex("#ffffff", a * 0.75);
  ctx.fill();
  ctx.restore();
}

export function drawFlourish(ctx, flourish, evolve) {
  if (!flourish || !evolve) return;

  const r = Math.max(0, Math.min(1, evolve.reveal));
  if (r <= 0) return;

  const alpha = evolve.pulse;
  const spread = evolve.spread;
  const driftPx = evolve.splatDrift * (38 * (flourish.scale || 1));
  const curve = animatedCurve(flourish.curve, evolve.wobble, evolve.age);

  (flourish.bokeh || []).forEach((orb) => {
    drawBokeh(ctx, orb, alpha, r * 0.85);
  });

  const ribbons = flourish.ribbons || [];
  ribbons.forEach((ribbon) => {
    drawRibbonPath(ctx, curve, ribbon, alpha, r, spread);
  });

  const centerRibbon = {
    offset: 0,
    colorStart: flourish.palette?.main?.dark || "#0066CC",
    colorEnd: flourish.palette?.main?.light || "#00D4FF",
    widthStart: (ribbons[1]?.widthStart || 4) * 1.05,
    widthEnd: (ribbons[1]?.widthEnd || 0.8) * 1.1,
    alphaMul: 0.98,
  };
  drawRibbonPath(ctx, curve, centerRibbon, alpha, r, spread * 0.92);

  const splatN = flourish.splatters.length || 1;
  flourish.splatters.forEach((sp, i) => {
    const t = i / splatN;
    const bornIn = Math.max(0, Math.min(1, (r - t) * 2.5 + 0.25));
    if (bornIn <= 0) return;
    const sx = sp.x + sp.driftNx * driftPx;
    const sy = sp.y + sp.driftNy * driftPx;
    ctx.beginPath();
    ctx.arc(sx, sy, safeRadius(sp.r * bornIn * (1 + evolve.splatDrift * 0.35)), 0, Math.PI * 2);
    ctx.fillStyle = rgbaFromHex(sp.color, alpha * sp.a * bornIn * 0.55);
    ctx.fill();
  });

  (flourish.petals || []).forEach((petal) => {
    drawPetal(ctx, petal, alpha, r, spread);
  });

  (flourish.spirals || []).forEach((sp) => {
    drawSpiral(ctx, sp, alpha, r, spread);
  });

  (flourish.sparkles || []).forEach((sp) => {
    drawSparkle(ctx, sp, alpha, r, evolve.age);
  });

  const end = curve[curve.length - 1];
  const start = curve[0];
  drawStartCurl(
    ctx,
    {
      x: start.x,
      y: start.y,
      nx: start.nx,
      ny: start.ny,
      radius: flourish.startCurl.radius * (0.9 + spread * 0.15),
      color: flourish.startCurl.color,
      dark: flourish.startCurl.dark,
    },
    alpha,
    r
  );
  drawEndCap(
    ctx,
    {
      x: end.x + end.nx * 3 * flourish.scale,
      y: end.y + end.ny * 3 * flourish.scale,
      r: flourish.endCap.r * (0.95 + spread * 0.12),
      color: flourish.endCap.color,
      dark: flourish.endCap.dark,
    },
    alpha,
    r
  );
}

const REVEAL_MS = 620;

export function getFlourishEvolve(path, now) {
  const born = path.born ?? now;
  const age = now - born;
  const reveal = Math.min(1, age / REVEAL_MS);
  const growAge = Math.max(0, age - REVEAL_MS);
  const spread = 1 + (1 - Math.exp(-growAge / 2600)) * 0.72;
  const splatDrift = 1 - Math.exp(-growAge / 2000);
  const pulse = 0.88 + Math.sin(age / 820) * 0.12;
  const wobble = (1 - Math.exp(-growAge / 3200)) * 4.5;

  return { reveal, spread, splatDrift, pulse, wobble, age };
}
