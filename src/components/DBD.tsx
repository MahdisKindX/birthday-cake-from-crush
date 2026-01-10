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

type Target = { kind: "gen"; id: string } | { kind: "gate" } | null
type KillerStunKind = "none" | "hit" | "pallet"
type SkillMode = "none" | "gen" | "hook"
type GameState = "playing" | "gameover" | "win"

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

export function DBD() {
  const GENS = useMemo(
    () =>
      [
        { id: "g1", x: 12, y: 58, w: "15%" },
        { id: "g2", x: 11, y: 79, w: "15%" },
        { id: "g3", x: 90, y: 45, w: "15%" },
        { id: "g4", x: 84, y: 76, w: "15%" },
      ] as const,
    []
  )

  const PALLETS = useMemo(
    () =>
      [
        { id: "p1", x: 19, y: 48, w: "20%", r: -12 },
        { id: "p2", x: 14.5, y: 65, w: "20%", r: -6 },
        { id: "p3", x: 84, y: 32, w: "20%", r: 10 },
        { id: "p4", x: 78, y: 64, w: "20%", r: 6 },
      ] as const,
    []
  )

  const LOCKERS = useMemo(
    () =>
      [
        { id: "l1", x: 21.2, y: 16, w: "13.5%", lockXFix: "-12px" },
        { id: "l2", x: 4, y: 44, w: "13.5%", lockXFix: "-12px" },
        { id: "l3", x: 65, y: 19.5, w: "13.5%", lockXFix: "-12px" },
        { id: "l4", x: 91.4, y: 24.5, w: "13.5%", lockXFix: "-12px" },
        { id: "l5", x: 91.5, y: 55, w: "13.5%", lockXFix: "-12px" },
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
  type GenState = Record<GenId, { progress: number; done: boolean }>

  type PalletId = (typeof PALLETS)[number]["id"]
  type PalletState = Record<PalletId, { down: boolean }>

  type LockerId = (typeof LOCKERS)[number]["id"]
  type HookId = (typeof HOOKS)[number]["id"]

  const initialGens = useMemo<GenState>(
    () => ({
      g1: { progress: 0, done: false },
      g2: { progress: 0, done: false },
      g3: { progress: 0, done: false },
      g4: { progress: 0, done: false },
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

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const PANEL_W = 520
  const PANEL_PAD = 18
  const [panelPos, setPanelPos] = useState({ leftX: PANEL_PAD, rightX: PANEL_PAD, w: PANEL_W })

  useEffect(() => {
    const compute = () => {
      const el = viewportRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const leftX = Math.max(PANEL_PAD, rect.left - PANEL_W - PANEL_PAD)
      const rightX = Math.min(window.innerWidth - PANEL_W - PANEL_PAD, rect.right + PANEL_PAD)
      setPanelPos({ leftX, rightX, w: PANEL_W })
    }

    const onResize = () => compute()

    const ro = new ResizeObserver(() => compute())
    if (viewportRef.current) ro.observe(viewportRef.current)

    compute()
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      ro.disconnect()
    }
  }, [])

  const [gameState, setGameState] = useState<GameState>("playing")
  const gameStateRef = useRef<GameState>("playing")

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

  const HOOK_FAIL_MAX = 3
  const hookFailRef = useRef(0)

  const [hookCountUI, setHookCountUI] = useState(0)
  const hookCountRef = useRef(0)

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

  const playerBoostUntilRef = useRef<number>(0)
  const playerInvulnUntilRef = useRef<number>(0)
  const [playerHurtUI, setPlayerHurtUI] = useState(false)
  const playerHurtUIRef = useRef(false)

  const playerHitsRef = useRef<number>(0)

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
  const chaseMusicRef = useRef<HTMLAudioElement | null>(null)
  const musicStartedRef = useRef(false)

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
  const endRef = useRef<HTMLAudioElement | null>(null)

  const gensCompletePlayedRef = useRef(false)
  const doorOpeningPlayedRef = useRef(false)

  const allGensDone = useMemo(() => Object.values(gens).every((g) => g.done), [gens])
  const gensLeft = useMemo(() => Object.values(gens).filter((g) => !g.done).length, [gens])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

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

  useEffect(() => {
    const VOL = 0.1

    const run = new Audio("/DBD/sounds/gen-running.mp3")
    run.loop = true
    run.volume = VOL
    runAudioRef.current = run

    const chase = new Audio("/DBD/sounds/chase.mp3")
    chase.loop = true
    chase.volume = 0.05
    chaseMusicRef.current = chase

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
    a13.volume = 0.14
    unhookFailRef.current = a13

    const a14 = new Audio("/DBD/sounds/end.mp3")
    a14.volume = 0.05
    endRef.current = a14

    return () => {
      try {
        run.pause()
      } catch {}
      try {
        chase.pause()
      } catch {}
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
    if (!allGensDone) return

    if (!gensCompletePlayedRef.current) {
      gensCompletePlayedRef.current = true
      const a = gensCompleteRef.current
      if (a) {
        try {
          a.pause()
          a.currentTime = 0
          void a.play()
        } catch {}
      }
    }

    setGatePulse(true)
    if (gatePulseTRef.current) window.clearTimeout(gatePulseTRef.current)
    gatePulseTRef.current = window.setTimeout(() => setGatePulse(false), 5200)

    return () => {
      if (gatePulseTRef.current) window.clearTimeout(gatePulseTRef.current)
      gatePulseTRef.current = null
    }
  }, [allGensDone])

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

  const hiddenLockerPos = useMemo(() => {
    if (!hiddenIn) return null
    return LOCKERS.find((l) => l.id === hiddenIn) ?? null
  }, [hiddenIn, LOCKERS])

  const nearestPallet = useMemo(() => {
    let best: { id: PalletId; d: number } | null = null
    for (const p of PALLETS) {
      const st = palletsRef.current[p.id]
      if (!st || st.down) continue
      const d = pxDistTo(playerPos, p)
      if (!best || d < best.d) best = { id: p.id, d }
    }
    return best
  }, [PALLETS, playerPos.x, playerPos.y])

  const interactablePallet: PalletId | null = useMemo(() => {
    if (!nearestPallet) return null
    if (nearestPallet.d > RANGE_PALLET) return null
    return nearestPallet.id
  }, [nearestPallet])

  const playOneShot = (ref: MutableRefObject<HTMLAudioElement | null>) => {
    const a = ref.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
      void a.play()
    } catch {}
  }

  const ensureChaseMusic = () => {
    if (musicStartedRef.current) return
    musicStartedRef.current = true
    const a = chaseMusicRef.current
    if (!a) return
    try {
      a.loop = true
      if (a.paused) a.currentTime = 0
      void a.play()
    } catch {}
  }

  const playEnd = () => {
    const chase = chaseMusicRef.current
    if (chase) {
      try {
        chase.pause()
      } catch {}
    }
    const a = endRef.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
      void a.play()
    } catch {}
  }

  const startRun = () => {
    const a = runAudioRef.current
    if (!a) return
    try {
      a.loop = true
      if (a.paused) a.currentTime = 0
      void a.play()
    } catch {}
  }

  const stopRun = () => {
    const a = runAudioRef.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
    } catch {}
  }

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
    const base = 6500
    const swing = 3500
    const faster = 1200 * difficulty01
    const ms = Math.max(5200, base + Math.random() * swing - faster)
    nextSkillAtRef.current = now + ms
  }

  const spawnSkill = (now: number, difficulty01: number, mode: SkillMode) => {
    const zoneWidth = clamp(0.18 - difficulty01 * 0.08, 0.09, 0.18)

    const minStart = 0.18
    const maxStart = 0.92 - zoneWidth
    const zoneStart = clamp(minStart + Math.random() * Math.max(0, maxStart - minStart), minStart, maxStart)

    const duration = clamp(2050 - difficulty01 * 320 + (Math.random() * 260 - 130), 1400, 2400)

    skillModeRef.current = mode
    skillRef.current = {
      active: true,
      startedAt: now,
      duration,
      zoneStart,
      zoneWidth,
      resolved: false,
    }

    setSkillUI({ active: true, p: 0, zoneStart, zoneWidth })
    playOneShot(skillAppearRef)
  }

  const applyGenDelta = (id: GenId, delta: number) => {
    const g = gensRef.current[id]
    if (!g || g.done) return

    const next = clamp(g.progress + delta, 0, 100)
    const becameDone = !g.done && next >= 100

    gensRef.current[id] = { progress: next, done: becameDone ? true : g.done }
    setGens({ ...gensRef.current })

    if (becameDone) {
      stopRun()
      playOneShot(genDoneRef)
      stopInteract()
    }
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
      applyGenDelta(id, 18)
    } else {
      playOneShot(genBlowRef)
      applyGenDelta(id, -6)
    }

    const difficulty01 = clamp((gensRef.current[id]?.progress ?? 0) / 100, 0, 1)
    scheduleNextSkill(now, difficulty01)
  }

  const gameOver = () => {
    if (gameStateRef.current !== "playing") return
    setGameState("gameover")
    playEnd()
    stopRun()
    clearMoveKeys()
    if (stepRef.current) setIsStep(false)
    if (skillRef.current.active) clearSkill()
  }

  const winGame = () => {
    if (gameStateRef.current !== "playing") return
    setGameState("win")
    playEnd()
    stopRun()
    clearMoveKeys()
    if (stepRef.current) setIsStep(false)
    if (skillRef.current.active) clearSkill()
  }

  const beginHookEscape = (now: number) => {
    hookEscapeDoneRef.current = 0
    hookFailRef.current = 0
    hookNextSkillAtRef.current = now + 900
  }

  const applyHookFail = () => {
    playOneShot(unhookFailRef)
    hookFailRef.current += 1
    if (hookFailRef.current >= HOOK_FAIL_MAX) {
      gameOver()
    }
  }

  const resolveHookSkill = (now: number, success: boolean) => {
    skillRef.current.resolved = true
    skillRef.current.active = false
    skillModeRef.current = "none"
    setSkillUI({ active: false, p: 0, zoneStart: 0, zoneWidth: 0 })

    if (!playerHookedRef.current) return
    if (gameStateRef.current !== "playing") return

    if (success) {
      playOneShot(skillSuccessRef)
      hookEscapeDoneRef.current = Math.min(HOOK_ESCAPE_NEEDED, hookEscapeDoneRef.current + 1)

      if (hookEscapeDoneRef.current >= HOOK_ESCAPE_NEEDED) {
        const hookId = hookedHookIdRef.current
        const hook = hookId ? HOOKS.find((h) => h.id === hookId) : null

        playerHookedRef.current = false
        setPlayerHookedUI(false)
        hookedHookIdRef.current = null
        setHookedHookIdUI(null)

        playerHitsRef.current = 0

        playerDownRef.current = false
        setPlayerDownUI(false)
        playerDownPosRef.current = null

        clearMoveKeys()
        setIsStep(false)

        if (hook) {
          const ox = hook.x + 3.2
          const oy = hook.y + 2.2
          setPlayerPos({ x: clamp(ox, 3.5, 96.5), y: clamp(oy, 3.5, 96.5) })
        }

        playerInvulnUntilRef.current = now + 1400
        playerBoostUntilRef.current = now + 1600

        killerIgnorePlayerUntilRef.current = Math.max(killerIgnorePlayerUntilRef.current, now + 4200)
        killerChasingRef.current = false

        hookEscapeDoneRef.current = 0
        hookFailRef.current = 0
        hookNextSkillAtRef.current = 0
        return
      }
    } else {
      applyHookFail()
    }

    hookNextSkillAtRef.current = now + (1300 + Math.random() * 1300)
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
    if (playerDownRef.current || playerCarriedRef.current || playerHookedRef.current) return false

    const currentlyHidden = hiddenInRef.current
    if (currentlyHidden) {
      playOneShot(lockerCloseRef)

      hiddenInRef.current = null
      setHiddenIn(null)
      killerChasingRef.current = false
      clearMoveKeys()
      setIsStep(false)

      const out = lastOutsidePosRef.current
      setPlayerPos({
        x: clamp(out.x, 3.5, 96.5),
        y: clamp(out.y, 3.5, 96.5),
      })
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
    if (playerDownRef.current || playerCarriedRef.current || playerHookedRef.current) return false
    if (!interactablePallet) return false

    palletsRef.current[interactablePallet] = { down: true }
    setPallets({ ...palletsRef.current })
    playOneShot(palletDropRef)

    const palletLayout = PALLETS.find((pp) => pp.id === interactablePallet)
    if (palletLayout) {
      const kpos = killerPosRef.current
      const dK = pxDistTo(kpos, palletLayout)
      const KILLER_PALLET_STUN_RANGE = 10.0
      if (dK <= KILLER_PALLET_STUN_RANGE) {
        const now = performance.now()
        const nextUntil = now + 3000
        if (nextUntil > killerStunUntilRef.current) killerStunUntilRef.current = nextUntil
        killerStunKindRef.current = "pallet"
        if (killerStunKindUIRef.current !== "pallet") {
          killerStunKindUIRef.current = "pallet"
          setKillerStunKindUI("pallet")
        }
        clearAllGenStuff()
      }
    }

    return true
  }

  const startInteractOn = (t: Target) => {
    if (!t) return
    if (hiddenInRef.current) return
    if (playerDownRef.current || playerCarriedRef.current || playerHookedRef.current) return
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      ensureChaseMusic()

      if (gameStateRef.current !== "playing") {
        if (e.key === " " || e.code === "Space") e.preventDefault()
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

        if (interactingRef.current) {
          if (attemptSkillPress()) return
          stopInteract()
          return
        }

        const t = interactableTarget
        if (t && !hiddenInRef.current) {
          startInteractOn(t)
          return
        }

        if (hiddenInRef.current) {
          tryToggleLocker()
          return
        }

        if (interactableLocker) {
          tryToggleLocker()
          return
        }

        if (interactablePallet) {
          tryDropPallet()
          return
        }
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
  }, [interactableTarget, interactableLocker, interactablePallet, allGensDone])

  useEffect(() => {
    const PAD = 3.5

    const STEP_PULSE_MS = 1000
    const STEP_SHOW_MS = 220

    const BASE_GEN_RATE = 2.75
    const BASE_GATE_RATE = 5.5

    const PLAYER_BASE_SPEED = 12
    const PLAYER_BOOST_MULT = 1.75
    const PLAYER_BOOST_MS = 2000

    const KILLER_SPEED = 18
    const KILLER_CARRY_SPEED = 16

    const KILLER_START_CHASE_RANGE = 60.0
    const KILLER_STOP_RANGE = 2.0

    const KILLER_HIT_RANGE = 9.0
    const KILLER_HIT_STUN_MS = 1000

    const KILLER_PICKUP_RANGE = 2.0
    const KILLER_HOOK_RANGE = 2.5

    const HOOK_SKILL_RETRY_MS = 900

    const pickWanderTarget = () => ({
      x: PAD + Math.random() * (100 - PAD * 2),
      y: PAD + Math.random() * (100 - PAD * 2),
    })

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

    const tick = (t: number) => {
      const last = lastRef.current ?? t
      const dt = (t - last) / 1000
      lastRef.current = t

      if (gameStateRef.current !== "playing") {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const killerStunned = t < killerStunUntilRef.current
      const stunKindNow: KillerStunKind = killerStunned ? killerStunKindRef.current : "none"
      setStunUIIfNeeded(stunKindNow)

      const boostActive =
        !playerDownRef.current && !playerCarriedRef.current && !playerHookedRef.current && t < playerBoostUntilRef.current
      setPlayerHurtIfNeeded(boostActive)

      {
        const kpos = killerPosRef.current
        const playerHidden = !!hiddenInRef.current
        const playerDown = playerDownRef.current
        const playerCarried = playerCarriedRef.current
        const playerHooked = playerHookedRef.current

        const ignorePlayer = t < killerIgnorePlayerUntilRef.current

        if (
          !killerStunned &&
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

            playerHitsRef.current = Math.min(2, playerHitsRef.current + 1)

            if (playerHitsRef.current >= 2) {
              if (hookCountRef.current >= 2) {
                gameOver()
              } else {
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
              }
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

        if (playerHidden || playerHooked || playerCarried || playerDown || ignorePlayer) {
          killerChasingRef.current = false
        } else if (!killerChasingRef.current) {
          const dToPlayer = pxDistTo(kpos, playerPosRef.current)
          if (dToPlayer <= KILLER_START_CHASE_RANGE) killerChasingRef.current = true
        }

        if (killerStunned) {
          if (killerStepRef.current) setKillerIsStep(false)
        } else {
          let tx = kpos.x
          let ty = kpos.y
          let speed = KILLER_SPEED

          if (playerHooked || ignorePlayer) {
            if (!killerWanderTargetRef.current || t >= killerNextWanderPickAtRef.current) {
              killerWanderTargetRef.current = pickWanderTarget()
              killerNextWanderPickAtRef.current = t + (2600 + Math.random() * 2600)
            }
            tx = killerWanderTargetRef.current.x
            ty = killerWanderTargetRef.current.y
          } else if (playerCarried) {
            const hookId = carryHookTargetRef.current
            const hook = hookId ? HOOKS.find((h) => h.id === hookId) : null
            if (hook) {
              tx = hook.x
              ty = hook.y
              speed = KILLER_CARRY_SPEED

              const dHook = pxDistTo(kpos, hook)
              if (dHook <= KILLER_HOOK_RANGE) {
                setPlayerCarriedIfNeeded(false)
                setPlayerDownIfNeeded(false)
                setPlayerHookedIfNeeded(true)
                setHookedHookIdIfNeeded(hook.id)

                hookCountRef.current = Math.min(2, hookCountRef.current + 1)
                setHookCountUI(hookCountRef.current)

                playOneShot(hookedRef)
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

            const nx = clamp(kpos.x + (ux / ASPECT) * speed * dt, PAD, 100 - PAD)
            const ny = clamp(kpos.y + uy * speed * dt, PAD, 100 - PAD)

            if (nx !== kpos.x || ny !== kpos.y) setKillerPos({ x: nx, y: ny })
          } else {
            if (killerStepRef.current) setKillerIsStep(false)
          }
        }
      }

      const gateOpenNow = gateRef.current.opened
      if (!hiddenInRef.current && !playerDownRef.current && !playerCarriedRef.current && !playerHookedRef.current && gateOpenNow) {
        const p = playerPosRef.current
        const inExitX = Math.abs(p.x - GATE.x) <= 12
        const inExitY = p.y <= 3.2
        if (inExitX && inExitY) {
          winGame()
        }
      }

      if (playerHookedRef.current) {
        clearAllGenStuff()
        stopRun()
        clearMoveKeys()
        if (stepRef.current) setIsStep(false)

        if (!skillRef.current.active && t >= hookNextSkillAtRef.current) {
          spawnSkill(t, 0.55, "hook")
        }

        if (skillRef.current.active && skillModeRef.current === "hook") {
          const p = clamp((t - skillRef.current.startedAt) / skillRef.current.duration, 0, 1)
          setSkillUI({ active: true, p, zoneStart: skillRef.current.zoneStart, zoneWidth: skillRef.current.zoneWidth })

          if (p >= 1 && !skillRef.current.resolved) {
            clearSkill()
            applyHookFail()
            hookNextSkillAtRef.current = t + HOOK_SKILL_RETRY_MS
          }
        } else {
          if (skillUI.active && skillModeRef.current !== "gen") {
            setSkillUI((s) => (s.active ? { active: false, p: 0, zoneStart: 0, zoneWidth: 0 } : s))
          }
        }
      } else if (!hiddenInRef.current && !playerDownRef.current && !playerCarriedRef.current) {
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

          setPlayerPos((p) => ({
            x: clamp(p.x + mx * speed * dt, PAD, 100 - PAD),
            y: clamp(p.y + my * speed * dt, PAD, 100 - PAD),
          }))
        } else {
          if (stepRef.current) setIsStep(false)
        }

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
                  gensRef.current[id] = { progress: after, done }
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
                  if (skillUI.active && skillModeRef.current === "gen") setSkillUI({ active: false, p: 0, zoneStart: 0, zoneWidth: 0 })
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
        clearAllGenStuff()
        stopRun()
        clearMoveKeys()
        if (stepRef.current) setIsStep(false)
        if (skillModeRef.current === "gen") clearSkill()
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [GENS, HOOKS, PALLETS, GATE, allGensDone])

  const playerSrcNormal = (() => {
    if (facing === "front") return isStep ? "/DBD/player/front-step.png" : "/DBD/player/front.png"
    if (facing === "back") return isStep ? "/DBD/player/back-step.png" : "/DBD/player/back.png"
    return isStep ? "/DBD/player/side-step.png" : "/DBD/player/side.png"
  })()

  const faceSrc = (() => {
    if (playerHitsRef.current >= 1) return "/DBD/hud/injured.png"
    return "/DBD/hud/normal.png"
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
    if (killerStunKindUI === "pallet") return 0.72
    if (playerCarriedUI) return 1.2
    if (killerIsStep) return 1
    return 1.3
  })()

  const hudPos = useMemo(() => {
    if (interactingRef.current && activeTargetRef.current) {
      const t = activeTargetRef.current
      if (t.kind === "gen") {
        const g = GENS.find((x) => x.id === t.id)
        if (!g) return null
        return { x: g.x, y: g.y, kind: "gen" as const, id: t.id }
      }
      return { x: GATE.x, y: GATE.y, kind: "gate" as const, id: null as any }
    }
    if (interactableTarget) {
      if (interactableTarget.kind === "gen") {
        const g = GENS.find((x) => x.id === interactableTarget.id)
        if (!g) return null
        return { x: g.x, y: g.y, kind: "gen" as const, id: interactableTarget.id }
      }
      return { x: GATE.x, y: GATE.y, kind: "gate" as const, id: null as any }
    }
    return null
  }, [GENS, GATE.x, GATE.y, interactableTarget])

  const palletHintPos = useMemo(() => {
    if (!interactablePallet) return null
    const p = PALLETS.find((x) => x.id === interactablePallet)
    return p ? { x: p.x, y: p.y } : null
  }, [interactablePallet, PALLETS])

  const activeProgress = useMemo(() => {
    if (!isInteracting || !activeTarget) return 0
    if (activeTarget.kind === "gen") return gens[activeTarget.id as GenId]?.progress ?? 0
    return gate.progress
  }, [isInteracting, activeTarget, gens, gate.progress])

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

  const showPlayerNormal = !hiddenIn && !playerCarriedUI && !playerHookedUI && !playerDownUI
  const showPlayerDown = !hiddenIn && playerDownUI && !playerCarriedUI && !playerHookedUI && !!downPos

  const resetGame = () => {
    setGameState("playing")
    gameStateRef.current = "playing"

    gensCompletePlayedRef.current = false
    doorOpeningPlayedRef.current = false

    gensRef.current = { ...initialGens }
    setGens({ ...initialGens })

    palletsRef.current = { ...initialPallets }
    setPallets({ ...initialPallets })

    gateRef.current = { progress: 0, opened: false }
    setGate({ progress: 0, opened: false })

    setGatePulse(false)
    if (gatePulseTRef.current) window.clearTimeout(gatePulseTRef.current)
    gatePulseTRef.current = null

    setPlayerPos({ x: 6.5, y: 70.5 })
    setFacing("front")
    setIsStep(false)

    setActiveTarget(null)
    setIsInteracting(false)
    activeTargetRef.current = null
    interactingRef.current = false

    hiddenInRef.current = null
    setHiddenIn(null)
    lastOutsidePosRef.current = { x: 6.5, y: 70.5 }

    playerDownRef.current = false
    setPlayerDownUI(false)
    playerDownPosRef.current = null

    playerCarriedRef.current = false
    setPlayerCarriedUI(false)

    playerHookedRef.current = false
    setPlayerHookedUI(false)
    hookedHookIdRef.current = null
    setHookedHookIdUI(null)
    carryHookTargetRef.current = null

    hookEscapeDoneRef.current = 0
    hookNextSkillAtRef.current = 0
    hookFailRef.current = 0

    hookCountRef.current = 0
    setHookCountUI(0)

    killerChasingRef.current = false
    killerWanderTargetRef.current = null
    killerNextWanderPickAtRef.current = 0

    killerStunUntilRef.current = 0
    killerStunKindRef.current = "none"
    killerStunKindUIRef.current = "none"
    setKillerStunKindUI("none")

    killerIgnorePlayerUntilRef.current = 0
    playerBoostUntilRef.current = 0
    playerInvulnUntilRef.current = 0
    playerHitsRef.current = 0
    playerHurtUIRef.current = false
    setPlayerHurtUI(false)

    setKillerPos({ x: 62, y: 44 })
    setKillerFacing("left")
    setKillerIsStep(false)

    clearMoveKeys()
    clearSkill()
    stopRun()

    const endA = endRef.current
    if (endA) {
      try {
        endA.pause()
        endA.currentTime = 0
      } catch {}
    }

    const chase = chaseMusicRef.current
    if (chase) {
      try {
        chase.pause()
        chase.currentTime = 0
      } catch {}
    }
    musicStartedRef.current = false
  }

  const showOverlay = gameState !== "playing"
  const overlayImg = gameState === "gameover" ? "/DBD/world/game-over.png" : "/DBD/world/win.png"

  const hintText = (() => {
    if (gameStateRef.current !== "playing") return null
    if (playerDownUI || playerCarriedUI || playerHookedUI) return null
    if (hiddenInRef.current) return "Press Space to exit"
    if (interactingRef.current) return null
    if (hudPos?.kind === "gen") return "Press Space to repair"
    if (hudPos?.kind === "gate") return "Press Space to open"
    return null
  })()

  const showLockerHint = !hiddenIn && interactableLocker && !playerDownUI && !playerCarriedUI && !playerHookedUI && !interactingRef.current
  const showPalletHint = !hiddenIn && !!interactablePallet && !playerDownUI && !playerCarriedUI && !playerHookedUI && !interactingRef.current

  return (
    <>
      <style>{`
        .dbd-shell {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: #000;
        }

        .dbd-stage {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }

        .dbd-viewport {
          position: relative;
          height: 100vh;
          aspect-ratio: 1.50037 / 1;
          width: auto;
          max-width: 100vw;
          max-height: 100vh;
          pointer-events: auto;
        }

        .dbd-side {
          position: absolute;
          top: 18px;
          bottom: 18px;
          width: 520px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          pointer-events: auto;
          z-index: 50;
        }

        .dbd-bloody-title {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-weight: 900;
          font-size: 28px;
          line-height: 1.08;
          letter-spacing: 0.5px;
          color: #a90000;
          text-transform: uppercase;
          text-shadow:
            0 2px 0 rgba(0,0,0,0.85),
            0 0 14px rgba(255,0,0,0.55),
            0 0 28px rgba(255,0,0,0.25);
          filter: drop-shadow(0 18px 26px rgba(0,0,0,0.55));
          user-select: none;
        }

        .dbd-side__card {
          border-radius: 22px;
          padding: 18px 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 18px 42px rgba(0,0,0,0.55);
        }

        .dbd-side__title {
          margin: 0 0 14px 0;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 22px;
          line-height: 1.25;
          font-weight: 800;
          color: rgba(255,255,255,0.92);
        }

        .dbd-legend {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .dbd-legend__row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 20px;
          font-weight: 800;
          color: rgba(255,255,255,0.92);
        }

        .dbd-keycap {
          min-width: 70px;
          height: 52px;
          padding: 0 16px;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.65);
          border: 2px solid rgba(255,255,255,0.18);
          box-shadow: 0 10px 26px rgba(0,0,0,0.45);
          font-size: 21px;
          font-weight: 900;
          letter-spacing: 0.6px;
          user-select: none;
        }

        .dbd-hud {
          display: flex;
          flex-direction: column;
          gap: 18px;
          align-items: center;
        }

        .dbd-hud__row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
        }

        .dbd-hud__num {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-weight: 1000;
          font-size: 120px;
          line-height: 1;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 18px 42px rgba(0,0,0,0.65);
          width: auto;
          min-width: 0;
          text-align: right;
          user-select: none;
        }

        .dbd-hud__icon {
          width: 400px;
          height: 400px;
          object-fit: contain;
          display: block;
          filter: drop-shadow(0 20px 36px rgba(0,0,0,0.7));
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          flex: 0 0 auto;
        }

        .dbd-hud__face {
          width: 400px;
          height: 400px;
          object-fit: contain;
          display: block;
          filter: drop-shadow(0 20px 36px rgba(0,0,0,0.7));
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          flex: 0 0 auto;
        }

        .dbd-hook-tally {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .dbd-hook-tally__i {
          width: 22px;
          height: 190px;
          border-radius: 16px;
          border: 5px solid rgba(0,0,0,0.95);
          background: transparent;
          box-shadow: 0 18px 36px rgba(0,0,0,0.55);
          flex: 0 0 auto;
        }

        .dbd-hook-tally__i.is-filled {
          background: rgba(255,255,255,0.92);
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
          transition: filter 520ms ease;
        }

        .dbd-gate--pulse {
          filter:
            brightness(1.9)
            contrast(1.2)
            drop-shadow(0 0 18px rgba(255,255,255,0.9))
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

        .dbd-gen { width: clamp(140px, var(--w, 15%), 320px); }

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
            drop-shadow(0 0 28px rgba(255, 0, 0, 0.55));
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

        .dbd-hint {
          position: absolute;
          left: var(--x, 50%);
          top: var(--y, 50%);
          transform: translate(-50%, calc(-100% - 26px));
          z-index: 12;
          pointer-events: none;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
        }

        .dbd-hint__pill {
          color: #eaeaea;
          background: rgba(0,0,0,0.62);
          border: 1px solid rgba(255,255,255,0.14);
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 18px;
          line-height: 1.2;
          white-space: nowrap;
          box-shadow: 0 10px 26px rgba(0,0,0,0.35);
        }

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
          height: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.14);
          border: 1px solid rgba(255,255,255,0.14);
          overflow: hidden;
          box-shadow: 0 10px 26px rgba(0,0,0,0.35);
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
          width: min(300px, 72vw);
          height: min(300px, 72vw);
          filter: drop-shadow(0 14px 26px rgba(0,0,0,0.45));
        }

        .skill-svg {
          width: 100%;
          height: 100%;
          display: block;
        }

        .skill-center {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: grid;
          place-items: center;
          gap: 10px;
        }

        .skill-pill {
          padding: 12px 20px;
          border-radius: 14px;
          background: rgba(0,0,0,0.65);
          border: 2px solid rgba(255,255,255,0.85);
          color: rgba(255,255,255,0.95);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 22px;
          letter-spacing: 0.6px;
          line-height: 1;
          user-select: none;
        }

        .dbd-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          background: rgba(0,0,0,0.92);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 22px;
          padding: 24px 18px;
          box-sizing: border-box;
        }

        .dbd-overlay__img {
          max-width: 92vw;
          max-height: 82vh;
          width: auto;
          height: auto;
          object-fit: contain;
          display: block;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          filter: drop-shadow(0 22px 44px rgba(0,0,0,0.75));
        }

        .dbd-overlay__btn {
          margin-top: 10px;
          appearance: none;
          border: 2px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.92);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-weight: 900;
          font-size: 26px;
          padding: 16px 28px;
          border-radius: 18px;
          cursor: pointer;
          box-shadow: 0 18px 42px rgba(0,0,0,0.55);
        }
        .dbd-overlay__btn:active { transform: translateY(1px); }
      `}</style>

      <div className="dbd-shell">
        <div className="dbd-stage">
          <div
            ref={viewportRef}
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
              const src = state.done ? "/DBD/world/gen-on.png" : "/DBD/world/gen-off.png"
              return (
                <img
                  key={g.id}
                  className="dbd-gen"
                  src={src}
                  alt="Generator"
                  draggable={false}
                  style={{ "--x": `${g.x}%`, "--y": `${g.y}%`, "--w": g.w } as CSSProperties}
                />
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

            {hookedHookPos && playerHookedUI && (
              <div
                className="dbd-player"
                style={
                  {
                    "--x": `${hookedHookPos.x}%`,
                    "--y": `${hookedHookPos.y}%`,
                    "--w": "12%",
                    "--scale": "0.65",
                  } as CSSProperties
                }
              >
                <img className="dbd-player__img" src="/DBD/player/hung.png" alt="Player (hooked)" draggable={false} />
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
                <img className="dbd-player__img" src="/DBD/player/injured.png" alt="Player (down)" draggable={false} />
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

            {hintText && hudPos && !hiddenIn && !playerDownUI && !playerCarriedUI && !playerHookedUI && (
              <div className="dbd-hint" style={{ "--x": `${hudPos.x}%`, "--y": `${hudPos.y}%` } as CSSProperties}>
                <div className="dbd-hint__pill">{hintText}</div>
              </div>
            )}

            {showLockerHint && (
              <div
                className="dbd-hint"
                style={
                  {
                    "--x": `${(LOCKERS.find((l) => l.id === interactableLocker)?.x ?? 50)}%`,
                    "--y": `${(LOCKERS.find((l) => l.id === interactableLocker)?.y ?? 50)}%`,
                  } as CSSProperties
                }
              >
                <div className="dbd-hint__pill">Press Space to hide</div>
              </div>
            )}

            {showPalletHint && palletHintPos && (
              <div className="dbd-hint" style={{ "--x": `${palletHintPos.x}%`, "--y": `${palletHintPos.y}%` } as CSSProperties}>
                <div className="dbd-hint__pill">Press Space to drop</div>
              </div>
            )}

            {hiddenIn && hiddenLockerPos && (
              <div className="dbd-hint" style={{ "--x": `${hiddenLockerPos.x}%`, "--y": `${hiddenLockerPos.y}%` } as CSSProperties}>
                <div className="dbd-hint__pill">Press Space to exit</div>
              </div>
            )}

            {isInteracting && !hiddenIn && !playerDownUI && !playerCarriedUI && !playerHookedUI && (
              <div className="dbd-progress">
                <div className="dbd-progress__track">
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

                  <div className="skill-center">
                    <div className="skill-pill">Space</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="dbd-side" style={{ left: `${panelPos.leftX}px`, width: `${panelPos.w}px` }}>
          <div className="dbd-bloody-title">KNOCKOFF DEAD BY DAYLIGHT MASGU EDITION DEVELOPED BY MAHDOON</div>

          <div className="dbd-side__card">
            <div className="dbd-side__title">You became a pro player, show off your skills.</div>

            <div className="dbd-legend">
              <div className="dbd-legend__row">
                <span className="dbd-keycap">W</span>
                <span>Move up</span>
              </div>
              <div className="dbd-legend__row">
                <span className="dbd-keycap">A</span>
                <span>Move left</span>
              </div>
              <div className="dbd-legend__row">
                <span className="dbd-keycap">S</span>
                <span>Move down</span>
              </div>
              <div className="dbd-legend__row">
                <span className="dbd-keycap">D</span>
                <span>Move right</span>
              </div>
              <div className="dbd-legend__row">
                <span className="dbd-keycap">Space</span>
                <span>Interact, hide, drop, skill check</span>
              </div>
            </div>
          </div>
        </div>

        <div className="dbd-side" style={{ left: `${panelPos.rightX}px`, width: `${panelPos.w}px` }}>
          <div className="dbd-side__card" style={{ height: "100%" }}>
            <div className="dbd-hud">
              <div className="dbd-hud__row">
                <div className="dbd-hud__num">{gensLeft}</div>
                <img className="dbd-hud__icon" src="/DBD/hud/gen.png" alt="Gens left" draggable={false} />
              </div>

              <div className="dbd-hud__row">
                <img className="dbd-hud__face" src={faceSrc} alt="Health" draggable={false} />
                <div className="dbd-hook-tally" aria-label="Hook tally">
                  <div className={`dbd-hook-tally__i ${hookCountUI >= 1 ? "is-filled" : ""}`} />
                  <div className={`dbd-hook-tally__i ${hookCountUI >= 2 ? "is-filled" : ""}`} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {showOverlay && (
          <div className="dbd-overlay" role="dialog" aria-modal="true">
            <img className="dbd-overlay__img" src={overlayImg} alt={gameState === "win" ? "Win" : "Game over"} draggable={false} />
            <button className="dbd-overlay__btn" onClick={resetGame}>
              Retry
            </button>
          </div>
        )}
      </div>
    </>
  )
}
