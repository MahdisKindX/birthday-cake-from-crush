import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, MutableRefObject } from "react"

type Key = "w" | "a" | "s" | "d"
type Facing = "front" | "back" | "left" | "right"

type SkillUI = {
  active: boolean
  p: number
  zoneStart: number
  zoneWidth: number
}

type DBDProps = { onNextScene?: () => void }

type Target = { kind: "gen"; id: string } | { kind: "gate" } | null
type KillerStunKind = "none" | "hit" | "pallet"
type SkillMode = "none" | "gen" | "hook"

const ASPECT = 1.50037
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg)
  const end = polarToCartesian(cx, cy, r, startDeg)
  const sweep = ((endDeg - startDeg) % 360 + 360) % 360
  const largeArcFlag = sweep > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

type WorldHint = {
  key: "SPACE"
  text: string
  x: number
  y: number
}

export function DBD({ onNextScene }: DBDProps) {
  const GENS = useMemo(
    () =>
      [
        { id: "g1", x: 8, y: 28, w: "15%" },
        { id: "g2", x: 11, y: 79, w: "15%" },
        { id: "g3", x: 85, y: 22, w: "15%" },
        { id: "g4", x: 84, y: 76, w: "15%" },
      ] as const,
    []
  )

  const handleContinue = () => {
    onNextScene?.()
  }

  const PALLETS = useMemo(
    () =>
      [
        { id: "p1", x: 30, y: 44, w: "20%", r: -12 },
        { id: "p2", x: 14.5, y: 65, w: "20%", r: -6 },
        { id: "p3", x: 55, y: 28, w: "20%", r: 10 },
        { id: "p4", x: 78, y: 64, w: "20%", r: 6 },
      ] as const,
    []
  )

  const LOCKERS = useMemo(
    () =>
      [
        { id: "l2", x: 4, y: 44, w: "13.5%", lockXFix: "-12px" },
        { id: "l3", x: 29.2, y: 16.7, w: "13.5%", lockXFix: "-12px" },
        { id: "l5", x: 94, y: 40, w: "13.5%", lockXFix: "-12px" },
        { id: "l6", x: 47.5, y: 92.0, w: "13.5%", lockXFix: "-12px" },
      ] as const,
    []
  )

  const HOOKS = useMemo(
    () =>
      [
        { id: "h1", x: 36.5, y: 30.0, w: "20%" },
        { id: "h2", x: 69.67, y: 43.2, w: "20%" },
      ] as const,
    []
  )

  const GATE = useMemo(
    () =>
      ({
        x: 45.2,
        y: 7.2,
      }) as const,
    []
  )

  type GenId = (typeof GENS)[number]["id"]
  type GenState = Record<GenId, { progress: number; done: boolean; kickReady: boolean; decayActive: boolean; decayFloor: number }>

  type PalletId = (typeof PALLETS)[number]["id"]
  type PalletState = Record<PalletId, { down: boolean }>

  type LockerId = (typeof LOCKERS)[number]["id"]
  type HookId = (typeof HOOKS)[number]["id"]

  const initialGens = useMemo<GenState>(
    () => ({
      g1: { progress: 0, done: false, kickReady: false, decayActive: false, decayFloor: 0 },
      g2: { progress: 0, done: false, kickReady: false, decayActive: false, decayFloor: 0 },
      g3: { progress: 0, done: false, kickReady: false, decayActive: false, decayFloor: 0 },
      g4: { progress: 0, done: false, kickReady: false, decayActive: false, decayFloor: 0 },
    }),
    []
  )

  const initialPallets = useMemo<PalletState>(
    () => ({
      p1: { down: false },
      p2: { down: false },
      p3: { down: false },
      p4: { down: false },
    }),
    []
  )

  const gensRef = useRef<GenState>(initialGens)
  const [gens, setGens] = useState<GenState>({ ...initialGens })

  const palletsRef = useRef<PalletState>(initialPallets)
  const [pallets, setPallets] = useState<PalletState>({ ...initialPallets })

  const gateRef = useRef({ progress: 0, opened: false })
  const [gate, setGate] = useState({ progress: 0, opened: false })

  const [gatePulse, setGatePulse] = useState(false)
  const gatePulseTRef = useRef<number | null>(null)

  const [playerPos, setPlayerPos] = useState({ x: 6.5, y: 70.5 })
  const playerPosRef = useRef(playerPos)

  const [facing, setFacing] = useState<Facing>("front")
  const [isStep, setIsStep] = useState(false)

  const [activeTarget, setActiveTarget] = useState<Target>(null)
  const activeTargetRef = useRef<Target>(null)

  const [isInteracting, setIsInteracting] = useState(false)
  const interactingRef = useRef(false)

  const [hiddenIn, setHiddenIn] = useState<LockerId | null>(null)
  const hiddenInRef = useRef<LockerId | null>(null)
  const lastOutsidePosRef = useRef({ x: 6.5, y: 70.5 })

  const [playerDownUI, setPlayerDownUI] = useState(false)
  const playerDownRef = useRef(false)
  const playerDownPosRef = useRef<{ x: number; y: number } | null>(null)

  const [playerCarriedUI, setPlayerCarriedUI] = useState(false)
  const playerCarriedRef = useRef(false)

  const [playerHookedUI, setPlayerHookedUI] = useState(false)
  const playerHookedRef = useRef(false)
  const [hookedHookIdUI, setHookedHookIdUI] = useState<HookId | null>(null)
  const hookedHookIdRef = useRef<HookId | null>(null)
  const carryHookTargetRef = useRef<HookId | null>(null)

  const HOOK_ESCAPE_NEEDED = 3
  const hookEscapeDoneRef = useRef(0)
  const hookNextSkillAtRef = useRef<number>(0)

  const HOOK_FAIL_LIMIT = 3
  const hookFailCountRef = useRef(0)

  const HOOK_UNHOOK_LIMIT = 2
  const unhookCountRef = useRef(0)

  const hookCountRef = useRef(0)
  const [hookCountUI, setHookCountUI] = useState(0)

  const [killerPos, setKillerPos] = useState({ x: 62, y: 44 })
  const killerPosRef = useRef(killerPos)

  const [killerFacing, setKillerFacing] = useState<Facing>("left")
  const killerFacingRef = useRef<Facing>("left")

  const [killerIsStep, setKillerIsStep] = useState(false)
  const killerStepRef = useRef(false)

  const killerLastStepPulseRef = useRef<number>(0)
  const killerStepUntilRef = useRef<number>(0)

  const killerWanderTargetRef = useRef<{ x: number; y: number } | null>(null)
  const killerNextWanderPickAtRef = useRef<number>(0)
  const killerChasingRef = useRef(false)

  const killerStunUntilRef = useRef<number>(0)
  const killerStunKindRef = useRef<KillerStunKind>("none")
  const [killerStunKindUI, setKillerStunKindUI] = useState<KillerStunKind>("none")
  const killerStunKindUIRef = useRef<KillerStunKind>("none")

  const killerIgnorePlayerUntilRef = useRef<number>(0)

  // Random locker checks (commit to one locker at a time)
  const killerNextLockerTryAtRef = useRef<number>(0)
  const killerLockerTargetIdRef = useRef<LockerId | null>(null)
  const killerLockerCheckUntilRef = useRef<number>(0)

  const playerBoostUntilRef = useRef<number>(0)
  const playerInvulnUntilRef = useRef<number>(0)
  const [playerHurtUI, setPlayerHurtUI] = useState(false)
  const playerHurtUIRef = useRef(false)

  const playerHitsRef = useRef<number>(0)
  const [playerHitsUI, setPlayerHitsUI] = useState(0)

  const [gameOverUI, setGameOverUI] = useState(false)
  const gameOverRef = useRef(false)

  const [winUI, setWinUI] = useState(false)
  const winRef = useRef(false)

  const keysRef = useRef<Record<Key, boolean>>({ w: false, a: false, s: false, d: false })
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef<number | null>(null)

  const facingRef = useRef<Facing>("front")
  const stepRef = useRef(false)
  const lastStepPulseRef = useRef<number>(0)
  const stepUntilRef = useRef<number>(0)

  const nextSkillAtRef = useRef<number>(0)
  const skillModeRef = useRef<SkillMode>("none")
  const skillRef = useRef<{
    active: boolean
    startedAt: number
    duration: number
    zoneStart: number
    zoneWidth: number
    resolved: boolean
  }>({
    active: false,
    startedAt: 0,
    duration: 0,
    zoneStart: 0,
    zoneWidth: 0,
    resolved: false,
  })

  const [skillUI, setSkillUI] = useState<SkillUI>({
    active: false,
    p: 0,
    zoneStart: 0,
    zoneWidth: 0,
  })

  const runAudioRef = useRef<HTMLAudioElement | null>(null)
  const skillAppearRef = useRef<HTMLAudioElement | null>(null)
  const skillSuccessRef = useRef<HTMLAudioElement | null>(null)
  const genBlowRef = useRef<HTMLAudioElement | null>(null)
  const genDoneRef = useRef<HTMLAudioElement | null>(null)
  const gensCompleteRef = useRef<HTMLAudioElement | null>(null)
  const doorOpeningRef = useRef<HTMLAudioElement | null>(null)
  const doorOpenedRef = useRef<HTMLAudioElement | null>(null)
  const jumpscareRef = useRef<HTMLAudioElement | null>(null)
  const palletDropRef = useRef<HTMLAudioElement | null>(null)
  const hookedRef = useRef<HTMLAudioElement | null>(null)
  const lockerOpenRef = useRef<HTMLAudioElement | null>(null)
  const lockerCloseRef = useRef<HTMLAudioElement | null>(null)
  const unhookFailRef = useRef<HTMLAudioElement | null>(null)

  const chaseMusicRef = useRef<HTMLAudioElement | null>(null)
  const chaseStartedRef = useRef(false)
  const endMusicRef = useRef<HTMLAudioElement | null>(null)

  const gensCompletePlayedRef = useRef(false)
  const doorOpeningPlayedRef = useRef(false)

  const allGensDone = useMemo(() => Object.values(gens).every((g) => g.done), [gens])
  const gensDoneCount = useMemo(() => Object.values(gens).filter((g) => g.done).length, [gens])
  const gensLeft = useMemo(() => Math.max(0, GENS.length - gensDoneCount), [GENS.length, gensDoneCount])

  useEffect(() => {
    playerPosRef.current = playerPos
  }, [playerPos])

  useEffect(() => {
    hiddenInRef.current = hiddenIn
  }, [hiddenIn])

  useEffect(() => {
    killerPosRef.current = killerPos
  }, [killerPos])

  useEffect(() => {
    killerFacingRef.current = killerFacing
  }, [killerFacing])

  useEffect(() => {
    killerStepRef.current = killerIsStep
  }, [killerIsStep])

  useEffect(() => {
    playerDownRef.current = playerDownUI
  }, [playerDownUI])

  useEffect(() => {
    playerCarriedRef.current = playerCarriedUI
  }, [playerCarriedUI])

  useEffect(() => {
    playerHookedRef.current = playerHookedUI
  }, [playerHookedUI])

  useEffect(() => {
    hookedHookIdRef.current = hookedHookIdUI
  }, [hookedHookIdUI])

  const playOneShot = (ref: MutableRefObject<HTMLAudioElement | null>) => {
    const a = ref.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
      void a.play()
    } catch { }
  }

  const startChase = () => {
    const a = chaseMusicRef.current
    if (!a) return
    if (gameOverRef.current || winRef.current) return
    try {
      a.loop = true
      a.volume = 0.05
      if (a.paused) {
        a.currentTime = 0
        void a.play()
      }
      chaseStartedRef.current = true
    } catch { }
  }

  const stopChase = () => {
    const a = chaseMusicRef.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
    } catch { }
  }

  const startRun = () => {
    const a = runAudioRef.current
    if (!a) return
    try {
      a.loop = true
      if (a.paused) a.currentTime = 0
      void a.play()
    } catch { }
  }

  const stopRun = () => {
    const a = runAudioRef.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
    } catch { }
  }

  useEffect(() => {
    const VOL = 0.1

    const run = new Audio("/DBD/sounds/gen-running.mp3")
    run.loop = true
    run.volume = VOL
    runAudioRef.current = run

    const a1 = new Audio("/DBD/sounds/skill-check.mp3")
    a1.volume = VOL
    skillAppearRef.current = a1

    const a2 = new Audio("/DBD/sounds/skill-check-success.mp3")
    a2.volume = VOL
    skillSuccessRef.current = a2

    const a3 = new Audio("/DBD/sounds/gen-blow.mp3")
    a3.volume = VOL
    genBlowRef.current = a3

    const a4 = new Audio("/DBD/sounds/gen-done.mp3")
    a4.volume = VOL
    genDoneRef.current = a4

    const a5 = new Audio("/DBD/sounds/gens-complete.mp3")
    a5.volume = VOL
    gensCompleteRef.current = a5

    const a6 = new Audio("/DBD/sounds/door-opening.mp3")
    a6.volume = VOL
    doorOpeningRef.current = a6

    const a7 = new Audio("/DBD/sounds/door-opened.mp3")
    a7.volume = VOL
    doorOpenedRef.current = a7

    const a8 = new Audio("/DBD/sounds/jumpscare.mp3")
    a8.volume = 0.18
    jumpscareRef.current = a8

    const a9 = new Audio("/DBD/sounds/pallet-drop.mp3")
    a9.volume = 0.16
    palletDropRef.current = a9

    const a10 = new Audio("/DBD/sounds/hooked.mp3")
    a10.volume = 0.18
    hookedRef.current = a10

    const a11 = new Audio("/DBD/sounds/locker-open.mp3")
    a11.volume = 0.14
    lockerOpenRef.current = a11

    const a12 = new Audio("/DBD/sounds/locker-close.mp3")
    a12.volume = 0.14
    lockerCloseRef.current = a12

    const a13 = new Audio("/DBD/sounds/unhook-fail.mp3")
    a13.volume = 0.18
    unhookFailRef.current = a13

    const chase = new Audio("/DBD/sounds/chase.mp3")
    chase.loop = true
    chase.volume = 0.05
    chaseMusicRef.current = chase

    const end = new Audio("/DBD/sounds/end.mp3")
    end.loop = false
    end.volume = 0.05
    endMusicRef.current = end

    return () => {
      try {
        run.pause()
      } catch { }
      try {
        chase.pause()
      } catch { }
      try {
        end.pause()
      } catch { }
    }
  }, [])

  useEffect(() => {
    facingRef.current = facing
  }, [facing])

  useEffect(() => {
    stepRef.current = isStep
  }, [isStep])

  useEffect(() => {
    activeTargetRef.current = activeTarget
  }, [activeTarget])

  useEffect(() => {
    interactingRef.current = isInteracting
  }, [isInteracting])

  useEffect(() => {
    gensRef.current = gens
  }, [gens])

  useEffect(() => {
    palletsRef.current = pallets
  }, [pallets])

  useEffect(() => {
    gateRef.current = gate
  }, [gate])

  useEffect(() => {
    startChase()
  }, [])

  const boundsRef = useRef({ left: 3.8, right: 3.8, top: 1.2, bottom: 3.8 })
  const clampToBounds = (p: { x: number; y: number }) => {
    const b = boundsRef.current
    return {
      x: clamp(p.x, b.left, 100 - b.right),
      y: clamp(p.y, b.top, 100 - b.bottom),
    }
  }

  const pxDistTo = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = (a.x - b.x) * ASPECT
    const dy = a.y - b.y
    return Math.hypot(dx, dy)
  }

  const RANGE_GEN = 7.0
  const RANGE_GATE = 10.5
  const RANGE_PALLET = 7.2
  const RANGE_LOCKER = 6.8

  const nearestGen = useMemo(() => {
    let best: { id: GenId; d: number } | null = null
    for (const g of GENS) {
      const d = pxDistTo(playerPos, g)
      if (!best || d < best.d) best = { id: g.id, d }
    }
    return best
  }, [GENS, playerPos.x, playerPos.y])

  const interactableGen: GenId | null = (() => {
    if (!nearestGen) return null
    const id = nearestGen.id
    const g = gensRef.current[id]
    if (!g || g.done) return null
    if (nearestGen.d > RANGE_GEN) return null
    return id
  })()

  const gateInteractable = useMemo(() => {
    if (!allGensDone) return false
    if (gate.opened) return false
    return pxDistTo(playerPos, GATE) <= RANGE_GATE
  }, [allGensDone, gate.opened, playerPos.x, playerPos.y, GATE])

  const interactableTarget: Target = (() => {
    if (gateInteractable) return { kind: "gate" }
    if (interactableGen) return { kind: "gen", id: interactableGen }
    return null
  })()

  const nearestLocker = useMemo(() => {
    let best: { id: LockerId; d: number } | null = null
    for (const l of LOCKERS) {
      const d = pxDistTo(playerPos, l)
      if (!best || d < best.d) best = { id: l.id, d }
    }
    return best
  }, [LOCKERS, playerPos.x, playerPos.y])

  const interactableLocker: LockerId | null = useMemo(() => {
    if (hiddenIn) return null
    if (!nearestLocker) return null
    if (nearestLocker.d > RANGE_LOCKER) return null
    return nearestLocker.id
  }, [hiddenIn, nearestLocker])

  const interactablePallet: PalletId | null = useMemo(() => {
    if (hiddenIn) return null
    if (isInteracting) return null
    if (playerDownUI || playerCarriedUI || playerHookedUI) return null
    if (gameOverUI || winUI) return null

    let best: { id: PalletId; d: number } | null = null
    for (const p of PALLETS) {
      const st = palletsRef.current[p.id]
      if (!st || st.down) continue
      const d = pxDistTo(playerPos, p)
      if (!best || d < best.d) best = { id: p.id, d }
    }
    if (!best) return null
    if (best.d > RANGE_PALLET) return null
    return best.id
  }, [PALLETS, playerPos.x, playerPos.y, hiddenIn, isInteracting, playerDownUI, playerCarriedUI, playerHookedUI, gameOverUI, winUI])

  useEffect(() => {
    if (!allGensDone) return

    if (!gensCompletePlayedRef.current) {
      gensCompletePlayedRef.current = true
      playOneShot(gensCompleteRef)
    }

    setGatePulse(true)
    if (gatePulseTRef.current) window.clearTimeout(gatePulseTRef.current)
    gatePulseTRef.current = window.setTimeout(() => setGatePulse(false), 8000)

    return () => {
      if (gatePulseTRef.current) window.clearTimeout(gatePulseTRef.current)
      gatePulseTRef.current = null
    }
  }, [allGensDone])

  const clearSkill = () => {
    skillModeRef.current = "none"
    skillRef.current.active = false
    skillRef.current.resolved = false
    setSkillUI((s) => (s.active ? { active: false, p: 0, zoneStart: 0, zoneWidth: 0 } : s))
  }

  const clearMoveKeys = () => {
    keysRef.current.w = false
    keysRef.current.a = false
    keysRef.current.s = false
    keysRef.current.d = false
  }

  const stopInteract = () => {
    setIsInteracting(false)
    setActiveTarget(null)
    interactingRef.current = false
    activeTargetRef.current = null
    nextSkillAtRef.current = 0
    if (skillModeRef.current === "gen") clearSkill()
    stopRun()
    doorOpeningPlayedRef.current = false
  }

  const scheduleNextSkill = (now: number, difficulty01: number) => {
    const base = 6000
    const swing = 3000
    const faster = 1500 * difficulty01
    const ms = Math.max(4800, base + Math.random() * swing - faster)
    nextSkillAtRef.current = now + ms
  }

  const spawnSkill = (now: number, difficulty01: number, mode: SkillMode) => {
    const zoneWidth = clamp(0.16 - difficulty01 * 0.09, 0.07, 0.16)
    const minStart = 0.18
    const maxStart = 0.92 - zoneWidth
    const zoneStart = clamp(minStart + Math.random() * Math.max(0, maxStart - minStart), minStart, maxStart)
    const duration = clamp(1850 - difficulty01 * 380 + (Math.random() * 220 - 110), 1150, 2100)

    skillModeRef.current = mode
    skillRef.current = { active: true, startedAt: now, duration, zoneStart, zoneWidth, resolved: false }
    setSkillUI({ active: true, p: 0, zoneStart, zoneWidth })
    playOneShot(skillAppearRef)
  }

  const applyGenDelta = (id: GenId, delta: number) => {
    const g = gensRef.current[id]
    if (!g || g.done) return

    const before = g.progress
    const next = clamp(before + delta, 0, 100)
    const becameDone = !g.done && next >= 100
    const progressed = next > before

    let decayActive = g.decayActive
    let decayFloor = g.decayFloor

    if (decayActive && next > decayFloor + 0.01) {
      decayActive = false
      decayFloor = 0
    }

    const kickReadyNext = becameDone ? false : g.kickReady || (progressed && next > 0)

    gensRef.current[id] = {
      progress: next,
      done: becameDone ? true : g.done,
      kickReady: kickReadyNext,
      decayActive,
      decayFloor,
    }
    setGens({ ...gensRef.current })

    if (becameDone) {
      stopRun()
      playOneShot(genDoneRef)
      stopInteract()
    }
  }

  const triggerGameOver = () => {
    if (gameOverRef.current || winRef.current) return
    gameOverRef.current = true
    setGameOverUI(true)

    clearMoveKeys()
    if (stepRef.current) setIsStep(false)
    if (killerStepRef.current) setKillerIsStep(false)

    try {
      stopRun()
    } catch { }

    stopChase()
    playOneShot(endMusicRef)

    if (interactingRef.current) stopInteract()
    clearSkill()
  }

  const triggerWin = () => {
    if (winRef.current || gameOverRef.current) return
    winRef.current = true
    setWinUI(true)

    clearMoveKeys()
    if (stepRef.current) setIsStep(false)
    if (killerStepRef.current) setKillerIsStep(false)

    try {
      stopRun()
    } catch { }

    stopChase()
    playOneShot(endMusicRef)

    if (interactingRef.current) stopInteract()
    clearSkill()
  }


  const resolveGenSkill = (now: number, success: boolean) => {
    const t = activeTargetRef.current
    if (!t || t.kind !== "gen") {
      clearSkill()
      return
    }

    const id = t.id as GenId
    const g = gensRef.current[id]
    if (!g || g.done) {
      clearSkill()
      return
    }

    skillRef.current.resolved = true
    skillRef.current.active = false
    skillModeRef.current = "none"
    setSkillUI({ active: false, p: 0, zoneStart: 0, zoneWidth: 0 })

    if (success) {
      playOneShot(skillSuccessRef)
      applyGenDelta(id, 10)
    } else {
      playOneShot(genBlowRef)
      applyGenDelta(id, -24)
    }

    const difficulty01 = clamp((gensRef.current[id]?.progress ?? 0) / 100, 0, 1)
    scheduleNextSkill(now, difficulty01)
  }

  const hookFail = (now: number) => {
    playOneShot(unhookFailRef)
    hookFailCountRef.current = Math.min(HOOK_FAIL_LIMIT, hookFailCountRef.current + 1)
    if (hookFailCountRef.current >= HOOK_FAIL_LIMIT) {
      triggerGameOver()
      return
    }
    hookNextSkillAtRef.current = now + (1400 + Math.random() * 1200)
  }

  const resolveHookSkill = (now: number, success: boolean) => {
    skillRef.current.resolved = true
    skillRef.current.active = false
    skillModeRef.current = "none"
    setSkillUI({ active: false, p: 0, zoneStart: 0, zoneWidth: 0 })

    if (!playerHookedRef.current) return
    if (gameOverRef.current || winRef.current) return

    if (success) {
      playOneShot(skillSuccessRef)
      hookEscapeDoneRef.current = Math.min(HOOK_ESCAPE_NEEDED, hookEscapeDoneRef.current + 1)

      if (hookEscapeDoneRef.current >= HOOK_ESCAPE_NEEDED) {
        unhookCountRef.current = Math.min(HOOK_UNHOOK_LIMIT, unhookCountRef.current + 1)

        const hookId = hookedHookIdRef.current
        const hook = hookId ? HOOKS.find((h) => h.id === hookId) : null

        playerHookedRef.current = false
        setPlayerHookedUI(false)
        hookedHookIdRef.current = null
        setHookedHookIdUI(null)

        playerHitsRef.current = 0
        setPlayerHitsUI(0)

        playerDownRef.current = false
        setPlayerDownUI(false)
        playerDownPosRef.current = null

        clearMoveKeys()
        setIsStep(false)

        if (hook) {
          const out = clampToBounds({ x: hook.x + 3.2, y: hook.y + 2.2 })
          setPlayerPos(out)
        }

        playerInvulnUntilRef.current = now + 1400
        playerBoostUntilRef.current = now + 1600

        killerIgnorePlayerUntilRef.current = Math.max(killerIgnorePlayerUntilRef.current, now + 3800)
        killerChasingRef.current = false

        hookEscapeDoneRef.current = 0
        hookNextSkillAtRef.current = 0
        hookFailCountRef.current = 0
        return
      }
    } else {
      hookFail(now)
      return
    }

    hookNextSkillAtRef.current = now + (1400 + Math.random() * 1200)
  }

  const attemptSkillPress = () => {
    if (!skillRef.current.active) return false
    if (skillRef.current.resolved) return false

    const mode = skillModeRef.current
    if (mode === "gen") {
      const t = activeTargetRef.current
      if (!t || t.kind !== "gen") return false
      if (!interactingRef.current) return false
    } else if (mode === "hook") {
      if (!playerHookedRef.current) return false
      if (gameOverRef.current || winRef.current) return false
    } else {
      return false
    }

    const now = performance.now()
    const p = clamp((now - skillRef.current.startedAt) / skillRef.current.duration, 0, 1)
    const z0 = skillRef.current.zoneStart
    const z1 = z0 + skillRef.current.zoneWidth
    const success = p >= z0 && p <= z1

    if (mode === "gen") resolveGenSkill(now, success)
    else resolveHookSkill(now, success)

    return true
  }

  const clearAllGenStuff = () => {
    if (interactingRef.current) stopInteract()
    stopRun()
    if (skillModeRef.current === "gen") clearSkill()
  }

  const tryToggleLocker = () => {
    if (interactingRef.current) return false
    if (playerDownRef.current || playerCarriedRef.current || playerHookedRef.current || gameOverRef.current || winRef.current) return false

    const currentlyHidden = hiddenInRef.current
    if (currentlyHidden) {
      playOneShot(lockerCloseRef)

      hiddenInRef.current = null
      setHiddenIn(null)
      killerChasingRef.current = false
      clearMoveKeys()
      setIsStep(false)

      const out = clampToBounds(lastOutsidePosRef.current)
      setPlayerPos(out)
      return true
    }

    const pos = playerPosRef.current
    let best: { id: LockerId; d: number } | null = null
    for (const l of LOCKERS) {
      const d = pxDistTo(pos, l)
      if (!best || d < best.d) best = { id: l.id, d }
    }
    if (!best) return false
    if (best.d > RANGE_LOCKER) return false

    playOneShot(lockerOpenRef)

    lastOutsidePosRef.current = pos
    clearAllGenStuff()
    clearMoveKeys()
    setIsStep(false)

    hiddenInRef.current = best.id
    setHiddenIn(best.id)

    killerChasingRef.current = false
    return true
  }

  const tryDropPallet = () => {
    if (interactingRef.current) return false
    if (hiddenInRef.current) return false
    if (playerDownRef.current || playerCarriedRef.current || playerHookedRef.current || gameOverRef.current || winRef.current) return false

    const pos = playerPosRef.current
    let best: { id: PalletId; d: number } | null = null

    for (const p of PALLETS) {
      const st = palletsRef.current[p.id]
      if (!st || st.down) continue
      const d = pxDistTo(pos, p)
      if (!best || d < best.d) best = { id: p.id, d }
    }

    if (!best) return false
    if (best.d > RANGE_PALLET) return false

    palletsRef.current[best.id] = { down: true }
    setPallets({ ...palletsRef.current })
    playOneShot(palletDropRef)

    const palletLayout = PALLETS.find((pp) => pp.id === best.id)
    if (palletLayout) {
      const kpos = killerPosRef.current
      const dK = pxDistTo(kpos, palletLayout)
      const KILLER_PALLET_STUN_RANGE = 13.0
      if (dK <= KILLER_PALLET_STUN_RANGE) {
        const now = performance.now()
        killerStunUntilRef.current = Math.max(killerStunUntilRef.current, now + 3000)
        killerStunKindRef.current = "pallet"
        if (killerStunKindUIRef.current !== "pallet") {
          killerStunKindUIRef.current = "pallet"
          setKillerStunKindUI("pallet")
        }
        if (killerStepRef.current) setKillerIsStep(false)
        clearAllGenStuff()
      }
    }

    return true
  }

  const startInteractOn = (t: Target) => {
    if (!t) return
    if (hiddenInRef.current) return
    if (playerDownRef.current || playerCarriedRef.current || playerHookedRef.current || gameOverRef.current || winRef.current) return
    if (interactingRef.current) stopInteract()

    if (t.kind === "gen") {
      const id = t.id as GenId
      const g = gensRef.current[id]
      if (!g || g.done) return

      setActiveTarget({ kind: "gen", id })
      setIsInteracting(true)
      activeTargetRef.current = { kind: "gen", id }
      interactingRef.current = true

      startRun()

      const now = performance.now()
      const difficulty01 = clamp(g.progress / 100, 0, 1)
      clearSkill()
      scheduleNextSkill(now, difficulty01)
      return
    }

    if (t.kind === "gate") {
      if (!allGensDone) return
      if (gateRef.current.opened) return

      setActiveTarget({ kind: "gate" })
      setIsInteracting(true)
      activeTargetRef.current = { kind: "gate" }
      interactingRef.current = true

      if (skillModeRef.current === "gen") clearSkill()
      stopRun()

      doorOpeningPlayedRef.current = false
      playOneShot(doorOpeningRef)
    }
  }

  const KILLER_GEN_SABOTAGE_CHANCE = 0.14
  const KILLER_SABOTAGE_TRY_MIN_MS = 4200
  const KILLER_SABOTAGE_TRY_MAX_MS = 8200
  const KILLER_KICK_ANIM_MS = 1500
  const KILLER_KICK_IMPACT_MS = 320
  const KILLER_SABOTAGE_AMOUNT = 14

  const GEN_REGRESS_RATE = 0.95 // progress points per second after a kick, while not being repaired

  const KILLER_LOCKER_CHECK_CHANCE = 0.10
  const KILLER_LOCKER_CHECK_CHANCE_HIDDEN = 0.35
  const KILLER_LOCKER_TRY_MIN_MS = 5200
  const KILLER_LOCKER_TRY_MAX_MS = 10000
  const KILLER_LOCKER_CHECK_MS = 700

  const killerNextSabotageTryAtRef = useRef<number>(0)
  const killerSabotageTargetRef = useRef<GenId | null>(null)

  const killerGenKickRef = useRef<{ id: GenId; startAt: number; impactAt: number; endAt: number; impacted: boolean } | null>(
    null
  )
  const [kickedGenUI, setKickedGenUI] = useState<GenId | null>(null)
  const kickedGenUIRef = useRef<GenId | null>(null)
  const [killerKickingUI, setKillerKickingUI] = useState(false)
  const killerKickingUIRef = useRef(false)

  useEffect(() => {
    kickedGenUIRef.current = kickedGenUI
  }, [kickedGenUI])

  useEffect(() => {
    killerKickingUIRef.current = killerKickingUI
  }, [killerKickingUI])

  const canKickGenNow = (id: GenId) => {
    const g = gensRef.current[id]
    return !!g && !g.done && g.progress > 0 && g.kickReady && !g.decayActive
  }

  const pickSabotageGen = (from: { x: number; y: number }): { id: GenId; d: number } | null => {
    let best: { id: GenId; d: number } | null = null
    for (const gg of GENS) {
      const st = gensRef.current[gg.id]
      if (!st || st.done) continue
      if (st.decayActive) continue
      if (!st.kickReady) continue
      if (st.progress <= 0) continue
      const d = pxDistTo(from, gg)
      if (!best || d < best.d) best = { id: gg.id, d }
    }
    return best
  }

  const startGenKick = (now: number, id: GenId) => {
    killerGenKickRef.current = {
      id,
      startAt: now,
      impactAt: now + KILLER_KICK_IMPACT_MS,
      endAt: now + KILLER_KICK_ANIM_MS,
      impacted: false,
    }
    setKickedGenUI(id)
    setKillerKickingUI(true)
    killerSabotageTargetRef.current = null
    killerChasingRef.current = false
  }

  const applySabotageKick = (id: GenId) => {
    const g = gensRef.current[id]
    if (!g || g.done) return
    if (!canKickGenNow(id)) return

    const preKick = g.progress
    const after = clamp(preKick - KILLER_SABOTAGE_AMOUNT, 0, 100)

    gensRef.current[id] = {
      progress: after,
      done: after >= 100,
      kickReady: false,
      decayActive: true,
      decayFloor: preKick,
    }
    setGens({ ...gensRef.current })

    playOneShot(genBlowRef)
  }

  const resetGame = () => {
    gameOverRef.current = false
    setGameOverUI(false)

    lastRef.current = null

    winRef.current = false
    setWinUI(false)

    if (gatePulseTRef.current) window.clearTimeout(gatePulseTRef.current)
    gatePulseTRef.current = null
    setGatePulse(false)

    gensCompletePlayedRef.current = false
    doorOpeningPlayedRef.current = false

    gensRef.current = { ...initialGens }
    setGens({ ...initialGens })

    palletsRef.current = { ...initialPallets }
    setPallets({ ...initialPallets })

    gateRef.current = { progress: 0, opened: false }
    setGate({ progress: 0, opened: false })

    clearMoveKeys()
    setFacing("front")
    facingRef.current = "front"
    setIsStep(false)
    stepRef.current = false
    lastStepPulseRef.current = 0
    stepUntilRef.current = 0

    setPlayerPos({ x: 20, y: 78 })
    playerPosRef.current = { x: 20, y: 78 }
    lastOutsidePosRef.current = { x: 20, y: 78 }

    hiddenInRef.current = null
    setHiddenIn(null)

    setActiveTarget(null)
    activeTargetRef.current = null
    setIsInteracting(false)
    interactingRef.current = false

    skillModeRef.current = "none"
    skillRef.current = { active: false, startedAt: 0, duration: 0, zoneStart: 0, zoneWidth: 0, resolved: false }
    setSkillUI({ active: false, p: 0, zoneStart: 0, zoneWidth: 0 })
    nextSkillAtRef.current = 0
    hookNextSkillAtRef.current = 0

    playerHitsRef.current = 0
    setPlayerHitsUI(0)
    playerBoostUntilRef.current = 0
    playerInvulnUntilRef.current = 0
    playerHurtUIRef.current = false
    setPlayerHurtUI(false)

    unhookCountRef.current = 0
    hookCountRef.current = 0
    setHookCountUI(0)

    playerDownPosRef.current = null
    playerDownRef.current = false
    setPlayerDownUI(false)

    playerCarriedRef.current = false
    setPlayerCarriedUI(false)

    playerHookedRef.current = false
    setPlayerHookedUI(false)
    hookedHookIdRef.current = null
    setHookedHookIdUI(null)
    carryHookTargetRef.current = null

    hookEscapeDoneRef.current = 0
    hookFailCountRef.current = 0

    killerPosRef.current = { x: 88, y: 22 }
    setKillerPos({ x: 88, y: 22 })

    killerFacingRef.current = "left"
    setKillerFacing("left")

    killerStepRef.current = false
    setKillerIsStep(false)
    killerLastStepPulseRef.current = 0
    killerStepUntilRef.current = 0

    killerWanderTargetRef.current = null
    killerNextWanderPickAtRef.current = 0
    killerChasingRef.current = false

    killerStunUntilRef.current = 0
    killerStunKindRef.current = "none"
    killerStunKindUIRef.current = "none"
    setKillerStunKindUI("none")

    killerIgnorePlayerUntilRef.current = 0

    killerNextLockerTryAtRef.current = 0
    killerLockerTargetIdRef.current = null
    killerLockerCheckUntilRef.current = 0

    killerNextSabotageTryAtRef.current = 0
    killerSabotageTargetRef.current = null
    killerGenKickRef.current = null
    setKickedGenUI(null)
    setKillerKickingUI(false)

    chaseStartedRef.current = false
    stopChase()
    startChase()

    try {
      stopRun()
    } catch { }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      startChase()

      if (gameOverRef.current || winRef.current) {
        if (e.repeat) return
        e.preventDefault()
        return
      }

      const k = e.key.toLowerCase()

      if (playerCarriedRef.current || playerDownRef.current) {
        if (k === "w" || k === "a" || k === "s" || k === "d" || k === " " || e.code === "Space") {
          if (e.repeat) return
          e.preventDefault()
          return
        }
      }

      if (playerHookedRef.current) {
        if (k === " " || e.code === "Space") {
          if (e.repeat) return
          e.preventDefault()
          attemptSkillPress()
          return
        }

        if (k === "w" || k === "a" || k === "s" || k === "d") {
          if (e.repeat) return
          e.preventDefault()
          return
        }
      }

      if (k === "w" || k === "a" || k === "s" || k === "d") {
        keysRef.current[k as Key] = true
        return
      }

      if (k === " " || e.code === "Space") {
        if (e.repeat) return
        e.preventDefault()

        if (playerDownRef.current || playerCarriedRef.current || playerHookedRef.current) return
        if (attemptSkillPress()) return

        if (hiddenInRef.current) {
          tryToggleLocker()
          return
        }

        const t = interactableTarget
        if (t) {
          const cur = activeTargetRef.current
          const same =
            !!cur &&
            ((cur.kind === "gen" && t.kind === "gen" && cur.id === t.id) || (cur.kind === "gate" && t.kind === "gate"))

          if (interactingRef.current && same) stopInteract()
          else startInteractOn(t)
          return
        }

        if (tryToggleLocker()) return
        if (tryDropPallet()) return
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        keysRef.current[k as Key] = false
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false })
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown as any)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [interactableTarget, allGensDone, PALLETS, LOCKERS])

  useEffect(() => {
    const STEP_PULSE_MS = 1000
    const STEP_SHOW_MS = 220

    const BASE_GEN_RATE = 2.75
    const BASE_GATE_RATE = 5.5

    const PLAYER_BASE_SPEED = 13
    const PLAYER_BOOST_MULT = 1.75
    const PLAYER_BOOST_MS = 2000

    const KILLER_SPEED = 17
    const KILLER_CARRY_SPEED = 16

    const KILLER_START_CHASE_RANGE = 45.0
    const KILLER_STOP_RANGE = 2.0

    const KILLER_HIT_RANGE = 10.0
    const KILLER_HIT_STUN_MS = 3000

    const KILLER_PICKUP_RANGE = 2.0
    const KILLER_HOOK_RANGE = 2.5

    const HOOK_SKILL_RETRY_MS = 900

    const WIN_Y_THRESHOLD = 2.15
    const WIN_X_RANGE = 11.0

    const pickWanderTarget = () => {
      const b = boundsRef.current
      return {
        x: b.left + Math.random() * (100 - b.left - b.right),
        y: b.top + Math.random() * (100 - b.top - b.bottom),
      }
    }

    const pickWanderTargetFarFrom = (from: { x: number; y: number }, minD: number) => {
      for (let i = 0; i < 12; i++) {
        const t0 = pickWanderTarget()
        if (pxDistTo(t0, from) >= minD) return t0
      }
      return pickWanderTarget()
    }

    const setStunUIIfNeeded = (kind: KillerStunKind) => {
      if (kind !== killerStunKindUIRef.current) {
        killerStunKindUIRef.current = kind
        setKillerStunKindUI(kind)
      }
    }

    const setPlayerHurtIfNeeded = (on: boolean) => {
      if (on !== playerHurtUIRef.current) {
        playerHurtUIRef.current = on
        setPlayerHurtUI(on)
      }
    }

    const setPlayerDownIfNeeded = (on: boolean) => {
      if (on !== playerDownRef.current) {
        playerDownRef.current = on
        setPlayerDownUI(on)
      }
    }

    const setPlayerCarriedIfNeeded = (on: boolean) => {
      if (on !== playerCarriedRef.current) {
        playerCarriedRef.current = on
        setPlayerCarriedUI(on)
      }
    }

    const setPlayerHookedIfNeeded = (on: boolean) => {
      if (on !== playerHookedRef.current) {
        playerHookedRef.current = on
        setPlayerHookedUI(on)
      }
    }

    const setHookedHookIdIfNeeded = (id: HookId | null) => {
      if (id !== hookedHookIdRef.current) {
        hookedHookIdRef.current = id
        setHookedHookIdUI(id)
      }
    }

    const forceStopPlayer = () => {
      clearMoveKeys()
      if (stepRef.current) setIsStep(false)
      clearAllGenStuff()
    }

    const findNearestHookId = (from: { x: number; y: number }) => {
      let best: { id: HookId; d: number } | null = null
      for (const h of HOOKS) {
        const d = pxDistTo(from, h)
        if (!best || d < best.d) best = { id: h.id, d }
      }
      return best?.id ?? (HOOKS[0]?.id ?? null)
    }

    const beginHookEscape = (now: number) => {
      hookEscapeDoneRef.current = 0
      hookFailCountRef.current = 0
      hookNextSkillAtRef.current = now + 800
    }

    const pickRandomLockerId = () => {
      const idx = Math.floor(Math.random() * LOCKERS.length)
      return (LOCKERS[idx]?.id ?? null) as LockerId | null
    }

    const tick = (t: number) => {
      if (gameOverRef.current || winRef.current) {
        lastRef.current = t
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const last = lastRef.current ?? t
      const dt = (t - last) / 1000
      lastRef.current = t

      // Gen regression after kick (only while not being repaired)
      {
        const cur = activeTargetRef.current
        const repairingId =
          interactingRef.current && cur && cur.kind === "gen" ? (cur.id as GenId) : (null as GenId | null)

        let changed = false
        const nextState = { ...gensRef.current }

          ; (Object.keys(nextState) as GenId[]).forEach((id) => {
            const st = nextState[id]
            if (!st) return
            if (st.done) return
            if (!st.decayActive) return
            if (repairingId === id) return

            const before = st.progress
            const after = clamp(before - GEN_REGRESS_RATE * dt, 0, 100)
            if (Math.abs(after - before) < 0.0001) return

            nextState[id] = { ...st, progress: after }
            changed = true
          })

        if (changed) {
          gensRef.current = nextState
          setGens(nextState)
        }
      }

      const killerStunned = t < killerStunUntilRef.current
      const stunKindNow: KillerStunKind = killerStunned ? killerStunKindRef.current : "none"
      setStunUIIfNeeded(stunKindNow)

      const boostActive =
        !playerDownRef.current && !playerCarriedRef.current && !playerHookedRef.current && t < playerBoostUntilRef.current
      setPlayerHurtIfNeeded(boostActive)

      // End locker check if it finished
      if (killerLockerTargetIdRef.current && killerLockerCheckUntilRef.current > 0 && t >= killerLockerCheckUntilRef.current) {
        killerLockerCheckUntilRef.current = 0
        killerLockerTargetIdRef.current = null
      }

      // Handle gen kick animation state
      {
        const kick = killerGenKickRef.current
        if (kick) {
          if (t >= kick.impactAt && !kick.impacted) {
            kick.impacted = true
            killerGenKickRef.current = kick
            applySabotageKick(kick.id)
          }
          if (t >= kick.endAt) {
            killerGenKickRef.current = null
            setKickedGenUI(null)
            setKillerKickingUI(false)
          }
        }
      }

      {
        const kpos = killerPosRef.current
        const playerHidden = !!hiddenInRef.current
        const playerDown = playerDownRef.current
        const playerCarried = playerCarriedRef.current
        const playerHooked = playerHookedRef.current
        const ignorePlayer = t < killerIgnorePlayerUntilRef.current

        // Hits
        if (
          !killerStunned &&
          !killerKickingUIRef.current &&
          !playerHidden &&
          !playerDown &&
          !playerCarried &&
          !playerHooked &&
          !ignorePlayer &&
          t >= playerInvulnUntilRef.current
        ) {
          const ppos = playerPosRef.current
          const dHit = pxDistTo(kpos, ppos)
          if (dHit <= KILLER_HIT_RANGE) {
            playOneShot(jumpscareRef)

            const nextHits = Math.min(2, playerHitsRef.current + 1)
            playerHitsRef.current = nextHits
            setPlayerHitsUI(nextHits)

            if (nextHits >= 2) {
              if (unhookCountRef.current >= HOOK_UNHOOK_LIMIT) {
                triggerGameOver()
                rafRef.current = requestAnimationFrame(tick)
                return
              }

              setPlayerHurtIfNeeded(false)
              playerBoostUntilRef.current = 0
              playerInvulnUntilRef.current = t + 999999999

              setPlayerDownIfNeeded(true)
              playerDownPosRef.current = { x: ppos.x, y: ppos.y }
              forceStopPlayer()

              carryHookTargetRef.current = null
              setPlayerCarriedIfNeeded(false)
              setPlayerHookedIfNeeded(false)
              setHookedHookIdIfNeeded(null)
            } else {
              playerInvulnUntilRef.current = t + PLAYER_BOOST_MS
              playerBoostUntilRef.current = t + PLAYER_BOOST_MS
            }

            killerStunUntilRef.current = t + KILLER_HIT_STUN_MS
            killerStunKindRef.current = "hit"
            setStunUIIfNeeded("hit")

            killerChasingRef.current = true
          }
        }

        // Chase toggles
        if (playerHidden || playerHooked || playerCarried || playerDown || ignorePlayer || killerKickingUIRef.current) {
          killerChasingRef.current = false
        } else if (!killerChasingRef.current) {
          const dToPlayer = pxDistTo(kpos, playerPosRef.current)
          if (dToPlayer <= KILLER_START_CHASE_RANGE) killerChasingRef.current = true
        }

        // Killer AI movement
        if (killerStunned || killerKickingUIRef.current) {
          if (killerStepRef.current) setKillerIsStep(false)
        } else {
          let tx = kpos.x
          let ty = kpos.y
          let speed = KILLER_SPEED

          const maybePickGenSabotage = () => {
            if (killerSabotageTargetRef.current) return
            if (killerChasingRef.current) return
            if (playerHidden || playerDown || playerCarried || playerHooked) return
            if (ignorePlayer) return
            if (killerLockerTargetIdRef.current) return

            if (t < killerNextSabotageTryAtRef.current) return
            killerNextSabotageTryAtRef.current =
              t +
              (KILLER_SABOTAGE_TRY_MIN_MS + Math.random() * (KILLER_SABOTAGE_TRY_MAX_MS - KILLER_SABOTAGE_TRY_MIN_MS))

            if (Math.random() >= KILLER_GEN_SABOTAGE_CHANCE) return

            const best = pickSabotageGen(kpos)
            if (!best) return
            killerSabotageTargetRef.current = best.id
          }

          const maybePickLockerCheck = () => {
            if (killerLockerTargetIdRef.current) return
            if (killerChasingRef.current) return
            if (playerDown || playerCarried || playerHooked) return
            if (ignorePlayer) return
            if (killerSabotageTargetRef.current) return

            if (t < killerNextLockerTryAtRef.current) return
            killerNextLockerTryAtRef.current =
              t + (KILLER_LOCKER_TRY_MIN_MS + Math.random() * (KILLER_LOCKER_TRY_MAX_MS - KILLER_LOCKER_TRY_MIN_MS))

            const chance = playerHidden ? KILLER_LOCKER_CHECK_CHANCE_HIDDEN : KILLER_LOCKER_CHECK_CHANCE
            if (Math.random() >= chance) return

            const id = pickRandomLockerId()
            if (!id) return
            killerLockerTargetIdRef.current = id
            killerLockerCheckUntilRef.current = 0
          }

          maybePickGenSabotage()
          maybePickLockerCheck()

          if (playerCarried) {
            const hookId = carryHookTargetRef.current
            const hook = hookId ? HOOKS.find((h) => h.id === hookId) : null
            if (hook) {
              tx = hook.x
              ty = hook.y
              speed = KILLER_CARRY_SPEED

              const dHook = pxDistTo(kpos, hook)
              if (dHook <= KILLER_HOOK_RANGE) {
                if (unhookCountRef.current >= HOOK_UNHOOK_LIMIT) {
                  triggerGameOver()
                  rafRef.current = requestAnimationFrame(tick)
                  return
                }

                setPlayerCarriedIfNeeded(false)
                setPlayerDownIfNeeded(false)
                setPlayerHookedIfNeeded(true)
                setHookedHookIdIfNeeded(hook.id)
                playOneShot(hookedRef)

                hookCountRef.current = Math.min(HOOK_UNHOOK_LIMIT, hookCountRef.current + 1)
                setHookCountUI(hookCountRef.current)

                beginHookEscape(t)

                killerIgnorePlayerUntilRef.current = t + 5200
                killerChasingRef.current = false
                killerWanderTargetRef.current = pickWanderTargetFarFrom({ x: hook.x, y: hook.y }, 28)
                killerNextWanderPickAtRef.current = t + (2600 + Math.random() * 2600)
              }
            }
          } else if (playerDown) {
            const downPos = playerDownPosRef.current
            if (downPos) {
              tx = downPos.x
              ty = downPos.y
              speed = KILLER_SPEED

              const dPick = pxDistTo(kpos, downPos)
              if (dPick <= KILLER_PICKUP_RANGE) {
                const nearestHook = findNearestHookId(kpos)
                carryHookTargetRef.current = nearestHook
                setPlayerCarriedIfNeeded(true)
              }
            }
          } else if (killerLockerTargetIdRef.current) {
            const lid = killerLockerTargetIdRef.current
            const locker = lid ? LOCKERS.find((l) => l.id === lid) : null
            if (!locker) {
              killerLockerTargetIdRef.current = null
              killerLockerCheckUntilRef.current = 0
            } else if (t < killerLockerCheckUntilRef.current && killerLockerCheckUntilRef.current > 0) {
              if (killerStepRef.current) setKillerIsStep(false)
            } else {
              tx = locker.x
              ty = locker.y
              speed = KILLER_SPEED

              const dLocker = pxDistTo(kpos, locker)
              const CHECK_RANGE = 2.4
              if (dLocker <= CHECK_RANGE) {
                killerLockerCheckUntilRef.current = t + KILLER_LOCKER_CHECK_MS
                playOneShot(lockerOpenRef)

                const hid = hiddenInRef.current
                if (hid && hid === locker.id) {
                  hiddenInRef.current = null
                  setHiddenIn(null)

                  playerHitsRef.current = 2
                  setPlayerHitsUI(2)

                  setPlayerDownIfNeeded(false)
                  setPlayerHookedIfNeeded(false)
                  setHookedHookIdIfNeeded(null)
                  setPlayerCarriedIfNeeded(true)

                  carryHookTargetRef.current = findNearestHookId(kpos)
                  killerChasingRef.current = false

                  killerLockerTargetIdRef.current = null
                }
              }
            }
          } else if (!killerChasingRef.current && killerSabotageTargetRef.current) {
            const gid = killerSabotageTargetRef.current
            const gLayout = gid ? GENS.find((gg) => gg.id === gid) ?? null : null
            const gState = gid ? gensRef.current[gid] : null

            if (!gid || !gLayout || !gState || gState.done || !canKickGenNow(gid)) {
              killerSabotageTargetRef.current = null
            } else {
              tx = gLayout.x
              ty = gLayout.y
              speed = KILLER_SPEED

              const KICK_RANGE = 2.4
              const dGen = pxDistTo(kpos, gLayout)
              if (dGen <= KICK_RANGE) {
                startGenKick(t, gid)
              }
            }
          } else if (playerHooked || ignorePlayer || playerHidden) {
            if (!killerWanderTargetRef.current || t >= killerNextWanderPickAtRef.current) {
              killerWanderTargetRef.current = pickWanderTarget()
              killerNextWanderPickAtRef.current = t + (2600 + Math.random() * 2600)
            }
            tx = killerWanderTargetRef.current.x
            ty = killerWanderTargetRef.current.y
          } else if (killerChasingRef.current && !playerHidden) {
            const ppos = playerPosRef.current
            const dToPlayer = pxDistTo(kpos, ppos)
            if (dToPlayer > KILLER_STOP_RANGE) {
              tx = ppos.x
              ty = ppos.y
            }
          } else {
            if (!killerWanderTargetRef.current || t >= killerNextWanderPickAtRef.current) {
              killerWanderTargetRef.current = pickWanderTarget()
              killerNextWanderPickAtRef.current = t + (2600 + Math.random() * 2600)
            }
            tx = killerWanderTargetRef.current.x
            ty = killerWanderTargetRef.current.y
          }

          const dx = (tx - kpos.x) * ASPECT
          const dy = ty - kpos.y
          const dist = Math.hypot(dx, dy)

          if (dist > 0.001) {
            const ux = dx / dist
            const uy = dy / dist

            const absX = Math.abs(ux / ASPECT)
            const absY = Math.abs(uy)

            let nextFacing: Facing = killerFacingRef.current
            if (absY >= absX) nextFacing = uy < 0 ? "back" : "front"
            else nextFacing = ux < 0 ? "left" : "right"

            if (nextFacing !== killerFacingRef.current) setKillerFacing(nextFacing)

            if (t - killerLastStepPulseRef.current >= 700) {
              killerLastStepPulseRef.current = t
              killerStepUntilRef.current = t + 220
              if (!killerStepRef.current) setKillerIsStep(true)
            }
            if (killerStepRef.current && t >= killerStepUntilRef.current) setKillerIsStep(false)

            const nextPos = clampToBounds({ x: kpos.x + (ux / ASPECT) * speed * dt, y: kpos.y + uy * speed * dt })
            if (nextPos.x !== kpos.x || nextPos.y !== kpos.y) setKillerPos(nextPos)
          } else {
            if (killerStepRef.current) setKillerIsStep(false)
          }
        }
      }

      // Win check
      if (gateRef.current.opened && !hiddenInRef.current && !playerDownRef.current && !playerCarriedRef.current && !playerHookedRef.current) {
        const p = playerPosRef.current
        const dx = Math.abs((p.x - GATE.x) * ASPECT)
        if (p.y <= WIN_Y_THRESHOLD && dx <= WIN_X_RANGE) {
          triggerWin()
          rafRef.current = requestAnimationFrame(tick)
          return
        }
      }

      // Hook skill loop
      if (playerHookedRef.current) {
        clearAllGenStuff()
        stopRun()
        clearMoveKeys()
        if (stepRef.current) setIsStep(false)

        if (!skillRef.current.active && t >= hookNextSkillAtRef.current) {
          spawnSkill(t, 0.6, "hook")
        }

        if (skillRef.current.active && skillModeRef.current === "hook") {
          const p = clamp((t - skillRef.current.startedAt) / skillRef.current.duration, 0, 1)
          setSkillUI({ active: true, p, zoneStart: skillRef.current.zoneStart, zoneWidth: skillRef.current.zoneWidth })

          if (p >= 1 && !skillRef.current.resolved) {
            clearSkill()
            hookFail(t)
            if (!gameOverRef.current && !winRef.current) {
              hookNextSkillAtRef.current = t + HOOK_SKILL_RETRY_MS
            }
          }
        } else {
          if (skillUI.active && skillModeRef.current !== "gen") {
            setSkillUI((s) => (s.active ? { active: false, p: 0, zoneStart: 0, zoneWidth: 0 } : s))
          }
        }
      } else if (!hiddenInRef.current && !playerDownRef.current && !playerCarriedRef.current) {
        // Player move
        const speed = PLAYER_BASE_SPEED * (boostActive ? PLAYER_BOOST_MULT : 1)

        const k = keysRef.current
        let mx = (k.d ? 1 : 0) - (k.a ? 1 : 0)
        let my = (k.s ? 1 : 0) - (k.w ? 1 : 0)
        const moving = mx !== 0 || my !== 0

        if (moving) {
          const len = Math.hypot(mx, my)
          mx /= len
          my /= len

          const absX = Math.abs(mx)
          const absY = Math.abs(my)

          let nextFacing: Facing = facingRef.current
          if (absY >= absX) nextFacing = my < 0 ? "back" : "front"
          else nextFacing = mx < 0 ? "left" : "right"

          if (nextFacing !== facingRef.current) setFacing(nextFacing)

          if (t - lastStepPulseRef.current >= STEP_PULSE_MS) {
            lastStepPulseRef.current = t
            stepUntilRef.current = t + STEP_SHOW_MS
            if (!stepRef.current) setIsStep(true)
          }

          if (stepRef.current && t >= stepUntilRef.current) setIsStep(false)

          setPlayerPos((p) => clampToBounds({ x: p.x + mx * speed * dt, y: p.y + my * speed * dt }))
        } else {
          if (stepRef.current) setIsStep(false)
        }

        // Interaction tick
        const cur = activeTargetRef.current
        if (interactingRef.current && cur) {
          if (cur.kind === "gen") {
            const id = cur.id as GenId
            const layout = GENS.find((gg) => gg.id === id)
            const gs = gensRef.current[id]

            if (!layout || !gs || gs.done) {
              stopInteract()
            } else {
              const d = pxDistTo(playerPosRef.current, layout)
              if (d > RANGE_GEN + 1.0) {
                stopInteract()
              } else {
                const before = gs.progress
                const after = clamp(before + BASE_GEN_RATE * dt, 0, 100)
                if (after !== before) {
                  const done = after >= 100
                  const progressed = after > before

                  let decayActive = gs.decayActive
                  let decayFloor = gs.decayFloor
                  if (decayActive && after > decayFloor + 0.01) {
                    decayActive = false
                    decayFloor = 0
                  }

                  const kickReady = done ? false : gs.kickReady || (progressed && after > 0)
                  gensRef.current[id] = { progress: after, done, kickReady, decayActive, decayFloor }
                  setGens({ ...gensRef.current })

                  if (done) {
                    stopRun()
                    playOneShot(genDoneRef)
                    stopInteract()
                  }
                }

                const now = t
                const difficulty01 = clamp((gensRef.current[id]?.progress ?? 0) / 100, 0, 1)

                if (!skillRef.current.active && now >= nextSkillAtRef.current) {
                  spawnSkill(now, difficulty01, "gen")
                }

                if (skillRef.current.active && skillModeRef.current === "gen") {
                  const p = clamp((now - skillRef.current.startedAt) / skillRef.current.duration, 0, 1)
                  setSkillUI({ active: true, p, zoneStart: skillRef.current.zoneStart, zoneWidth: skillRef.current.zoneWidth })

                  if (p >= 1 && !skillRef.current.resolved) {
                    resolveGenSkill(now, false)
                  }
                } else {
                  if (skillUI.active && skillModeRef.current === "gen") {
                    setSkillUI({ active: false, p: 0, zoneStart: 0, zoneWidth: 0 })
                  }
                }
              }
            }
          } else if (cur.kind === "gate") {
            if (!allGensDone || gateRef.current.opened) {
              stopInteract()
            } else {
              const d = pxDistTo(playerPosRef.current, GATE)
              if (d > RANGE_GATE + 1.0) {
                stopInteract()
              } else {
                if (!doorOpeningPlayedRef.current) {
                  doorOpeningPlayedRef.current = true
                  playOneShot(doorOpeningRef)
                }

                const before = gateRef.current.progress
                const after = clamp(before + BASE_GATE_RATE * dt, 0, 100)
                if (after !== before) {
                  const opened = after >= 100
                  const nextState = { progress: after, opened }
                  gateRef.current = nextState
                  setGate(nextState)
                  if (opened) {
                    playOneShot(doorOpenedRef)
                    stopInteract()
                  }
                }

                if (skillModeRef.current === "gen") clearSkill()
              }
            }
          }
        } else {
          if (skillModeRef.current === "gen") clearSkill()
        }
      } else {
        if (hiddenInRef.current) {
          if (stepRef.current) setIsStep(false)
          if (skillModeRef.current === "gen") clearSkill()
          clearAllGenStuff()
        } else {
          clearAllGenStuff()
          stopRun()
          clearMoveKeys()
          if (stepRef.current) setIsStep(false)
          if (skillModeRef.current === "gen") clearSkill()
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [GENS, skillUI.active, allGensDone, GATE, HOOKS, PALLETS, LOCKERS, initialGens, initialPallets])

  const playerSrcNormal = (() => {
    if (facing === "front") return isStep ? "/DBD/player/front-step.png" : "/DBD/player/front.png"
    if (facing === "back") return isStep ? "/DBD/player/back-step.png" : "/DBD/player/back.png"
    return isStep ? "/DBD/player/side-step.png" : "/DBD/player/side.png"
  })()

  const killerSrc = (() => {
    if (killerStunKindUI === "pallet") return "/DBD/killer/stunned.png"
    if (killerStunKindUI === "hit") return "/DBD/killer/hit.png"
    if (playerCarriedUI) return "/DBD/killer/carrying.png"
    if (killerFacing === "front") return killerIsStep ? "/DBD/killer/front-step.png" : "/DBD/killer/front.png"
    if (killerFacing === "back") return killerIsStep ? "/DBD/killer/back-step.png" : "/DBD/killer/back.png"
    return killerIsStep ? "/DBD/killer/side-step.png" : "/DBD/killer/side.png"
  })()

  const killerRenderScale = (() => {
    if (killerStunKindUI === "pallet") return 0.88
    if (playerCarriedUI) return 1.2
    if (killerIsStep) return 1
    return 1.3
  })()

  const activeProgress = useMemo(() => {
    if (!isInteracting || !activeTarget) return 0
    if (activeTarget.kind === "gen") return gens[activeTarget.id as GenId]?.progress ?? 0
    return gate.progress
  }, [isInteracting, activeTarget, gens, gate.progress])

  const activeGenDecay = useMemo(() => {
    if (!isInteracting || !activeTarget || activeTarget.kind !== "gen") return null
    const st = gens[activeTarget.id as GenId]
    if (!st) return null
    if (!st.decayActive) return null
    return st.decayFloor
  }, [isInteracting, activeTarget, gens])

  const kickedGenPos = useMemo(() => {
    if (!kickedGenUI) return null
    return GENS.find((g) => g.id === kickedGenUI) ?? null
  }, [kickedGenUI, GENS])

  const killerKickFacing = useMemo<Facing>(() => {
    if (!kickedGenPos) return killerFacing
    return killerPos.x < kickedGenPos.x ? "right" : "left"
  }, [kickedGenPos, killerPos.x, killerFacing])

  const isWorkingOnGen = isInteracting && !!activeTarget && activeTarget.kind === "gen"

  const SWEEP_START = -135
  const SWEEP_DEG = 270

  const indicatorDeg = SWEEP_START + clamp(skillUI.p, 0, 1) * SWEEP_DEG
  const z0Deg = SWEEP_START + clamp(skillUI.zoneStart, 0, 1) * SWEEP_DEG
  const z1Deg = SWEEP_START + clamp(skillUI.zoneStart + skillUI.zoneWidth, 0, 1) * SWEEP_DEG

  const cx = 120
  const cy = 120
  const r = 92

  const zonePath = describeArc(cx, cy, r, z0Deg, z1Deg)
  const redInner = polarToCartesian(cx, cy, r - 26, indicatorDeg)
  const redOuter = polarToCartesian(cx, cy, r + 30, indicatorDeg)

  const hookedHookPos = useMemo(() => {
    if (!hookedHookIdUI) return null
    return HOOKS.find((h) => h.id === hookedHookIdUI) ?? null
  }, [hookedHookIdUI, HOOKS])

  const downPos = playerDownUI ? playerDownPosRef.current : null

  const showPlayerNormal =
    !hiddenIn &&
    !playerCarriedUI &&
    !playerHookedUI &&
    !playerDownUI &&
    !isWorkingOnGen
  const showPlayerDown = !hiddenIn && playerDownUI && !playerCarriedUI && !playerHookedUI && !!downPos

  const worldHints: WorldHint[] = useMemo(() => {
    if (gameOverUI || winUI) return []
    if (playerDownUI || playerCarriedUI) return []
    if (playerHookedUI) return []
    if (skillUI.active) return []

    if (hiddenIn) {
      const lid = hiddenIn
      const loc = LOCKERS.find((l) => l.id === lid)
      if (!loc) return []
      return [{ key: "SPACE", text: "Press SPACE", x: loc.x, y: loc.y - 7.5 }]
    }

    const out: WorldHint[] = []

    if (!isInteracting && interactableTarget) {
      if (interactableTarget.kind === "gen") {
        const loc = GENS.find((g) => g.id === interactableTarget.id)
        if (loc) out.push({ key: "SPACE", text: "Press SPACE", x: loc.x, y: loc.y - 9.5 })
      } else if (interactableTarget.kind === "gate") {
        out.push({ key: "SPACE", text: "Press SPACE", x: GATE.x, y: GATE.y - 7.5 })
      }
    }

    if (!isInteracting && interactableLocker) {
      const loc = LOCKERS.find((l) => l.id === interactableLocker)
      if (loc) out.push({ key: "SPACE", text: "Press SPACE", x: loc.x, y: loc.y - 8.5 })
    }

    if (!isInteracting && interactablePallet) {
      const loc = PALLETS.find((p) => p.id === interactablePallet)
      if (loc) out.push({ key: "SPACE", text: "Press SPACE", x: loc.x, y: loc.y - 8.5 })
    }

    return out.slice(0, 2)
  }, [
    gameOverUI,
    winUI,
    playerDownUI,
    playerCarriedUI,
    playerHookedUI,
    skillUI.active,
    hiddenIn,
    isInteracting,
    interactableTarget,
    interactableLocker,
    interactablePallet,
    GENS,
    PALLETS,
    LOCKERS,
    GATE,
  ])

  const faceSrc =
    playerHitsUI === 0 && !playerDownUI && !playerCarriedUI && !playerHookedUI ? "/DBD/hud/normal.png" : "/DBD/hud/injured.png"

  const isTallyOn = (idx: 1 | 2) => hookCountUI >= idx

  return (
    <>
      <style>{`
        .dbd-root {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: #000;
        }

        .dbd-shell {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
        }

        .dbd-viewport {
          position: relative;
          width: min(100vw, calc(100vh * 1.50037));
          height: min(100vh, calc(100vw * 0.66655));
        }

        .dbd-killer--kick {
  z-index: 4;
}

        .dbd-map {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
        }

        .dbd-side {
          position: fixed;
          top: 0;
          bottom: 0;
          width: clamp(
            0px,
            calc((100vw - min(100vw, calc(100vh * 1.50037))) / 2),
            700px
          );
          padding: 10px 10px;
          overflow: hidden;
          color: rgba(255,255,255,0.92);
          pointer-events: none;
          z-index: 500;
          container-type: inline-size;
        }

        .dbd-side--left { left: 0; }
        .dbd-side--right { right: 0; display: flex; justify-content: flex-start; }

        .dbd-side__card {
          pointer-events: none;
          width: 100%;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.22);
          border-radius: 18px;
          padding: 10px 10px;
          box-sizing: border-box;
          box-shadow: 0 14px 36px rgba(0,0,0,0.4);
          overflow: hidden;
        }

        .dbd-side__brand {
          margin: 0 0 clamp(10px, 5cqw, 14px) 0;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: clamp(14px, 6.4cqw, 20px);
          line-height: 1.15;
          color: rgba(255, 70, 70, 0.95);
          text-shadow:
            0 2px 0 rgba(0,0,0,0.8),
            0 10px 26px rgba(0,0,0,0.55);
        }

        .dbd-side__title {
          font-size: clamp(14px, 5.2cqw, 18px);
          line-height: 1.25;
          letter-spacing: 0.01em;
          margin: 0 0 clamp(12px, 6cqw, 16px) 0;
          opacity: 0.95;
        }

        .dbd-legend {
          display: grid;
          gap: clamp(10px, 4.8cqw, 14px);
        }

        .dbd-legend__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: clamp(10px, 5cqw, 14px);
          font-size: clamp(14px, 5.2cqw, 18px);
          opacity: 0.95;
          white-space: nowrap;
        }

        .dbd-legend__keys {
          display: inline-flex;
          gap: clamp(8px, 3.4cqw, 12px);
          align-items: center;
          flex-wrap: wrap;
        }

        .dbd-keycap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: clamp(44px, 16cqw, 78px);
          height: clamp(36px, 13.5cqw, 60px);
          padding: 0 clamp(10px, 4.6cqw, 16px);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.24);
          background: rgba(255,255,255,0.08);
          font-weight: 900;
          letter-spacing: 0.06em;
          font-size: clamp(13px, 5.2cqw, 20px);
        }

        .dbd-hud {
          width: 100%;
          display: grid;
          gap: clamp(12px, 6cqw, 18px);
        }

        .dbd-hud__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: clamp(10px, 5cqw, 16px);
        }

        .dbd-hud__gens,
        .dbd-hud__health {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 16px;
          width: 100%;
        }

        .dbd-hud__num {
          font-size: 120px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.02em;
          color: rgba(255,255,255,0.98);
          min-width: 0;
          text-align: left;
          transform: translateX(22px);
          pointer-events: none;
        }

        .dbd-hud__icon {
          width: 400px;
          height: 400px;
          object-fit: contain;
          flex: 0 0 auto;
          transform: translateX(-90px);
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
        }

        .dbd-hud__face {
          width: 400px;
          height: 400px;
          object-fit: contain;
          flex: 0 0 auto;
          transform: translateX(-30px);
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
        }

        .dbd-hook-tally {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
          transform: translateX(69px);
        }

        .dbd-hook-tally__i {
          width: clamp(12px, 4.2cqw, 22px);
          height: clamp(52px, 16cqw, 110px);
          border-radius: 999px;
          border: 2px solid rgba(0,0,0,0.95);
          background: rgba(255,255,255,0);
          box-shadow: 0 8px 16px rgba(0,0,0,0.25);
        }

        .dbd-hook-tally__i--on {
          background: rgba(255,255,255,0.96);
        }

        .dbd-gate {
          position: absolute;
          left: var(--gate-x, 50%);
          top: 0;
          transform: translate(-50%, var(--gate-offset-y, 0px));
          width: clamp(180px, var(--gate-w, 26%), 560px);
          height: auto;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          z-index: 2;
          transition: filter 420ms ease;
        }

        .dbd-gate--pulse {
          filter:
            brightness(1.7)
            contrast(1.15)
            drop-shadow(0 0 14px rgba(255,255,255,0.8))
            drop-shadow(0 0 44px rgba(255,255,255,0.38));
        }

        .dbd-gen,
        .dbd-locker,
        .dbd-pallet,
        .dbd-hook {
          position: absolute;
          left: var(--x, 50%);
          top: var(--y, 50%);
          transform: translate(-50%, -50%);
          height: auto;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          z-index: 2;
        }

        .dbd-gen-wrap {
  position: absolute;
  left: var(--x, 50%);
  top: var(--y, 50%);
  transform: translate(-50%, -50%);
  width: clamp(140px, var(--w, 15%), 320px);
  height: auto;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
  z-index: 2;
}

/* softer glow area + less blur */
.dbd-gen-wrap::before {
  content: "";
  position: absolute;
  inset: -14%;
  border-radius: 999px;
  opacity: 0;
  filter: blur(6px);
  transition: opacity 160ms ease;
  background: radial-gradient(circle, rgba(255, 0, 0, 0.28), rgba(255, 0, 0, 0) 72%);
}

/* lighter highlight on regress */
.dbd-gen-wrap--regress::before {
  opacity: 1;
}

/* reduce drop-shadows a lot */
.dbd-gen-wrap--regress {
  filter:
    drop-shadow(0 0 6px rgba(255, 0, 0, 0.35))
    drop-shadow(0 0 14px rgba(255, 0, 0, 0.18));
}


.dbd-gen-img {
  position: relative;
  width: 100%;
  height: auto;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

        .dbd-locker {
          transform: translate(calc(-50% + var(--lock-x-fix, -12px)), -50%);
          width: clamp(150px, var(--w, 13.5%), 340px);
          transition: filter 180ms ease;
        }

        .dbd-locker--active {
          filter: brightness(1.25) drop-shadow(0 0 14px rgba(255,255,255,0.25));
        }

        .dbd-pallet {
          transform: translate(-50%, -50%) rotate(var(--r, 0deg));
          width: clamp(120px, var(--w, 12%), 320px);
        }

        .dbd-hook { width: clamp(90px, var(--w, 8%), 300px); }

        .dbd-player {
          position: absolute;
          left: var(--x, 50%);
          top: var(--y, 50%);
          transform: translate(-50%, -50%) scale(var(--scale, 1));
          width: clamp(120px, var(--w, 12%), 360px);
          pointer-events: none;
          z-index: 3;
        }

        .dbd-player--hurt {
          filter:
            drop-shadow(0 0 12px rgba(255, 0, 0, 0.95))
            drop-shadow(0 0 26px rgba(255, 0, 0, 0.55));
        }

        .dbd-killer {
          position: absolute;
          left: var(--x, 50%);
          top: var(--y, 50%);
          transform: translate(-50%, -50%) scale(var(--killer-scale, 1));
          width: clamp(120px, var(--w, 12%), 360px);
          pointer-events: none;
          z-index: 3;
        }

        .dbd-player__img, .dbd-killer__img {
          width: 100%;
          height: auto;
          display: block;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
        }

        .dbd-player--flip .dbd-player__img { transform: scaleX(-1); transform-origin: center; }
        .dbd-killer--flip .dbd-killer__img { transform: scaleX(-1); transform-origin: center; }

        .dbd-progress {
          position: absolute;
          left: 50%;
          top: 72%;
          transform: translate(-50%, -50%);
          z-index: 14;
          pointer-events: none;
          width: min(520px, 78vw);
        }

        .dbd-progress__track {
          position: relative;
          height: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.14);
          border: 1px solid rgba(255,255,255,0.14);
          overflow: hidden;
          box-shadow: 0 10px 26px rgba(0,0,0,0.35);
        }

        .dbd-progress__baseline {
          position: absolute;
          top: -6px;
          bottom: -6px;
          width: 3px;
          left: 0%;
          background: rgba(255, 0, 0, 0.9);
          box-shadow: 0 0 12px rgba(255, 0, 0, 0.55);
          border-radius: 999px;
        }

        .dbd-progress__fill {
          height: 100%;
          width: 0%;
          background: rgba(255,255,255,0.82);
        }

        .skill-overlay {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          z-index: 20;
          pointer-events: none;
        }

        .skill-wrap {
          position: relative;
          width: min(260px, 62vw);
          height: min(260px, 62vw);
          filter: drop-shadow(0 14px 26px rgba(0,0,0,0.45));
        }

        .skill-svg {
          width: 100%;
          height: 100%;
          display: block;
        }

        .skill-key {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 14px;
          letter-spacing: 0.06em;
          color: rgba(255,255,255,0.94);
          background: rgba(0,0,0,0.62);
          border: 1px solid rgba(255,255,255,0.28);
          border-radius: 10px;
          padding: 8px 10px;
          user-select: none;
          pointer-events: none;
        }

        .dbd-hint-world {
          position: absolute;
          left: var(--x, 50%);
          top: var(--y, 50%);
          transform: translate(-50%, -100%);
          z-index: 60;
          pointer-events: none;
        }

        .dbd-hint {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(0,0,0,0.62);
          border: 1px solid rgba(255,255,255,0.28);
          border-radius: 14px;
          padding: 10px 12px;
          color: rgba(255,255,255,0.92);
          font-size: 14px;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 10px 26px rgba(0,0,0,0.35);
        }

        .dbd-hint__key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 52px;
          height: 30px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.08);
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .dbd-end {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: grid;
          place-items: center;
          background: #000;
        }

        .dbd-end__img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
        }



/* push actions to bottom + add space from bottom edge */
.dbd-end__actions{
  margin-top:auto;
  padding-bottom:24px;

  display:flex;
  gap:18px;              /* gap between buttons */
  justify-content:center;
  align-items:center;
  width:100%;
}

        .dbd-end__btn {
          display:inline-flex;
  align-items:center;
  justify-content:center;
          left: 50%;
          bottom: 26px;
          transform: translateX(-50%);
          pointer-events: auto;
          border: 1px solid rgba(255,255,255,0.35);
          background: rgba(0,0,0,0.62);
          color: rgba(255,255,255,0.95);
          padding: 12px 18px;
          border-radius: 12px;
          font-size: 16px;
          cursor: pointer;
        }

        .dbd-end__btn:active {
          transform: translateX(-50%) scale(0.98);
        }
      `}</style>

      <div className="dbd-root">
        <div className="dbd-side dbd-side--left" aria-hidden="true">
          <div className="dbd-side__card">
            <h2 className="dbd-side__brand">KNOCKOFF DEAD BY DAYLIGHT MASGU EDITION DEVELOPED BY MAHDOON</h2>
            <p className="dbd-side__title">you became a pro player, show off your skills.</p>
            <div className="dbd-legend">
              <div className="dbd-legend__row">
                <span className="dbd-legend__keys">
                  <span className="dbd-keycap">W</span>
                  <span className="dbd-keycap">A</span>
                  <span className="dbd-keycap">S</span>
                  <span className="dbd-keycap">D</span>
                </span>
                <span>Move</span>
              </div>
              <div className="dbd-legend__row">
                <span className="dbd-legend__keys">
                  <span className="dbd-keycap">SPACE</span>
                </span>
                <span>Interact</span>
              </div>
            </div>
          </div>
        </div>

        <div className="dbd-side dbd-side--right" aria-hidden="true">
          <div className="dbd-side__card">
            <div className="dbd-hud">
              <div className="dbd-hud__row">
                <div className="dbd-hud__gens">
                  <div className="dbd-hud__num">{gensLeft}</div>
                  <img className="dbd-hud__icon" src="/DBD/hud/gen.png" alt="" draggable={false} />
                </div>
              </div>

              <div className="dbd-hud__row">
                <div className="dbd-hud__health">
                  <div className="dbd-hook-tally">
                    <div className={`dbd-hook-tally__i ${isTallyOn(1) ? "dbd-hook-tally__i--on" : ""}`} />
                    <div className={`dbd-hook-tally__i ${isTallyOn(2) ? "dbd-hook-tally__i--on" : ""}`} />
                  </div>
                  <img className="dbd-hud__face" src={faceSrc} alt="" draggable={false} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dbd-shell">
          <div
            className="dbd-viewport"
            style={
              {
                "--gate-x": "45.2%",
                "--gate-w": "26%",
                "--gate-offset-y": "-70px",
              } as CSSProperties
            }
          >
            <img className="dbd-map" src="/DBD/world/map.png" alt="DBD world map" draggable={false} />

            <img
              className={`dbd-gate ${gatePulse && !gate.opened ? "dbd-gate--pulse" : ""}`}
              src={gate.opened ? "/DBD/world/gate-open.png" : "/DBD/world/gate-closed.png"}
              alt="Exit gate"
              draggable={false}
            />

            {GENS.map((g) => {
              const state = gens[g.id]
              const workingThis = isWorkingOnGen && activeTarget?.kind === "gen" && activeTarget.id === g.id

              const isRegressing = !!state?.decayActive && !state?.done && !workingThis

              const src = workingThis
                ? "/DBD/player/gen-working.png"
                : state.done
                  ? "/DBD/world/gen-on.png"
                  : "/DBD/world/gen-off.png"

              return (
                <div
                  key={g.id}
                  className={`dbd-gen-wrap ${isRegressing ? "dbd-gen-wrap--regress" : ""}`}
                  style={{ "--x": `${g.x}%`, "--y": `${g.y}%`, "--w": g.w } as CSSProperties}
                >
                  <img className="dbd-gen-img" src={src} alt="Generator" draggable={false} />
                </div>
              )
            })}


            {PALLETS.map((p) => {
              const st = pallets[p.id]
              const src = st?.down ? "/DBD/world/pallet-down.png" : "/DBD/world/pallet-up.png"
              return (
                <img
                  key={p.id}
                  className="dbd-pallet"
                  src={src}
                  alt="Pallet"
                  draggable={false}
                  style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--w": p.w, "--r": `${p.r}deg` } as CSSProperties}
                />
              )
            })}

            {LOCKERS.map((l) => {
              const isActive = (hiddenIn && l.id === hiddenIn) || (!hiddenIn && interactableLocker === l.id)
              return (
                <img
                  key={l.id}
                  className={`dbd-locker ${isActive ? "dbd-locker--active" : ""}`}
                  src="/DBD/world/locker.png"
                  alt="Locker"
                  draggable={false}
                  style={{ "--x": `${l.x}%`, "--y": `${l.y}%`, "--w": l.w, "--lock-x-fix": l.lockXFix } as CSSProperties}
                />
              )
            })}

            {HOOKS.map((h) => (
              <img
                key={h.id}
                className="dbd-hook"
                src="/DBD/world/hook.png"
                alt="Hook"
                draggable={false}
                style={{ "--x": `${h.x}%`, "--y": `${h.y}%`, "--w": h.w } as CSSProperties}
              />
            ))}

            {killerKickingUI ? (
              <div
                className={`dbd-killer dbd-killer--kick ${killerKickFacing === "right" ? "dbd-killer--flip" : ""}`}
                style={
                  {
                    "--x": `${(kickedGenPos?.x ?? killerPos.x)}%`,
                    "--y": `${(kickedGenPos?.y ?? killerPos.y)}%`,
                    "--w": "12%",
                    "--killer-scale": "1.25",
                  } as CSSProperties
                }
              >
                <img className="dbd-killer__img" src="/DBD/killer/gen-kick.png" alt="Killer" draggable={false} />
              </div>
            ) : (
              <div
                className={`dbd-killer ${killerFacing === "right" ? "dbd-killer--flip" : ""}`}
                style={
                  {
                    "--x": `${killerPos.x}%`,
                    "--y": `${killerPos.y}%`,
                    "--w": "12%",
                    "--killer-scale": String(killerRenderScale),
                  } as CSSProperties
                }
              >
                <img className="dbd-killer__img" src={killerSrc} alt="Killer" draggable={false} />
              </div>
            )}

            {hookedHookPos && playerHookedUI && (
              <div
                className="dbd-player"
                style={
                  {
                    "--x": `${hookedHookPos.x}%`,
                    "--y": `${hookedHookPos.y}%`,
                    "--w": "12%",
                    "--scale": "0.78",
                  } as CSSProperties
                }
              >
                <img className="dbd-player__img" src="/DBD/player/hung.png" alt="Player" draggable={false} />
              </div>
            )}

            {showPlayerDown && downPos && (
              <div
                className="dbd-player"
                style={
                  {
                    "--x": `${downPos.x}%`,
                    "--y": `${downPos.y}%`,
                    "--w": "12%",
                    "--scale": "1",
                  } as CSSProperties
                }
              >
                <img className="dbd-player__img" src="/DBD/player/injured.png" alt="Player" draggable={false} />
              </div>
            )}

            {showPlayerNormal && (
              <div
                className={`dbd-player ${playerHurtUI ? "dbd-player--hurt" : ""} ${facing === "right" ? "dbd-player--flip" : ""}`}
                style={
                  {
                    "--x": `${playerPos.x}%`,
                    "--y": `${playerPos.y}%`,
                    "--w": "12%",
                    "--scale": facing === "back" && isStep ? "0.67" : "1",
                  } as CSSProperties
                }
              >
                <img className="dbd-player__img" src={playerSrcNormal} alt="Player" draggable={false} />
              </div>
            )}

            {isInteracting && !hiddenIn && !playerDownUI && !playerCarriedUI && !playerHookedUI && (
              <div className="dbd-progress">
                <div className="dbd-progress__track">
                  {activeGenDecay !== null && (
                    <div className="dbd-progress__baseline" style={{ left: `${clamp(activeGenDecay, 0, 100)}%` }} />
                  )}
                  <div className="dbd-progress__fill" style={{ width: `${clamp(activeProgress, 0, 100)}%` }} />
                </div>
              </div>
            )}

            {skillUI.active && !playerDownUI && !playerCarriedUI && (
              <div className="skill-overlay">
                <div className="skill-wrap">
                  <svg className="skill-svg" viewBox="0 0 240 240" aria-hidden="true">
                    <defs>
                      <filter id="redGlow" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur stdDeviation="2.4" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    <path
                      d={describeArc(cx, cy, r, SWEEP_START, SWEEP_START + SWEEP_DEG)}
                      fill="none"
                      stroke="rgba(255,255,255,0.55)"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />

                    <path d={zonePath} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="12" strokeLinecap="round" />

                    <line
                      x1={redInner.x}
                      y1={redInner.y}
                      x2={redOuter.x}
                      y2={redOuter.y}
                      stroke="rgba(255,0,0,0.95)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      filter="url(#redGlow)"
                    />
                  </svg>

                  <div className="skill-key">SPACE</div>
                </div>
              </div>
            )}

            {worldHints.map((h, i) => (
              <div
                key={`${h.x}-${h.y}-${i}`}
                className="dbd-hint-world"
                style={{ "--x": `${h.x}%`, "--y": `${h.y}%` } as CSSProperties}
                aria-hidden="true"
              >
                <div className="dbd-hint">
                  <span className="dbd-hint__key">{h.key}</span>
                  <span>{h.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {gameOverUI && (
          <div className="dbd-end" role="dialog" aria-label="Game Over">
            <img className="dbd-end__img" src="/DBD/world/game-over.png" alt="Game Over" draggable={false} />
            <button className="dbd-end__btn" type="button" onClick={resetGame}>
              Retry
            </button>
          </div>
        )}

        {winUI && (
          <div className="dbd-end" role="dialog" aria-label="You Win">
            <img className="dbd-end__img" src="/DBD/world/win.png" alt="Win" draggable={false} />

            <div className="dbd-end__actions">
              <button className="dbd-end__btn" type="button" onClick={resetGame}>
                Retry
              </button>

              <button className="dbd-end__btn dbd-end__btn--primary" type="button" onClick={handleContinue}>
                Continue
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
