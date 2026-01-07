// src/App.tsx
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Environment, OrbitControls } from "@react-three/drei"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Group } from "three"
import { Vector3 } from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { Candle } from "./models/candle"
import { Cake } from "./models/cake"
import { Table } from "./models/table"
import { PictureFrame } from "./models/pictureFrame"
import { Fireworks } from "./components/Fireworks"
import { BirthdayCard } from "./components/BirthdayCard"
import { ReflectionOverlay } from "./components/ReflectionOverlay"
import { CookieScene } from "./components/CookieScene"
import { GymScene } from "./components/GymScene"
import { ItalianScene } from "./components/ItalianScene"

import "./App.css"

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

type BirthdayCardConfig = {
  id: string
  image: string
  position: [number, number, number]
  rotation: [number, number, number]
}

type AnimatedSceneProps = {
  isPlaying: boolean
  onBackgroundFadeChange?: (opacity: number) => void
  onEnvironmentProgressChange?: (progress: number) => void
  candleLit: boolean
  onAnimationComplete?: () => void
  cards: ReadonlyArray<BirthdayCardConfig>
  activeCardId: string | null
  onToggleCard: (id: string) => void
}

const CAKE_START_Y = 10
const CAKE_END_Y = 0
const CAKE_DESCENT_DURATION = 3

const TABLE_START_Z = 30
const TABLE_END_Z = 0
const TABLE_SLIDE_DURATION = 0.7
const TABLE_SLIDE_START = CAKE_DESCENT_DURATION - TABLE_SLIDE_DURATION - 0.1

const CANDLE_START_Y = 5
const CANDLE_SINK = 0.13
const CANDLE_END_Y = -CANDLE_SINK
const CANDLE_DROP_DURATION = 1.2
const CANDLE_DROP_START = Math.max(CAKE_DESCENT_DURATION, TABLE_SLIDE_START + TABLE_SLIDE_DURATION) + 1.0

const totalAnimationTime = CANDLE_DROP_START + CANDLE_DROP_DURATION

const ORBIT_TARGET = new Vector3(0, 1, 0)
const ORBIT_INITIAL_RADIUS = 3
const ORBIT_INITIAL_HEIGHT = 1
const ORBIT_INITIAL_AZIMUTH = Math.PI / 2
const ORBIT_MIN_DISTANCE = 2
const ORBIT_MAX_DISTANCE = 8
const ORBIT_MIN_POLAR = Math.PI * 0
const ORBIT_MAX_POLAR = Math.PI / 2

const BACKGROUND_FADE_DURATION = 1
const BACKGROUND_FADE_OFFSET = 0
const BACKGROUND_FADE_END = Math.max(CANDLE_DROP_START - BACKGROUND_FADE_OFFSET, BACKGROUND_FADE_DURATION)
const BACKGROUND_FADE_START = Math.max(BACKGROUND_FADE_END - BACKGROUND_FADE_DURATION, 0)

const TYPED_LINES = [
  "> masgu",
  "...",
  "> today is your birthday",
  "...",
  "> so i made you this little surprise",
  "...",
  "🥳💐🎂🎈🎉🎁",
]
const TYPED_CHAR_DELAY = 100
const POST_TYPING_SCENE_DELAY = 1000
const CURSOR_BLINK_INTERVAL = 480
const ACHIEVEMENTS_PROMPT_DELAY = 10000

const BIRTHDAY_CARDS: ReadonlyArray<BirthdayCardConfig> = [
  {
    id: "confetti",
    image: "/card.png",
    position: [1, 0.081, -2],
    rotation: [-Math.PI / 2, 0, Math.PI / 3],
  },
]

function AnimatedScene({
  isPlaying,
  onBackgroundFadeChange,
  onEnvironmentProgressChange,
  candleLit,
  onAnimationComplete,
  cards,
  activeCardId,
  onToggleCard,
}: AnimatedSceneProps) {
  const cakeGroup = useRef<Group>(null)
  const tableGroup = useRef<Group>(null)
  const candleGroup = useRef<Group>(null)
  const animationStartRef = useRef<number | null>(null)
  const hasPrimedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const completionNotifiedRef = useRef(false)
  const backgroundOpacityRef = useRef(1)
  const environmentProgressRef = useRef(0)

  useEffect(() => {
    onBackgroundFadeChange?.(backgroundOpacityRef.current)
    onEnvironmentProgressChange?.(environmentProgressRef.current)
  }, [onBackgroundFadeChange, onEnvironmentProgressChange])

  const emitBackgroundOpacity = (value: number) => {
    const clamped = clamp(value, 0, 1)
    if (Math.abs(clamped - backgroundOpacityRef.current) > 0.005) {
      backgroundOpacityRef.current = clamped
      onBackgroundFadeChange?.(clamped)
    }
  }

  const emitEnvironmentProgress = (value: number) => {
    const clamped = clamp(value, 0, 1)
    if (Math.abs(clamped - environmentProgressRef.current) > 0.005) {
      environmentProgressRef.current = clamped
      onEnvironmentProgressChange?.(clamped)
    }
  }

  useFrame(({ clock }) => {
    const cake = cakeGroup.current
    const table = tableGroup.current
    const candle = candleGroup.current

    if (!cake || !table || !candle) return

    if (!hasPrimedRef.current) {
      cake.position.set(0, CAKE_START_Y, 0)
      cake.rotation.set(0, 0, 0)
      table.position.set(0, 0, TABLE_START_Z)
      table.rotation.set(0, 0, 0)
      candle.position.set(0, CANDLE_START_Y, 0)
      candle.visible = false
      hasPrimedRef.current = true
    }

    if (!isPlaying) {
      emitBackgroundOpacity(1)
      emitEnvironmentProgress(0)
      animationStartRef.current = null
      hasCompletedRef.current = false
      completionNotifiedRef.current = false
      return
    }

    if (hasCompletedRef.current) {
      emitBackgroundOpacity(0)
      emitEnvironmentProgress(1)
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true
        onAnimationComplete?.()
      }
      return
    }

    if (animationStartRef.current === null) {
      animationStartRef.current = clock.elapsedTime
    }

    const elapsed = clock.elapsedTime - animationStartRef.current
    const clampedElapsed = clamp(elapsed, 0, totalAnimationTime)

    const cakeProgress = clamp(clampedElapsed / CAKE_DESCENT_DURATION, 0, 1)
    const cakeEase = easeOutCubic(cakeProgress)
    cake.position.y = lerp(CAKE_START_Y, CAKE_END_Y, cakeEase)
    cake.position.x = 0
    cake.position.z = 0
    cake.rotation.y = cakeEase * Math.PI * 2
    cake.rotation.x = 0
    cake.rotation.z = 0

    let tableZ = TABLE_START_Z
    if (clampedElapsed >= TABLE_SLIDE_START) {
      const tableProgress = clamp((clampedElapsed - TABLE_SLIDE_START) / TABLE_SLIDE_DURATION, 0, 1)
      const tableEase = easeOutCubic(tableProgress)
      tableZ = lerp(TABLE_START_Z, TABLE_END_Z, tableEase)
    }
    table.position.set(0, 0, tableZ)
    table.rotation.set(0, 0, 0)

    if (clampedElapsed >= CANDLE_DROP_START) {
      if (!candle.visible) candle.visible = true
      const candleProgress = clamp((clampedElapsed - CANDLE_DROP_START) / CANDLE_DROP_DURATION, 0, 1)
      const candleEase = easeOutCubic(candleProgress)
      candle.position.y = lerp(CANDLE_START_Y, CANDLE_END_Y, candleEase)
    } else {
      candle.visible = false
      candle.position.set(0, CANDLE_START_Y, 0)
    }

    if (clampedElapsed < BACKGROUND_FADE_START) {
      emitBackgroundOpacity(1)
      emitEnvironmentProgress(0)
    } else {
      const fadeProgress = clamp((clampedElapsed - BACKGROUND_FADE_START) / BACKGROUND_FADE_DURATION, 0, 1)
      const eased = easeOutCubic(fadeProgress)
      const backgroundOpacity = 1 - eased
      emitBackgroundOpacity(backgroundOpacity)
      emitEnvironmentProgress(1 - backgroundOpacity)
    }

    const animationDone = clampedElapsed >= totalAnimationTime
    if (animationDone) {
      cake.position.set(0, CAKE_END_Y, 0)
      cake.rotation.set(0, 0, 0)
      table.position.set(0, 0, TABLE_END_Z)
      candle.position.set(0, CANDLE_END_Y, 0)
      candle.visible = true
      emitBackgroundOpacity(0)
      emitEnvironmentProgress(1)
      hasCompletedRef.current = true
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true
        onAnimationComplete?.()
      }
    }
  })

  return (
    <>
      <group ref={tableGroup}>
        <Table />
        <PictureFrame image="/frame2.jpg" position={[0, 0.735, 3]} rotation={[0, 5.6, 0]} scale={0.75} />
        <PictureFrame image="/frame3.jpeg" position={[0, 0.735, -3]} rotation={[0, 4.0, 0]} scale={0.75} />
        <PictureFrame image="/frame4.jpeg" position={[-1.5, 0.735, 2.5]} rotation={[0, 5.4, 0]} scale={0.75} />
        <PictureFrame image="/frame1.jpg" position={[-1.5, 0.735, -2.5]} rotation={[0, 4.2, 0]} scale={0.75} />
        {cards.map((card) => (
          <BirthdayCard
            key={card.id}
            id={card.id}
            image={card.image}
            tablePosition={card.position}
            tableRotation={card.rotation}
            isActive={activeCardId === card.id}
            onToggle={onToggleCard}
          />
        ))}
      </group>

      <group ref={cakeGroup}>
        <Cake />
      </group>

      <group ref={candleGroup}>
        <Candle isLit={candleLit} scale={0.25} position={[0, 1.1, 0]} />
      </group>
    </>
  )
}

function ConfiguredOrbitControls() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const offset = new Vector3(
      Math.sin(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS,
      ORBIT_INITIAL_HEIGHT,
      Math.cos(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS
    )
    const cameraPosition = ORBIT_TARGET.clone().add(offset)
    camera.position.copy(cameraPosition)
    camera.lookAt(ORBIT_TARGET)

    const controls = controlsRef.current
    if (controls) {
      controls.target.copy(ORBIT_TARGET)
      controls.update()
    }
  }, [camera])

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
      minPolarAngle={ORBIT_MIN_POLAR}
      maxPolarAngle={ORBIT_MAX_POLAR}
    />
  )
}

type EnvironmentBackgroundControllerProps = {
  intensity: number
}

function EnvironmentBackgroundController({ intensity }: EnvironmentBackgroundControllerProps) {
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    if ("backgroundIntensity" in scene) {
      ;(scene as unknown as { backgroundIntensity: number }).backgroundIntensity = intensity
    }
  }, [scene, intensity])

  return null
}

function StartModal({ onStart }: { onStart: () => void }) {
  const overlay: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 120,
    display: "grid",
    placeItems: "center",
    background: "rgba(0,0,0,0.62)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    padding: 16,
  }

  const card: React.CSSProperties = {
    width: "min(760px, 92vw)",
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(10,10,12,0.62)",
    boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
    overflow: "hidden",
    color: "rgba(255,255,255,0.96)",
  }

  const top: React.CSSProperties = {
    padding: "18px 18px 10px",
    display: "grid",
    gap: 8,
  }

  const title: React.CSSProperties = {
    fontWeight: 950,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontSize: "clamp(20px, 2.4vw, 34px)",
    lineHeight: 1.1,
  }

  const sub: React.CSSProperties = {
    opacity: 0.82,
    fontSize: 14,
    lineHeight: 1.35,
  }

  const divider: React.CSSProperties = {
    height: 1,
    background: "rgba(255,255,255,0.14)",
  }

  const footer: React.CSSProperties = {
    padding: "14px 18px 18px",
    display: "flex",
    justifyContent: "flex-end",
  }

  const btn: React.CSSProperties = {
    borderRadius: 16,
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.92)",
    color: "rgba(10,10,12,0.92)",
    fontWeight: 950,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: "0 14px 46px rgba(0,0,0,0.30)",
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={card}>
        <div style={top}>
          <div style={title}>are you ready?</div>
          <div style={sub}>Hit start when you want to begin</div>
        </div>
        <div style={divider} />
        <div style={footer}>
          <button style={btn} onClick={onStart}>
            start
          </button>
        </div>
      </div>
    </div>
  )
}

function GlassActionOverlay({
  title,
    buttonText,
  onAction,
}: {
  title?: string
  buttonText: string
  onAction: () => void
}) {
  return (
    <div className="action-overlay action-overlay--bottom">
      <div className="glass-panel">
        {(title) && (
          <div className="glass-panel__copy">
            {title && <div className="glass-panel__title">{title}</div>}
          </div>
        )}
        <button className="glass-button" onClick={onAction}>
          {buttonText}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  type SceneMode = "birthday" | "cookie" | "gym" | "italian" | "next"
  const [sceneMode, setSceneMode] = useState<SceneMode>("birthday")

  const [hasStarted, setHasStarted] = useState(false)
  const [startModalOpen, setStartModalOpen] = useState(true)

  const [backgroundOpacity, setBackgroundOpacity] = useState(1)
  const [environmentProgress, setEnvironmentProgress] = useState(0)
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [sceneStarted, setSceneStarted] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [hasAnimationCompleted, setHasAnimationCompleted] = useState(false)
  const [isCandleLit, setIsCandleLit] = useState(true)
  const [fireworksActive, setFireworksActive] = useState(false)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null)
  const [showReflectionButton, setShowReflectionButton] = useState(false)
  const [reflectionOpen, setReflectionOpen] = useState(false)
  const [sceneIndex, setSceneIndex] = useState<0 | 1>(0)
  const [showAchievementsPrompt, setShowAchievementsPrompt] = useState(false)
  const [showLookBackPrompt, setShowLookBackPrompt] = useState(false)

  function NextScene() {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 90,
          display: "grid",
          placeItems: "center",
          color: "rgba(255,255,255,0.92)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 900,
        }}
      >
        next scene
      </div>
    )
  }

  useEffect(() => {
    if (sceneIndex !== 0 || !hasAnimationCompleted || isCandleLit) {
      setShowAchievementsPrompt(false)
      return
    }
    const t = window.setTimeout(() => setShowAchievementsPrompt(true), ACHIEVEMENTS_PROMPT_DELAY)
    return () => window.clearTimeout(t)
  }, [sceneIndex, hasAnimationCompleted, isCandleLit])

  useEffect(() => {
    if (!hasAnimationCompleted) {
      setShowReflectionButton(false)
      return
    }
    const t = window.setTimeout(() => setShowReflectionButton(true), 10000)
    return () => window.clearTimeout(t)
  }, [hasAnimationCompleted])

  useEffect(() => {
    const audio = new Audio("/music.mp3")
    audio.loop = true
    audio.preload = "auto"
    backgroundAudioRef.current = audio
    return () => {
      audio.pause()
      backgroundAudioRef.current = null
    }
  }, [])

  const playBackgroundMusic = useCallback(() => {
    const audio = backgroundAudioRef.current
    if (!audio) return
    if (!audio.paused) return
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }, [])

  const startExperience = useCallback(() => {
    setStartModalOpen(false)
    playBackgroundMusic()
    setHasStarted(true)
  }, [playBackgroundMusic])

  useEffect(() => {
    if (sceneMode !== "birthday") return
    if (!hasAnimationCompleted) return
    if (isCandleLit) return

    setShowLookBackPrompt(false)
    const handle = window.setTimeout(() => {
      setShowLookBackPrompt(true)
    }, 10000)
    return () => window.clearTimeout(handle)
  }, [sceneMode, hasAnimationCompleted, isCandleLit])

  const goToCookie = useCallback(() => {
    setShowLookBackPrompt(false)
    setSceneMode("cookie")
  }, [])

  const blowOut = useCallback(() => {
    setIsCandleLit(false)
    setFireworksActive(true)
  }, [])

  const activate = useCallback(() => {
    if (!hasStarted) return
    if (startModalOpen) return
    if (sceneMode !== "birthday") return

    if (showLookBackPrompt && hasAnimationCompleted && !isCandleLit) {
      goToCookie()
      return
    }

    if (hasAnimationCompleted && isCandleLit) {
      blowOut()
    }
  }, [
    hasStarted,
    startModalOpen,
    sceneMode,
    showLookBackPrompt,
    hasAnimationCompleted,
    isCandleLit,
    goToCookie,
    blowOut,
  ])

  useEffect(() => {
    if (sceneMode !== "birthday") return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return
      event.preventDefault()
      activate()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [sceneMode, activate])

  const typingComplete = currentLineIndex >= TYPED_LINES.length
  const typedLines = useMemo(() => {
    if (TYPED_LINES.length === 0) return [""]

    return TYPED_LINES.map((line, index) => {
      if (typingComplete || index < currentLineIndex) return line
      if (index === currentLineIndex) return line.slice(0, Math.min(currentCharIndex, line.length))
      return ""
    })
  }, [currentCharIndex, currentLineIndex, typingComplete])

  const cursorLineIndex = typingComplete ? Math.max(typedLines.length - 1, 0) : currentLineIndex
  const cursorTargetIndex = Math.max(Math.min(cursorLineIndex, typedLines.length - 1), 0)

  useEffect(() => {
    if (sceneMode !== "birthday") return

    if (!hasStarted) {
      setCurrentLineIndex(0)
      setCurrentCharIndex(0)
      setSceneStarted(false)
      setIsCandleLit(true)
      setFireworksActive(false)
      setHasAnimationCompleted(false)
      return
    }

    if (typingComplete) {
      if (!sceneStarted) {
        const handle = window.setTimeout(() => {
          setSceneStarted(true)
        }, POST_TYPING_SCENE_DELAY)
        return () => window.clearTimeout(handle)
      }
      return
    }

    const currentLine = TYPED_LINES[currentLineIndex] ?? ""
    const handle = window.setTimeout(() => {
      if (currentCharIndex < currentLine.length) {
        setCurrentCharIndex((prev) => prev + 1)
        return
      }

      let nextLineIndex = currentLineIndex + 1
      while (nextLineIndex < TYPED_LINES.length && TYPED_LINES[nextLineIndex].length === 0) {
        nextLineIndex += 1
      }

      setCurrentLineIndex(nextLineIndex)
      setCurrentCharIndex(0)
    }, TYPED_CHAR_DELAY)

    return () => window.clearTimeout(handle)
  }, [sceneMode, hasStarted, currentCharIndex, currentLineIndex, typingComplete, sceneStarted])

  useEffect(() => {
    if (sceneMode !== "birthday") return
    const handle = window.setInterval(() => {
      setCursorVisible((prev) => !prev)
    }, CURSOR_BLINK_INTERVAL)
    return () => window.clearInterval(handle)
  }, [sceneMode])

  const handleCardToggle = useCallback((id: string) => {
    setActiveCardId((current) => (current === id ? null : id))
  }, [])

  const isScenePlaying = hasStarted && sceneStarted

  return (
    <div className="App">
      {sceneMode === "cookie" ? (
        <CookieScene onNextScene={() => setSceneMode("gym")} />
      ) : sceneMode === "gym" ? (
        <GymScene onNextScene={() => setSceneMode("italian")} />
      ) : sceneMode === "italian" ? (
        <ItalianScene onNextScene={() => setSceneMode("next")} />
      ) : sceneMode === "next" ? (
        <NextScene />
      ) : (
        <>
          <div className="background-overlay" style={{ opacity: backgroundOpacity }}>
            <div className="typed-text">
              {typedLines.map((line, index) => {
                const showCursor = cursorVisible && index === cursorTargetIndex && (!typingComplete || !sceneStarted)
                return (
                  <span className="typed-line" key={`typed-line-${index}`}>
                    {line || "\u00a0"}
                    {showCursor && (
                      <span aria-hidden="true" className="typed-cursor">
                        _
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>

          {hasAnimationCompleted && isCandleLit && (
            <GlassActionOverlay buttonText="Blow out the candle" onAction={activate} />
          )}

          {hasAnimationCompleted && !isCandleLit && showLookBackPrompt && (
            <GlassActionOverlay
              title="Look back on your achievements at 22"
              buttonText="Continue"
              onAction={activate}
            />
          )}

          <Canvas
            gl={{ alpha: true }}
            style={{ background: "transparent" }}
            onCreated={({ gl }) => {
              gl.setClearColor("#000000", 0)
            }}
          >
            <Suspense fallback={null}>
              <AnimatedScene
                isPlaying={isScenePlaying}
                candleLit={isCandleLit}
                onBackgroundFadeChange={setBackgroundOpacity}
                onEnvironmentProgressChange={setEnvironmentProgress}
                onAnimationComplete={() => setHasAnimationCompleted(true)}
                cards={BIRTHDAY_CARDS}
                activeCardId={activeCardId}
                onToggleCard={handleCardToggle}
              />
              <ambientLight intensity={0.35 + (1 - environmentProgress) * 0.45} />
              <directionalLight intensity={0.5} position={[2, 10, 0]} color={[1, 0.9, 0.95]} />
              <Environment
                files={["/hdr.exr"]}
                backgroundRotation={[0, 3.3, 0]}
                environmentRotation={[0, 3.3, 0]}
                background
                environmentIntensity={1.1 * environmentProgress}
                backgroundIntensity={1.0 * environmentProgress}
              />
              <EnvironmentBackgroundController intensity={1.0 * environmentProgress} />
              <Fireworks isActive={fireworksActive} origin={[0, 10, 0]} />
              <ConfiguredOrbitControls />
            </Suspense>
          </Canvas>

          {startModalOpen && <StartModal onStart={startExperience} />}
        </>
      )}
    </div>
  )
}
