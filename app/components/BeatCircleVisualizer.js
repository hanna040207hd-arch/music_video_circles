"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./BeatCircleVisualizer.module.css";

const W = 1400;
const H = 875;
const STEPS = 16;
const MARGIN = 64;
const SIZE_SCALE = Math.min(W / 680, H / 440);
const CIRCLE_SIZE_MIN = Math.round(28 * SIZE_SCALE);
const CIRCLE_SIZE_MAX = Math.round(88 * SIZE_SCALE);
const CIRCLE_SIZE_FLOOR = Math.round(16 * SIZE_SCALE);
const CIRCLE_MIN_RADIUS = Math.round(14 * SIZE_SCALE);
const CIRCLE_STACK_SHRINK = 3 * SIZE_SCALE;

const PALETTE = [
  { base: "#E8185A", light: "#FF80AB", mid: "#F06292", dark: "#AD1457" },
  { base: "#8BC34A", light: "#CCFF90", mid: "#AED581", dark: "#558B2F" },
  { base: "#FFD600", light: "#FFFF8D", mid: "#FFF176", dark: "#F9A825" },
  { base: "#E91E63", light: "#FF80AB", mid: "#F48FB1", dark: "#880E4F" },
  { base: "#76C442", light: "#B5EF8A", mid: "#9CCC65", dark: "#33691E" },
  { base: "#FF6F00", light: "#FFD180", mid: "#FFAB40", dark: "#E65100" },
  { base: "#EC407A", light: "#F48FB1", mid: "#F06292", dark: "#AD1457" },
  { base: "#BDBDBD", light: "#EEEEEE", mid: "#E0E0E0", dark: "#9E9E9E" },
];

const DRUM_TRACKS = {
  kick: {
    label: "Kick",
    color: "#E2185A",
    pal: 0,
    sound: { freq: 60, type: "sine", decay: 0.45, noise: false, drop: true },
  },
  snare: {
    label: "Snare",
    color: "#F57C00",
    pal: 5,
    sound: { freq: 2200, type: "square", decay: 0.18, noise: true },
  },
  hihat: {
    label: "Hat",
    color: "#00897B",
    pal: 2,
    sound: { freq: 900, type: "square", decay: 0.08, noise: true },
  },
  bass: {
    label: "Bass",
    color: "#6C3ABA",
    pal: 6,
    sound: { freq: 80, type: "sawtooth", decay: 0.35, noise: false },
  },
  perc: {
    label: "Perc",
    color: "#1565C0",
    pal: 4,
    sound: { freq: 300, type: "triangle", decay: 0.12, noise: false },
  },
};

const DRUM_TRACK_KEYS = Object.keys(DRUM_TRACKS);

const KEYS = [
  { key: "q", pal: 0 },
  { key: "w", pal: 1 },
  { key: "e", pal: 2 },
  { key: "r", pal: 3 },
  { key: "a", pal: 4 },
  { key: "s", pal: 5 },
  { key: "d", pal: 6 },
  { key: "f", pal: 7 },
  { key: "z", pal: 0 },
  { key: "x", pal: 1 },
  { key: "c", pal: 2 },
  { key: "v", pal: 3 },
  { key: "1", pal: 4 },
  { key: "2", pal: 5 },
  { key: "3", pal: 6 },
  { key: "4", pal: 7 },
];

const SOUNDS = [
  { freq: 55, type: "sine", decay: 0.5 },
  { freq: 180, type: "square", decay: 0.18 },
  { freq: 900, type: "square", decay: 0.07 },
  { freq: 70, type: "sine", decay: 0.4 },
  { freq: 80, type: "sawtooth", decay: 0.38 },
  { freq: 320, type: "square", decay: 0.1 },
  { freq: 440, type: "triangle", decay: 0.25 },
  { freq: 110, type: "sawtooth", decay: 0.35 },
  { freq: 55, type: "sine", decay: 0.5 },
  { freq: 200, type: "square", decay: 0.15 },
  { freq: 600, type: "triangle", decay: 0.2 },
  { freq: 330, type: "sawtooth", decay: 0.3 },
  { freq: 750, type: "sine", decay: 0.15 },
  { freq: 220, type: "triangle", decay: 0.28 },
  { freq: 120, type: "sine", decay: 0.32 },
  { freq: 160, type: "sawtooth", decay: 0.3 },
];

const SQ_ON_CLASS = {
  kick: styles.sqOnKick,
  snare: styles.sqOnSnare,
  hihat: styles.sqOnHihat,
  bass: styles.sqOnBass,
  perc: styles.sqOnPerc,
};

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeHex(color) {
  if (!color || color[0] !== "#") return "#ffffff";
  if (color.length === 4) {
    return (
      "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
    );
  }
  return color.length === 7 ? color : "#ffffff";
}

function withAlpha(color, alpha) {
  const hex = normalizeHex(color);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const MIN_POINT_DIST = 6;

function segmentLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function totalPathsLength(paths) {
  let total = 0;
  paths.forEach((path) => {
    const pts = path.points;
    for (let i = 1; i < pts.length; i++) {
      total += segmentLength(pts[i - 1], pts[i]);
    }
  });
  return total;
}

function sampleOnPaths(paths, distance) {
  let remaining = distance;
  for (let p = 0; p < paths.length; p++) {
    const pts = paths[p].points;
    if (pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      const seg = segmentLength(pts[i - 1], pts[i]);
      if (remaining <= seg || (p === paths.length - 1 && i === pts.length - 1)) {
        const t = seg > 0 ? remaining / seg : 0;
        const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
        const y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t;
        const mag = seg || 1;
        return {
          x,
          y,
          tangent: { x: (pts[i].x - pts[i - 1].x) / mag, y: (pts[i].y - pts[i - 1].y) / mag },
        };
      }
      remaining -= seg;
    }
  }
  const lastPath = paths[paths.length - 1];
  const last = lastPath?.points[lastPath.points.length - 1];
  return last ? { x: last.x, y: last.y, tangent: { x: 1, y: 0 } } : null;
}

function getSpawnOnPaths(paths, cursorRef) {
  const total = totalPathsLength(paths);
  if (total < 24) return null;
  cursorRef.current = (cursorRef.current + rand(30, 95)) % total;
  const sample = sampleOnPaths(paths, cursorRef.current);
  if (!sample) return null;
  return {
    x: sample.x + rand(-8, 8),
    y: sample.y + rand(-8, 8),
    tangent: sample.tangent,
  };
}

function drawUserPaths(c, paths, activeStroke) {
  c.lineCap = "round";
  c.lineJoin = "round";

  paths.forEach((path) => {
    const pts = path.points;
    if (pts.length < 2) return;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.strokeStyle = "rgba(40,40,40,0.22)";
    c.lineWidth = 2.5;
    c.stroke();
  });

  if (activeStroke && activeStroke.points.length >= 2) {
    const pts = activeStroke.points;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.strokeStyle = "rgba(226,24,90,0.55)";
    c.lineWidth = 3;
    c.stroke();
  }
}

function randomSpawnPos() {
  const bias = Math.random();
  const x =
    bias < 0.33
      ? rand(MARGIN, W * 0.38)
      : bias < 0.66
        ? rand(W * 0.32, W * 0.68)
        : rand(W * 0.62, W - MARGIN);
  const y =
    Math.random() < 0.5
      ? rand(MARGIN, H * 0.55)
      : rand(H * 0.45, H - MARGIN);
  return {
    x: x + rand(-35, 35),
    y: y + rand(-28, 28),
  };
}

function paletteColor(pal, kind) {
  const tones = [pal.base, pal.mid, pal.light, pal.dark, "#ffffff"];
  return normalizeHex(tones[kind ?? Math.floor(Math.random() * tones.length)]);
}

function buildMixedRingColors(primaryPalIdx, ringCount) {
  const primary = PALETTE[primaryPalIdx % PALETTE.length];
  const colors = [];
  for (let i = 0; i < ringCount; i++) {
    if (Math.random() < 0.45) {
      colors.push(paletteColor(primary));
    } else {
      const extra = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      colors.push(paletteColor(Math.random() < 0.5 ? primary : extra));
    }
  }
  return colors;
}

function emptyDrumPattern() {
  return DRUM_TRACK_KEYS.reduce((acc, k) => {
    acc[k] = new Array(STEPS).fill(false);
    return acc;
  }, {});
}

function makeRandomDrumPattern() {
  return {
    kick: Array.from(
      { length: STEPS },
      (_, i) => (Math.random() < 0.45 && i % 4 === 0) || Math.random() < 0.12
    ),
    snare: Array.from(
      { length: STEPS },
      (_, i) => (Math.random() < 0.5 && i % 4 === 2) || Math.random() < 0.1
    ),
    hihat: Array.from({ length: STEPS }, () => Math.random() < 0.55),
    bass: Array.from({ length: STEPS }, () => Math.random() < 0.25),
    perc: Array.from({ length: STEPS }, () => Math.random() < 0.2),
  };
}

function createSlots() {
  const slots = {};
  [...KEYS.map((k) => k.key), ...DRUM_TRACK_KEYS].forEach((id) => {
    slots[id] = { circles: [], last: null };
  });
  return slots;
}

class MCircle {
  constructor(x, y, size, rings, ringColors, slotId) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.rings = rings;
    this.ringColors = ringColors.map(normalizeHex);
    this.slotId = slotId;
    this.ringStretch = 0.72 + Math.random() * 0.22;
    this.ringRadii = Array.from({ length: rings }, (_, i) => {
      const t = i / Math.max(rings - 1, 1);
      const shrink = 0.35 + t * 0.5;
      return Math.max(size * (1 - shrink), 8 * SIZE_SCALE);
    });
    this.ringWidths = Array.from({ length: rings }, (_, i) =>
      i === 0 ? rand(2.5, 4.5) : rand(1.2, 2.8)
    );
    this.centerR = size * rand(0.12, 0.22);
    this.drift = rand(0.3, 0.55);
    this.age = 0;
    this.maxAge = 180 + Math.random() * 200;
    this.alpha = 0;
    this.vx = rand(-1.8, 1.8);
    this.vy = rand(-1.4, 1.4);
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpd = rand(0.006, 0.022);
    this.rot = rand(-0.12, 0.12);
    this.scale = rand(0.85, 1.15);
    this.done = false;
    this.pulse = 0;
  }

  trigger() {
    this.pulse = 1;
    this.scale = Math.min(this.scale + rand(0.05, 0.2), 1.45);
  }

  applyPathMotion(tangent) {
    const speed = rand(0.5, 1.3);
    this.vx = tangent.x * speed;
    this.vy = tangent.y * speed;
    this.drift = rand(0.06, 0.18);
  }

  update() {
    this.age++;
    this.wobble += this.wobbleSpd;
    this.pulse *= 0.88;
    const progress = this.age / this.maxAge;
    if (progress < 0.08) this.alpha = Math.max(0.2, progress / 0.08);
    else if (progress > 0.72) this.alpha = 1 - (progress - 0.72) / 0.28;
    else this.alpha = 1;
    this.x += this.vx * this.drift;
    this.y += this.vy * this.drift;
    if (this.x < this.size) this.vx = Math.abs(this.vx) * 0.75;
    if (this.x > W - this.size) this.vx = -Math.abs(this.vx) * 0.75;
    if (this.y < this.size) this.vy = Math.abs(this.vy) * 0.75;
    if (this.y > H - this.size) this.vy = -Math.abs(this.vy) * 0.75;
    if (this.age >= this.maxAge) this.done = true;
  }

  draw(c) {
    if (this.done || this.alpha <= 0.01) return;
    const { rings, alpha, ringColors, pulse, ringStretch, rot, wobble } = this;
    const scl = this.scale * (1 + pulse * 0.22);

    try {
      c.save();
      c.globalAlpha = alpha * 0.92;
      c.translate(this.x, this.y);
      c.rotate(rot + wobble * 0.06);
      c.scale(scl, scl * ringStretch);

      for (let i = 0; i < rings; i++) {
        const r = this.ringRadii[i];
        if (r < 2) continue;
        const colA = normalizeHex(ringColors[i % ringColors.length]);
        const colB = normalizeHex(ringColors[(i + 2) % ringColors.length]);

        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        if (i < rings - 1) {
          const grd = c.createRadialGradient(0, 0, 0, 0, 0, r);
          grd.addColorStop(0, withAlpha(colB, 0.85));
          grd.addColorStop(0.5, colA);
          grd.addColorStop(1, withAlpha(colA, 0.55));
          c.fillStyle = grd;
          c.fill();
        } else {
          c.fillStyle = withAlpha(colA, 0.35);
          c.fill();
        }
        c.strokeStyle = colA;
        c.lineWidth = this.ringWidths[i];
        c.stroke();
      }

      c.beginPath();
      c.arc(0, 0, this.centerR, 0, Math.PI * 2);
      c.fillStyle = pulse > 0.15 ? ringColors[0] : ringColors[1] || ringColors[0];
      c.fill();
      c.restore();
    } catch {
      c.restore();
      this.done = true;
    }
  }
}

class Trail {
  constructor(x1, y1, x2, y2, col) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.col = col;
    this.alpha = rand(0.35, 0.65);
    this.fade = rand(0.007, 0.011);
    this.lineWidth = rand(0.8, 1.6);
    this.done = false;
  }

  update() {
    this.alpha -= this.fade;
    if (this.alpha <= 0) this.done = true;
  }

  draw(c) {
    c.save();
    c.globalAlpha = this.alpha;
    c.beginPath();
    c.moveTo(this.x1, this.y1);
    c.lineTo(this.x2, this.y2);
    c.strokeStyle = this.col;
    c.lineWidth = this.lineWidth;
    c.setLineDash([4, 8]);
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }
}

function drawBg(c) {
  c.fillStyle = "#fff";
  c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(200,220,200,.18)";
  const gs = 18;
  for (let x = gs / 2; x < W; x += gs) {
    for (let y = gs / 2; y < H; y += gs) {
      c.beginPath();
      c.arc(x, y, 1.2, 0, Math.PI * 2);
      c.fill();
    }
  }
}

export default function BeatCircleVisualizer() {
  const canvasRef = useRef(null);
  const circlesRef = useRef([]);
  const trailsRef = useRef([]);
  const slotsRef = useRef(createSlots());
  const audioCtxRef = useRef(null);
  const animIdRef = useRef(null);
  const seqStepRef = useRef(0);
  const seqTimerRef = useRef(null);
  const heldRef = useRef(new Set());
  const flashTimersRef = useRef({});
  const pathsRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const pathCursorRef = useRef(0);
  const isDrawingRef = useRef(false);

  const [bpm, setBpm] = useState(120);
  const [seqRunning, setSeqRunning] = useState(false);
  const [seqCurStep, setSeqCurStep] = useState(-1);
  const [drumPattern, setDrumPattern] = useState(emptyDrumPattern);
  const [flashingKeys, setFlashingKeys] = useState({});

  const drumPatternRef = useRef(drumPattern);

  useEffect(() => {
    drumPatternRef.current = drumPattern;
  }, [drumPattern]);

  const getAC = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }, []);

  const playDrumSound = useCallback(
    (trackId) => {
      const track = DRUM_TRACKS[trackId];
      const s = track.sound;
      const a = getAC();
      a.resume();
      const g = a.createGain();
      g.gain.setValueAtTime(0.65, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + s.decay);
      g.connect(a.destination);

      if (s.noise) {
        const buf = a.createBuffer(1, a.sampleRate * s.decay, a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        }
        const src = a.createBufferSource();
        src.buffer = buf;
        const f = a.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = s.freq;
        f.Q.value = 0.4;
        src.connect(f);
        f.connect(g);
        src.start();
      } else {
        const osc = a.createOscillator();
        osc.type = s.type;
        osc.frequency.value = s.freq;
        if (s.drop) {
          osc.frequency.exponentialRampToValueAtTime(s.freq * 0.4, a.currentTime + 0.15);
        }
        osc.connect(g);
        osc.start();
        osc.stop(a.currentTime + s.decay + 0.05);
      }
    },
    [getAC]
  );

  const playKeySound = useCallback(
    (idx) => {
      const a = getAC();
      a.resume();
      const s = SOUNDS[idx % SOUNDS.length];
      const g = a.createGain();
      g.gain.setValueAtTime(0.6, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + s.decay);
      g.connect(a.destination);
      const isNoise = idx === 1 || idx === 2 || idx === 5;
      if (isNoise) {
        const buf = a.createBuffer(1, a.sampleRate * s.decay, a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
        }
        const src = a.createBufferSource();
        src.buffer = buf;
        const f = a.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = s.freq;
        f.Q.value = 0.6;
        src.connect(f);
        f.connect(g);
        src.start();
      } else {
        const osc = a.createOscillator();
        osc.type = s.type;
        osc.frequency.value = s.freq;
        if (idx === 0 || idx === 3) {
          osc.frequency.exponentialRampToValueAtTime(s.freq * 0.3, a.currentTime + 0.15);
        }
        osc.connect(g);
        osc.start();
        osc.stop(a.currentTime + s.decay + 0.05);
      }
    },
    [getAC]
  );

  const spawnCircle = useCallback((slotId, palIdx, sizeBoost = 0) => {
    const onPath = getSpawnOnPaths(pathsRef.current, pathCursorRef);
    const pos = onPath
      ? { x: onPath.x, y: onPath.y }
      : randomSpawnPos();
    const tangent = onPath?.tangent;
    const slot = slotsRef.current[slotId];
    const existCount = slot.circles.filter((cc) => !cc.done).length;
    const size =
      rand(CIRCLE_SIZE_MIN, CIRCLE_SIZE_MAX) -
      existCount * CIRCLE_STACK_SHRINK +
      sizeBoost;
    const rings = Math.floor(rand(3, 7));
    if (size < CIRCLE_SIZE_FLOOR) return;

    const ringColors = buildMixedRingColors(palIdx, rings);
    const mc = new MCircle(
      pos.x,
      pos.y,
      Math.max(size, CIRCLE_MIN_RADIUS),
      rings,
      ringColors,
      slotId
    );
    if (tangent) mc.applyPathMotion(tangent);

    if (slot.last && !slot.last.done) {
      trailsRef.current.push(
        new Trail(slot.last.x, slot.last.y, mc.x, mc.y, withAlpha(pick(ringColors), 0.67))
      );
    }

    slot.circles.forEach((cc) => {
      if (!cc.done) cc.trigger();
    });
    slot.circles.push(mc);
    slot.last = mc;
    circlesRef.current.push(mc);
  }, []);

  const hitDrum = useCallback(
    (trackId) => {
      const track = DRUM_TRACKS[trackId];
      playDrumSound(trackId);
      spawnCircle(trackId, track.pal, rand(0, 18 * SIZE_SCALE));
    },
    [playDrumSound, spawnCircle]
  );

  const flashKey = useCallback((key) => {
    const keyDef = KEYS.find((k) => k.key === key);
    if (!keyDef) return;
    if (flashTimersRef.current[key]) clearTimeout(flashTimersRef.current[key]);
    setFlashingKeys((prev) => ({ ...prev, [key]: true }));
    flashTimersRef.current[key] = setTimeout(() => {
      setFlashingKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete flashTimersRef.current[key];
    }, 130);
  }, []);

  const hitKey = useCallback(
    (keyDef, keyIdx) => {
      playKeySound(keyIdx);
      spawnCircle(keyDef.key, keyDef.pal, rand(-5 * SIZE_SCALE, 12 * SIZE_SCALE));
      flashKey(keyDef.key);
    },
    [playKeySound, spawnCircle, flashKey]
  );

  const toggleDrumStep = useCallback((trackId, index) => {
    setDrumPattern((prev) => {
      const next = { ...prev, [trackId]: [...prev[trackId]] };
      next[trackId][index] = !next[trackId][index];
      return next;
    });
  }, []);

  const clearPaths = useCallback(() => {
    pathsRef.current = [];
    activeStrokeRef.current = null;
    pathCursorRef.current = 0;
    isDrawingRef.current = false;
  }, []);

  const clearAll = useCallback(() => {
    circlesRef.current = [];
    trailsRef.current = [];
    slotsRef.current = createSlots();
    clearPaths();
    setDrumPattern(emptyDrumPattern());
    setSeqRunning(false);
    setSeqCurStep(-1);
    seqStepRef.current = 0;
    if (seqTimerRef.current) clearTimeout(seqTimerRef.current);
  }, [clearPaths]);

  const randomAll = useCallback(() => {
    setDrumPattern(makeRandomDrumPattern());
  }, []);

  const toggleSeq = useCallback(() => {
    setSeqRunning((r) => !r);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function render() {
      drawBg(ctx);
      drawUserPaths(ctx, pathsRef.current, activeStrokeRef.current);
      trailsRef.current = trailsRef.current.filter((t) => !t.done);
      trailsRef.current.forEach((t) => {
        t.update();
        t.draw(ctx);
      });
      circlesRef.current = circlesRef.current.filter((cc) => !cc.done);
      Object.values(slotsRef.current).forEach((sl) => {
        sl.circles = sl.circles.filter((cc) => !cc.done);
      });
      circlesRef.current.forEach((cc) => {
        cc.update();
        try {
          cc.draw(ctx);
        } catch {
          cc.done = true;
        }
      });
      animIdRef.current = requestAnimationFrame(render);
    }

    render();
    return () => {
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      Object.values(flashTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const keyMap = {};
    KEYS.forEach((k, i) => {
      keyMap[k.key] = { def: k, idx: i };
    });

    function onKeyDown(e) {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (keyMap[k] && !heldRef.current.has(k)) {
        heldRef.current.add(k);
        hitKey(keyMap[k].def, keyMap[k].idx);
      }
    }

    function onKeyUp(e) {
      heldRef.current.delete(e.key.toLowerCase());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [hitKey]);

  useEffect(() => {
    if (!seqRunning) {
      if (seqTimerRef.current) clearTimeout(seqTimerRef.current);
      setSeqCurStep(-1);
      seqStepRef.current = 0;
      return;
    }

    function tickSeq() {
      const step = seqStepRef.current;
      const pat = drumPatternRef.current;
      DRUM_TRACK_KEYS.forEach((trackId) => {
        if (pat[trackId][step]) hitDrum(trackId);
      });
      setSeqCurStep(step);
      seqStepRef.current = (step + 1) % STEPS;
      seqTimerRef.current = setTimeout(tickSeq, 60000 / bpm / 4);
    }

    seqStepRef.current = 0;
    tickSeq();

    return () => {
      if (seqTimerRef.current) clearTimeout(seqTimerRef.current);
    };
  }, [seqRunning, bpm, hitDrum]);

  const getCanvasPoint = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: Math.max(0, Math.min(W, (clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(H, (clientY - rect.top) * scaleY)),
    };
  }, []);

  const appendStrokePoint = useCallback(
    (clientX, clientY) => {
      const pt = getCanvasPoint(clientX, clientY);
      if (!pt || !activeStrokeRef.current) return;
      const pts = activeStrokeRef.current.points;
      const last = pts[pts.length - 1];
      if (last && segmentLength(last, pt) < MIN_POINT_DIST) return;
      pts.push(pt);
    },
    [getCanvasPoint]
  );

  const finishStroke = useCallback(() => {
    const stroke = activeStrokeRef.current;
    if (stroke && stroke.points.length >= 2) {
      pathsRef.current.push(stroke);
    }
    activeStrokeRef.current = null;
    isDrawingRef.current = false;
  }, []);

  const onCanvasPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      isDrawingRef.current = true;
      activeStrokeRef.current = { points: [pt] };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [getCanvasPoint]
  );

  const onCanvasPointerMove = useCallback(
    (e) => {
      if (!isDrawingRef.current) return;
      appendStrokePoint(e.clientX, e.clientY);
    },
    [appendStrokePoint]
  );

  const onCanvasPointerUp = useCallback(
    (e) => {
      if (!isDrawingRef.current) return;
      appendStrokePoint(e.clientX, e.clientY);
      finishStroke();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [appendStrokePoint, finishStroke]
  );

  return (
    <div className={styles.root}>
      <div className={styles.canvasWrap}>
        <p className={styles.drawHint}>캔버스에 드래그해 선을 그으면, 원이 선을 따라 나타납니다</p>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          width={W}
          height={H}
          aria-label="Music video circles"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        />
        <div className={styles.hud}>
          <div className={styles.keyGroup}>
            {KEYS.map((k, i) => {
              const pal = PALETTE[k.pal];
              const flashing = flashingKeys[k.key];
              return (
                <button
                  key={k.key}
                  type="button"
                  className={`${styles.kkey} ${flashing ? styles.kkeyActive : ""}`}
                  style={{
                    borderColor: flashing ? pal.base : pal.base + "66",
                    background: flashing ? pal.base : "#f5f5f5",
                    color: flashing ? "#fff" : "#333",
                  }}
                  onPointerDown={() => hitKey(k, i)}
                  aria-label={`Key ${k.key.toUpperCase()}`}
                >
                  {k.key.toUpperCase()}
                </button>
              );
            })}
          </div>
          <div className={styles.sep} />
          <div className={styles.bpmRow}>
            <span>BPM</span>
            <input
              type="range"
              min={60}
              max={180}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
            />
            <span>{bpm}</span>
          </div>
          <div className={styles.ctrlRow}>
            <button
              type="button"
              className={`${styles.bb2} ${seqRunning ? styles.bb2On : ""}`}
              onClick={toggleSeq}
            >
              {seqRunning ? "■ Stop" : "▶ Play"}
            </button>
            <button type="button" className={styles.bb2} onClick={randomAll}>
              Random
            </button>
            <button type="button" className={styles.bb2} onClick={clearPaths}>
              선 지우기
            </button>
            <button type="button" className={styles.bb2} onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className={styles.seqPanel}>
        {DRUM_TRACK_KEYS.map((trackId) => {
          const track = DRUM_TRACKS[trackId];
          return (
            <div key={trackId} className={styles.seqRow}>
              <span className={styles.seqLabel} style={{ color: track.color }}>
                {track.label}
              </span>
              <div className={styles.seqSteps}>
                {drumPattern[trackId].map((on, i) => (
                  <button
                    key={i}
                    type="button"
                    className={[
                      styles.sq,
                      on ? SQ_ON_CLASS[trackId] : "",
                      seqRunning && i === seqCurStep ? styles.sqCur : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => toggleDrumStep(trackId, i)}
                    aria-label={`${track.label} step ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
