import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber"
import { Clone, ContactShadows, OrbitControls, useGLTF } from "@react-three/drei"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box3, Group, Mesh, Vector3 } from "three"
import { EXRLoader, type OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { EquirectangularReflectionMapping } from "three"

type GymSceneProps = {
  onNextScene?: () => void
}

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

function pickTargetRange(width = 0.09, lastMin?: number): [number, number] {
  const lo = 0.18
  const hi = 0.96
  const maxMin = Math.max(lo, hi - width)

  const randMin = () => lo + Math.random() * (maxMin - lo)

  let min = randMin()

  if (typeof lastMin === "number") {
    let tries = 0
    while (Math.abs(min - lastMin) < 0.32 && tries < 10) {
      min = randMin()
      tries += 1
    }
    if (Math.abs(min - lastMin) < 0.32) {
      min = min < 0.5 ? Math.min(maxMin, min + 0.45) : Math.max(lo, min - 0.45)
    }
  }

  return [min, min + width]
}

function mulScale(
  scale: number | [number, number, number] | undefined,
  k: number
): number | [number, number, number] | undefined {
  if (scale === undefined) return k
  if (typeof scale === "number") return scale * k
  return [scale[0] * k, scale[1] * k, scale[2] * k]
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

  const finalScale = useMemo(() => mulScale(scale, fitK), [scale, fitK])

  return (
    <group position={position} rotation={rotation} scale={finalScale}>
      <group position={[-center.x, -minY, -center.z]}>
        <Clone object={gltf.scene} />
      </group>
    </group>
  )
}

type FloatingDrinkProps = {
  url: string
  angle: number
  radius: number
  baseY: number
  spinOffset: number
  fitHeight: number
  scale?: number
}

function FloatingDrink({ url, angle, radius, baseY, spinOffset, fitHeight, scale = 1 }: FloatingDrinkProps) {
  const ref = useRef<Group>(null)
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const g = ref.current
    if (!g) return
    g.position.y = baseY + Math.sin(t * 1.3 + spinOffset) * 0.08
    g.rotation.y = t * 0.55 + spinOffset
    g.rotation.z = Math.sin(t * 1.1 + spinOffset) * 0.06
  })

  return (
    <group ref={ref} position={[x, baseY, z]} rotation={[0, -angle + Math.PI, 0]} scale={scale}>
      <GroundedClone url={url} fitHeight={fitHeight} />
    </group>
  )
}

function CameraSetup() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    camera.position.set(0, 2.05, 7.2)
    camera.lookAt(0, 1.45, 0)

    const c = controlsRef.current
    if (c) {
      c.target.set(0, 1.45, 0)
      c.update()
    }
  }, [camera])

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      minDistance={2.6}
      maxDistance={9}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2}
    />
  )
}

function GymWorld({ ringSpeed, playerUrl }: { ringSpeed: number; playerUrl: string }) {
  const WORLD_SCALE = 2.25
  const WORLD_Y = -0.22
  const ringRef = useRef<Group>(null)

  useFrame((_, delta) => {
    const g = ringRef.current
    if (!g) return
    g.rotation.y += delta * ringSpeed
  })

  const drinkUrls = useMemo(
    () => ["/gym/monster_zero.glb", "/gym/monster_energy_drink.glb", "/gym/monster_energy_drink_mango.glb"],
    []
  )

  const DRINK_FIT_HEIGHT = 0.55

  const drinks = useMemo(() => {
    const count = 9
    const out: Array<{ url: string; angle: number; offset: number }> = []
    for (let i = 0; i < count; i += 1) {
      out.push({
        url: drinkUrls[i % drinkUrls.length],
        angle: (i / count) * Math.PI * 2,
        offset: i * 0.65,
      })
    }
    return out
  }, [drinkUrls])

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        intensity={0.7}
        position={[3.6, 7.2, 2.8]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight intensity={1.0} position={[-3.2, 6.8, 2.6]} angle={0.35} penumbra={0.55} castShadow />
      <hemisphereLight intensity={0.35} color="#ffffff" groundColor="#0e0e12" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial
          color="#24242b"
          roughness={0.78}
          metalness={0.08}
          envMapIntensity={1.25}
          emissive="#0b0b10"
          emissiveIntensity={0.35}
        />
      </mesh>

      <ContactShadows position={[0, -0.205, 0]} opacity={0.32} scale={13} blur={2.1} far={9} />

      <group position={[0, WORLD_Y, 0]} scale={WORLD_SCALE}>
        <GroundedClone url={playerUrl} position={[0, 0, 0]} scale={1.1} />

        <GroundedClone
          url="/gym/dumbbell_barbell_bench_-_9mb.glb"
          position={[2.25, 0, -0.25]}
          rotation={[0, -0.9, 0]}
          scale={1.0}
        />

        <GroundedClone url="/gym/stationary_bike.glb" position={[-1.55, 0, 1.22]} rotation={[0, 0.95, 0]} fitHeight={0.95} />

        <GroundedClone url="/gym/dumbbells.glb" position={[-0.65, 0, 1.35]} rotation={[0, 0.25, 0]} scale={1.2} />

        <group ref={ringRef} position={[0, 0, 0]}>
          {drinks.map((d, i) => (
            <FloatingDrink
              key={`${d.url}-${i}`}
              url={d.url}
              angle={d.angle}
              radius={1.75}
              baseY={1.1}
              spinOffset={d.offset}
              fitHeight={DRINK_FIT_HEIGHT}
              scale={1}
            />
          ))}
        </group>
      </group>
    </>
  )
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

type RepGameProps = {
  streak: number
  required: number
  unlocked: boolean
  perfectMin: number
  perfectMax: number
  onAttempt: (releasedAt: number) => void
  onContinue: () => void
}

function PerfectRepHUD({ streak, required, unlocked, perfectMin, perfectMax, onAttempt, onContinue }: RepGameProps) {
  const [meter, setMeter] = useState(0)
  const [flash, setFlash] = useState<"perfect" | "miss" | null>(null)
  const [repFxKey, setRepFxKey] = useState(0)
  const [pulseKey, setPulseKey] = useState(0)

  const holdingRef = useRef(false)
  const meterRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastTRef = useRef<number | null>(null)

  const triggerFlash = useCallback((k: "perfect" | "miss") => {
    setFlash(k)
    window.setTimeout(() => setFlash(null), 520)
  }, [])

  const releaseAttempt = useCallback(() => {
    const v = meterRef.current
    onAttempt(v)

    const ok = v >= perfectMin && v <= perfectMax

    setRepFxKey((k) => k + 1)
    if (ok) setPulseKey((p) => p + 1)

    triggerFlash(ok ? "perfect" : "miss")

    meterRef.current = 0
    setMeter(0)
  }, [onAttempt, perfectMin, perfectMax, triggerFlash])

  useEffect(() => {
    const tick = (t: number) => {
      const last = lastTRef.current ?? t
      const dt = Math.min((t - last) / 1000, 0.05)
      lastTRef.current = t

      const upSpeed = 1.15
      const downSpeed = 1.35

      const holding = holdingRef.current
      let next = meterRef.current + (holding ? upSpeed : -downSpeed) * dt
      if (next < 0) next = 0
      if (next > 1) next = 1

      meterRef.current = next
      setMeter(next)

      rafRef.current = window.requestAnimationFrame(tick)
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTRef.current = null
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSpace = e.code === "Space" || e.key === " "
      if (!isSpace) return
      if (e.repeat) return
      e.preventDefault()

      if (unlocked) return
      holdingRef.current = true
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const isSpace = e.code === "Space" || e.key === " "
      if (!isSpace) return
      e.preventDefault()

      if (unlocked) return

      holdingRef.current = false
      releaseAttempt()
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [releaseAttempt, unlocked])

  const pct = Math.round(meter * 100)
  const pMinPct = Math.round(perfectMin * 100)
  const pWidthPct = Math.max(0, Math.round((perfectMax - perfectMin) * 100))

  return (
    <>
      {pulseKey > 0 && (
        <>
          <div key={`pulse-${pulseKey}`} className="gym-light-pulse" aria-hidden="true" />
          <div key={`strobe-${pulseKey}`} className="gym-light-strobe" aria-hidden="true" />
          <div key={`sweep-${pulseKey}`} className="gym-light-sweep" aria-hidden="true" />
        </>
      )}

      <div className="gym-hud-top">perfect rep</div>

      {flash && (
        <div className={`gym-flash ${flash === "perfect" ? "is-perfect" : "is-miss"}`}>
          {flash === "perfect" ? "PERFECT" : "MISS"}
        </div>
      )}

      <div className="gym-hud-bottom">
        <div className="gym-rep-wrap">
          <div className="gym-rep-row">
            <div className="gym-rep-big">{unlocked ? "GYM QUEEN 💪🏻" : "Hold Space to lift, release at the top"}</div>
            {!unlocked && <div className="gym-rep-small">{`${streak}/${required} perfect reps`}</div>}
          </div>

          {!unlocked && (
            <>
              <div className="gym-rep-emoji" key={`repfx-${repFxKey}`} aria-hidden="true">
                🏋️
              </div>

              <div
                className="gym-rep-bar"
                style={
                  {
                    ["--pmin" as any]: `${pMinPct}%`,
                    ["--pwidth" as any]: `${pWidthPct}%`,
                    ["--fill" as any]: `${meter}`,
                  } as any
                }
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className="gym-rep-fill" />
                <div className="gym-rep-tick" style={{ left: `${pct}%` }} />
              </div>
            </>
          )}

          {unlocked && (
            <button className="gym-continue-btn" type="button" onClick={onContinue}>
              continue
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export function GymScene({ onNextScene }: GymSceneProps) {
  const [mounted, setMounted] = useState(false)

  const REQUIRED_STREAK = 5

  const [streak, setStreak] = useState(0)
  const [unlocked, setUnlocked] = useState(false)

  const [target, setTarget] = useState<[number, number]>(() => pickTargetRange(0.09))
  const targetMin = target[0]
  const targetMax = target[1]

  const ringSpeed = useMemo(() => {
    const base = 0.12
    const factor = 1 + streak * 0.22 + (unlocked ? 0.25 : 0)
    return base * factor
  }, [streak, unlocked])

  const playerUrl = useMemo(() => {
    return unlocked ? "/gym/massa_buff.glb" : "/gym/massa_pbr.glb"
  }, [unlocked])

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 40)
    return () => window.clearTimeout(t)
  }, [])

  const handleAttempt = useCallback(
    (releasedAt: number) => {
      if (unlocked) return

      const ok = releasedAt >= targetMin && releasedAt <= targetMax

      setTarget((prev) => pickTargetRange(0.09, prev[0]))

      if (!ok) {
        setStreak(0)
        return
      }

      setStreak((s) => {
        const next = s + 1
        if (next >= REQUIRED_STREAK) {
          setUnlocked(true)
          return REQUIRED_STREAK
        }
        return next
      })
    },
    [REQUIRED_STREAK, targetMin, targetMax, unlocked]
  )

  const handleContinue = useCallback(() => {
    if (!unlocked) return
    onNextScene?.()
  }, [onNextScene, unlocked])

  return (
    <div className={`gym-scene ${mounted ? "is-mounted" : ""}`}>
      <style>{`
        .gym-scene {
          position: absolute;
          inset: 0;
          z-index: 80;
          overflow: hidden;
          background: radial-gradient(1200px 700px at 50% 20%, rgba(40,40,48,0.34), rgba(0,0,0,0.92));
          font-family: "Courier New", Courier, monospace;
          color: rgba(255,255,255,0.96);
        }

        .gym-hud-top {
          position: absolute;
          top: 1.15rem;
          left: 50%;
          transform: translateX(-50%);
          width: min(1240px, 94vw);
          z-index: 10;
          text-align: center;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 900;
          font-size: clamp(1.05rem, 2vw, 1.5rem);
          text-shadow: 0 18px 60px rgba(0,0,0,0.65);
          opacity: 0.98;
          pointer-events: none;
        }

        .gym-hud-bottom {
          position: absolute;
          bottom: 1.1rem;
          left: 50%;
          transform: translateX(-50%);
          width: min(1240px, 94vw);
          z-index: 10;
          display: grid;
          place-items: center;
          padding: 0.85rem 0.95rem;
          border-radius: 18px;
          border: 2px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.28);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 24px 70px rgba(0,0,0,0.55);
          pointer-events: auto;
        }

        .gym-rep-wrap {
          width: min(720px, 92vw);
          display: grid;
          gap: 0.65rem;
        }

        .gym-rep-row {
          display: grid;
          gap: 0.25rem;
          text-align: center;
          pointer-events: none;
        }

        .gym-rep-big {
          letter-spacing: 0.1em;
          font-size: clamp(0.95rem, 1.6vw, 1.12rem);
          opacity: 0.95;
        }

        .gym-rep-small {
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-weight: 900;
          font-size: 0.78rem;
          opacity: 0.75;
        }

        .gym-rep-bar {
          position: relative;
          height: 14px;
          border-radius: 999px;
          border: 2px solid rgba(255, 90, 90, 0.26);
          background: rgba(170, 28, 28, 0.20);
          overflow: hidden;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.18);
          pointer-events: none;
        }

        .gym-rep-bar::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: var(--pmin, 86%);
          width: var(--pwidth, 9%);
          background: linear-gradient(
            to right,
            rgba(0, 255, 160, 0.08),
            rgba(0, 255, 160, 0.28),
            rgba(0, 255, 160, 0.08)
          );
          box-shadow:
            inset 0 0 0 1px rgba(0, 255, 160, 0.20),
            0 0 22px rgba(0, 255, 160, 0.12);
        }

        .gym-rep-fill {
          height: 100%;
          background: rgba(255, 255, 255, 0.92);
          transform-origin: left;
          transform: scaleX(var(--fill, 0));
          will-change: transform;
        }

        .gym-rep-tick {
          position: absolute;
          top: -7px;
          width: 2px;
          height: 28px;
          background: rgba(255,255,255,0.75);
          transform: translateX(-1px);
          opacity: 0.9;
          box-shadow: 0 0 18px rgba(255,255,255,0.12);
        }

        .gym-rep-emoji {
          justify-self: center;
          text-align: center;
          font-size: clamp(1.6rem, 2.8vw, 2.1rem);
          line-height: 1;
          opacity: 0;
          filter: drop-shadow(0 10px 28px rgba(255,255,255,0.10));
          animation: gymEmojiPop 520ms ease both;
          pointer-events: none;
        }

        @keyframes gymEmojiPop {
          0% { opacity: 0; transform: translateY(6px) scale(0.92); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
          24% { opacity: 1; transform: translateY(-2px) scale(1.08); filter: drop-shadow(0 18px 44px rgba(255,255,255,0.18)); }
          100% { opacity: 0; transform: translateY(-4px) scale(1.02); filter: drop-shadow(0 10px 28px rgba(255,255,255,0.10)); }
        }

        .gym-flash.is-perfect {
          border-color: rgba(0, 255, 160, 0.28);
          background: rgba(0, 255, 160, 0.10);
          box-shadow: 0 24px 90px rgba(0, 255, 160, 0.14);
        }

        .gym-flash.is-miss {
          border-color: rgba(255, 90, 90, 0.30);
          background: rgba(255, 40, 40, 0.10);
          box-shadow: 0 24px 90px rgba(255, 70, 70, 0.12);
        }

        .gym-light-pulse {
          position: absolute;
          inset: 0;
          z-index: 9;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0;
          background:
            radial-gradient(900px 520px at 50% 34%, rgba(255,255,255,0.18), rgba(255,255,255,0) 60%),
            radial-gradient(1200px 760px at 30% 72%, rgba(0,255,160,0.14), rgba(0,255,160,0) 62%),
            radial-gradient(1200px 760px at 70% 70%, rgba(255,110,60,0.10), rgba(255,110,60,0) 62%);
          animation: gymPulse 1100ms ease-out both;
        }

        @keyframes gymPulse {
          0% { opacity: 0; }
          18% { opacity: 1; }
          100% { opacity: 0; }
        }

        .gym-light-strobe {
          position: absolute;
          inset: 0;
          z-index: 9;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0;
          background: rgba(255,255,255,0.22);
          animation: gymStrobe 420ms ease both;
        }

        @keyframes gymStrobe {
          0% { opacity: 0; }
          14% { opacity: 1; }
          42% { opacity: 0.15; }
          100% { opacity: 0; }
        }

        .gym-light-sweep {
          position: absolute;
          inset: -20% 0;
          z-index: 9;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0) 0%,
            rgba(255,255,255,0.12) 45%,
            rgba(0,255,160,0.10) 55%,
            rgba(0,0,0,0) 100%
          );
          transform: translateY(-24%);
          animation: gymSweep 1200ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
        }

        @keyframes gymSweep {
          0% { opacity: 0; transform: translateY(-24%); }
          18% { opacity: 1; }
          100% { opacity: 0; transform: translateY(24%); }
        }

        .gym-continue-btn {
          justify-self: center;
          width: min(220px, 64vw);
          border-radius: 16px;
          padding: 12px 16px;
          border: 2px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.28);
          color: rgba(255,255,255,0.96);
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: transform 160ms ease, filter 160ms ease;
          pointer-events: auto;
        }

        .gym-continue-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        .gym-continue-btn:active {
          transform: translateY(0px) scale(0.99);
          filter: brightness(0.98);
        }

        .gym-continue-btn:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 3px;
        }

        .gym-flash {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          z-index: 12;
          padding: 0.85rem 1.1rem;
          border-radius: 18px;
          border: 2px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.34);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 24px 80px rgba(0,0,0,0.55);
          letter-spacing: 0.28em;
          text-transform: uppercase;
          font-weight: 950;
          font-size: clamp(1.2rem, 2.8vw, 1.7rem);
          opacity: 0;
          animation: gymFlashIn 520ms ease both;
          pointer-events: none;
        }

        .gym-flash.is-perfect {
          filter: brightness(1.05);
        }

        .gym-flash.is-miss {
          opacity: 0;
        }

        @keyframes gymFlashIn {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
          18% { opacity: 1; transform: translate(-50%, -50%) scale(1.02); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.01); }
        }

        .gym-canvas {
          position: absolute;
          inset: 0;
        }
      `}</style>

      <PerfectRepHUD
        streak={streak}
        required={REQUIRED_STREAK}
        unlocked={unlocked}
        perfectMin={targetMin}
        perfectMax={targetMax}
        onAttempt={handleAttempt}
        onContinue={handleContinue}
      />

      <div className="gym-canvas">
        <Canvas shadows gl={{ antialias: true }}>
          <Suspense fallback={null}>
            <GymWorld ringSpeed={ringSpeed} playerUrl={playerUrl} />
            <GymHDRI />
            <pointLight intensity={0.85} position={[-1.4, 1.4, 1.2]} distance={6} />
            <CameraSetup />
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