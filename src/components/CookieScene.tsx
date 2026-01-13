// src/components/CookieScene.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type React from "react"

type Slide = {
  key: string
  src: string
  alt: string
  subtitle: string
  zoomObjectPosition?: string
}

type CookieSceneProps = {
  onNextScene?: () => void
}

type ConfettiPiece = {
  id: string
  left: number
  delayMs: number
  durationMs: number
  driftPx: number
  rotDeg: number
  spinDeg: number
  w: number
  h: number
  color: string
}

type ClickPop = {
  id: string
  x: number
  y: number
}

type CrumbBurst = {
  id: string
  x: number
  y: number
  dx: number
  dy: number
  rot: number
  size: number
  delayMs: number
  durationMs: number
  alpha: number
  c1: string
  c2: string
  dot: string
  round: number
}

const TYPE_STACK =
  "'Writing Machine', 'Special Elite', 'JMH Typewriter', 'Courier Prime', 'Courier New', monospace"

function TypewriterFontLoader() {
  useEffect(() => {
    const hrefs = [
      "https://fonts.googleapis.com/css2?family=Special+Elite&display=swap",
      "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap",
    ]

    const links: HTMLLinkElement[] = []
    for (const href of hrefs) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      document.head.appendChild(link)
      links.push(link)
    }

    return () => {
      for (const l of links) {
        try {
          document.head.removeChild(l)
        } catch {}
      }
    }
  }, [])

  return null
}

function StyleTag() {
  return (
    <style>{`
      @font-face {
        font-family: 'Writing Machine';
        src: url('/fonts/writing-machine.woff2') format('woff2'),
             url('/fonts/writing-machine.woff') format('woff'),
             url('/fonts/writing-machine.ttf') format('truetype');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'JMH Typewriter';
        src: url('/fonts/jmh-typewriter.woff2') format('woff2'),
             url('/fonts/jmh-typewriter.woff') format('woff'),
             url('/fonts/jmh-typewriter.ttf') format('truetype');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
    `}</style>
  )
}

export function CookieScene({ onNextScene }: CookieSceneProps) {
  const slides = useMemo<ReadonlyArray<Slide>>(
    () => [
      {
        key: "cookies-float",
        src: "/cookie/cookies-float.jpeg",
        alt: "Cookies floating",
        subtitle: "Launch day energy, the first real batch that felt like a brand",
      },
      {
        key: "chefs-hand",
        src: "/cookie/chefs-hand.jpeg",
        alt: "Chef hand",
        subtitle: "Hands-on craft, the tiny details that make the difference",
      },
      {
        key: "classic",
        src: "/cookie/classic.jpeg",
        alt: "Classic cookie",
        subtitle: "Classic and clean, the one that makes everyone happy",
      },
      {
        key: "cereal-box",
        src: "/cookie/cereal-box.jpeg",
        alt: "Cereal box cookie",
        subtitle: "Playful energy, snack vibes but still premium",
      },
      {
        key: "smores",
        src: "/cookie/smores.jpeg",
        alt: "Smores cookie",
        subtitle: "S’mores mood, gooey and dramatic in the best way",
        zoomObjectPosition: "50% 70%",
      },
      {
        key: "choco-focused",
        src: "/cookie/choco-focused.jpeg",
        alt: "Chocolate focused cookie",
        subtitle: "Signature chocolate look, refined and ready for photos",
      },
      {
        key: "red-velvet",
        src: "/cookie/red-velvet-focused.jpeg",
        alt: "Red velvet cookie",
        subtitle: "Red velvet moment, bold color and soft crumb",
      },
      {
        key: "pistach",
        src: "/cookie/pistach.jpeg",
        alt: "Pistach cookie",
        subtitle: "Pistachio glow, the flavor that makes people pause",
      },
      {
        key: "pistachio-focused",
        src: "/cookie/pistachio-focused.jpeg",
        alt: "Pistachio focused cookie",
        subtitle: "That pistachio signature, instantly recognizable",
      },
      {
        key: "black-forest",
        src: "/cookie/black-forest.jpeg",
        alt: "Black forest cookie",
        subtitle: "Black forest depth, rich and glossy with bite",
      },
      {
        key: "choco-pattern",
        src: "/cookie/choco-pattern.jpeg",
        alt: "Chocolate pattern",
        subtitle: "Aesthetic direction, patterns that made the visuals feel premium",
      },
    ],
    []
  )

  const [activeIndex, setActiveIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)

  const [showGate, setShowGate] = useState(false)
  const [cookieClicks, setCookieClicks] = useState(0)
  const [gateComplete, setGateComplete] = useState(false)

  const [showConfetti, setShowConfetti] = useState(false)
  const [confettiSeed, setConfettiSeed] = useState(0)

  const REQUIRED_CLICKS = 100

  const [visited, setVisited] = useState<Set<string>>(() => {
    const first = slides[0]?.key
    return new Set(first ? [first] : [])
  })

  const gateCardRef = useRef<HTMLDivElement | null>(null)

  const [pops, setPops] = useState<ClickPop[]>([])
  const [crumbs, setCrumbs] = useState<CrumbBurst[]>([])
  const [cookieBop, setCookieBop] = useState(0)

  const allSeen = slides.length > 0 ? visited.size >= slides.length : true

  const leftIndex = (activeIndex - 1 + slides.length) % slides.length
  const rightIndex = (activeIndex + 1) % slides.length

  const active = slides[activeIndex]
  const left = slides[leftIndex]
  const right = slides[rightIndex]

  useEffect(() => {
    const k = slides[activeIndex]?.key
    if (!k) return
    setVisited((prev) => {
      if (prev.has(k)) return prev
      const next = new Set(prev)
      next.add(k)
      return next
    })
  }, [activeIndex, slides])

  const next = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % slides.length)
  }, [slides.length])

  const prev = useCallback(() => {
    setActiveIndex((p) => (p - 1 + slides.length) % slides.length)
  }, [slides.length])

  const openGate = useCallback(() => {
    if (!allSeen) return
    setShowGate(true)
  }, [allSeen])

  const closeGate = useCallback(() => {
    setShowGate(false)
  }, [])

  const addPop = useCallback((clientX: number, clientY: number) => {
    const card = gateCardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    setPops((prev) => [...prev, { id, x, y }])
    window.setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== id))
    }, 650)
  }, [])

  const addCrumbs = useCallback((clientX: number, clientY: number) => {
    const card = gateCardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x0 = clientX - rect.left
    const y0 = clientY - rect.top

    const rand = (min: number, max: number) => min + Math.random() * (max - min)
    const randi = (min: number, max: number) => Math.floor(rand(min, max + 1))

    const cookiePal = [
      { c1: "#e8caa2", c2: "#cfa073", dot: "#4a2b1a" },
      { c1: "#f0d1a8", c2: "#c8915f", dot: "#3a2216" },
      { c1: "#e2b98a", c2: "#b97a4d", dot: "#2a180f" },
      { c1: "#f3d6b0", c2: "#caa07a", dot: "#5a331f" },
    ]

    const pieces = Array.from({ length: 18 }, (_, i) => {
      const id = `crumb-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`
      const ang = rand(0, Math.PI * 2)
      const spd = rand(160, 360)
      const dx = Math.cos(ang) * spd
      const dy = Math.sin(ang) * spd - rand(40, 140)
      const { c1, c2, dot } = cookiePal[i % cookiePal.length]
      const round = rand(18, 999)

      return {
        id,
        x: x0,
        y: y0,
        dx,
        dy,
        rot: rand(-260, 260),
        size: rand(5.2, 10.4),
        delayMs: randi(0, 45),
        durationMs: randi(560, 880),
        alpha: rand(0.68, 0.98),
        c1,
        c2,
        dot,
        round,
      } satisfies CrumbBurst
    })

    setCrumbs((prev) => [...prev, ...pieces])
    window.setTimeout(() => {
      const ids = new Set(pieces.map((p) => p.id))
      setCrumbs((prev) => prev.filter((c) => !ids.has(c.id)))
    }, 1050)
  }, [])

  const handleGateCookieClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()

      if (cookieClicks >= REQUIRED_CLICKS) return
      const nextCount = Math.min(cookieClicks + 1, REQUIRED_CLICKS)

      setCookieClicks(nextCount)
      setCookieBop((t) => t + 1)

      addPop(e.clientX, e.clientY)
      addCrumbs(e.clientX, e.clientY)

      if (nextCount === REQUIRED_CLICKS && !gateComplete) {
        setGateComplete(true)
        setConfettiSeed((s) => s + 1)
        setShowConfetti(true)
        window.setTimeout(() => setShowConfetti(false), 5200)
      }
    },
    [addCrumbs, addPop, cookieClicks, gateComplete]
  )

  const handleGateContinue = useCallback(() => {
    if (!gateComplete) return
    setShowGate(false)
    onNextScene?.()
  }, [gateComplete, onNextScene])

  const confettiPieces = useMemo<ReadonlyArray<ConfettiPiece>>(() => {
    const colors = ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#b517ff", "#f77f00", "#f72585", "#a7c957"]
    const rand = (min: number, max: number) => min + Math.random() * (max - min)
    const randi = (min: number, max: number) => Math.floor(rand(min, max + 1))

    return Array.from({ length: 240 }, (_, i) => {
      const id = `c${confettiSeed}-${i}`
      return {
        id,
        left: rand(0, 100),
        delayMs: randi(0, 900),
        durationMs: randi(2600, 4200),
        driftPx: randi(-260, 260),
        rotDeg: randi(0, 360),
        spinDeg: randi(540, 1440),
        w: randi(6, 11),
        h: randi(10, 20),
        color: colors[i % colors.length],
      }
    })
  }, [confettiSeed])

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 40)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showGate) {
        if (e.key === "Escape") {
          e.preventDefault()
          closeGate()
        }
        return
      }

      const isLeft = e.key === "ArrowLeft"
      const isRight = e.key === "ArrowRight"
      const isEnter = e.key === "Enter"
      const isEsc = e.key === "Escape"

      if (isEnter) {
        e.preventDefault()
        setIsZoomed((v) => !v)
        return
      }

      if (isEsc) {
        if (!isZoomed) return
        e.preventDefault()
        setIsZoomed(false)
        return
      }

      if (isLeft) {
        e.preventDefault()
        if (!isZoomed) prev()
        return
      }

      if (isRight) {
        e.preventDefault()
        if (!isZoomed) next()
        return
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeGate, isZoomed, next, prev, showGate])

  const gatePct = Math.round((Math.min(cookieClicks, REQUIRED_CLICKS) / REQUIRED_CLICKS) * 100)

  const gateHeadline = useMemo(() => {
    if (gateComplete) return "YIPPEE 🎉"
    if (cookieClicks >= 75) return "ALMOST THERE 🔥"
    if (cookieClicks >= 50) return "HALFWAY 🚀"
    if (cookieClicks >= 25) return "NICE START ✨"
    return "WAIT 🛑"
  }, [cookieClicks, gateComplete])

  const gateMotivation = useMemo(() => {
    if (gateComplete) return "good job chef baker queen masgu 👑"
    if (cookieClicks >= 75) return "almost there! last stretch!"
    if (cookieClicks >= 50) return "halfway! keep going!"
    if (cookieClicks >= 25) return "nice start! keep clicking!"
    return "before you move on, click this cookie 100 times"
  }, [cookieClicks, gateComplete])

  const footerButtonDisabled = !allSeen
  const footerButtonLabel = allSeen ? "CONTINUE" : "KEEP BROWSING"

  return (
    <div className={`cookie-scene ${mounted ? "is-mounted" : ""}`}>
      <TypewriterFontLoader />
      <StyleTag />

      <style>{`
        :root {
          --madras: #203d03;
          --chino: #d4d1bd;
          --deep-fir: #0c1701;
        }

        .cookie-scene {
          position: absolute;
          inset: 0;
          z-index: 60;
          overflow: hidden;
          background: transparent;
          color: rgba(255, 255, 255, 0.96);
          font-family: ${TYPE_STACK};
          text-rendering: geometricPrecision;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .cookie-scene,
        .cookie-scene * {
          font-family: ${TYPE_STACK};
        }

        .cookie-topTitle {
          position: absolute;
          top: 1.05rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 40;

          padding: 10px 18px;
          border-radius: 18px;

          border: 2px solid rgba(212,209,189,0.18);
          background: rgba(12,23,1,0.58);
          color: rgba(212,209,189,0.96);

          box-shadow: 0 18px 54px rgba(0,0,0,0.45);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);

          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 950;
          font-size: clamp(1.05rem, 1.9vw, 1.38rem);
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
        }

        .cookie-bg-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.98;
          filter: saturate(1.08) contrast(1.06);
          transform: scale(1.03);
        }

        .cookie-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(920px 560px at 50% 22%, rgba(0,0,0,0.06), rgba(0,0,0,0.52) 58%, rgba(0,0,0,0.72) 100%);
        }

        .cookie-stage {
          position: absolute;
          inset: 0;
          z-index: 20;
          display: grid;
          place-items: center;
          padding: 6.6rem 1.2rem 7.4rem;
        }

        .cookie-deck {
          width: min(1400px, 96vw);
          height: min(74vh, 820px);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(14px, 1.6vw, 22px);
          position: relative;
        }

        .cookie-card {
          position: relative;
          border-radius: 26px;
          overflow: hidden;
          border: 2px solid rgba(255,255,255,0.22);
          background: rgba(0,0,0,0.14);
          box-shadow: 0 26px 90px rgba(0,0,0,0.6);
          pointer-events: none;
          will-change: opacity, filter, transform;
          opacity: 0;
          filter: blur(18px);
          transform: translateY(14px) scale(0.98);
        }

        .cookie-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 50%;
          display: block;
          transform: scale(1.02);
          user-select: none;
          -webkit-user-drag: none;
        }

        .cookie-card::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(900px 520px at 28% 18%, rgba(255,255,255,0.08), rgba(255,255,255,0) 55%),
            linear-gradient(to bottom, rgba(0,0,0,0.02), rgba(0,0,0,0.22));
        }

        .cookie-card {
          --o: 1;
          --b: 0px;
          animation: cookieFade 560ms cubic-bezier(0.2, 0.85, 0.2, 1) both;
        }

        @keyframes cookieFade {
          from {
            opacity: 0;
            filter: blur(18px);
            transform: translateY(14px) scale(0.98);
          }
          to {
            opacity: var(--o);
            filter: blur(var(--b));
            transform: translateY(0px) scale(1);
          }
        }

        .cookie-card--side {
          width: min(520px, 34vw);
          height: min(56vh, 660px);
          --o: 0.8;
          --b: 0.8px;
        }

        .cookie-card--center {
          width: min(900px, 56vw);
          height: min(68vh, 780px);
          --o: 1;
          --b: 0px;
          pointer-events: auto;
          cursor: zoom-in;
        }

        .cookie-card--center:active {
          transform: translateY(1px) scale(0.995);
        }

        .cookie-nav {
          height: min(56vh, 660px);
          width: clamp(74px, 5.2vw, 92px);
          border-radius: 26px;

          border: 2px solid rgba(255,255,255,0.22);
          background: rgba(0,0,0,0.14);
          box-shadow: 0 26px 90px rgba(0,0,0,0.6);

          display: grid;
          place-items: center;

          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;

          transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;
          outline: none;
        }

        .cookie-nav:focus,
        .cookie-nav:focus-visible {
          outline: none;
          box-shadow: 0 26px 90px rgba(0,0,0,0.6);
        }

        .cookie-nav::-moz-focus-inner { border: 0; }

        .cookie-nav:hover {
          transform: scale(1.01);
          filter: brightness(1.04);
        }

        .cookie-nav:active {
          transform: scale(0.995);
          filter: brightness(0.98);
        }

        .cookie-nav:disabled {
          opacity: 0.25;
          cursor: default;
          pointer-events: none;
          filter: none;
          transform: none;
        }

        .cookie-nav svg {
          width: clamp(36px, 3.2vw, 48px);
          height: clamp(36px, 3.2vw, 48px);
          color: rgba(255, 255, 255, 0.92);
        }

        .cookie-footer {
          position: absolute;
          bottom: 1.1rem;
          left: 50%;
          transform: translateX(-50%);
          width: min(1240px, 94vw);
          z-index: 30;

          padding: 0.8rem 0.95rem;
          border-radius: 18px;
          border: 2px solid rgba(212,209,189,0.16);
          background: rgba(12,23,1,0.58);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 24px 70px rgba(0,0,0,0.52);
          color: rgba(212,209,189,0.96);
        }

        .cookie-footer-row {
          --slot: clamp(170px, 22vw, 220px);
          display: grid;
          grid-template-columns: var(--slot) 1fr var(--slot);
          align-items: center;
        }

        .cookie-footer-spacer {
          width: var(--slot);
        }

        .cookie-footer-subtitle {
          text-align: center;
          letter-spacing: 0.08em;
          line-height: 1.45;
          font-size: clamp(0.9rem, 1.4vw, 1.06rem);
          opacity: 0.98;
          padding: 0.35rem 0.5rem;
        }

        .cookie-continue {
          width: var(--slot);
          justify-self: end;

          border-radius: 16px;
          padding: 12px 14px;
          border: 2px solid rgba(212,209,189,0.22);
          background: var(--madras);
          color: var(--chino);

          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;

          box-shadow: 0 18px 54px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);

          transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          justify-content: center;

          outline: none;
          -webkit-tap-highlight-color: transparent;
        }

        .cookie-continue:focus,
        .cookie-continue:focus-visible {
          outline: none;
          box-shadow: 0 18px 54px rgba(0,0,0,0.32);
        }

        .cookie-continue::-moz-focus-inner { border: 0; }

        .cookie-continue:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        .cookie-continue:active {
          transform: translateY(0px) scale(0.99);
          filter: brightness(0.98);
        }

        .cookie-continue:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          pointer-events: none;
          transform: none;
          filter: none;
        }

        .cookie-zoom-overlay {
          position: absolute;
          inset: 0;
          z-index: 50;
          display: grid;
          place-items: center;
          background: rgba(0,0,0,0.62);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 1.2rem;
          animation: zoomOverlayIn 220ms ease both;
        }

        @keyframes zoomOverlayIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }

        .cookie-zoom-card {
          width: auto;
          height: auto;
          max-width: min(1380px, 94vw);
          max-height: min(90vh, 980px);
          border-radius: 28px;
          overflow: hidden;
          border: 2px solid rgba(255,255,255,0.28);
          background: rgba(0,0,0,0.18);
          box-shadow: 0 34px 120px rgba(0,0,0,0.72);
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .cookie-zoom-card img {
          width: 100%;
          height: 100%;
          object-fit: contain !important;
          object-position: var(--zoom-pos, 50% 50%) !important;
          display: block;
          user-select: none;
          -webkit-user-drag: none;
        }

        .cookie-zoom-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 46px;
          height: 46px;
          border-radius: 16px;

          display: grid;
          place-items: center;

          border: 2px solid rgba(212,209,189,0.22);
          background: rgba(12,23,1,0.42);
          color: rgba(212,209,189,0.96);
          cursor: pointer;

          box-shadow: 0 18px 54px rgba(0,0,0,0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);

          transition: transform 160ms ease, filter 160ms ease;
          padding: 0;
          line-height: 0;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }

        .cookie-zoom-close:focus,
        .cookie-zoom-close:focus-visible { outline: none; }
        .cookie-zoom-close::-moz-focus-inner { border: 0; }

        .cookie-zoom-close:hover { transform: translateY(-1px); filter: brightness(1.06); }
        .cookie-zoom-close:active { transform: translateY(0px) scale(0.99); filter: brightness(0.98); }

        .cookie-zoom-close svg {
          display: block;
          width: 20px;
          height: 20px;
          color: rgba(212,209,189,0.95);
        }

        .cookie-gate-overlay {
          position: absolute;
          inset: 0;
          z-index: 80;
          display: grid;
          place-items: center;
          background: rgba(0,0,0,0.66);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 1.2rem;
        }

        .cookie-gate-card {
          width: min(820px, 94vw);
          border-radius: 22px;
          border: 2px solid rgba(212,209,189,0.18);
          box-shadow: 0 34px 120px rgba(0,0,0,0.72);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          padding: 1.2rem 1.1rem 1rem;
          position: relative;
          overflow: hidden;
          color: rgba(212,209,189,0.96);
          font-family: ${TYPE_STACK};
          z-index: 90;

          background-image:
            linear-gradient(rgba(12,23,1,0.76), rgba(12,23,1,0.86)),
            url('/cookie/cookie-bg-pattern.jpeg');
          background-size: cover;
          background-position: center;
        }

        .cookie-gate-card::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(900px 520px at 50% 18%, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%);
          opacity: 0.9;
          z-index: 0;
        }

        .cookie-gate-fxLayer {
          position: absolute;
          inset: 0;
          z-index: 6;
          pointer-events: none;
        }

        .cookie-gate-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 46px;
          height: 46px;
          border-radius: 16px;

          display: grid;
          place-items: center;

          border: 2px solid rgba(212,209,189,0.26);
          background: rgba(12,23,1,0.36);
          color: rgba(212,209,189,0.96);

          cursor: pointer;
          outline: none;
          -webkit-tap-highlight-color: transparent;

          z-index: 12;

          box-shadow: 0 18px 54px rgba(0,0,0,0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);

          transition: transform 160ms ease, filter 160ms ease, background 160ms ease;
          padding: 0;
        }

        .cookie-gate-close:focus,
        .cookie-gate-close:focus-visible { outline: none; }
        .cookie-gate-close::-moz-focus-inner { border: 0; }
        .cookie-gate-close:hover { transform: translateY(-1px); filter: brightness(1.06); background: rgba(12,23,1,0.48); }
        .cookie-gate-close:active { transform: translateY(0px) scale(0.99); filter: brightness(0.98); }
        .cookie-gate-close svg { width: 20px; height: 20px; display: block; pointer-events: none; }

        .cookie-gate-title {
          text-align: center;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          font-weight: 950;
          font-size: clamp(1.35rem, 2.3vw, 1.75rem);
          margin: 0.3rem 0 0.45rem;
          position: relative;
          z-index: 5;
          color: rgba(212,209,189,0.98);
        }

        .cookie-gate-subtitle {
          text-align: center;
          letter-spacing: 0.09em;
          line-height: 1.55;
          font-size: clamp(0.95rem, 1.55vw, 1.06rem);
          opacity: 0.98;
          margin: 0 0 0.95rem;
          padding: 0 0.8rem;
          position: relative;
          z-index: 5;
          color: rgba(212,209,189,0.96);
        }

        .cookie-gate-body {
          display: grid;
          gap: 0.9rem;
          place-items: center;
          padding: 0.2rem 0.4rem 0.25rem;
          position: relative;
          z-index: 5;
        }

        .cookie-gate-cookie {
          border: none;
          background: transparent;
          box-shadow: none;
          width: auto;
          height: auto;
          padding: 0;
          border-radius: 0;
          display: grid;
          place-items: center;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          outline: none;
          transition: transform 140ms ease, filter 140ms ease;
          position: relative;
          z-index: 5;
        }

        .cookie-gate-cookie:focus,
        .cookie-gate-cookie:focus-visible { outline: none; box-shadow: none; }
        .cookie-gate-cookie::-moz-focus-inner { border: 0; }
        .cookie-gate-cookie:hover { transform: translateY(-1px) scale(1.03); filter: brightness(1.04); }
        .cookie-gate-cookie:active { transform: translateY(0px) scale(0.99); filter: brightness(0.98); }
        .cookie-gate-cookie:disabled { opacity: 0.55; cursor: default; transform: none; filter: none; }

        .cookie-gate-cookie-imgWrap {
          width: clamp(190px, 26vw, 260px);
          height: clamp(190px, 26vw, 260px);
          border-radius: 999px;
          display: grid;
          place-items: center;
          position: relative;
        }

        .cookie-gate-cookie-img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          user-select: none;
          -webkit-user-drag: none;
          filter: drop-shadow(0 18px 48px rgba(0,0,0,0.45));
          transform-origin: 50% 50%;
          animation: cookieBop 180ms ease both;
        }

        @keyframes cookieBop {
          0% { transform: scale(1) rotate(0deg); }
          55% { transform: scale(1.045) rotate(-1.2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }

        .cookie-gate-pop {
          position: absolute;
          transform: translate(-50%, -50%);
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(212,209,189,0.98);
          text-shadow: 0 10px 26px rgba(0,0,0,0.62);
          animation: popFloat 650ms ease both;
          will-change: transform, opacity, filter;
          white-space: nowrap;
          font-size: 0.92rem;

          background: transparent;
          border: none;
          padding: 0;
          border-radius: 0;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        @keyframes popFloat {
          0% { opacity: 0; transform: translate(-50%, -50%) translateY(8px) scale(0.98); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) translateY(-38px) scale(1.03); }
        }

        .cookie-gate-crumb {
          position: absolute;
          left: 0;
          top: 0;
          transform: translate(-50%, -50%);
          animation-name: crumbFly;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
          animation-fill-mode: both;
          will-change: transform, opacity, filter;
          pointer-events: none;

          box-shadow: 0 10px 26px rgba(0,0,0,0.35);
          border: 1px solid rgba(12,23,1,0.18);
          opacity: 0.85;
          filter: saturate(1.08) contrast(1.03);
        }

        @keyframes crumbFly {
          0% {
            transform: translate(-50%, -50%) translate3d(0px, 0px, 0) rotate(0deg);
            opacity: 0.95;
            filter: blur(0px) saturate(1.08) contrast(1.03);
          }
          100% {
            transform: translate(-50%, -50%) translate3d(var(--dx, 0px), var(--dy, 0px), 0) rotate(var(--rot, 0deg));
            opacity: 0;
            filter: blur(0.7px) saturate(1.08) contrast(1.03);
          }
        }

        .cookie-gate-progressWrap {
          width: min(560px, 88vw);
          display: grid;
          gap: 0.5rem;
          position: relative;
          z-index: 5;
        }

        .cookie-gate-progressTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 900;
          font-size: 0.76rem;
          opacity: 0.98;
          color: rgba(212,209,189,0.92);
        }

        .cookie-gate-bar {
          height: 14px;
          border-radius: 999px;
          border: 2px solid rgba(212,209,189,0.18);
          background: rgba(12,23,1,0.35);
          overflow: hidden;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.22);
        }

        .cookie-gate-barFill {
          height: 100%;
          width: 0%;
          background: var(--chino);
          transition: width 140ms ease;
        }

        .cookie-gate-actions {
          width: min(560px, 88vw);
          display: flex;
          justify-content: center;
          padding-top: 0.35rem;
          position: relative;
          z-index: 5;
        }

        .cookie-gate-continue {
          border-radius: 16px;
          padding: 12px 18px;
          border: 2px solid rgba(212,209,189,0.22);
          background: var(--madras);
          color: var(--chino);
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 18px 54px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;
          white-space: nowrap;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }

        .cookie-gate-continue:focus,
        .cookie-gate-continue:focus-visible { outline: none; }
        .cookie-gate-continue::-moz-focus-inner { border: 0; }
        .cookie-gate-continue:hover { transform: translateY(-1px); filter: brightness(1.04); }
        .cookie-gate-continue:active { transform: translateY(0px) scale(0.99); filter: brightness(0.98); }
        .cookie-gate-continue:disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; transform: none; filter: none; }

        .cookie-gate-congrats {
          width: min(640px, 88vw);
          max-height: min(54vh, 520px);
          height: auto;
          object-fit: contain;
          display: block;
          border-radius: 22px;
          border: 2px solid rgba(212,209,189,0.18);
          background: rgba(12,23,1,0.22);
          box-shadow: 0 26px 90px rgba(0,0,0,0.55);
          user-select: none;
          -webkit-user-drag: none;
          position: relative;
          z-index: 5;
        }

        .cookie-confetti-screen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 90;
        }

        .cookie-confetti-screen, .cookie-confetti-screen * { pointer-events: none; }

        .cookie-confetti-screen > span {
          position: absolute;
          top: -18vh;
          border-radius: 3px;
          opacity: 0.95;
          animation-name: confettiFall;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
          animation-fill-mode: both;
          will-change: transform, opacity;
        }

        @keyframes confettiFall {
          0% { transform: translate3d(var(--drift, 0px), -18vh, 0) rotate(var(--rot, 0deg)); opacity: 0.95; }
          100% { transform: translate3d(calc(var(--drift, 0px) * -1), 120vh, 0) rotate(calc(var(--rot, 0deg) + var(--spin, 360deg))); opacity: 0.95; }
        }

        @media (max-width: 900px) {
          .cookie-deck { gap: 12px }
          .cookie-card--side { width: min(380px, 28vw); height: min(48vh, 560px); }
          .cookie-card--center { width: min(760px, 62vw); height: min(62vh, 700px); }
          .cookie-nav { height: min(48vh, 560px); width: clamp(64px, 5.4vw, 84px); }
        }

        @media (max-width: 720px) {
          .cookie-stage { padding: 5.6rem 0.9rem 7.4rem }
          .cookie-deck { height: min(66vh, 740px) }
          .cookie-card--side { display: none }
          .cookie-card--center { width: min(980px, 92vw); height: min(62vh, 700px); }
          .cookie-nav { height: 56px; width: 56px; border-radius: 16px; }
          .cookie-nav svg { width: 28px; height: 28px; }
          .cookie-footer-row { --slot: clamp(160px, 36vw, 220px); }
        }
      `}</style>

      <div className="cookie-topTitle">[Bake Bar]</div>

      <video className="cookie-bg-video" src="/cookie/cookie-bg-vid.mp4" autoPlay loop muted playsInline />
      <div className="cookie-vignette" />

      <div className="cookie-stage">
        <div className="cookie-deck">
          <button
            className="cookie-nav cookie-nav--left"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!isZoomed) prev()
            }}
            aria-label="Previous image"
            type="button"
            disabled={isZoomed}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M15.5 19a1 1 0 0 1-.7-.3l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 1 1 1.4 1.4L10.91 12l5.29 5.3A1 1 0 0 1 15.5 19z"
              />
            </svg>
          </button>

          <div className="cookie-card cookie-card--side" key={`left-${left.key}`}>
            <img src={left.src} alt={left.alt} />
          </div>

          <div
            className="cookie-card cookie-card--center"
            key={`center-${active.key}`}
            role="button"
            tabIndex={0}
            onClick={() => setIsZoomed(true)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              setIsZoomed(true)
            }}
          >
            <img src={active.src} alt={active.alt} />
          </div>

          <div className="cookie-card cookie-card--side" key={`right-${right.key}`}>
            <img src={right.src} alt={right.alt} />
          </div>

          <button
            className="cookie-nav cookie-nav--right"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!isZoomed) next()
            }}
            aria-label="Next image"
            type="button"
            disabled={isZoomed}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M8.5 19a1 1 0 0 1-.7-1.7l5.29-5.3-5.29-5.3A1 1 0 1 1 9.2 5.3l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-.7.3z"
              />
            </svg>
          </button>
        </div>
      </div>

      <footer className="cookie-footer">
        <div className="cookie-footer-row">
          <div className="cookie-footer-spacer" aria-hidden="true" />
          <div className="cookie-footer-subtitle">{active?.subtitle ?? ""}</div>
          <button className="cookie-continue" onClick={openGate} type="button" disabled={footerButtonDisabled}>
            {footerButtonLabel}
          </button>
        </div>
      </footer>

      {isZoomed && active && (
        <div className="cookie-zoom-overlay" onClick={() => setIsZoomed(false)} role="button" tabIndex={-1}>
          <div
            className="cookie-zoom-card"
            style={{ ["--zoom-pos" as any]: active.zoomObjectPosition ?? "50% 50%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={active.src} alt={active.alt} />
            <button className="cookie-zoom-close" type="button" aria-label="Close" onClick={() => setIsZoomed(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M7 7L17 17M17 7L7 17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showConfetti && (
        <div className="cookie-confetti-screen" aria-hidden="true">
          {confettiPieces.map((p) => (
            <span
              key={p.id}
              style={
                {
                  left: `${p.left}%`,
                  width: `${p.w}px`,
                  height: `${p.h}px`,
                  background: p.color,
                  animationDelay: `${p.delayMs}ms`,
                  animationDuration: `${p.durationMs}ms`,
                  ["--drift" as any]: `${p.driftPx}px`,
                  ["--rot" as any]: `${p.rotDeg}deg`,
                  ["--spin" as any]: `${p.spinDeg}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {showGate && (
        <div className="cookie-gate-overlay" role="dialog" aria-modal="true" aria-label="Cookie goal modal">
          <div className="cookie-gate-card" ref={gateCardRef}>
            <div className="cookie-gate-fxLayer" aria-hidden="true">
              {pops.map((p) => (
                <div key={p.id} className="cookie-gate-pop" style={{ left: `${p.x}px`, top: `${p.y}px` }}>
                  +1 🍪
                </div>
              ))}

              {crumbs.map((c) => (
                <span
                  key={c.id}
                  className="cookie-gate-crumb"
                  style={
                    {
                      left: `${c.x}px`,
                      top: `${c.y}px`,
                      width: `${c.size}px`,
                      height: `${c.size}px`,
                      borderRadius: `${c.round}px`,
                      opacity: c.alpha,
                      animationDelay: `${c.delayMs}ms`,
                      animationDuration: `${c.durationMs}ms`,
                      backgroundImage: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0) 58%),
                                       radial-gradient(circle at 70% 65%, ${c.dot} 0 22%, rgba(0,0,0,0) 23%),
                                       radial-gradient(circle at 45% 78%, ${c.dot} 0 16%, rgba(0,0,0,0) 17%),
                                       linear-gradient(135deg, ${c.c1}, ${c.c2})`,
                      ["--dx" as any]: `${c.dx}px`,
                      ["--dy" as any]: `${c.dy}px`,
                      ["--rot" as any]: `${c.rot}deg`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>

            <button className="cookie-gate-close" type="button" aria-label="Close" onClick={closeGate}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M7 7L17 17M17 7L7 17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="cookie-gate-title">{gateHeadline}</div>
            <div className="cookie-gate-subtitle">{gateMotivation}</div>

            <div className="cookie-gate-body">
              {gateComplete ? (
                <img className="cookie-gate-congrats" src="/cookie/congrations.jpg" alt="Congratulations" draggable={false} />
              ) : (
                <button type="button" className="cookie-gate-cookie" onClick={handleGateCookieClick} aria-label="Click cookie">
                  <div className="cookie-gate-cookie-imgWrap">
                    <img
                      key={cookieBop}
                      className="cookie-gate-cookie-img"
                      src="/cookie/cookie.png"
                      alt="Cookie"
                      draggable={false}
                    />
                  </div>
                </button>
              )}

              <div className="cookie-gate-progressWrap" aria-label="Progress">
                <div className="cookie-gate-progressTop">
                  <span>
                    {cookieClicks}/100
                  </span>
                  <span>{gatePct}%</span>
                </div>
                <div className="cookie-gate-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={gatePct}>
                  <div className="cookie-gate-barFill" style={{ width: `${gatePct}%` }} />
                </div>
              </div>

              <div className="cookie-gate-actions">
                <button type="button" className="cookie-gate-continue" onClick={handleGateContinue} disabled={!gateComplete}>
                  CONTINUE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
