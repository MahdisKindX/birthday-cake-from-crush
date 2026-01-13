import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber"
import { Clone, ContactShadows, useGLTF } from "@react-three/drei"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import { Box3, Group, Mesh, PerspectiveCamera, Vector3 } from "three"
import { EXRLoader } from "three-stdlib"
import { EquirectangularReflectionMapping } from "three"
import { guess } from "web-audio-beat-detector"

type GymSceneProps = { onNextScene?: () => void }

type GroundedCloneProps = {
  url: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  fitHeight?: number
}

function markShadows(root: Group) {
  root.traverse((o) => {
    const m = o as Mesh
    if ((m as any).isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
}

function mulScale(scale: number | [number, number, number] | undefined, k: number) {
  if (scale === undefined) return k
  if (typeof scale === "number") return scale * k
  return [scale[0] * k, scale[1] * k, scale[2] * k] as [number, number, number]
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

function formatTime(s: number) {
  const ss = Math.max(0, Math.floor(s))
  const m = Math.floor(ss / 60)
  const r = ss % 60
  return `${m}:${String(r).padStart(2, "0")}`
}

function formatPct(p: number) {
  const x = clamp(p, 0, 1)
  return `${Math.round(x * 100)}%`
}

function formatInt(n: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(n)))
}

function GroundedClone({ url, position, rotation, scale, fitHeight }: GroundedCloneProps) {
  const gltf = useGLTF(url) as any

  useEffect(() => {
    if (!gltf?.scene) return
    markShadows(gltf.scene)
  }, [gltf])

  const { center, minY, fitK } = useMemo(() => {
    const box = new Box3().setFromObject(gltf.scene)
    const c = box.getCenter(new Vector3())
    const y = box.min.y
    const size = box.getSize(new Vector3())
    const k = fitHeight && size.y > 0.00001 ? fitHeight / size.y : 1
    return { center: c, minY: y, fitK: k }
  }, [gltf, fitHeight])

  const finalScale = useMemo(() => mulScale(scale as any, fitK), [scale, fitK])

  return (
    <group position={position} rotation={rotation} scale={finalScale as any}>
      <group position={[-center.x, -minY, -center.z]}>
        <Clone object={gltf.scene} />
      </group>
    </group>
  )
}

type Lane = 0 | 1 | 2 | 3
type Note = { id: string; lane: Lane; time: number; hit?: boolean }

const KEY_TO_LANE: Record<string, Lane> = { KeyA: 0, KeyS: 1, KeyK: 2, KeyL: 3 }
const LANE_LABELS = ["A", "S", "K", "L"] as const

function buildChartEasy(bpm: number, offset: number, duration: number): Note[] {
  const beat = 60 / Math.max(1, bpm)
  const skipChance = 0.55
  const doubleEvery = 32

  const seededLane = (i: number) => {
    const x = Math.sin(i * 777.77) * 10000
    const frac = x - Math.floor(x)
    return Math.floor(frac * 4) as Lane
  }

  const notes: Note[] = []
  let last: Lane | null = null
  let i = 0
  let beatIndex = 0
  let lastTime = -999

  for (let t = Math.max(0, offset); t < duration - 0.6; t += beat, beatIndex += 1) {
    const r = (Math.sin((beatIndex + 1) * 123.456) + 1) / 2
    if (r < skipChance) continue
    if (t - lastTime < 0.44) continue

    let lane = seededLane(i)
    if (last !== null && lane === last) lane = (((lane + 1) % 4) as Lane)
    last = lane

    notes.push({ id: `n${i}`, lane, time: t })
    i += 1
    lastTime = t

    const makeDouble = beatIndex > 0 && beatIndex % doubleEvery === 0
    if (makeDouble && t + beat * 0.5 < duration - 0.6) {
      const lane2 = (((lane + 2) % 4) as Lane)
      notes.push({ id: `n${i}`, lane: lane2, time: t + beat * 0.5 })
      i += 1
      last = lane2
      lastTime = t + beat * 0.5
    }
  }

  return notes
}

type Popup = { id: string; lane: Lane; kind: "perfect" | "miss"; at: number }
type BurstRay = { a: number; len: number; w: number; delay: number }
type Burst = { id: string; lane: Lane; at: number; rays: BurstRay[] }

type Shot =
  | {
      kind: "pose"
      pos: [number, number, number]
      target: [number, number, number]
      fov: number
      durMin: number
      durMax: number
    }
  | {
      kind: "orbit"
      radius: number
      height: number
      target: [number, number, number]
      fov: number
      turns: number
      dir: 1 | -1
      durMin: number
      durMax: number
    }

const NORMAL_SHOTS: Shot[] = [
  { kind: "pose", pos: [0.0, 2.45, 9.4], target: [0.0, 1.45, 0.0], fov: 66, durMin: 6.0, durMax: 9.0 },
  { kind: "pose", pos: [4.8, 2.35, 7.8], target: [0.1, 1.55, 0.1], fov: 72, durMin: 5.5, durMax: 8.5 },
  { kind: "pose", pos: [-4.7, 2.25, 7.6], target: [-0.1, 1.55, 0.05], fov: 70, durMin: 5.5, durMax: 8.5 },
  { kind: "pose", pos: [0.9, 1.95, 3.75], target: [0.1, 1.6, 0.05], fov: 44, durMin: 5.0, durMax: 7.0 },
  { kind: "pose", pos: [-1.25, 1.35, 4.25], target: [0.0, 1.5, 0.0], fov: 52, durMin: 5.0, durMax: 7.5 },
  { kind: "pose", pos: [0.0, 3.95, 7.0], target: [0.0, 1.45, 0.0], fov: 58, durMin: 5.5, durMax: 8.0 },
  { kind: "orbit", radius: 7.6, height: 2.35, target: [0.0, 1.55, 0.0], fov: 62, turns: 1, dir: 1, durMin: 6.5, durMax: 9.5 },
]

const STREAK_SHOTS: Shot[] = [
  { kind: "pose", pos: [0.55, 2.0, 3.0], target: [0.0, 1.62, 0.0], fov: 38, durMin: 5.0, durMax: 7.0 },
  { kind: "pose", pos: [-5.6, 2.45, 6.7], target: [0.0, 1.62, 0.05], fov: 78, durMin: 5.5, durMax: 8.0 },
  { kind: "pose", pos: [5.9, 2.45, 6.4], target: [0.0, 1.62, 0.05], fov: 78, durMin: 5.5, durMax: 8.0 },
  { kind: "pose", pos: [0.0, 2.75, 9.2], target: [0.0, 1.62, 0.0], fov: 72, durMin: 4.8, durMax: 7.2 },
  { kind: "pose", pos: [0.0, 2.1, 5.6], target: [0.0, 1.62, 0.0], fov: 46, durMin: 4.8, durMax: 7.2 },
  { kind: "pose", pos: [2.3, 3.7, 6.1], target: [0.0, 1.62, 0.0], fov: 64, durMin: 5.0, durMax: 7.8 },
  { kind: "orbit", radius: 6.0, height: 2.15, target: [0.0, 1.62, 0.0], fov: 66, turns: 2, dir: -1, durMin: 6.0, durMax: 8.0 },
]

function pickDifferentIndex(max: number, last: number) {
  if (max <= 1) return 0
  let idx = Math.floor(Math.random() * max)
  let tries = 0
  while (idx === last && tries < 10) {
    idx = Math.floor(Math.random() * max)
    tries += 1
  }
  if (idx === last) idx = (idx + 1) % max
  return idx
}

function CinematicCamera({ streakMode }: { streakMode: boolean }) {
  const cameraAny = useThree((s) => s.camera)
  const cam = cameraAny as PerspectiveCamera

  const lastShotIdxRef = useRef(-1)
  const shotStartRef = useRef(0)
  const shotDurRef = useRef(7)

  const fromPosRef = useRef(new Vector3(0, 2.05, 7.2))
  const toPosRef = useRef(new Vector3(0, 2.05, 7.2))

  const fromTarRef = useRef(new Vector3(0, 1.45, 0))
  const toTarRef = useRef(new Vector3(0, 1.45, 0))

  const fromFovRef = useRef(48)
  const toFovRef = useRef(48)

  const orbitStartAngleRef = useRef(0)
  const orbitDirRef = useRef<1 | -1>(1)
  const orbitTurnsRef = useRef(1)
  const orbitRadiusRef = useRef(7)
  const orbitHeightRef = useRef(2.2)
  const orbitTargetRef = useRef(new Vector3(0, 1.55, 0))
  const orbitFovRef = useRef(60)

  const orbitActiveRef = useRef(false)

  const chooseNextShot = useCallback(
    (t: number) => {
      if (!(cam as any).isPerspectiveCamera) return

      const list = streakMode ? STREAK_SHOTS : NORMAL_SHOTS
      const idx = pickDifferentIndex(list.length, lastShotIdxRef.current)
      lastShotIdxRef.current = idx
      const shot = list[idx]

      shotStartRef.current = t
      shotDurRef.current = lerp(shot.durMin, shot.durMax, Math.random())

      fromPosRef.current.copy(cam.position)
      fromFovRef.current = cam.fov

      const curTar = new Vector3(0, 1.55, 0)
      fromTarRef.current.copy(curTar)

      if (shot.kind === "orbit") {
        orbitActiveRef.current = true
        orbitStartAngleRef.current = Math.random() * Math.PI * 2
        orbitDirRef.current = shot.dir
        orbitTurnsRef.current = shot.turns
        orbitRadiusRef.current = shot.radius
        orbitHeightRef.current = shot.height
        orbitTargetRef.current.set(shot.target[0], shot.target[1], shot.target[2])
        orbitFovRef.current = shot.fov

        toFovRef.current = shot.fov
        toTarRef.current.set(shot.target[0], shot.target[1], shot.target[2])
        toPosRef.current.copy(cam.position)
        return
      }

      orbitActiveRef.current = false
      toPosRef.current.set(shot.pos[0], shot.pos[1], shot.pos[2])
      toTarRef.current.set(shot.target[0], shot.target[1], shot.target[2])
      toFovRef.current = shot.fov
    },
    [cam, streakMode]
  )

  useEffect(() => {
    if (!(cam as any).isPerspectiveCamera) return
    cam.position.set(0, 2.05, 7.2)
    cam.lookAt(0, 1.45, 0)
    cam.fov = 48
    cam.updateProjectionMatrix()
    chooseNextShot(0.001)
  }, [cam, chooseNextShot])

  useFrame(({ clock }) => {
    if (!(cam as any).isPerspectiveCamera) return

    const t = clock.elapsedTime
    const elapsed = t - shotStartRef.current
    const dur = Math.max(0.001, shotDurRef.current)
    const u = clamp(elapsed / dur, 0, 1)

    if (u >= 1) chooseNextShot(t)

    if (orbitActiveRef.current) {
      const tt = clamp(elapsed / dur, 0, 1)
      const ang = orbitStartAngleRef.current + orbitDirRef.current * orbitTurnsRef.current * (Math.PI * 2) * tt

      const tx = orbitTargetRef.current.x
      const ty = orbitTargetRef.current.y
      const tz = orbitTargetRef.current.z

      const x = tx + Math.cos(ang) * orbitRadiusRef.current
      const z = tz + Math.sin(ang) * orbitRadiusRef.current
      const y = orbitHeightRef.current + Math.sin(tt * Math.PI) * 0.15

      cam.position.set(x, y, z)
      cam.lookAt(tx, ty, tz)

      const f = orbitFovRef.current
      if (Math.abs(cam.fov - f) > 0.01) {
        cam.fov = f
        cam.updateProjectionMatrix()
      }
      return
    }

    const a = smoothstep(u)

    const px = lerp(fromPosRef.current.x, toPosRef.current.x, a)
    const py = lerp(fromPosRef.current.y, toPosRef.current.y, a)
    const pz = lerp(fromPosRef.current.z, toPosRef.current.z, a)

    const tx = lerp(fromTarRef.current.x, toTarRef.current.x, a)
    const ty = lerp(fromTarRef.current.y, toTarRef.current.y, a)
    const tz = lerp(fromTarRef.current.z, toTarRef.current.z, a)

    cam.position.set(px, py, pz)
    cam.lookAt(tx, ty, tz)

    const f = lerp(fromFovRef.current, toFovRef.current, a)
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f
      cam.updateProjectionMatrix()
    }
  })

  return null
}

function GymHDRI() {
  const scene = useThree((s) => s.scene)
  const tex = useLoader(EXRLoader, "/gym/gym_01_4k.exr")

  useEffect(() => {
    tex.mapping = EquirectangularReflectionMapping
    scene.environment = tex
    scene.background = tex
    return () => {
      scene.environment = null
      scene.background = null
      tex.dispose()
    }
  }, [scene, tex])

  return null
}

type FloatingDrinkProps = {
  url: string
  index: number
  angle: number
  radius: number
  baseY: number
  spinOffset: number
  fitHeight: number
  scale?: number
  bounceRef: MutableRefObject<Float32Array>
  streak: number
  streakMode: boolean
}

const DRINK_BOUNCE_DUR = 0.52

function FloatingDrink({
  url,
  index,
  angle,
  radius,
  baseY,
  spinOffset,
  fitHeight,
  scale = 1,
  bounceRef,
  streak,
  streakMode,
}: FloatingDrinkProps) {
  const ref = useRef<Group>(null)
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const g = ref.current
    if (!g) return

    const rem = bounceRef.current[index] ?? 0
    const phase = rem > 0 ? 1 - rem / DRINK_BOUNCE_DUR : 1

    const ampBase = 0.08 + Math.min(30, streak) * 0.0035 + (streakMode ? 0.06 : 0)
    const drop = rem > 0 ? -ampBase * Math.sin(Math.PI * phase) : 0
    const wob = rem > 0 ? Math.sin(phase * Math.PI * 2) * 0.03 : 0

    const float = Math.sin(t * 1.3 + spinOffset) * 0.08
    const wobble = Math.sin(t * 1.1 + spinOffset) * 0.06

    const spinBoost = 0.55 + Math.min(24, streak) * 0.02 + (streakMode ? 0.2 : 0)
    g.position.y = baseY + float + drop
    g.rotation.y = t * spinBoost + spinOffset
    g.rotation.z = wobble + wob
    g.scale.setScalar(scale * (1 + (streakMode ? 0.05 : 0.015)))
  })

  const glow = streakMode ? 0.85 : 0.35
  const ringOpacity = streakMode ? 0.34 : 0.22

  return (
    <group ref={ref} position={[x, baseY, z]} rotation={[0, -angle + Math.PI, 0]}>
      <pointLight intensity={glow} color={streakMode ? "#ffd166" : "#7efcff"} distance={3.0} />
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <ringGeometry args={[0.15, 0.30, 64]} />
        <meshBasicMaterial transparent opacity={ringOpacity} color={streakMode ? "#ffd166" : "#7efcff"} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <ringGeometry args={[0.30, 0.37, 64]} />
        <meshBasicMaterial transparent opacity={ringOpacity * 0.7} color={streakMode ? "#ff9b3d" : "#b26bff"} />
      </mesh>

      <GroundedClone url={url} fitHeight={fitHeight} />
    </group>
  )
}

function GymWorld({
  ringSpeed,
  playerUrl,
  drinkBeatKey,
  streak,
  streakMode,
}: {
  ringSpeed: number
  playerUrl: string
  drinkBeatKey: number
  streak: number
  streakMode: boolean
}) {
  const WORLD_SCALE = 2.25
  const WORLD_Y = -0.22
  const ringRef = useRef<Group>(null)

  const drinkUrls = useMemo(
    () => ["/gym/monster_zero.glb", "/gym/monster_energy_drink.glb", "/gym/monster_energy_drink_mango.glb"],
    []
  )

  const DRINK_FIT_HEIGHT = 0.55

  const drinks = useMemo(() => {
    const count = 9
    const out: Array<{ url: string; angle: number; offset: number; idx: number }> = []
    for (let i = 0; i < count; i += 1) {
      out.push({
        idx: i,
        url: drinkUrls[i % drinkUrls.length],
        angle: (i / count) * Math.PI * 2,
        offset: i * 0.65,
      })
    }
    return out
  }, [drinkUrls])

  const bounceRef = useRef<Float32Array>(new Float32Array(9))

  useEffect(() => {
    if (!drinkBeatKey) return
    const b = bounceRef.current
    if (!b || b.length === 0) return

    if (streakMode) {
      for (let i = 0; i < b.length; i += 1) b[i] = DRINK_BOUNCE_DUR
      return
    }

    const pick = Math.floor(Math.random() * b.length)
    b[pick] = DRINK_BOUNCE_DUR
  }, [drinkBeatKey, streakMode])

  useFrame((_, delta) => {
    const g = ringRef.current
    if (g) g.rotation.y += delta * ringSpeed

    const b = bounceRef.current
    for (let i = 0; i < b.length; i += 1) {
      if (b[i] <= 0) continue
      b[i] = Math.max(0, b[i] - delta)
    }
  })

  const stageGlow = 0.06 + (streakMode ? 0.18 : 0.0)

  return (
    <>
      <ambientLight intensity={0.45 + stageGlow} />
      <directionalLight
        intensity={0.7 + stageGlow * 0.9}
        position={[3.6, 7.2, 2.8]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight intensity={1.0 + stageGlow * 0.9} position={[-3.2, 6.8, 2.6]} angle={0.35} penumbra={0.55} castShadow />
      <hemisphereLight intensity={0.35 + stageGlow * 0.6} color="#ffffff" groundColor="#0e0e12" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial
          color="#24242b"
          roughness={0.78}
          metalness={0.08}
          envMapIntensity={1.25}
          emissive="#0b0b10"
          emissiveIntensity={0.35 + stageGlow * 1.35}
        />
      </mesh>

      <ContactShadows position={[0, -0.205, 0]} opacity={0.32} scale={13} blur={2.1} far={9} />

      <group position={[0, WORLD_Y, 0]} scale={WORLD_SCALE}>
        <GroundedClone url={playerUrl} position={[0, 0, 0]} scale={1.1} />

        <GroundedClone url="/gym/dumbbell_barbell_bench_-_9mb.glb" position={[2.25, 0, -0.25]} rotation={[0, -0.9, 0]} scale={1.0} />
        <GroundedClone url="/gym/stationary_bike.glb" position={[-1.55, 0, 1.22]} rotation={[0, 0.95, 0]} fitHeight={0.95} />
        <GroundedClone url="/gym/dumbbells.glb" position={[-0.65, 0, 1.35]} rotation={[0, 0.25, 0]} scale={1.2} />

        <group ref={ringRef} position={[0, 0, 0]}>
          {drinks.map((d) => (
            <FloatingDrink
              key={`${d.url}-${d.idx}`}
              url={d.url}
              index={d.idx}
              angle={d.angle}
              radius={1.75}
              baseY={1.1}
              spinOffset={d.offset}
              fitHeight={DRINK_FIT_HEIGHT}
              scale={1}
              bounceRef={bounceRef}
              streak={streak}
              streakMode={streakMode}
            />
          ))}
        </group>
      </group>
    </>
  )
}

type LeaderRow = { name: string; score: number; isUser?: boolean; isTop?: boolean }

function makeFakeLeaderboard(userScore: number): LeaderRow[] {
  const rand01 = (seed: number) => {
    const x = Math.sin(seed * 999.123) * 10000
    return x - Math.floor(x)
  }

  const others = ["Mr. fucks you guy", "Larry", "Guy who said Type of Shit", "OnfoenemIbeWalking", "Hoosayn"]

  const baseSeed = Math.floor((performance.now() + userScore) * 0.001)

  const otherRows: LeaderRow[] = others.map((name, i) => {
    const r = rand01(baseSeed + i * 13 + 7)
    const r2 = rand01(baseSeed + i * 29 + 3)
    const cap = 350_000
    const v = Math.floor(40_000 + r * (cap - 40_000) + r2 * 18_000)
    return { name, score: clamp(v, 1, cap) }
  })

  const rows: LeaderRow[] = [
    { name: "Mahdoon", score: 999_999, isTop: true },
    { name: "Masgu", score: Math.max(0, Math.floor(userScore)), isUser: true },
    ...otherRows,
  ]

  const uniq: LeaderRow[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const key = `${r.name}-${r.score}`
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(r)
  }

  const sorted = uniq.sort((a, b) => b.score - a.score)

  const ensureTop = sorted.findIndex((r) => r.isTop)
  if (ensureTop !== 0 && ensureTop > -1) {
    const [top] = sorted.splice(ensureTop, 1)
    sorted.unshift(top)
  }

  const ensureUser = sorted.findIndex((r) => r.isUser)
  if (ensureUser === -1) sorted.splice(1, 0, { name: "Masgu", score: Math.max(0, Math.floor(userScore)), isUser: true })

  return sorted.slice(0, 8)
}

export function GymScene({ onNextScene }: GymSceneProps) {
  const [mounted, setMounted] = useState(false)

  const acRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const startAcTimeRef = useRef<number | null>(null)

  const manualStopRef = useRef(false)

  const notesRef = useRef<Note[]>([])
  const [renderNotes, setRenderNotes] = useState<Note[]>([])

  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [ended, setEnded] = useState(false)

  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const pausedSongTimeRef = useRef(0)

  const [, setBpm] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)

  const [songTime, setSongTime] = useState(0)
  const songTimeRef = useRef(0)

  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)

  const [countdown, setCountdown] = useState<number | null>(null)
const countdownIntervalRef = useRef<number | null>(null)

  const maxComboRef = useRef(0)

  const [laneFlash, setLaneFlash] = useState<[number, number, number, number]>([0, 0, 0, 0])

  const [popups, setPopups] = useState<Popup[]>([])
  const [bursts, setBursts] = useState<Burst[]>([])
  const [centerFlash, setCenterFlash] = useState<{ key: number; kind: "perfect" | "miss" } | null>(null)

  const [drinkBeatKey, setDrinkBeatKey] = useState(0)

  const [endModalKey, setEndModalKey] = useState(0)

  const [showStartModal, setShowStartModal] = useState(true)
  const [starting, setStarting] = useState(false)
  const startTimerRef = useRef<number | null>(null)

  const stopCountdown = useCallback(() => {
  if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current)
  countdownIntervalRef.current = null
  setCountdown(null)
}, [])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 40)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (combo > maxComboRef.current) maxComboRef.current = combo
  }, [combo])

  useEffect(() => {
    if (ended) setEndModalKey((k) => k + 1)
  }, [ended])

useEffect(() => {
  return () => {
    if (startTimerRef.current) window.clearTimeout(startTimerRef.current)
    startTimerRef.current = null

    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current)
    countdownIntervalRef.current = null
  }
}, [])

  const STREAK_THRESHOLD = 18
  const streakMode = combo >= STREAK_THRESHOLD

  const multiplier = useMemo(() => {
    if (combo >= 18) return 16
    if (combo >= 14) return 8
    if (combo >= 10) return 4
    if (combo >= 6) return 2
    return 1
  }, [combo])

  const streakProg = useMemo(() => clamp(combo / STREAK_THRESHOLD, 0, 1), [combo])

  const ringSpeed = useMemo(() => {
    const base = 0.12
    const c = Math.min(40, combo)
    const ramp = 1 + c * 0.055
    const streakRamp = combo >= 18 ? 1 + (c - 18) * 0.03 : 1
    return base * ramp * streakRamp
  }, [combo])

  const playerUrl = useMemo(() => (streakMode ? "/gym/massa_buff.glb" : "/gym/massa_pbr.glb"), [streakMode])

  const cleanupAudio = useCallback(() => {
    const src = sourceRef.current
    sourceRef.current = null
    try {
      if (src) src.stop()
    } catch {}

    const ac = acRef.current
    acRef.current = null
    try {
      if (ac) ac.close()
    } catch {}

    gainRef.current = null
    bufferRef.current = null
    startAcTimeRef.current = null
    manualStopRef.current = false
  }, [])

  useEffect(() => () => cleanupAudio(), [cleanupAudio])

  const resetRunState = useCallback(() => {
    setScore(0)
    setCombo(0)
    setHits(0)
    setMisses(0)
    maxComboRef.current = 0
    setPopups([])
    setBursts([])
    setCenterFlash(null)
    setDrinkBeatKey(0)
    setSongTime(0)
    songTimeRef.current = 0
    setRenderNotes([])
    setPaused(false)
    pausedSongTimeRef.current = 0
  }, [])

  const startSourceAt = useCallback((offsetSeconds: number) => {
    const ac = acRef.current
    const g = gainRef.current
    const buffer = bufferRef.current
    if (!ac || !g || !buffer) return false

    const src = ac.createBufferSource()
    src.buffer = buffer
    src.connect(g)
    sourceRef.current = src

    const startAt = ac.currentTime + 0.06
    startAcTimeRef.current = startAt - offsetSeconds

    src.onended = () => {
      if (manualStopRef.current) {
        manualStopRef.current = false
        return
      }
      setReady(false)
      setStarted(false)
      setEnded(true)
      setPaused(false)
      setRenderNotes([])
      setSongTime(buffer.duration)
      songTimeRef.current = buffer.duration
    }

    try {
      src.start(startAt, Math.max(0, offsetSeconds))
      return true
    } catch {
      return false
    }
  }, [])

  const primeAndStart = useCallback(async () => {
    if (started) return true
    try {
      setReady(false)
      setEnded(false)
      cleanupAudio()
      resetRunState()

      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
      const ac = new AC()
      acRef.current = ac

      const g = ac.createGain()
      g.gain.value = 0.05
      gainRef.current = g
      g.connect(ac.destination)

      await ac.resume()

      const res = await fetch("/gym/afterlife.mp3")
      const ab = await res.arrayBuffer()
      const buffer = await ac.decodeAudioData(ab.slice(0))
      bufferRef.current = buffer
      setDuration(buffer.duration)

      const sampleDur = Math.min(25, buffer.duration)
      const det = await guess(buffer, 0, sampleDur)
      const detBpm = Math.max(70, Math.min(180, det.bpm || 120))
      const detOffset = Math.max(0, Math.min(2.5, det.offset ?? 0))

      setBpm(detBpm)
      notesRef.current = buildChartEasy(detBpm, detOffset, buffer.duration)

      const ok = startSourceAt(0)
      if (!ok) throw new Error("start failed")

      setStarted(true)
      setReady(true)
      setPaused(false)
      return true
    } catch {
      setReady(false)
      setStarted(false)
      setEnded(false)
      setPaused(false)
      cleanupAudio()
      return false
    }
  }, [cleanupAudio, resetRunState, started, startSourceAt])

  const pauseGame = useCallback(() => {
    if (!started || ended) return
    if (pausedRef.current) return
    const src = sourceRef.current
    if (!src) return

    pausedSongTimeRef.current = songTimeRef.current
    setPaused(true)

    manualStopRef.current = true
    try {
      src.stop()
    } catch {}
    sourceRef.current = null
  }, [ended, started])

  const resumeGame = useCallback(() => {
    if (!started || ended) return
    if (!pausedRef.current) return

    const ac = acRef.current
    const buffer = bufferRef.current
    if (!ac || !buffer) return

    const off = clamp(pausedSongTimeRef.current, 0, Math.max(0, buffer.duration - 0.01))
    const ok = startSourceAt(off)
    if (!ok) return

    setPaused(false)
    setReady(true)
  }, [ended, startSourceAt, started])

  const togglePause = useCallback(() => {
    if (!started || ended) return
    if (pausedRef.current) resumeGame()
    else pauseGame()
  }, [ended, pauseGame, resumeGame, started])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return
      e.preventDefault()
      togglePause()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [togglePause])

  useEffect(() => {
    if (!started) return
    let raf = 0
    let frame = 0

    const travel = 2.35

    const tick = () => {
      if (!started) return
      if (pausedRef.current) {
        if (frame % 6 === 0) setSongTime(pausedSongTimeRef.current)
        frame += 1
        raf = window.requestAnimationFrame(tick)
        return
      }

      const ac = acRef.current
      const startAt = startAcTimeRef.current
      if (ac && typeof startAt === "number") {
        const t = Math.max(0, ac.currentTime - startAt)
        songTimeRef.current = t
        if (frame % 2 === 0) setSongTime(t)

        const notes = notesRef.current

        while (notes.length && notes[0].time < t - 0.22) {
          if (!notes[0].hit) {
            setCombo(0)
            setMisses((m) => m + 1)
            setCenterFlash((prev) => ({ key: (prev?.key ?? 0) + 1, kind: "miss" }))
          }
          notes.shift()
        }

        const view = notes.filter((n) => n.time >= t - 0.35 && n.time <= t + travel)
        setRenderNotes(view)
      }

      frame += 1
      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [started])

  const spawnPopup = useCallback((lane: Lane, kind: "perfect" | "miss") => {
    const now = performance.now()
    const id = `${now}-${lane}-${kind}`
    const p: Popup = { id, lane, kind, at: now }
    setPopups((prev) => [...prev, p])
    window.setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== id)), 650)
  }, [])

  const spawnElectricBurst = useCallback((lane: Lane) => {
    const now = performance.now()
    const id = `b-${now}-${lane}`
    const rays: BurstRay[] = Array.from({ length: 14 }, (_, i) => {
      const r1 = (Math.sin((now * 0.001 + i * 7.1 + lane * 19.9) * 12.34) + 1) / 2
      const r2 = (Math.sin((now * 0.002 + i * 11.7 + lane * 23.3) * 9.11) + 1) / 2
      const r3 = (Math.sin((now * 0.003 + i * 5.9 + lane * 29.1) * 14.77) + 1) / 2
      return {
        a: r1 * 360,
        len: lerp(28, 64, r2),
        w: lerp(2, 4, r3),
        delay: lerp(0, 70, (Math.sin((now * 0.004 + i * 3.3) * 10.21) + 1) / 2),
      }
    })
    const b: Burst = { id, lane, at: now, rays }
    setBursts((prev) => [...prev, b])
    window.setTimeout(() => setBursts((prev) => prev.filter((x) => x.id !== id)), 520)
  }, [])

  const attemptHit = useCallback(
    (lane: Lane) => {
      if (!ready || pausedRef.current || ended) return

      const t = songTimeRef.current
      const HIT = 0.17
      const notes = notesRef.current

      for (let i = 0; i < notes.length; i += 1) {
        const n = notes[i]
        if (n.time > t + HIT) break
        if (n.lane !== lane) continue

        const dt = Math.abs(n.time - t)
        if (dt <= HIT) {
          n.hit = true
          notes.splice(i, 1)

          const base = Math.max(10, Math.round(140 * (1 - dt / HIT)))
          const add = base * multiplier

          setHits((h) => h + 1)
          setCombo((c) => c + 1)
          setScore((s) => s + add)

          spawnPopup(lane, "perfect")
          spawnElectricBurst(lane)
          setCenterFlash((prev) => ({ key: (prev?.key ?? 0) + 1, kind: "perfect" }))

          setDrinkBeatKey((k) => k + 1)
          return
        }
      }

      setCombo(0)
      setMisses((m) => m + 1)
      spawnPopup(lane, "miss")
      setCenterFlash((prev) => ({ key: (prev?.key ?? 0) + 1, kind: "miss" }))
    },
    [ended, multiplier, ready, spawnElectricBurst, spawnPopup]
  )

  useEffect(() => {
    if (!started) return

    const onKeyDown = (e: KeyboardEvent) => {
      const lane = KEY_TO_LANE[e.code]
      if (lane === undefined) return
      if (pausedRef.current) return
      e.preventDefault()

      setLaneFlash((prev) => {
        const next = [...prev] as [number, number, number, number]
        next[lane] = Date.now()
        return next
      })

      attemptHit(lane)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [attemptHit, started])

const retry = useCallback(async () => {
  if (startTimerRef.current) window.clearTimeout(startTimerRef.current)
  startTimerRef.current = null

  stopCountdown()

  setStarting(false)
  setShowStartModal(false)

  cleanupAudio()
  setStarted(false)
  setReady(false)
  setEnded(false)
  setPaused(false)
  resetRunState()

  await primeAndStart()
}, [cleanupAudio, primeAndStart, resetRunState, stopCountdown])

  const songPct = duration > 0 ? clamp(songTime / duration, 0, 1) : 0

  const travel = 2.35
  const HIT_LINE_FROM_BOTTOM = 38
  const LANE_PLAY_H = 320
  const HIT_LINE_Y = LANE_PLAY_H - HIT_LINE_FROM_BOTTOM
  const NOTE_H = 22

  const npTitle = "Afterlife"
  const npSub = "Avenged Sevenfold"

  const attempts = hits + misses
  const accuracy = attempts > 0 ? hits / attempts : 0

  const leaderboard = useMemo(() => {
    return makeFakeLeaderboard(score)
  }, [endModalKey, score])

  const userRank = useMemo(() => {
    const idx = leaderboard.findIndex((r) => r.isUser)
    return idx >= 0 ? idx + 1 : null
  }, [leaderboard])

const START_COUNTDOWN_SECONDS = 3
const START_DELAY_MS = START_COUNTDOWN_SECONDS * 1000

const onStartClick = useCallback(() => {
  if (starting || started || ready) return

  setShowStartModal(false)
  setStarting(true)

  if (startTimerRef.current) window.clearTimeout(startTimerRef.current)
  stopCountdown()

  setCountdown(START_COUNTDOWN_SECONDS)
  countdownIntervalRef.current = window.setInterval(() => {
    setCountdown((c) => {
      if (c === null) return c
      const next = c - 1
      if (next <= 0) {
        if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
        return 0
      }
      return next
    })
  }, 1000)

  startTimerRef.current = window.setTimeout(async () => {
    const ok = await primeAndStart()
    setStarting(false)
    startTimerRef.current = null
    stopCountdown()
    if (!ok) setShowStartModal(true)
  }, START_DELAY_MS)
}, [primeAndStart, ready, started, starting, stopCountdown])

  return (
    <div className={`gym-scene ${mounted ? "is-mounted" : ""}`}>
      <style>{`
  @font-face {
    font-family: "NightmareHero";
    src: url("/fonts/Nightmare_Hero_Normal.ttf") format("truetype");
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }

  .gym-scene {
    position: absolute;
    inset: 0;
    z-index: 80;
    overflow: hidden;
    background: radial-gradient(1200px 700px at 50% 20%, rgba(40,40,48,0.34), rgba(0,0,0,0.92));
    font-family: "NightmareHero", system-ui, sans-serif;
    color: rgba(255,255,255,0.96);

    --laneBg:
      radial-gradient(260px 240px at 50% 35%, rgba(126,252,255,0.09), rgba(0,0,0,0) 60%),
      linear-gradient(135deg, rgba(126,252,255,0.10), rgba(178,107,255,0.08)),
      rgba(0,0,0,0.16);

    --laneBorder: rgba(255,255,255,0.12);

    --streakBorder: rgba(255,209,102,0.28);
     --streakBg:
      radial-gradient(260px 240px at 50% 35%, rgba(255,209,102,0.10), rgba(0,0,0,0) 62%),
      linear-gradient(135deg, rgba(255,209,102,0.12), rgba(255,77,109,0.06)),
      rgba(0,0,0,0.18);
    --streakGlow: 0 24px 80px rgba(255,209,102,0.06), 0 24px 70px rgba(0,0,0,0.55);
  }

  .gym-canvas { position: absolute; inset: 0; }
  .gym-ui { position: absolute; inset: 0; z-index: 10; pointer-events: none; }

  .hud-bottom {
    position: absolute;
    left: 50%;
    bottom: 1.2rem;
    transform: translateX(-50%);
    width: min(1280px, 96vw);
    display: grid;
    grid-template-columns: 94px 1fr 300px;
    gap: 16px;
    align-items: end;
    pointer-events: none;
  }

  .hud-bottom.is-streak .rhythm-wrap,
  .hud-bottom.is-streak .stats-panel,
  .hud-bottom.is-streak .nowPlayingBox,
  .hud-bottom.is-streak .streak-meter {
    border-color: var(--streakBorder);
    background: var(--streakBg);
    box-shadow: var(--streakGlow);
  }

  .rhythm-wrap,
  .stats-panel,
  .nowPlayingBox,
  .streak-meter,
  .songProgWrap,
  .statRow,
  .pauseBtn,
  .pauseCard,
  .gym-startCard,
  .howText,
  .howAid,
  .endCard,
  .endTableWrap,
  .endStatRow {
    border-color: var(--laneBorder);
    background: var(--laneBg);
  }

  .hud-bottom.is-streak .songProgWrap,
  .hud-bottom.is-streak .statRow,
  .hud-bottom.is-streak .pauseBtn,
  .hud-bottom.is-streak .pauseCard,
  .hud-bottom.is-streak .gym-startCard,
  .hud-bottom.is-streak .howText,
  .hud-bottom.is-streak .howAid,
  .hud-bottom.is-streak .endCard,
  .hud-bottom.is-streak .endTableWrap,
  .hud-bottom.is-streak .endStatRow {
    border-color: rgba(255,209,102,0.16);
    background:
      radial-gradient(220px 200px at 50% 35%, rgba(255,209,102,0.06), rgba(0,0,0,0) 62%),
      rgba(0,0,0,0.18);
  }

  .mult-above {
    position: relative;
    height: 488px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    pointer-events: none;
  }

  .mult-pill {
    position: absolute;
    top: -14px;
    left: 50%;
    transform: translate(-50%, -100%);
    padding: 12px 16px;
    border-radius: 999px;
    border: var(--laneBorder);
    background: var(--laneBg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 24px 70px rgba(0,0,0,0.50);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.35rem;
    opacity: 0.98;
    min-width: 88px;
    text-align: center;
  }

  .hud-bottom.is-streak .mult-pill {
    border-color: rgba(255,209,102,0.22);
    color: rgba(255,230,170,0.98);
    background:
      radial-gradient(220px 200px at 50% 35%, rgba(255,209,102,0.08), rgba(0,0,0,0) 62%),
      rgba(0,0,0,0.28);
    box-shadow: 0 24px 80px rgba(255,209,102,0.06), 0 24px 70px rgba(0,0,0,0.55);
  }

  .streak-meter {
    height: 488px;
    width: 100%;
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.14);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 24px 70px rgba(0,0,0,0.55);
    overflow: hidden;
    position: relative;
  }
  .streak-meter::before {
    content: "";
    position: absolute;
    inset: 10px;
    border-radius: 14px;
    background: rgba(0,0,0,0.28);
    border: 2px solid rgba(255,255,255,0.10);
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
  }
  .streak-fill {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 14px;
    height: calc((100% - 28px) * var(--p));
    border-radius: 12px;
    background: linear-gradient(to top, #25ff9a 0%, #ffe066 55%, #ff4d6d 100%);
    box-shadow: 0 18px 60px rgba(0,0,0,0.35);
  }

  .rhythm-wrap {
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.14);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 24px 70px rgba(0,0,0,0.55);
    padding: 1.15rem 1.15rem 1.05rem;
    pointer-events: none;
  }

  .rhythm-inner {
    position: relative;
    width: 100%;
    height: 320px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .lane {
    position: relative;
    height: 100%;
    border-radius: 16px;
    border: 2px solid var(--laneBorder);
    background: var(--laneBg);
    overflow: hidden;
  }

  .hud-bottom.is-streak .lane {
    background:
      radial-gradient(260px 240px at 50% 35%, rgba(255,209,102,0.08), rgba(0,0,0,0) 62%),
      rgba(0,0,0,0.18);
    border-color: rgba(255,209,102,0.14);
  }

  .lane::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 38px;
    height: 2px;
    background: rgba(255,255,255,0.55);
    opacity: 0.9;
    box-shadow: 0 0 22px rgba(255,255,255,0.10);
  }
  .hud-bottom.is-streak .lane::after {
    background: rgba(255,209,102,0.70);
    box-shadow: 0 0 24px rgba(255,209,102,0.12);
  }

  .note {
    position: absolute;
    top: 0;
    left: 12%;
    right: 12%;
    height: 22px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.20);
    background: linear-gradient(90deg, rgba(109,106,255,0.92), rgba(76,201,240,0.86), rgba(181,23,255,0.88));

    border-color: rgba(255,255,255,0.22);
    box-shadow:
      0 18px 60px rgba(0,0,0,0.35),
      0 0 18px rgba(126,252,255,0.12),
      inset 0 0 0 1px rgba(0,0,0,0.22);
    will-change: transform;
  }
  .hud-bottom.is-streak .note {
    background: linear-gradient(90deg, rgba(255,209,102,0.94), rgba(255,155,61,0.84), rgba(255,209,102,0.94));

    border-color: rgba(255,209,102,0.22);
    box-shadow:
      0 18px 60px rgba(0,0,0,0.35),
      0 0 18px rgba(255,209,102,0.10),
      inset 0 0 0 1px rgba(0,0,0,0.22);
  }

  .lane.is-pressed { filter: brightness(1.08); border-color: rgba(126,252,255,0.28); }
  .hud-bottom.is-streak .lane.is-pressed { border-color: rgba(255,209,102,0.26); }

  .key-row {
    margin-top: 12px;
    height: 82px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .keycapWrap {
    position: relative;
    border-radius: 16px;
    border: var(--laneBorder);
    background: var(--laneBg);
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  .hud-bottom.is-streak .keycapWrap {
    border-color: rgba(255,209,102,0.16);
    background:
      radial-gradient(220px 200px at 50% 35%, rgba(255,209,102,0.06), rgba(0,0,0,0) 62%),
      rgba(0,0,0,0.18);
  }

  .keycap {
    width: 70px;
    height: 70px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.14);
    background: rgba(0,0,0,0.22);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: grid;
    place-items: center;
    font-weight: 900;
    text-transform: uppercase;
    font-size: 34px;
    opacity: 0.95;
    box-shadow: 0 18px 60px rgba(0,0,0,0.45);
    position: relative;
  }

  .keycapGlow {
    position: absolute;
    inset: -10px;
    border-radius: 999px;
    border: 2px solid rgba(126,252,255,0.0);
    opacity: 0;
    transition: opacity 140ms ease, border-color 140ms ease;
    pointer-events: none;
  }

  .keycapWrap.is-pressed .keycap { border-color: rgba(126,252,255,0.28); }
  .keycapWrap.is-pressed .keycapGlow { opacity: 1; border-color: rgba(126,252,255,0.22); }

  .hud-bottom.is-streak .keycap { border-color: rgba(255,209,102,0.20); color: rgba(255,230,170,0.96); }
  .hud-bottom.is-streak .keycapWrap.is-pressed .keycapGlow { border-color: rgba(255,209,102,0.18); opacity: 1; }

  .popup {
    position: absolute;
    left: 50%;
    top: 242px;
    transform: translateX(-50%);
    pointer-events: none;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 1.15rem;
    opacity: 0;
    filter: drop-shadow(0 14px 40px rgba(0,0,0,0.55));
    animation: popFloat 650ms ease both;
    white-space: nowrap;
  }
  .popup.is-perfect { color: rgba(126,252,255,0.98); text-shadow: 0 0 18px rgba(126,252,255,0.25); }
  .popup.is-miss { color: rgba(255,120,120,0.98); text-shadow: 0 0 18px rgba(255,120,120,0.22); }
  .hud-bottom.is-streak .popup.is-perfect { color: rgba(255,209,102,0.98); text-shadow: 0 0 18px rgba(255,209,102,0.18); }

  @keyframes popFloat {
    0% { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.96); }
    18% { opacity: 1; transform: translateX(-50%) translateY(-4px) scale(1.03); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-18px) scale(1.02); }
  }

  .burst {
    position: absolute;
    left: 50%;
    top: 270px;
    width: 2px;
    height: 2px;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .ray {
    position: absolute;
    left: 0;
    top: 0;
    height: 2px;
    border-radius: 999px;
    transform-origin: left center;
    opacity: 0;
    background:
      linear-gradient(to right,
        rgba(255,255,255,0.00),
        rgba(126,252,255,0.92),
        rgba(178,107,255,0.88),
        rgba(255,255,255,0.00)
      );
    filter: drop-shadow(0 0 12px rgba(126,252,255,0.20));
    animation: rayZap 520ms ease both;
  }
  .hud-bottom.is-streak .ray {
    background:
      linear-gradient(to right,
        rgba(255,255,255,0.00),
        rgba(255,209,102,0.92),
        rgba(255,155,61,0.86),
        rgba(255,255,255,0.00)
      );
    filter: drop-shadow(0 0 12px rgba(255,209,102,0.16));
  }

  @keyframes rayZap {
    0% { opacity: 0; transform: rotate(var(--a)) scaleX(0.12); }
    16% { opacity: 1; transform: rotate(var(--a)) scaleX(1.0); }
    100% { opacity: 0; transform: rotate(var(--a)) scaleX(0.55); }
  }

  .centerFlash {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 12;
    padding: 1.05rem 1.3rem;
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.18);
    background: rgba(0,0,0,0.34);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 24px 80px rgba(0,0,0,0.55);
    letter-spacing: 0.28em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: clamp(1.65rem, 3.3vw, 2.25rem);
    opacity: 0;
    pointer-events: none;
    animation: centerFlashIn 520ms ease both;
  }
  .centerFlash.is-perfect {
    border-color: rgba(126,252,255,0.22);
    box-shadow: 0 24px 90px rgba(126,252,255,0.10), 0 24px 80px rgba(0,0,0,0.55);
    color: rgba(126,252,255,0.98);
  }
  .centerFlash.is-miss {
    border-color: rgba(255,120,120,0.22);
    box-shadow: 0 24px 90px rgba(255,120,120,0.10), 0 24px 80px rgba(0,0,0,0.55);
    color: rgba(255,120,120,0.98);
  }
  .hud-bottom.is-streak .centerFlash.is-perfect {
    border-color: rgba(255,209,102,0.26);
    box-shadow: 0 24px 90px rgba(255,209,102,0.10), 0 24px 80px rgba(0,0,0,0.55);
    color: rgba(255,209,102,0.98);
  }
  @keyframes centerFlashIn {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
    18% { opacity: 1; transform: translate(-50%, -50%) scale(1.02); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.01); }
  }

  .stats-panel {
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.14);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 24px 70px rgba(0,0,0,0.55);
    padding: 16px 16px 14px;
    pointer-events: none;
  }

  .statRow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 12px;
    border-radius: 14px;
    border: 2px solid rgba(255,255,255,0.08);
    margin-bottom: 12px;
  }
  .statRow:last-child { margin-bottom: 0; }
  .statRow span {
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.02rem;
    opacity: 0.86;
  }
  .statRow b {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.32rem;
    opacity: 0.98;
  }

  .songProgWrap {
    margin-top: 16px;
    border-radius: 16px;
    border: 2px solid rgba(255,255,255,0.10);
    padding: 14px 14px 12px;
  }
  .songBar {
    height: 16px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.10);
    background: rgba(0,0,0,0.22);
    overflow: hidden;
  }
  .songBar > span {
    display: block;
    height: 100%;
    transform-origin: left;
    transform: scaleX(var(--p));
    background: linear-gradient(90deg, rgba(109,106,255,0.92), rgba(76,201,240,0.86), rgba(181,23,255,0.88));
  }
  .hud-bottom.is-streak .songBar > span {
    background: linear-gradient(90deg, rgba(255,209,102,0.94), rgba(255,155,61,0.84), rgba(255,209,102,0.94));
  }
  .songTimes {
    margin-top: 12px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.02rem;
    opacity: 0.88;
  }

  .btn {
    border-radius: 16px;
    padding: 14px 18px;
    border: 2px solid rgba(255,255,255,0.14);
    background: rgba(0,0,0,0.28);
    color: rgba(255,255,255,0.96);
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 24px 70px rgba(0,0,0,0.35);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    transition: transform 160ms ease, filter 160ms ease;
    font-size: 1.10rem;
  }
  .btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .btn:active { transform: translateY(0px) scale(0.99); filter: brightness(0.98); }
  .btn:focus-visible { outline: 2px solid rgba(255,255,255,0.55); outline-offset: 3px; }

  .btn.primary {
    background: linear-gradient(90deg, rgba(109,106,255,0.85), rgba(76,201,240,0.75), rgba(181,23,255,0.8));
    border-color: rgba(255,255,255,0.12);
  }
  .hud-bottom.is-streak .btn.primary {
    background: linear-gradient(90deg, rgba(255,209,102,0.92), rgba(255,155,61,0.78), rgba(255,209,102,0.92));
  }

  .nowPlayingBox {
    position: absolute;
    right: 1.1rem;
    bottom: 1.1rem;
    width: min(360px, 56vw);
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.14);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 24px 70px rgba(0,0,0,0.55);
    padding: 16px 16px 16px;
    pointer-events: auto;
  }

  .nowPlayingBox.is-streak {
    border-color: var(--streakBorder);
    background: var(--streakBg);
    box-shadow: var(--streakGlow);
  }

  .npLabel {
    text-align: center;
    letter-spacing: 0.20em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.12rem;
    opacity: 0.94;
    margin-bottom: 12px;
  }

  .npCoverWrap {
    display: grid;
    place-items: center;
    margin-bottom: 12px;
  }
  .npCover {
    width: 168px;
    height: 168px;
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.12);
    object-fit: cover;
    box-shadow: 0 18px 60px rgba(0,0,0,0.35);
  }
  .nowPlayingBox.is-streak .npCover {
    border-color: rgba(255,209,102,0.18);
    box-shadow: 0 18px 70px rgba(0,0,0,0.40), 0 0 22px rgba(255,209,102,0.10);
  }

  .npSongTitle {
    text-align: center;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.45rem;
    opacity: 0.98;
    margin-bottom: 6px;
  }
  .npArtist {
    text-align: center;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.15rem;
    opacity: 0.78;
    margin-bottom: 8px;
  }
  .nowPlayingBox.is-streak .npSongTitle { color: rgba(255,230,170,0.98); }
  .nowPlayingBox.is-streak .npArtist { opacity: 0.84; color: rgba(255,209,102,0.92); }

  .pauseBtn {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 54px;
    height: 54px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.14);
    color: rgba(255,255,255,0.95);
    cursor: pointer;
    display: grid;
    place-items: center;
    box-shadow: 0 18px 60px rgba(0,0,0,0.35);
    transition: transform 140ms ease, filter 140ms ease;
  }
  .nowPlayingBox.is-streak .pauseBtn {
    border-color: rgba(255,209,102,0.20);
  }
  .pauseBtn:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .pauseBtn:active { transform: translateY(0px) scale(0.99); filter: brightness(0.98); }
  .pauseBtn:focus-visible { outline: 2px solid rgba(255,255,255,0.55); outline-offset: 3px; }

  .pauseGlyph {
    font-weight: 900;
    letter-spacing: 0.08em;
    font-size: 1.18rem;
    text-transform: uppercase;
    opacity: 0.98;
  }

  .pauseOverlay,
  .endOverlay {
    position: absolute;
    inset: 0;
    z-index: 45;
    display: grid;
    place-items: center;
    background: rgba(0,0,0,0.46);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    pointer-events: auto;
    padding: 18px;
  }

  .pauseCard {
    width: min(600px, 92vw);
    border-radius: 22px;
    border: 2px solid rgba(255,255,255,0.16);
    box-shadow: 0 34px 120px rgba(0,0,0,0.72);
    padding: 22px 22px 20px;
    text-align: center;
  }

.countdownOverlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,0.46);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: none;
  padding: 18px;
}

.countdownCard {
  border-radius: 26px;
  border: 2px solid rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.34);
  box-shadow: 0 34px 120px rgba(0,0,0,0.72);
  padding: 28px 34px 26px;
  text-align: center;
}

.countdownNumber {
  letter-spacing: 0.28em;
  text-transform: uppercase;
  font-weight: 900;
  font-size: clamp(5rem, 12vw, 9rem);
  line-height: 1;
  margin: 0.15rem 0 0.6rem;
  text-shadow: 0 24px 90px rgba(0,0,0,0.55);
}

.countdownHint {
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-weight: 900;
  font-size: clamp(1.15rem, 2.4vw, 1.6rem);
  opacity: 0.86;
}

.hud-bottom.is-streak ~ .nowPlayingBox .countdownNumber,
.gym-scene .countdownOverlay .countdownNumber {
  color: rgba(255,255,255,0.96);
}

.hud-bottom.is-streak ~ .nowPlayingBox .countdownCard,
.gym-scene .countdownOverlay .countdownCard {
  border-color: rgba(255,255,255,0.18);
}

  .pauseTitle {
    letter-spacing: 0.28em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: clamp(1.70rem, 3.2vw, 2.25rem);
    margin: 0.25rem 0 0.6rem;
  }
  .pauseSub {
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.18rem;
    opacity: 0.84;
    line-height: 1.6;
  }
  .pauseRow {
    margin-top: 18px;
    display: flex;
    gap: 12px;
    justify-content: center;
    pointer-events: auto;
  }

  .gym-startOverlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(0,0,0,0.66);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    pointer-events: auto;
  }
  .gym-startCard {
    width: min(980px, 96vw);
    border-radius: 22px;
    border: 2px solid rgba(255,255,255,0.16);
    box-shadow: 0 34px 120px rgba(0,0,0,0.72);
    padding: 26px 26px 22px;
  }
  .gym-startTitle {
    text-align: center;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: clamp(2.05rem, 3.3vw, 2.65rem);
    margin: 0.25rem 0 1.1rem;
  }

  .howWrap {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    align-items: center;
  }
  @media (max-width: 860px) {
    .howWrap { grid-template-columns: 1fr; }
  }

  .howText {
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.12);
    padding: 22px 22px;
  }
  .howText h3 {
    margin: 0 0 14px;
    text-align: left;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.70rem;
    opacity: 0.96;
  }
  .howText ul {
    margin: 0;
    padding-left: 20px;
    text-align: left;
    line-height: 1.65;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.35rem;
    opacity: 0.92;
  }
  .howText li { margin: 12px 0; }

  .howAid {
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.12);
    padding: 14px 14px;
    display: grid;
    place-items: center;
  }
  .howAid img {
    width: min(620px, 100%);
    height: auto;
    display: block;
    filter: drop-shadow(0 18px 60px rgba(0,0,0,0.45));
    opacity: 0.98;
  }

  .gym-startRow { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 18px; }
  .gym-startBtn {
    border-radius: 16px;
    padding: 16px 22px;
    border: 2px solid rgba(255,255,255,0.14);
    background: rgba(0,0,0,0.28);
    color: rgba(255,255,255,0.96);
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 24px 70px rgba(0,0,0,0.35);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;
    font-size: 1.25rem;
  }
  .gym-startBtn:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .gym-startBtn:active { transform: translateY(0px) scale(0.99); filter: brightness(0.98); }
  .gym-startBtn:focus-visible { outline: 2px solid rgba(255,255,255,0.55); outline-offset: 3px; }
  .gym-startBtn[disabled] { opacity: 0.55; cursor: default; transform: none; filter: none; }

  .endCard {
    width: min(980px, 96vw);
    border-radius: 22px;
    border: 2px solid rgba(255,255,255,0.16);
    box-shadow: 0 34px 120px rgba(0,0,0,0.72);
    padding: 22px 22px 20px;
  }

  .endTitle {
    text-align: center;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: clamp(2.05rem, 3.3vw, 2.65rem);
    margin: 0.25rem 0 1.0rem;
  }

  .endGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .endGrid { grid-template-columns: 1fr; }
  }

  .endStats {
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.12);
    padding: 14px 14px 6px;
  }

  .endStatRow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 12px;
    border-radius: 14px;
    border: 2px solid rgba(255,255,255,0.08);
    margin-bottom: 12px;
  }
  .endStatRow span {
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.75rem;
    opacity: 0.86;
  }
  .endStatRow b {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 2rem;
    opacity: 0.98;
  }

  .endTableWrap {
    border-radius: 18px;
    border: 2px solid rgba(255,255,255,0.12);
    padding: 14px 14px 12px;
    overflow: hidden;
  }

  .endTableTitle {
    text-align: center;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.75rem;
    opacity: 0.96;
    margin: 4px 0 12px;
  }

  .endTable {
    width: 100%;
    border-collapse: collapse;
    overflow: hidden;
  }
  .endTable th,
  .endTable td {
    padding: 10px 10px;
    border-bottom: 2px solid rgba(255,255,255,0.08);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 1.33rem;
    opacity: 0.92;
  }
  .endTable th { opacity: 0.72; font-size: 1rem; }
  .endTable tr:last-child td { border-bottom: none; }

  .endRowUser td {
    border-bottom-color: rgba(126,252,255,0.12);
    background: rgba(0,0,0,0.18);
  }
  .hud-bottom.is-streak .endRowUser td {
    border-bottom-color: rgba(255,209,102,0.12);
  }

  .rankPill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.14);
    background: rgba(0,0,0,0.22);
    box-shadow: 0 18px 60px rgba(0,0,0,0.25);
  }
  .rankPill.top {
    border-color: rgba(255,209,102,0.22);
  }

  .endActions {
    margin-top: 16px;
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    pointer-events: auto;
  }
`}</style>

      <div className="gym-ui">
        {centerFlash && (
          <div key={`cf-${centerFlash.key}`} className={`centerFlash ${centerFlash.kind === "perfect" ? "is-perfect" : "is-miss"}`}>
            {centerFlash.kind === "perfect" ? "PERFECT" : "MISS"}
          </div>
        )}

        <div className={`hud-bottom ${streakMode ? "is-streak" : ""}`}>
          <div className="mult-above">
            <div className="mult-pill">{`${multiplier}x`}</div>
            <div className="streak-meter" style={{ ["--p" as any]: `${streakProg}` } as any}>
              <div className="streak-fill" />
            </div>
          </div>

          <div className="rhythm-wrap">
            <div className="rhythm-inner">
              {([0, 1, 2, 3] as Lane[]).map((lane) => {
                const pressed = laneFlash[lane] && Date.now() - laneFlash[lane] < 120
                return (
                  <div key={lane} className={`lane ${pressed ? "is-pressed" : ""}`}>
                    {ready &&
                      renderNotes
                        .filter((n) => n.lane === lane)
                        .map((n) => {
                          const dt = n.time - songTime
                          const prog = 1 - dt / travel
                          const y = prog * HIT_LINE_Y - NOTE_H / 2
                          const cy = clamp(y, -NOTE_H, HIT_LINE_Y - NOTE_H / 2)
                          return <div key={n.id} className="note" style={{ transform: `translateY(${cy}px)` }} />
                        })}

                    {popups
                      .filter((p) => p.lane === lane)
                      .map((p) => (
                        <div key={p.id} className={`popup ${p.kind === "perfect" ? "is-perfect" : "is-miss"}`}>
                          {p.kind === "perfect" ? "PERFECT" : "MISS"}
                        </div>
                      ))}

                    {bursts
                      .filter((b) => b.lane === lane)
                      .map((b) => (
                        <div key={b.id} className="burst" aria-hidden="true">
                          {b.rays.map((r, i) => (
                            <span
                              key={`${b.id}-r-${i}`}
                              className="ray"
                              style={
                                {
                                  width: `${r.len}px`,
                                  height: `${r.w}px`,
                                  animationDelay: `${r.delay}ms`,
                                  ["--a" as any]: `${r.a}deg`,
                                } as any
                              }
                            />
                          ))}
                        </div>
                      ))}
                  </div>
                )
              })}
            </div>

            <div className="key-row">
              {([0, 1, 2, 3] as Lane[]).map((lane) => {
                const pressed = laneFlash[lane] && Date.now() - laneFlash[lane] < 120
                return (
                  <div key={`k-${lane}`} className={`keycapWrap ${pressed ? "is-pressed" : ""}`}>
                    <div className="keycap">
                      {LANE_LABELS[lane]}
                      <span className="keycapGlow" />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="songProgWrap">
              <div className="songBar" style={{ ["--p" as any]: `${songPct}` } as any}>
                <span />
              </div>
              <div className="songTimes">
                <span>{formatTime(songTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="stats-panel">
            <div className="statRow">
              <span>score</span>
              <b>{score}</b>
            </div>
            <div className="statRow">
              <span>combo</span>
              <b>{combo}</b>
            </div>
            <div className="statRow">
              <span>hits</span>
              <b>{hits}</b>
            </div>
            <div className="statRow">
              <span>miss</span>
              <b>{misses}</b>
            </div>
          </div>
        </div>

        {countdown !== null && !started && !ended && (
  <div className="countdownOverlay" role="dialog" aria-modal="true">
    <div className="countdownCard">
      <div className="countdownNumber">{countdown === 0 ? "GO" : countdown}</div>
      <div className="countdownHint">GET READY</div>
    </div>
  </div>
)}

        <div className={`nowPlayingBox ${streakMode ? "is-streak" : ""}`}>
          <button className="pauseBtn" type="button" onClick={togglePause} aria-label="Pause">
            <span className="pauseGlyph">{paused ? "▶" : "II"}</span>
          </button>

          <div className="npLabel">NOW PLAYING</div>
          <div className="npCoverWrap">
            <img className="npCover" src="/gym/song-cover.png" alt="Song cover" />
          </div>
          <div className="npSongTitle">{npTitle}</div>
          <div className="npArtist">{npSub}</div>
        </div>

        {paused && started && !ended && (
          <div className="pauseOverlay" role="dialog" aria-modal="true">
            <div className="pauseCard">
              <div className="pauseTitle">paused</div>
              <div className="pauseSub">
                press esc to resume
                <br />
                or click the button
              </div>
              <div className="pauseRow">
                <button className="btn primary" type="button" onClick={togglePause}>
                  resume
                </button>
                <button className="btn" type="button" onClick={retry}>
                  retry
                </button>
              </div>
            </div>
          </div>
        )}

        {ended && (
          <div className="endOverlay" role="dialog" aria-modal="true">
            <div className={`endCard ${streakMode ? "is-streak" : ""}`}>
              <div className="endTitle">results</div>

              <div className="endGrid">
                <div className="endStats">
                  <div className="endStatRow">
                    <span>player</span>
                    <b>Masgu</b>
                  </div>
                  <div className="endStatRow">
                    <span>score</span>
                    <b>{formatInt(score)}</b>
                  </div>
                  <div className="endStatRow">
                    <span>accuracy</span>
                    <b>{formatPct(accuracy)}</b>
                  </div>
                  <div className="endStatRow">
                    <span>hits</span>
                    <b>{formatInt(hits)}</b>
                  </div>
                  <div className="endStatRow">
                    <span>misses</span>
                    <b>{formatInt(misses)}</b>
                  </div>
                  <div className="endStatRow">
                    <span>max combo</span>
                    <b>{formatInt(maxComboRef.current)}</b>
                  </div>
                  <div className="endStatRow">
                    <span>rank</span>
                    <b>{userRank ? `#${userRank}` : "---"}</b>
                  </div>
                </div>

                <div className="endTableWrap">
                  <div className="endTableTitle">leaderboard</div>
                  <table className="endTable">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>rank</th>
                        <th style={{ textAlign: "left" }}>name</th>
                        <th style={{ textAlign: "right" }}>score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((r, i) => (
                        <tr key={`${r.name}-${r.score}`} className={r.isUser ? "endRowUser" : ""}>
                          <td style={{ textAlign: "left" }}>
                            <span className={`rankPill ${r.isTop ? "top" : ""}`}>#{i + 1}</span>
                          </td>
                          <td style={{ textAlign: "left" }}>{r.name}</td>
                          <td style={{ textAlign: "right" }}>{formatInt(r.score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="endActions">
                <button className="btn" type="button" onClick={retry}>
                  retry
                </button>
                <button className="btn primary" type="button" onClick={() => onNextScene?.()}>
                  continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showStartModal && !started && !ended && (
        <div className="gym-startOverlay" role="dialog" aria-modal="true">
          <div className="gym-startCard">
            <div className="gym-startTitle">how to play</div>

            <div className="howWrap">
              <div className="howText">
                <h3>rules</h3>
                <ul>
                  <li>hit A S K L when the notes reach the line</li>
                  <li>timing matters, closer to the line means more points</li>
                  <li>miss resets your combo, keep a streak to ramp multiplier</li>
                  <li>press ESC to pause or resume</li>
                  <li>volume is set low by default (0.05)</li>
                </ul>
              </div>

              <div className="howAid">
                <img src="/gym/visual-aid.png" alt="Keyboard visual aid for A S K L controls" />
              </div>
            </div>

            <div className="gym-startRow">
              <button className="gym-startBtn" type="button" onClick={onStartClick} disabled={starting || started || ready}>
                {starting ? "starting..." : "start"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="gym-canvas">
        <Canvas shadows gl={{ antialias: true }} camera={{ fov: 48, position: [0, 2.05, 7.2], near: 0.1, far: 100 }}>
          <Suspense fallback={null}>
            <GymWorld ringSpeed={ringSpeed} playerUrl={playerUrl} drinkBeatKey={drinkBeatKey} streak={combo} streakMode={streakMode} />
            <GymHDRI />
            <CinematicCamera streakMode={streakMode} />
            <pointLight intensity={0.85} position={[-1.4, 1.4, 1.2]} distance={6} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  )
}

useGLTF.preload("/gym/massa_pbr.glb")
useGLTF.preload("/gym/massa_buff.glb")
useGLTF.preload("/gym/stationary_bike.glb")
useGLTF.preload("/gym/dumbbell_barbell_bench_-_9mb.glb")
useGLTF.preload("/gym/dumbbells.glb")
useGLTF.preload("/gym/monster_zero.glb")
useGLTF.preload("/gym/monster_energy_drink.glb")
useGLTF.preload("/gym/monster_energy_drink_mango.glb")
