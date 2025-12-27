import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  MathUtils,
  PointsMaterial,
  Vector3,
} from "three";

type FireworksProps = {
  isActive: boolean;
  origin?: [number, number, number];
};

const FIREWORKS_MAX = 18;
const SPARKS_PER_FIREWORK = 220;
const TOTAL_SPARKS = FIREWORKS_MAX * SPARKS_PER_FIREWORK;

const SHOWER_PARTICLES = 850;

const GRAVITY = -6.3;

type PatternType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
// 0 sphere/chrysanthemum
// 1 ring
// 2 heart
// 3 spiral
// 4 willow
// 5 palm
// 6 star
// 7 double ring
// 8 peony+pistil (inner burst)
// 9 crackle
// 10 flower/petals
// 11 strobe comet

type FireworkState = {
  phase: Uint8Array; // 0 = rocket, 1 = burst
  age: Float32Array; // rocket age (neg = waiting)
  life: Float32Array;

  burstAge: Float32Array;
  burstLife: Float32Array;

  rocketPos: Float32Array;
  rocketVel: Float32Array;

  burstOrigin: Float32Array;
  baseColor: Float32Array;

  pattern: Uint8Array;
};

type SparkState = {
  pos: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  color: Float32Array;
};

type ShowerState = {
  pos: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  color: Float32Array;
};

const makeGlowTexture = () => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );

  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.12, "rgba(255,255,255,0.95)");
  g.addColorStop(0.32, "rgba(255,255,255,0.55)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
};

const pickFireworkColor = () => {
  const hue = Math.random();
  const sat = 0.85 + Math.random() * 0.12;
  const lit = 0.52 + Math.random() * 0.22;
  return new Color().setHSL(hue, sat, lit);
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const heartPoint = (t: number) => {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return { x, y };
};

const starRadius = (t: number) => {
  // 5-point star-ish radius modulation
  const spikes = 5;
  const s = Math.sin(t * spikes);
  return 0.55 + 0.45 * Math.abs(s);
};

export function Fireworks({ isActive, origin = [0, 5, -14] }: FireworksProps) {
  const camera = useThree((s) => s.camera);
  const baseOrigin = useMemo(() => new Vector3(...origin), [origin]);
  const glowTex = useMemo(() => makeGlowTexture(), []);

  const rocketPointsGeomRef = useRef<BufferGeometry>(null);
  const rocketTrailGeomRef = useRef<BufferGeometry>(null);
  const sparkLinesGeomRef = useRef<BufferGeometry>(null);
  const sparkPointsGeomRef = useRef<BufferGeometry>(null);
  const showerPointsGeomRef = useRef<BufferGeometry>(null);

  const rocketMatRef = useRef<PointsMaterial>(null);
  const sparkPointMatRef = useRef<PointsMaterial>(null);
  const showerMatRef = useRef<PointsMaterial>(null);
  const rocketTrailMatRef = useRef<LineBasicMaterial>(null);
  const sparkLineMatRef = useRef<LineBasicMaterial>(null);

  const fireworkRef = useRef<FireworkState | null>(null);
  const sparksRef = useRef<SparkState | null>(null);
  const showerRef = useRef<ShowerState | null>(null);

  const rocketPointPositions = useMemo(
    () => new Float32Array(FIREWORKS_MAX * 3),
    []
  );
  const rocketPointColors = useMemo(
    () => new Float32Array(FIREWORKS_MAX * 3),
    []
  );

  const rocketTrailPositions = useMemo(
    () => new Float32Array(FIREWORKS_MAX * 2 * 3),
    []
  );
  const rocketTrailColors = useMemo(
    () => new Float32Array(FIREWORKS_MAX * 2 * 3),
    []
  );

  const sparkLinePositions = useMemo(
    () => new Float32Array(TOTAL_SPARKS * 2 * 3),
    []
  );
  const sparkLineColors = useMemo(
    () => new Float32Array(TOTAL_SPARKS * 2 * 3),
    []
  );

  const sparkPointPositions = useMemo(
    () => new Float32Array(TOTAL_SPARKS * 3),
    []
  );
  const sparkPointColors = useMemo(
    () => new Float32Array(TOTAL_SPARKS * 3),
    []
  );

  const showerPositions = useMemo(
    () => new Float32Array(SHOWER_PARTICLES * 3),
    []
  );
  const showerColors = useMemo(
    () => new Float32Array(SHOWER_PARTICLES * 3),
    []
  );

  const tmpForward = useMemo(() => new Vector3(), []);
  const tmpRight = useMemo(() => new Vector3(), []);
  const tmpUp = useMemo(() => new Vector3(), []);
  const tmpV = useMemo(() => new Vector3(), []);
  const tmpC = useMemo(() => new Color(), []);

  const getInViewCenter = () => {
    camera.getWorldDirection(tmpForward).normalize();
    tmpUp.copy(camera.up).normalize();
    tmpRight.copy(tmpForward).cross(tmpUp).normalize();

    const dist = 5.6 + Math.random() * 2.2;
    const xOff = (Math.random() - 0.5) * 3.1;
    const yOff = 1.4 + Math.random() * 2.6;
    const zOff = (Math.random() - 0.5) * 1.4;

    tmpV
      .copy(camera.position)
      .addScaledVector(tmpForward, dist)
      .addScaledVector(tmpRight, xOff)
      .addScaledVector(tmpUp, yOff)
      .addScaledVector(tmpForward, zOff);

    tmpV.y = MathUtils.clamp(tmpV.y, 2.2, 10.8);
    return tmpV.clone();
  };

  const pickPattern = (): PatternType => {
    const r = Math.random();
    if (r < 0.16) return 0; // sphere
    if (r < 0.27) return 1; // ring
    if (r < 0.35) return 2; // heart
    if (r < 0.44) return 3; // spiral
    if (r < 0.54) return 4; // willow
    if (r < 0.62) return 5; // palm
    if (r < 0.71) return 6; // star
    if (r < 0.79) return 7; // double ring
    if (r < 0.87) return 8; // pistil
    if (r < 0.93) return 9; // crackle
    if (r < 0.975) return 10; // flower
    return 11; // strobe comet
  };

  const initFirework = (i: number) => {
    const fw = fireworkRef.current!;
    const base3 = i * 3;

    const c = pickFireworkColor();
    fw.baseColor[base3] = c.r;
    fw.baseColor[base3 + 1] = c.g;
    fw.baseColor[base3 + 2] = c.b;

    fw.pattern[i] = pickPattern();

    fw.phase[i] = 0;
    fw.age[i] = -Math.random() * 1.8;
    fw.life[i] = 0.9 + Math.random() * 0.9;

    fw.burstAge[i] = 0;

    const p = fw.pattern[i] as PatternType;
    fw.burstLife[i] =
      p === 4 ? 4.2 + Math.random() * 2.8 : p === 11 ? 2.3 + Math.random() * 1.2 : 2.8 + Math.random() * 2.1;

    const burstTarget = getInViewCenter();

    const start = burstTarget.clone();
    start.y -= 6.2 + Math.random() * 2.4;
    start.x += (Math.random() - 0.5) * 0.8;
    start.z += (Math.random() - 0.5) * 0.8;

    fw.rocketPos[base3] = start.x;
    fw.rocketPos[base3 + 1] = start.y;
    fw.rocketPos[base3 + 2] = start.z;

    fw.burstOrigin[base3] = burstTarget.x;
    fw.burstOrigin[base3 + 1] = burstTarget.y;
    fw.burstOrigin[base3 + 2] = burstTarget.z;

    const travel = burstTarget.clone().sub(start);
    const t = fw.life[i];

    fw.rocketVel[base3] = travel.x / t;
    fw.rocketVel[base3 + 1] = travel.y / t + 1.25;
    fw.rocketVel[base3 + 2] = travel.z / t;
  };

  const burstFirework = (i: number) => {
    const fw = fireworkRef.current!;
    const sp = sparksRef.current!;
    const base3 = i * 3;

    fw.phase[i] = 1;
    fw.burstAge[i] = 0;

    const pattern = fw.pattern[i] as PatternType;

    const ox = fw.rocketPos[base3];
    const oy = fw.rocketPos[base3 + 1];
    const oz = fw.rocketPos[base3 + 2];

    fw.burstOrigin[base3] = ox;
    fw.burstOrigin[base3 + 1] = oy;
    fw.burstOrigin[base3 + 2] = oz;

    const cr0 = fw.baseColor[base3];
    const cg0 = fw.baseColor[base3 + 1];
    const cb0 = fw.baseColor[base3 + 2];

    // second hue for multi-color (shift hue a bit)
    tmpC.setRGB(cr0, cg0, cb0);
    const hsl = { h: 0, s: 0, l: 0 };
    tmpC.getHSL(hsl);
    tmpC.setHSL((hsl.h + (0.09 + Math.random() * 0.2)) % 1, Math.min(1, hsl.s * 0.95), hsl.l);
    const cr1 = tmpC.r;
    const cg1 = tmpC.g;
    const cb1 = tmpC.b;

    const baseSpark = i * SPARKS_PER_FIREWORK;

    const palmArms = 10 + ((Math.random() * 5) | 0);
    const spiralTurns = 2.4 + Math.random() * 2.2;

    for (let s = 0; s < SPARKS_PER_FIREWORK; s += 1) {
      const idx = baseSpark + s;
      const idx3 = idx * 3;

      sp.age[idx] = -Math.random() * 0.18;

      const lifeScale =
        pattern === 4 ? 1.35 + Math.random() * 0.7 :
        pattern === 9 ? 0.55 + Math.random() * 0.45 :
        pattern === 11 ? 0.7 + Math.random() * 0.6 :
        0.75 + Math.random() * 0.65;

      sp.life[idx] = fw.burstLife[i] * lifeScale;

      sp.pos[idx3] = ox;
      sp.pos[idx3 + 1] = oy;
      sp.pos[idx3 + 2] = oz;

      let dx = 0;
      let dy = 0;
      let dz = 0;
      let speed = 0;

      const tMix = s / SPARKS_PER_FIREWORK;

      if (pattern === 0) {
        // sphere / chrysanthemum
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const phi = Math.acos(u);
        dx = Math.sin(phi) * Math.cos(theta);
        dy = Math.cos(phi);
        dz = Math.sin(phi) * Math.sin(theta);
        dy = dy * 0.88 + 0.32;
        speed = 7.2 + Math.random() * 8.8;
      } else if (pattern === 1) {
        // ring
        const a = tMix * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        dx = Math.cos(a);
        dz = Math.sin(a);
        dy = (Math.random() - 0.5) * 0.18 + 0.12;
        speed = 8.8 + Math.random() * 7.2;
      } else if (pattern === 2) {
        // heart
        const t = Math.random() * Math.PI * 2;
        const p = heartPoint(t);
        dx = p.x / 18;
        dy = p.y / 18 + 0.38;
        dz = (Math.random() - 0.5) * 0.22;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        speed = 7.0 + Math.random() * 8.0;
      } else if (pattern === 3) {
        // spiral
        const a = tMix * spiralTurns * Math.PI * 2;
        const r = Math.sqrt(tMix);
        dx = Math.cos(a) * r;
        dz = Math.sin(a) * r;
        dy = 0.6 + (1 - r) * 0.85 + (Math.random() - 0.5) * 0.08;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        speed = 6.4 + Math.random() * 7.8;
      } else if (pattern === 4) {
        // willow (slow, drooping)
        const a = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.35);
        dx = Math.cos(a) * r * 0.55;
        dz = Math.sin(a) * r * 0.55;
        dy = 1.05 + Math.random() * 0.65;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        speed = 4.2 + Math.random() * 3.6;
      } else if (pattern === 5) {
        // palm (strong arms + filler)
        const arm = (Math.random() * palmArms) | 0;
        const a = (arm / palmArms) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
        dx = Math.cos(a);
        dz = Math.sin(a);
        dy = 0.38 + Math.random() * 0.26;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        speed = 9.4 + Math.random() * 7.2;
      } else if (pattern === 6) {
        // star (2D-ish star in camera-ish plane)
        const t = tMix * Math.PI * 2 + (Math.random() - 0.5) * 0.16;
        const r = starRadius(t);
        dx = Math.cos(t) * r;
        dy = Math.sin(t) * r + 0.18;
        dz = (Math.random() - 0.5) * 0.14;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        speed = 8.0 + Math.random() * 7.0;
      } else if (pattern === 7) {
        // double ring
        const ring = s < SPARKS_PER_FIREWORK * 0.55 ? 0 : 1;
        const a = (tMix * Math.PI * 2) + (Math.random() - 0.5) * 0.22;
        const ringScale = ring === 0 ? 1.0 : 0.62;
        dx = Math.cos(a) * ringScale;
        dz = Math.sin(a) * ringScale;
        dy = (Math.random() - 0.5) * 0.18 + (ring === 0 ? 0.12 : 0.28);
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        speed = (ring === 0 ? 9.2 : 7.4) + Math.random() * 6.8;
      } else if (pattern === 8) {
        // peony + pistil (outer sphere + inner sphere)
        const inner = s < SPARKS_PER_FIREWORK * 0.38;
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const phi = Math.acos(u);
        dx = Math.sin(phi) * Math.cos(theta);
        dy = Math.cos(phi) * 0.85 + 0.25;
        dz = Math.sin(phi) * Math.sin(theta);
        speed = (inner ? 4.8 : 8.2) + Math.random() * (inner ? 3.8 : 7.2);
      } else if (pattern === 9) {
        // crackle (chaotic, short life)
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const phi = Math.acos(u);
        dx = Math.sin(phi) * Math.cos(theta);
        dy = Math.cos(phi) * 0.75 + 0.3;
        dz = Math.sin(phi) * Math.sin(theta);
        speed = 5.6 + Math.random() * 8.8;
      } else if (pattern === 10) {
        // flower/petals (8 petals)
        const petals = 8;
        const petal = ((tMix * petals) | 0) % petals;
        const a =
          (petal / petals) * Math.PI * 2 +
          (Math.random() - 0.5) * 0.12;
        const r = 0.85 + 0.15 * Math.cos(tMix * Math.PI * 2);
        dx = Math.cos(a) * r;
        dz = Math.sin(a) * r;
        dy = 0.34 + Math.random() * 0.22;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        speed = 8.6 + Math.random() * 7.2;
      } else {
        // strobe comet (fewer fast streaky sparks)
        const a = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const phi = Math.acos(u);
        dx = Math.sin(phi) * Math.cos(a);
        dy = Math.cos(phi) * 0.75 + 0.35;
        dz = Math.sin(phi) * Math.sin(a);
        speed = 10.0 + Math.random() * 10.0;
        if (Math.random() < 0.6) speed *= 0.55;
      }

      sp.vel[idx3] = dx * speed * (0.88 + Math.random() * 0.26);
      sp.vel[idx3 + 1] = dy * speed * (0.88 + Math.random() * 0.26);
      sp.vel[idx3 + 2] = dz * speed * (0.88 + Math.random() * 0.26);

      // multi-color assignment per pattern
      const useAccent =
        pattern === 7 || pattern === 8 || pattern === 10 || pattern === 11 || (pattern === 0 && Math.random() < 0.35);
      const mix =
        pattern === 8
          ? (s < SPARKS_PER_FIREWORK * 0.38 ? 1 : 0)
          : useAccent
            ? (tMix < 0.5 ? 0 : 1)
            : (Math.random() < 0.25 ? 1 : 0);

      const rC = mix ? cr1 : cr0;
      const gC = mix ? cg1 : cg0;
      const bC = mix ? cb1 : cb0;

      // keep colors saturated (avoid pushing to white)
      const tint = 0.62 + Math.random() * 0.28;
      sp.color[idx3] = rC * tint;
      sp.color[idx3 + 1] = gC * tint;
      sp.color[idx3 + 2] = bC * tint;
    }
  };

  const resetShower = (i: number) => {
    const sh = showerRef.current!;
    const idx3 = i * 3;

    camera.getWorldDirection(tmpForward).normalize();
    tmpUp.copy(camera.up).normalize();
    tmpRight.copy(tmpForward).cross(tmpUp).normalize();

    const dist = 5.0 + Math.random() * 2.2;
    const xOff = (Math.random() - 0.5) * 6.2;
    const yOff = 4.8 + Math.random() * 3.2;
    const zOff = (Math.random() - 0.5) * 2.0;

    tmpV
      .copy(camera.position)
      .addScaledVector(tmpForward, dist)
      .addScaledVector(tmpRight, xOff)
      .addScaledVector(tmpUp, yOff)
      .addScaledVector(tmpForward, zOff);

    sh.pos[idx3] = tmpV.x;
    sh.pos[idx3 + 1] = tmpV.y;
    sh.pos[idx3 + 2] = tmpV.z;

    sh.vel[idx3] = (Math.random() - 0.5) * 0.9;
    sh.vel[idx3 + 1] = -(2.6 + Math.random() * 2.9);
    sh.vel[idx3 + 2] = (Math.random() - 0.5) * 0.9;

    const c = pickFireworkColor();
    const boost = 0.78;
    sh.color[idx3] = c.r * boost;
    sh.color[idx3 + 1] = c.g * boost;
    sh.color[idx3 + 2] = c.b * boost;

    sh.life[i] = 3.6 + Math.random() * 3.2;
    sh.age[i] = -Math.random() * 1.2;
  };

  useEffect(() => {
    fireworkRef.current = {
      phase: new Uint8Array(FIREWORKS_MAX),
      age: new Float32Array(FIREWORKS_MAX),
      life: new Float32Array(FIREWORKS_MAX),
      burstAge: new Float32Array(FIREWORKS_MAX),
      burstLife: new Float32Array(FIREWORKS_MAX),
      rocketPos: new Float32Array(FIREWORKS_MAX * 3),
      rocketVel: new Float32Array(FIREWORKS_MAX * 3),
      burstOrigin: new Float32Array(FIREWORKS_MAX * 3),
      baseColor: new Float32Array(FIREWORKS_MAX * 3),
      pattern: new Uint8Array(FIREWORKS_MAX),
    };

    sparksRef.current = {
      pos: new Float32Array(TOTAL_SPARKS * 3),
      vel: new Float32Array(TOTAL_SPARKS * 3),
      age: new Float32Array(TOTAL_SPARKS),
      life: new Float32Array(TOTAL_SPARKS),
      color: new Float32Array(TOTAL_SPARKS * 3),
    };

    showerRef.current = {
      pos: new Float32Array(SHOWER_PARTICLES * 3),
      vel: new Float32Array(SHOWER_PARTICLES * 3),
      age: new Float32Array(SHOWER_PARTICLES),
      life: new Float32Array(SHOWER_PARTICLES),
      color: new Float32Array(SHOWER_PARTICLES * 3),
    };

    for (let i = 0; i < FIREWORKS_MAX; i += 1) initFirework(i);
    for (let i = 0; i < SHOWER_PARTICLES; i += 1) resetShower(i);

    rocketPointPositions.fill(0);
    rocketPointColors.fill(0);
    rocketTrailPositions.fill(0);
    rocketTrailColors.fill(0);
    sparkLinePositions.fill(0);
    sparkLineColors.fill(0);
    sparkPointPositions.fill(0);
    sparkPointColors.fill(0);
    showerPositions.fill(0);
    showerColors.fill(0);
  }, []);

  useFrame((_, delta) => {
    const fw = fireworkRef.current;
    const sp = sparksRef.current;
    const sh = showerRef.current;

    const rocketPointsGeom = rocketPointsGeomRef.current;
    const rocketTrailGeom = rocketTrailGeomRef.current;
    const sparkLinesGeom = sparkLinesGeomRef.current;
    const sparkPointsGeom = sparkPointsGeomRef.current;
    const showerGeom = showerPointsGeomRef.current;

    const rocketMat = rocketMatRef.current;
    const sparkPointMat = sparkPointMatRef.current;
    const showerMat = showerMatRef.current;
    const rocketTrailMat = rocketTrailMatRef.current;
    const sparkLineMat = sparkLineMatRef.current;

    if (
      !fw ||
      !sp ||
      !sh ||
      !rocketPointsGeom ||
      !rocketTrailGeom ||
      !sparkLinesGeom ||
      !sparkPointsGeom ||
      !showerGeom ||
      !rocketMat ||
      !sparkPointMat ||
      !showerMat ||
      !rocketTrailMat ||
      !sparkLineMat
    ) {
      return;
    }

    const dampOn = isActive ? 2.2 : 6.5;
    rocketMat.opacity = MathUtils.damp(rocketMat.opacity, isActive ? 0.95 : 0, dampOn, delta);
    rocketTrailMat.opacity = MathUtils.damp(rocketTrailMat.opacity, isActive ? 0.8 : 0, dampOn, delta);
    sparkLineMat.opacity = MathUtils.damp(sparkLineMat.opacity, isActive ? 0.92 : 0, dampOn, delta);
    sparkPointMat.opacity = MathUtils.damp(sparkPointMat.opacity, isActive ? 0.92 : 0, dampOn, delta);
    showerMat.opacity = MathUtils.damp(showerMat.opacity, isActive ? 0.55 : 0, dampOn, delta);

    if (!isActive) {
      (rocketPointsGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (rocketPointsGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

      (rocketTrailGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (rocketTrailGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

      (sparkLinesGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (sparkLinesGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

      (sparkPointsGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (sparkPointsGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

      (showerGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (showerGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

      return;
    }

    // Confetti shower
    for (let i = 0; i < SHOWER_PARTICLES; i += 1) {
      const idx3 = i * 3;
      sh.age[i] += delta;

      if (sh.age[i] < 0) continue;

      if (sh.age[i] > sh.life[i] || sh.pos[idx3 + 1] < baseOrigin.y - 2.5) {
        resetShower(i);
        continue;
      }

      const ageT = sh.age[i] / sh.life[i];
      const fade = Math.pow(Math.max(0, 1 - ageT), 1.05);

      const drift = Math.sin((i * 7.7 + sh.age[i] * 2.7) * 1.2) * 0.25;
      sh.vel[idx3] += drift * delta * 0.25;
      sh.vel[idx3 + 2] += drift * delta * 0.25;

      sh.vel[idx3 + 1] += GRAVITY * 0.12 * delta;

      sh.pos[idx3] += sh.vel[idx3] * delta;
      sh.pos[idx3 + 1] += sh.vel[idx3 + 1] * delta;
      sh.pos[idx3 + 2] += sh.vel[idx3 + 2] * delta;

      showerPositions[idx3] = sh.pos[idx3];
      showerPositions[idx3 + 1] = sh.pos[idx3 + 1];
      showerPositions[idx3 + 2] = sh.pos[idx3 + 2];

      showerColors[idx3] = sh.color[idx3] * fade;
      showerColors[idx3 + 1] = sh.color[idx3 + 1] * fade;
      showerColors[idx3 + 2] = sh.color[idx3 + 2] * fade;
    }

    // Rockets + burst scheduling
    for (let i = 0; i < FIREWORKS_MAX; i += 1) {
      const base3 = i * 3;

      fw.age[i] += delta;

      if (fw.age[i] < 0) {
        rocketPointPositions[base3] = fw.rocketPos[base3];
        rocketPointPositions[base3 + 1] = fw.rocketPos[base3 + 1];
        rocketPointPositions[base3 + 2] = fw.rocketPos[base3 + 2];

        rocketPointColors[base3] = 0;
        rocketPointColors[base3 + 1] = 0;
        rocketPointColors[base3 + 2] = 0;

        const tBase = i * 2 * 3;
        rocketTrailPositions[tBase] = fw.rocketPos[base3];
        rocketTrailPositions[tBase + 1] = fw.rocketPos[base3 + 1];
        rocketTrailPositions[tBase + 2] = fw.rocketPos[base3 + 2];
        rocketTrailPositions[tBase + 3] = fw.rocketPos[base3];
        rocketTrailPositions[tBase + 4] = fw.rocketPos[base3 + 1];
        rocketTrailPositions[tBase + 5] = fw.rocketPos[base3 + 2];

        rocketTrailColors[tBase] = 0;
        rocketTrailColors[tBase + 1] = 0;
        rocketTrailColors[tBase + 2] = 0;
        rocketTrailColors[tBase + 3] = 0;
        rocketTrailColors[tBase + 4] = 0;
        rocketTrailColors[tBase + 5] = 0;

        continue;
      }

      if (fw.phase[i] === 0) {
        fw.rocketVel[base3 + 1] += GRAVITY * 0.08 * delta;

        fw.rocketPos[base3] += fw.rocketVel[base3] * delta;
        fw.rocketPos[base3 + 1] += fw.rocketVel[base3 + 1] * delta;
        fw.rocketPos[base3 + 2] += fw.rocketVel[base3 + 2] * delta;

        const headX = fw.rocketPos[base3];
        const headY = fw.rocketPos[base3 + 1];
        const headZ = fw.rocketPos[base3 + 2];

        const vx = fw.rocketVel[base3];
        const vy = fw.rocketVel[base3 + 1];
        const vz = fw.rocketVel[base3 + 2];
        const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

        const trailLen = MathUtils.clamp(vlen * 0.05, 0.06, 0.34);

        const tailX = headX - (vx / vlen) * trailLen;
        const tailY = headY - (vy / vlen) * trailLen;
        const tailZ = headZ - (vz / vlen) * trailLen;

        rocketPointPositions[base3] = headX;
        rocketPointPositions[base3 + 1] = headY;
        rocketPointPositions[base3 + 2] = headZ;

        const cR = fw.baseColor[base3];
        const cG = fw.baseColor[base3 + 1];
        const cB = fw.baseColor[base3 + 2];

        const flash = fw.age[i] < 0.12 ? 1.0 - fw.age[i] / 0.12 : 0.0;
        const headBoost = Math.min(0.95, 0.55 + flash * 0.35);

        rocketPointColors[base3] = cR * headBoost;
        rocketPointColors[base3 + 1] = cG * headBoost;
        rocketPointColors[base3 + 2] = cB * headBoost;

        const tBase = i * 2 * 3;
        rocketTrailPositions[tBase] = tailX;
        rocketTrailPositions[tBase + 1] = tailY;
        rocketTrailPositions[tBase + 2] = tailZ;
        rocketTrailPositions[tBase + 3] = headX;
        rocketTrailPositions[tBase + 4] = headY;
        rocketTrailPositions[tBase + 5] = headZ;

        const trailFade = MathUtils.clamp(vlen / 10, 0.3, 1);
        rocketTrailColors[tBase] = cR * 0.14 * trailFade;
        rocketTrailColors[tBase + 1] = cG * 0.14 * trailFade;
        rocketTrailColors[tBase + 2] = cB * 0.14 * trailFade;
        rocketTrailColors[tBase + 3] = cR * 0.7 * trailFade;
        rocketTrailColors[tBase + 4] = cG * 0.7 * trailFade;
        rocketTrailColors[tBase + 5] = cB * 0.7 * trailFade;

        if (fw.age[i] >= fw.life[i]) {
          burstFirework(i);
        }
      } else {
        fw.burstAge[i] += delta;
        if (fw.burstAge[i] > fw.burstLife[i] + 0.35) {
          initFirework(i);
        }

        rocketPointColors[base3] = 0;
        rocketPointColors[base3 + 1] = 0;
        rocketPointColors[base3 + 2] = 0;

        const tBase = i * 2 * 3;
        rocketTrailColors[tBase] = 0;
        rocketTrailColors[tBase + 1] = 0;
        rocketTrailColors[tBase + 2] = 0;
        rocketTrailColors[tBase + 3] = 0;
        rocketTrailColors[tBase + 4] = 0;
        rocketTrailColors[tBase + 5] = 0;
      }
    }

    // Sparks simulation (distinct designs + fizzle)
    const velDampBase = Math.pow(0.985, delta * 60);

    for (let i = 0; i < TOTAL_SPARKS; i += 1) {
      const idx3 = i * 3;
      const lineBase = i * 2 * 3;

      sp.age[i] += delta;

      if (sp.age[i] < 0) {
        sparkLineColors[lineBase] = 0;
        sparkLineColors[lineBase + 1] = 0;
        sparkLineColors[lineBase + 2] = 0;
        sparkLineColors[lineBase + 3] = 0;
        sparkLineColors[lineBase + 4] = 0;
        sparkLineColors[lineBase + 5] = 0;

        sparkPointColors[idx3] = 0;
        sparkPointColors[idx3 + 1] = 0;
        sparkPointColors[idx3 + 2] = 0;

        continue;
      }

      if (sp.age[i] > sp.life[i]) {
        sparkLineColors[lineBase] = 0;
        sparkLineColors[lineBase + 1] = 0;
        sparkLineColors[lineBase + 2] = 0;
        sparkLineColors[lineBase + 3] = 0;
        sparkLineColors[lineBase + 4] = 0;
        sparkLineColors[lineBase + 5] = 0;

        sparkPointColors[idx3] = 0;
        sparkPointColors[idx3 + 1] = 0;
        sparkPointColors[idx3 + 2] = 0;

        continue;
      }

      const fwIndex = (i / SPARKS_PER_FIREWORK) | 0;
      const pattern = fw.pattern[fwIndex] as PatternType;

      const ageT = clamp01(sp.age[i] / sp.life[i]);
      const fade = Math.pow(Math.max(0, 1 - ageT), 1.35);

      // pattern-specific motion tweaks
      if (pattern === 4) {
        // willow: heavier droop + extra drag
        sp.vel[idx3] *= 0.995;
        sp.vel[idx3 + 2] *= 0.995;
        sp.vel[idx3 + 1] *= 0.988;
        sp.vel[idx3 + 1] += GRAVITY * 1.18 * delta;
      } else if (pattern === 9) {
        // crackle: jitter + tiny micro-bursts
        const jitter = (Math.random() - 0.5) * 0.9;
        sp.vel[idx3] += jitter * delta * 5.0;
        sp.vel[idx3 + 2] += jitter * delta * 5.0;
        sp.vel[idx3 + 1] += (Math.random() * 0.35) * delta * 4.0;
        sp.vel[idx3 + 1] += GRAVITY * 0.95 * delta;
      } else if (pattern === 11) {
        // strobe comet: slightly less gravity, more forward streak
        sp.vel[idx3 + 1] += GRAVITY * 0.7 * delta;
      } else {
        sp.vel[idx3 + 1] += GRAVITY * delta;
      }

      const velDamp =
        velDampBase *
        (pattern === 11 ? 0.992 : pattern === 9 ? 0.982 : 0.987) *
        (0.985 + 0.02 * fade);

      sp.vel[idx3] *= velDamp;
      sp.vel[idx3 + 1] *= velDamp;
      sp.vel[idx3 + 2] *= velDamp;

      sp.pos[idx3] += sp.vel[idx3] * delta;
      sp.pos[idx3 + 1] += sp.vel[idx3 + 1] * delta;
      sp.pos[idx3 + 2] += sp.vel[idx3 + 2] * delta;

      const vx = sp.vel[idx3];
      const vy = sp.vel[idx3 + 1];
      const vz = sp.vel[idx3 + 2];
      const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

      const streakBase = pattern === 11 ? 0.055 : 0.035;
      const streak = MathUtils.clamp(vlen * streakBase, 0.06, pattern === 11 ? 0.75 : 0.45) * (0.28 + 0.72 * fade);

      const hx = sp.pos[idx3];
      const hy = sp.pos[idx3 + 1];
      const hz = sp.pos[idx3 + 2];

      const tx = hx - (vx / vlen) * streak;
      const ty = hy - (vy / vlen) * streak;
      const tz = hz - (vz / vlen) * streak;

      sparkLinePositions[lineBase] = tx;
      sparkLinePositions[lineBase + 1] = ty;
      sparkLinePositions[lineBase + 2] = tz;
      sparkLinePositions[lineBase + 3] = hx;
      sparkLinePositions[lineBase + 4] = hy;
      sparkLinePositions[lineBase + 5] = hz;

      // Twinkle/strobe without whitening
      const baseTwinkle = 0.78 + 0.22 * Math.sin((i * 11.9 + sp.age[i] * 20.0) % (Math.PI * 2));
      const strobe =
        pattern === 11
          ? (Math.sin(sp.age[i] * 26.0 + i * 0.3) > 0.6 ? 1.0 : 0.35)
          : pattern === 9
            ? (Math.sin(sp.age[i] * 36.0 + i * 0.8) > 0.72 ? 1.0 : 0.55)
            : 1.0;

      const flashBoost = ageT < 0.05 ? (1 - ageT / 0.05) * 0.25 : 0.0;

      const intensityRaw = (0.18 + 0.82 * fade + flashBoost) * baseTwinkle * strobe;
      const intensity = Math.min(0.92, intensityRaw);

      const rBase = sp.color[idx3];
      const gBase = sp.color[idx3 + 1];
      const bBase = sp.color[idx3 + 2];

      const cr = rBase * intensity;
      const cg = gBase * intensity;
      const cb = bBase * intensity;

      // tail lower energy, head higher energy -> colored streaks
      const tail = 0.18 + 0.22 * fade;

      sparkLineColors[lineBase] = cr * tail;
      sparkLineColors[lineBase + 1] = cg * tail;
      sparkLineColors[lineBase + 2] = cb * tail;
      sparkLineColors[lineBase + 3] = cr;
      sparkLineColors[lineBase + 4] = cg;
      sparkLineColors[lineBase + 5] = cb;

      sparkPointPositions[idx3] = hx;
      sparkPointPositions[idx3 + 1] = hy;
      sparkPointPositions[idx3 + 2] = hz;

      const pointBoost = pattern === 11 ? 1.15 : pattern === 9 ? 1.05 : 1.0;
      sparkPointColors[idx3] = Math.min(0.98, cr * pointBoost);
      sparkPointColors[idx3 + 1] = Math.min(0.98, cg * pointBoost);
      sparkPointColors[idx3 + 2] = Math.min(0.98, cb * pointBoost);
    }

    (rocketPointsGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (rocketPointsGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

    (rocketTrailGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (rocketTrailGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

    (sparkLinesGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (sparkLinesGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

    (sparkPointsGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (sparkPointsGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;

    (showerGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (showerGeom.getAttribute("color") as BufferAttribute).needsUpdate = true;
  });

  return (
    <group>
      {/* Rocket glow */}
      <points frustumCulled={false}>
        <bufferGeometry ref={rocketPointsGeomRef}>
          <bufferAttribute attach="attributes-position" args={[rocketPointPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[rocketPointColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={rocketMatRef}
          transparent
          opacity={0}
          vertexColors
          depthWrite={false}
          blending={AdditiveBlending}
          map={glowTex}
          alphaMap={glowTex}
          size={0.23}
          sizeAttenuation
          toneMapped={false}
        />
      </points>

      {/* Rocket trail */}
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={rocketTrailGeomRef}>
          <bufferAttribute attach="attributes-position" args={[rocketTrailPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[rocketTrailColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={rocketTrailMatRef}
          transparent
          opacity={0}
          vertexColors
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>

      {/* Spark streaks (design fireworks) */}
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={sparkLinesGeomRef}>
          <bufferAttribute attach="attributes-position" args={[sparkLinePositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[sparkLineColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={sparkLineMatRef}
          transparent
          opacity={0}
          vertexColors
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>

      {/* Spark glow points */}
      <points frustumCulled={false}>
        <bufferGeometry ref={sparkPointsGeomRef}>
          <bufferAttribute attach="attributes-position" args={[sparkPointPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[sparkPointColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={sparkPointMatRef}
          transparent
          opacity={0}
          vertexColors
          depthWrite={false}
          blending={AdditiveBlending}
          map={glowTex}
          alphaMap={glowTex}
          size={0.16}
          sizeAttenuation
          toneMapped={false}
        />
      </points>

      {/* Confetti shower */}
      <points frustumCulled={false}>
        <bufferGeometry ref={showerPointsGeomRef}>
          <bufferAttribute attach="attributes-position" args={[showerPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[showerColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={showerMatRef}
          transparent
          opacity={0}
          vertexColors
          depthWrite={false}
          blending={AdditiveBlending}
          map={glowTex}
          alphaMap={glowTex}
          size={0.11}
          sizeAttenuation
          toneMapped={false}
        />
      </points>
    </group>
  );
}
