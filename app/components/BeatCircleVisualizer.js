"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCanvasRecorder,
  downloadBlob,
} from "../lib/canvasRecorder";
import {
  defaultOverlayText,
  drawOverlayText,
  hitTestOverlayText,
} from "../lib/overlayText";
import {
  buildFlourishFromStroke,
  drawFlourish,
  drawStrokeFanPreview,
  getFlourishEvolve,
} from "../lib/pathFlourish";
import {
  createVideoWorkSurface,
  drawIdleBackground,
  drawVectorVideoBackground,
} from "../lib/videoVectorFilter";
import styles from "./BeatCircleVisualizer.module.css";

const W = 1200;
const H = 750;
const STEPS = 16;
const MARGIN = 64;
const SIZE_SCALE = Math.min(W / 680, H / 440);
const CIRCLE_SIZE_MIN = Math.round(28 * SIZE_SCALE);
const CIRCLE_SIZE_MAX = Math.round(88 * SIZE_SCALE);
const CIRCLE_SIZE_FLOOR = Math.round(16 * SIZE_SCALE);
const CIRCLE_MIN_RADIUS = Math.round(14 * SIZE_SCALE);
const CIRCLE_STACK_SHRINK = 5 * SIZE_SCALE;
const MAX_CIRCLES_PER_SLOT = 4;
const MAX_TOTAL_CIRCLES = 36;
const MIN_SPAWN_GAP = 38 * SIZE_SCALE;
const SPAWN_RETRY = 5;
const MAX_PERSISTENT_PATHS = 24;

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
    color: "#FF1493",
    pal: 0,
    sound: { freq: 60, type: "sine", decay: 0.45, noise: false, drop: true },
  },
  snare: {
    label: "Snare",
    color: "#FFD600",
    pal: 5,
    sound: { freq: 2200, type: "square", decay: 0.18, noise: true },
  },
  hihat: {
    label: "Hat",
    color: "#39FF14",
    pal: 2,
    sound: { freq: 900, type: "square", decay: 0.08, noise: true },
  },
  bass: {
    label: "Bass",
    color: "#7B2CFF",
    pal: 6,
    sound: { freq: 80, type: "sawtooth", decay: 0.35, noise: false },
  },
  perc: {
    label: "Perc",
    color: "#00FFFF",
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

const DEFAULT_BG_SLOTS = [
  "#ffffff",
  "#d4f5ef",
  "#fff8e7",
  "#e8e4ff",
  "#ffe8f0",
];
const BG_SLOTS_STORAGE_KEY = "beat-circle-bg-slots";
const BG_COLOR_STORAGE_KEY = "beat-circle-bg-current";

function loadBgSlotsFromStorage() {
  if (typeof window === "undefined") return DEFAULT_BG_SLOTS.slice();
  try {
    const raw = window.localStorage.getItem(BG_SLOTS_STORAGE_KEY);
    if (!raw) return DEFAULT_BG_SLOTS.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 1) {
      return DEFAULT_BG_SLOTS.slice();
    }
    const slots = [];
    for (let i = 0; i < 5; i++) {
      slots.push(normalizeHex(parsed[i] || DEFAULT_BG_SLOTS[i]));
    }
    return slots;
  } catch {
    return DEFAULT_BG_SLOTS.slice();
  }
}

function persistBgSlots(slots) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BG_SLOTS_STORAGE_KEY, JSON.stringify(slots));
  } catch {
    /* ignore quota */
  }
}

function loadBgColorFromStorage() {
  if (typeof window === "undefined") return "#ffffff";
  try {
    const raw = window.localStorage.getItem(BG_COLOR_STORAGE_KEY);
    return raw ? normalizeHex(raw) : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

function persistBgColor(hex) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BG_COLOR_STORAGE_KEY, normalizeHex(hex));
  } catch {
    /* ignore */
  }
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [c(r), c(g), c(b)].map((n) => n.toString(16).padStart(2, "0")).join("")
  );
}

function lightenHex(hex, t) {
  const { r, g, b } = hexToRgb(hex);
  const mix = Math.max(0, Math.min(1, t));
  return rgbToHex(
    r + (255 - r) * mix,
    g + (255 - g) * mix,
    b + (255 - b) * mix
  );
}

function darkenHex(hex, t) {
  const { r, g, b } = hexToRgb(hex);
  const mix = Math.max(0, Math.min(1, t));
  return rgbToHex(r * (1 - mix), g * (1 - mix), b * (1 - mix));
}

function blendHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const mix = Math.max(0, Math.min(1, t));
  return rgbToHex(
    A.r + (B.r - A.r) * mix,
    A.g + (B.g - A.g) * mix,
    A.b + (B.b - A.b) * mix
  );
}

/** 트랙/컬러피커 지정색 → 링·채우기용 밝기 단계만 */
function buildPaletteFromHex(baseHex) {
  const base = normalizeHex(baseHex);
  return {
    base,
    light: lightenHex(base, 0.38),
    mid: lightenHex(base, 0.16),
    dark: darkenHex(base, 0.32),
  };
}

function defaultDrumColors() {
  return DRUM_TRACK_KEYS.reduce((acc, id) => {
    acc[id] = DRUM_TRACKS[id].color;
    return acc;
  }, {});
}

/**
 * fillColors: 바깥 채우기·중심 — 지정 색 계열
 * strokeColors: 안쪽 얇은 링 선 — 같은 계열 + accentHexes 살짝 블렌드
 */
function buildRingColorSets(baseHex, ringCount, accentHexes) {
  const pal = buildPaletteFromHex(baseHex);
  const tones = [pal.base, pal.light, pal.mid, pal.dark];
  const accents = (accentHexes || [])
    .map((h) => normalizeHex(h))
    .filter((h) => h && h !== normalizeHex(baseHex));
  const fillColors = [];
  const strokeColors = [];

  for (let i = 0; i < ringCount; i++) {
    const main = normalizeHex(tones[i % tones.length]);
    fillColors.push(main);

    if (i === 0) {
      strokeColors.push(main);
      continue;
    }

    if (accents.length > 0 && Math.random() < 0.72) {
      const accent = accents[Math.floor(Math.random() * accents.length)];
      strokeColors.push(
        normalizeHex(blendHex(main, accent, rand(0.2, 0.42)))
      );
    } else {
      strokeColors.push(
        normalizeHex(blendHex(main, tones[(i + 1) % tones.length], 0.18))
      );
    }
  }

  return { fillColors, strokeColors };
}

function drumAccentColors(excludeTrackId, drumColorMap) {
  return DRUM_TRACK_KEYS.filter((id) => id !== excludeTrackId).map(
    (id) => drumColorMap[id] || DRUM_TRACKS[id].color
  );
}

function paletteAccentColors(excludePalIdx) {
  const skip = excludePalIdx % PALETTE.length;
  return PALETTE.filter((_, i) => i !== skip).map((p) => p.base);
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

/** 장식 선은 사라지지 않음 — 궤적(points) 유지, born만 초기화 */
function updatePersistentPaths(paths, now) {
  paths.forEach((path) => {
    if (path.born == null) path.born = now;
    path.alpha = 1;
  });
}

function getSpawnPathList(paths, activeStroke) {
  const list = paths.filter((p) => p.points && p.points.length >= 2);
  if (activeStroke?.points?.length >= 2) {
    list.push({ points: activeStroke.points });
  }
  return list;
}

function drawUserPaths(c, paths, activeStroke, now) {
  paths.forEach((path) => {
    if (!path.flourish) return;
    const evolve = getFlourishEvolve(path, now);
    try {
      drawFlourish(c, path.flourish, evolve);
    } catch {
      /* skip broken flourish frame */
    }
  });

  if (activeStroke && activeStroke.points.length >= 2) {
    try {
      drawStrokeFanPreview(c, activeStroke.points, SIZE_SCALE);
    } catch {
      /* skip preview frame */
    }
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

function buildMixedRingColorSets(primaryPalIdx, ringCount) {
  const primary = PALETTE[primaryPalIdx % PALETTE.length];
  return buildRingColorSets(
    primary.base,
    ringCount,
    paletteAccentColors(primaryPalIdx)
  );
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
    slots[id] = { circles: [] };
  });
  return slots;
}

class MCircle {
  constructor(x, y, size, rings, ringColors, slotId, ringStrokeColors) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.rings = rings;
    this.ringColors = ringColors.map(normalizeHex);
    this.ringStrokeColors = (ringStrokeColors || ringColors).map(normalizeHex);
    this.slotId = slotId;
    this.ringStretch = 0.72 + Math.random() * 0.22;
    this.ringRadii = Array.from({ length: rings }, (_, i) => {
      const t = i / Math.max(rings - 1, 1);
      const shrink = 0.35 + t * 0.5;
      return Math.max(size * (1 - shrink), 8 * SIZE_SCALE);
    });
    this.ringWidths = Array.from({ length: rings }, (_, i) =>
      i === 0 ? rand(3, 5.5) : rand(3.4, 6.2)
    );
    this.centerR = size * rand(0.12, 0.22);
    this.whiteAccentMode = Math.random() < 0.5 ? "center" : "ring";
    this.whiteRingIndex =
      rings > 1 ? Math.floor(rand(1, rings)) : 0;
    this.drift = rand(0.3, 0.55);
    this.age = 0;
    this.maxAge = 140 + Math.random() * 120;
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
    this.alpha = 1;
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
      c.globalAlpha = 1;
      c.translate(this.x, this.y);
      c.rotate(rot + wobble * 0.06);
      c.scale(scl, scl * ringStretch);

      for (let i = 0; i < rings; i++) {
        const r = this.ringRadii[i];
        if (r < 2) continue;
        const fillCol = normalizeHex(ringColors[i % ringColors.length]);
        const strokeCol =
          this.whiteAccentMode === "ring" && i === this.whiteRingIndex
            ? "#ffffff"
            : normalizeHex(this.ringStrokeColors[i % this.ringStrokeColors.length]);

        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        // 가장 바깥 원만 채우기 — 나머지는 선만 (채우기는 지정색, 선은 살짝 섞인 색)
        if (i === 0) {
          c.fillStyle = fillCol;
          c.fill();
        }
        c.strokeStyle = strokeCol;
        c.lineWidth = this.ringWidths[i];
        c.stroke();
      }

      c.beginPath();
      c.arc(0, 0, this.centerR, 0, Math.PI * 2);
      c.fillStyle =
        this.whiteAccentMode === "center"
          ? "#ffffff"
          : ringColors[1] || ringColors[0];
      c.fill();
      c.restore();
    } catch {
      c.restore();
      this.done = true;
    }
  }
}

function drawBg(c, bgColor) {
  drawIdleBackground(c, W, H, { bgColor });
}

export default function BeatCircleVisualizer() {
  const canvasRef = useRef(null);
  const circlesRef = useRef([]);
  const slotsRef = useRef(createSlots());
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const recordDestRef = useRef(null);
  const recorderSessionRef = useRef(null);
  const animIdRef = useRef(null);
  const seqStepRef = useRef(0);
  const seqTimerRef = useRef(null);
  const heldRef = useRef(new Set());
  const flashTimersRef = useRef({});
  const pathsRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const pathCursorRef = useRef(0);
  const isDrawingRef = useRef(false);
  const isDraggingTextRef = useRef(false);
  const textDragOffsetRef = useRef({ x: 0, y: 0 });
  const videoRef = useRef(null);
  const workSurfaceRef = useRef(null);
  const videoUrlRef = useRef(null);

  const [bpm, setBpm] = useState(120);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoLabel, setVideoLabel] = useState("");
  const [videoReady, setVideoReady] = useState(false);
  const [fxThreshold, setFxThreshold] = useState(120);
  const [fxHalftone, setFxHalftone] = useState(true);
  const [fxBgColor, setFxBgColor] = useState(() =>
    typeof window !== "undefined" ? loadBgColorFromStorage() : "#ffffff"
  );
  const [bgSlots, setBgSlots] = useState(() =>
    typeof window !== "undefined" ? loadBgSlotsFromStorage() : DEFAULT_BG_SLOTS
  );
  const [activeBgSlot, setActiveBgSlot] = useState(0);
  const [overlayText, setOverlayText] = useState(() =>
    defaultOverlayText(SIZE_SCALE)
  );
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const overlayTextRef = useRef(overlayText);
  const slotClickTimerRef = useRef(null);
  const [drumColors, setDrumColors] = useState(defaultDrumColors);
  const drumColorsRef = useRef(drumColors);

  useEffect(() => {
    overlayTextRef.current = overlayText;
  }, [overlayText]);

  useEffect(() => {
    persistBgColor(fxBgColor);
  }, [fxBgColor]);

  const saveBgSlot = useCallback((index, color) => {
    const hex = normalizeHex(color ?? fxBgColor);
    setBgSlots((prev) => {
      const next = prev.slice();
      next[index] = hex;
      persistBgSlots(next);
      return next;
    });
    setActiveBgSlot(index);
  }, [fxBgColor]);

  const applyBgSlot = useCallback((hex, index) => {
    setFxBgColor(normalizeHex(hex));
    if (typeof index === "number") setActiveBgSlot(index);
  }, []);

  const handleSlotClick = useCallback(
    (hex, index) => {
      if (slotClickTimerRef.current) clearTimeout(slotClickTimerRef.current);
      slotClickTimerRef.current = setTimeout(() => {
        applyBgSlot(hex, index);
        slotClickTimerRef.current = null;
      }, 220);
    },
    [applyBgSlot]
  );

  const handleSlotDoubleClick = useCallback(
    (index) => {
      if (slotClickTimerRef.current) {
        clearTimeout(slotClickTimerRef.current);
        slotClickTimerRef.current = null;
      }
      saveBgSlot(index);
    },
    [saveBgSlot]
  );

  useEffect(() => {
    drumColorsRef.current = drumColors;
  }, [drumColors]);
  const [seqRunning, setSeqRunning] = useState(false);
  const [seqCurStep, setSeqCurStep] = useState(-1);
  const [drumPattern, setDrumPattern] = useState(() => emptyDrumPattern());
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

  const getMasterGain = useCallback(() => {
    const a = getAC();
    if (!masterGainRef.current) {
      masterGainRef.current = a.createGain();
      masterGainRef.current.gain.value = 1;
      masterGainRef.current.connect(a.destination);
    }
    return masterGainRef.current;
  }, [getAC]);

  const playDrumSound = useCallback(
    (trackId) => {
      const track = DRUM_TRACKS[trackId];
      const s = track.sound;
      const a = getAC();
      a.resume();
      const g = a.createGain();
      g.gain.setValueAtTime(0.65, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + s.decay);
      g.connect(getMasterGain());

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
    [getAC, getMasterGain]
  );

  const playKeySound = useCallback(
    (idx) => {
      const a = getAC();
      a.resume();
      const s = SOUNDS[idx % SOUNDS.length];
      const g = a.createGain();
      g.gain.setValueAtTime(0.6, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + s.decay);
      g.connect(getMasterGain());
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
    [getAC, getMasterGain]
  );

  const stopRecording = useCallback(async () => {
    const session = recorderSessionRef.current;
    recorderSessionRef.current = null;
    setIsRecording(false);
    if (!session) return;

    try {
      const blob = await session.stop();
      const ext = session.mimeType.indexOf("webm") >= 0 ? "webm" : "mp4";
      downloadBlob(blob, "music-video-circles-" + Date.now() + "." + ext);
    } catch (err) {
      console.error(err);
    }

    if (recordDestRef.current && masterGainRef.current) {
      try {
        masterGainRef.current.disconnect(recordDestRef.current);
      } catch {
        /* already disconnected */
      }
      recordDestRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || recorderSessionRef.current) return;

    try {
      const ac = getAC();
      await ac.resume();

      const v = videoRef.current;
      if (v && videoUrl) {
        try {
          await v.play();
        } catch {
          /* ignore */
        }
      }

      const dest = ac.createMediaStreamDestination();
      recordDestRef.current = dest;
      getMasterGain().connect(dest);

      const session = createCanvasRecorder(canvas, dest.stream, 30);
      recorderSessionRef.current = session;
      session.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setIsRecording(false);
      recorderSessionRef.current = null;
    }
  }, [getAC, getMasterGain, videoUrl]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      if (recorderSessionRef.current) {
        recorderSessionRef.current.stop().catch(function () {});
        recorderSessionRef.current = null;
      }
    };
  }, []);

  const countActiveCircles = useCallback(() => {
    return circlesRef.current.filter((cc) => !cc.done).length;
  }, []);

  const isTooCloseToOthers = useCallback((x, y, minGap) => {
    for (const cc of circlesRef.current) {
      if (cc.done) continue;
      const d = Math.hypot(cc.x - x, cc.y - y);
      if (d < minGap + cc.size * 0.22) return true;
    }
    return false;
  }, []);

  const pickSpawnPosition = useCallback(() => {
    const spawnPaths = getSpawnPathList(
      pathsRef.current,
      activeStrokeRef.current
    );

    if (spawnPaths.length > 0) {
      for (let attempt = 0; attempt < SPAWN_RETRY; attempt++) {
        const onPath = getSpawnOnPaths(spawnPaths, pathCursorRef);
        if (!onPath) break;
        const pos = { x: onPath.x, y: onPath.y, tangent: onPath.tangent };
        if (!isTooCloseToOthers(pos.x, pos.y, MIN_SPAWN_GAP)) {
          return pos;
        }
        if (attempt >= 2) {
          pos.x += rand(-24, 24);
          pos.y += rand(-20, 20);
          return pos;
        }
      }
      const onPath = getSpawnOnPaths(spawnPaths, pathCursorRef);
      if (onPath) {
        return { x: onPath.x, y: onPath.y, tangent: onPath.tangent };
      }
    }

    const pos = randomSpawnPos();
    return { ...pos, tangent: null };
  }, [isTooCloseToOthers]);

  const setDrumColor = useCallback((trackId, hex) => {
    const next = normalizeHex(hex);
    setDrumColors((prev) => ({ ...prev, [trackId]: next }));
    DRUM_TRACKS[trackId].color = next;
  }, []);

  const spawnCircle = useCallback((slotId, colorSource, sizeBoost = 0) => {
    if (countActiveCircles() >= MAX_TOTAL_CIRCLES) return;

    const slot = slotsRef.current[slotId];
    const existCount = slot.circles.filter((cc) => !cc.done).length;
    if (existCount >= MAX_CIRCLES_PER_SLOT) return;

    const pos = pickSpawnPosition();
    if (!pos) return;

    const size =
      rand(CIRCLE_SIZE_MIN, CIRCLE_SIZE_MAX) *
        (existCount === 0 ? 1 : rand(0.55, 0.92)) -
      existCount * CIRCLE_STACK_SHRINK +
      sizeBoost;
    const rings = Math.floor(rand(3, 6));
    if (size < CIRCLE_SIZE_FLOOR) return;

    const drumBase =
      DRUM_TRACK_KEYS.includes(slotId) &&
      (drumColorsRef.current[slotId] || DRUM_TRACKS[slotId].color);
    let colorSets;
    if (drumBase) {
      colorSets = buildRingColorSets(
        drumBase,
        rings,
        drumAccentColors(slotId, drumColorsRef.current)
      );
    } else if (typeof colorSource === "string") {
      colorSets = buildRingColorSets(colorSource, rings, paletteAccentColors(-1));
    } else {
      colorSets = buildMixedRingColorSets(colorSource, rings);
    }
    const mc = new MCircle(
      pos.x,
      pos.y,
      Math.max(size, CIRCLE_MIN_RADIUS),
      rings,
      colorSets.fillColors,
      slotId,
      colorSets.strokeColors
    );
    if (pos.tangent) mc.applyPathMotion(pos.tangent);

    const recent = slot.circles.filter((cc) => !cc.done).slice(-2);
    recent.forEach((cc) => cc.trigger());

    slot.circles.push(mc);
    circlesRef.current.push(mc);
  }, [countActiveCircles, pickSpawnPosition]);

  const hitDrum = useCallback(
    (trackId) => {
      playDrumSound(trackId);
      const color = drumColorsRef.current[trackId] || DRUM_TRACKS[trackId].color;
      spawnCircle(trackId, color, rand(0, 18 * SIZE_SCALE));
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

  const removeVideo = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setVideoUrl(null);
    setVideoLabel("");
    setVideoReady(false);
  }, []);

  const handleVideoFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("video/")) return;
      removeVideo();
      const url = URL.createObjectURL(file);
      videoUrlRef.current = url;
      setVideoUrl(url);
      setVideoLabel(file.name);
      setVideoReady(false);
      e.target.value = "";
    },
    [removeVideo]
  );

  useEffect(() => {
    workSurfaceRef.current = createVideoWorkSurface(W, H);
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;
    v.src = videoUrl;
    v.load();
    const onReady = () => setVideoReady(true);
    v.addEventListener("loadeddata", onReady);
    v.play().catch(() => {});
    return () => v.removeEventListener("loadeddata", onReady);
  }, [videoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function render() {
      const video = videoRef.current;
      const work = workSurfaceRef.current;
      const drewVideo =
        videoUrl &&
        videoReady &&
        video &&
        work &&
        drawVectorVideoBackground(ctx, video, work, {
          width: W,
          height: H,
          threshold: fxThreshold,
          halftone: fxHalftone,
          bgColor: fxBgColor,
        });

      if (!drewVideo) drawBg(ctx, fxBgColor);

      const now = performance.now();
      updatePersistentPaths(pathsRef.current, now);
      drawUserPaths(ctx, pathsRef.current, activeStrokeRef.current, now);
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
      drawOverlayText(ctx, overlayTextRef.current);
      animIdRef.current = requestAnimationFrame(render);
    }

    render();
    return () => {
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      Object.values(flashTimersRef.current).forEach(clearTimeout);
    };
  }, [videoUrl, videoReady, fxThreshold, fxHalftone, fxBgColor, overlayText]);

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
      const born = performance.now();
      const flourish = buildFlourishFromStroke(stroke.points, SIZE_SCALE);
      if (!flourish) return;
      pathsRef.current.push({
        points: stroke.points,
        born,
        alpha: 1,
        flourish,
      });
      if (pathsRef.current.length > MAX_PERSISTENT_PATHS) {
        pathsRef.current.shift();
      }
    }
    activeStrokeRef.current = null;
    isDrawingRef.current = false;
  }, []);

  const onCanvasPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (
        ctx &&
        hitTestOverlayText(ctx, overlayTextRef.current, pt.x, pt.y, 18)
      ) {
        isDraggingTextRef.current = true;
        setIsDraggingText(true);
        textDragOffsetRef.current = {
          x: pt.x - overlayTextRef.current.x,
          y: pt.y - overlayTextRef.current.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      isDrawingRef.current = true;
      activeStrokeRef.current = { points: [pt] };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [getCanvasPoint]
  );

  const onCanvasPointerMove = useCallback(
    (e) => {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;

      if (isDraggingTextRef.current) {
        const next = {
          ...overlayTextRef.current,
          x: Math.max(0, Math.min(W, pt.x - textDragOffsetRef.current.x)),
          y: Math.max(0, Math.min(H, pt.y - textDragOffsetRef.current.y)),
        };
        overlayTextRef.current = next;
        setOverlayText(next);
        return;
      }

      if (!isDrawingRef.current) return;
      appendStrokePoint(e.clientX, e.clientY);
    },
    [getCanvasPoint, appendStrokePoint]
  );

  const onCanvasPointerUp = useCallback(
    (e) => {
      if (isDraggingTextRef.current) {
        isDraggingTextRef.current = false;
        setIsDraggingText(false);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }

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
      <div className={styles.videoToolbar}>
        <label className={styles.videoUpload}>
          <input
            type="file"
            accept="video/*"
            onChange={handleVideoFile}
          />
          영상 업로드
        </label>
        {videoUrl && (
          <>
            <span className={styles.videoName}>{videoLabel}</span>
            <button type="button" className={styles.bb2} onClick={removeVideo}>
              영상 제거
            </button>
            <div className={styles.fxRow}>
              <span>Threshold</span>
              <input
                type="range"
                min={60}
                max={200}
                value={fxThreshold}
                onChange={(e) => setFxThreshold(Number(e.target.value))}
              />
              <span>{fxThreshold}</span>
            </div>
            <label className={styles.fxRow}>
              <input
                type="checkbox"
                checked={fxHalftone}
                onChange={(e) => setFxHalftone(e.target.checked)}
              />
              하프톤
            </label>
            <label className={styles.fxRow} title="밝은 영역·배경 색 (실루엣 검정은 유지)">
              <span>배경</span>
              <input
                type="color"
                className={styles.fxColor}
                value={fxBgColor}
                onChange={(e) => setFxBgColor(normalizeHex(e.target.value))}
              />
            </label>
            <div className={styles.fxPresetsWrap}>
              <div className={styles.fxPresets}>
                {bgSlots.map((hex, i) => (
                  <button
                    key={`${i}-${hex}`}
                    type="button"
                    className={
                      i === activeBgSlot
                        ? `${styles.fxPresetBtn} ${styles.fxPresetBtnSelected}`
                        : styles.fxPresetBtn
                    }
                    style={{ background: hex }}
                    title={`${hex} — 클릭: 적용 · Shift+클릭: 저장 슬롯만 선택`}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        if (slotClickTimerRef.current) {
                          clearTimeout(slotClickTimerRef.current);
                          slotClickTimerRef.current = null;
                        }
                        setActiveBgSlot(i);
                        return;
                      }
                      handleSlotClick(hex, i);
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      handleSlotDoubleClick(i);
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className={styles.fxSaveSlot}
                title={`슬롯 ${activeBgSlot + 1} ← 점선 테두리 슬롯에 지금 배경색 저장`}
                onClick={() => saveBgSlot(activeBgSlot, fxBgColor)}
              >
                저장
              </button>
            </div>
          </>
        )}
      </div>

      <div className={styles.textToolbar}>
        <label className={styles.textToolbarLabel}>
          <span>텍스트</span>
          <textarea
            className={styles.textArea}
            rows={3}
            value={overlayText.text}
            placeholder={"bad bitch\npretty with"}
            onChange={(e) =>
              setOverlayText((prev) => ({ ...prev, text: e.target.value }))
            }
          />
        </label>
        <label className={styles.fxRow}>
          <span>글자색</span>
          <input
            type="color"
            className={styles.fxColor}
            value={overlayText.color}
            onChange={(e) =>
              setOverlayText((prev) => ({
                ...prev,
                color: normalizeHex(e.target.value),
              }))
            }
          />
        </label>
        <label className={styles.fxRow}>
          <span>크기</span>
          <input
            type="range"
            min={28}
            max={120}
            value={overlayText.fontSize}
            onChange={(e) =>
              setOverlayText((prev) => ({
                ...prev,
                fontSize: Number(e.target.value),
              }))
            }
          />
          <span>{overlayText.fontSize}</span>
        </label>
        <label className={styles.fxRow}>
          <span>가로폭</span>
          <input
            type="range"
            min={35}
            max={130}
            value={Math.round((overlayText.scaleX || 1) * 100)}
            onChange={(e) =>
              setOverlayText((prev) => ({
                ...prev,
                scaleX: Number(e.target.value) / 100,
              }))
            }
          />
          <span>{Math.round((overlayText.scaleX || 1) * 100)}%</span>
        </label>
        <span className={styles.textHint}>캔버스에서 글자를 드래그해 위치 이동</span>
      </div>

      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="auto"
        style={{ display: "none" }}
      />
      <div className={styles.stage}>
        <div className={styles.canvasWrap}>
          <p className={styles.drawHint}>
            {videoUrl
              ? "장식 선은 사라지지 않고 퍼지며 남음 · 원은 궤적 위에만"
              : "드래그한 장식 선은 캔버스에 남고 퍼져 나갑니다 (선 지우기/Clear로 삭제)"}
          </p>
          <canvas
            ref={canvasRef}
          className={styles.canvas}
          width={W}
          height={H}
          aria-label="Music video circles"
          style={{ cursor: isDraggingText ? "grabbing" : "crosshair" }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          />
        </div>
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
                  style={
                    flashing
                      ? {
                          background: `linear-gradient(180deg, ${pal.light} 0%, ${pal.base} 100%)`,
                          boxShadow: `0 0 0 2px rgba(255,255,255,0.5), 0 0 14px ${pal.base}88, inset 0 3px 10px rgba(40,50,70,0.3)`,
                        }
                      : undefined
                  }
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
            <button
              type="button"
              className={`${styles.bb2} ${isRecording ? styles.bb2On : ""}`}
              onClick={toggleRecording}
              title="캔버스+소리 녹화 (WebM). 종료 시 파일 저장"
            >
              {isRecording ? "■ 저장 종료" : "● 영상 저장"}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.seqPanel}>
        {DRUM_TRACK_KEYS.map((trackId) => {
          const track = DRUM_TRACKS[trackId];
          return (
            <div key={trackId} className={styles.seqRow}>
              <span
                className={styles.seqLabel}
                style={{ color: drumColors[trackId] }}
              >
                {track.label}
              </span>
              <input
                type="color"
                className={styles.trackColorPick}
                value={drumColors[trackId]}
                onChange={(e) => setDrumColor(trackId, e.target.value)}
                title={`${track.label} 원 색상`}
                aria-label={`${track.label} 색상`}
              />
              <div className={styles.seqSteps}>
                {drumPattern[trackId].map((on, i) => (
                  <button
                    key={i}
                    type="button"
                    className={[
                      styles.sq,
                      seqRunning && i === seqCurStep ? styles.sqCur : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      on
                        ? {
                            background: drumColors[trackId],
                            borderColor: drumColors[trackId],
                          }
                        : undefined
                    }
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
