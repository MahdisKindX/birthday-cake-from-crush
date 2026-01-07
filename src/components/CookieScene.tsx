// src/components/CookieScene.tsx
import { useCallback, useEffect, useMemo, useState } from "react";

type Slide = {
  key: string;
  src: string;
  alt: string;
  subtitle: string;
};

type CookieSceneProps = {
  onNextScene?: () => void;
};

type ConfettiPiece = {
  id: string;
  left: number;
  delayMs: number;
  durationMs: number;
  driftPx: number;
  rotDeg: number;
  spinDeg: number;
  w: number;
  h: number;
  color: string;
};

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
        key: "choco-focused",
        src: "/cookie/choco-focused.jpeg",
        alt: "Chocolate focused cookie",
        subtitle: "The signature chocolate look, refined and ready for photos",
      },
      {
        key: "cookie-closeup",
        src: "/cookie/cookie-closeup.jpeg",
        alt: "Cookie closeup",
        subtitle: "Close up perfection, texture, shine, and that fresh baked glow",
      },
      {
        key: "pistachio-focused",
        src: "/cookie/pistachio-focused.jpeg",
        alt: "Pistachio focused cookie",
        subtitle: "The pistachio moment, the flavor that makes people pause",
      },
      {
        key: "choco-pattern",
        src: "/cookie/choco-pattern.jpeg",
        alt: "Chocolate pattern",
        subtitle: "The aesthetic direction, patterns that made the visuals feel premium",
      },
      {
        key: "cookie-bg-pattern",
        src: "/cookie/cookie-bg-pattern.jpeg",
        alt: "Cookie background pattern",
        subtitle: "The brand backdrop, cozy, sweet, and instantly recognizable",
      },
    ],
    []
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const [showGate, setShowGate] = useState(false);
  const [cookieClicks, setCookieClicks] = useState(0);
  const [gateComplete, setGateComplete] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiSeed, setConfettiSeed] = useState(0);

  const REQUIRED_CLICKS = 100;

  const leftIndex = (activeIndex - 1 + slides.length) % slides.length;
  const rightIndex = (activeIndex + 1) % slides.length;

  const active = slides[activeIndex];
  const left = slides[leftIndex];
  const right = slides[rightIndex];

  const next = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prev = useCallback(() => {
    setActiveIndex((p) => (p - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const openGate = useCallback(() => {
    setShowGate(true);
  }, []);

  const handleGateCookieClick = useCallback(() => {
    setCookieClicks((prevCount) => {
      if (prevCount >= REQUIRED_CLICKS) return prevCount;

      const nextCount = Math.min(prevCount + 1, REQUIRED_CLICKS);

      if (nextCount === REQUIRED_CLICKS) {
        setGateComplete(true);
        setConfettiSeed((s) => s + 1);
        setShowConfetti(true);
        window.setTimeout(() => setShowConfetti(false), 5200);
      }

      return nextCount;
    });
  }, []);

  const handleGateContinue = useCallback(() => {
    if (!gateComplete) return;
    setShowGate(false);
    onNextScene?.();
  }, [gateComplete, onNextScene]);

  const confettiPieces = useMemo<ReadonlyArray<ConfettiPiece>>(() => {
    const colors = ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#b517ff", "#f77f00", "#f72585", "#a7c957"];
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const randi = (min: number, max: number) => Math.floor(rand(min, max + 1));

    return Array.from({ length: 240 }, (_, i) => {
      const id = `c${confettiSeed}-${i}`;
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
      };
    });
  }, [confettiSeed]);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 40);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showGate) {
        if (e.key === "Escape") {
          e.preventDefault();
        }
        return;
      }

      const isLeft = e.key === "ArrowLeft";
      const isRight = e.key === "ArrowRight";
      const isEnter = e.key === "Enter";
      const isEsc = e.key === "Escape";

      if (isEnter) {
        e.preventDefault();
        setIsZoomed((v) => !v);
        return;
      }

      if (isEsc) {
        if (!isZoomed) return;
        e.preventDefault();
        setIsZoomed(false);
        return;
      }

      if (isLeft) {
        e.preventDefault();
        if (!isZoomed) prev();
        return;
      }

      if (isRight) {
        e.preventDefault();
        if (!isZoomed) next();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isZoomed, next, prev, showGate]);

  const gatePct = Math.round((Math.min(cookieClicks, REQUIRED_CLICKS) / REQUIRED_CLICKS) * 100);

  return (
    <div className={`cookie-scene ${mounted ? "is-mounted" : ""}`}>
      <style>{`
        .cookie-scene {
          position: absolute;
          inset: 0;
          z-index: 60;
          overflow: hidden;
          background: transparent;
          color: rgba(255, 255, 255, 0.96);
          font-family: "Courier New", Courier, monospace;
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
        }

        .cookie-nav:hover {
          transform: scale(1.01);
          filter: brightness(1.04);
        }

        .cookie-nav:active {
          transform: scale(0.995);
          filter: brightness(0.98);
        }

        .cookie-nav:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 4px;
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

          padding: 0.7rem 0.9rem;
          border-radius: 18px;
          border: 2px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.26);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 24px 70px rgba(0,0,0,0.5);
        }

        .cookie-footer-row {
          --slot: 156px;
          display: grid;
          grid-template-columns: var(--slot) 1fr var(--slot);
          align-items: center;
        }

        .cookie-footer-spacer {
          width: var(--slot);
        }

        .cookie-footer-subtitle {
          text-align: center;
          letter-spacing: 0.1em;
          line-height: 1.45;
          font-size: clamp(0.92rem, 1.4vw, 1.06rem);
          opacity: 0.95;
          padding: 0.35rem 0.5rem;
        }

        .cookie-continue {
          width: var(--slot);
          justify-self: end;

          border-radius: 16px;
          padding: 12px 16px;
          border: 2px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.26);
          color: rgba(255, 255, 255, 0.96);
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: transform 160ms ease, filter 160ms ease;
          white-space: nowrap;
        }

        .cookie-continue:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        .cookie-continue:active {
          transform: translateY(0px) scale(0.99);
          filter: brightness(0.98);
        }

        .cookie-continue:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 3px;
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
          max-width: min(1320px, 94vw);
          max-height: min(86vh, 920px);
          border-radius: 28px;
          overflow: hidden;
          border: 2px solid rgba(255,255,255,0.28);
          background: rgba(0,0,0,0.18);
          box-shadow: 0 34px 120px rgba(0,0,0,0.72);
          animation: zoomCardIn 240ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        @keyframes zoomCardIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0px) scale(1);
            filter: blur(0px);
          }
        }

        .cookie-zoom-card img {
          width: auto;
          height: auto;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
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

          border: 2px solid rgba(255,255,255,0.22);
          background: rgba(0,0,0,0.28);
          color: rgba(255,255,255,0.96);
          cursor: pointer;

          box-shadow: 0 18px 54px rgba(0,0,0,0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);

          transition: transform 160ms ease, filter 160ms ease;
          padding: 0;
          line-height: 0;
        }

        .cookie-zoom-close:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }

        .cookie-zoom-close:active {
          transform: translateY(0px) scale(0.99);
          filter: brightness(0.98);
        }

        .cookie-zoom-close:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 4px;
        }

        .cookie-zoom-close svg {
          display: block;
          width: 20px;
          height: 20px;
          color: rgba(255,255,255,0.95);
        }
          .cookie-gate-congrats {
  width: min(640px, 88vw);
  max-height: min(54vh, 520px);
  height: auto;
  object-fit: contain;
  display: block;

  border-radius: 22px;
  border: 2px solid rgba(255,255,255,0.22);
  background: rgba(0,0,0,0.18);
  box-shadow: 0 26px 90px rgba(0,0,0,0.55);

  user-select: none;
  -webkit-user-drag: none;
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
          width: min(760px, 92vw);
          border-radius: 22px;
          border: 2px solid rgba(255,255,255,0.22);
          background: rgba(0,0,0,0.28);
          box-shadow: 0 34px 120px rgba(0,0,0,0.72);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          padding: 1.1rem 1.1rem 1rem;
          position: relative;
          overflow: hidden;
        }

        .cookie-gate-title {
          text-align: center;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          font-weight: 950;
          font-size: clamp(1.25rem, 2.2vw, 1.6rem);
          margin: 0.25rem 0 0.5rem;
        }

        .cookie-gate-subtitle {
          text-align: center;
          letter-spacing: 0.12em;
          line-height: 1.45;
          font-size: clamp(0.9rem, 1.5vw, 1.02rem);
          opacity: 0.92;
          margin: 0 0 0.9rem;
          padding: 0 0.6rem;
        }

        .cookie-gate-body {
          display: grid;
          gap: 0.85rem;
          place-items: center;
          padding: 0.2rem 0.4rem 0.2rem;
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
  transition: transform 140ms ease, filter 140ms ease;
    outline: none;

}

.cookie-gate-cookie:focus,
.cookie-gate-cookie:focus-visible {
  outline: none;
  box-shadow: none;
}

.cookie-gate-cookie::-moz-focus-inner {
  border: 0;
}

.cookie-gate-cookie:hover {
  transform: translateY(-1px) scale(1.03);
  filter: brightness(1.05);
}

.cookie-gate-cookie:active {
  transform: translateY(0px) scale(0.99);
  filter: brightness(0.98);
}

.cookie-gate-cookie:disabled {
  opacity: 0.55;
  cursor: default;
  transform: none;
  filter: none;
}

.cookie-gate-cookie-emoji {
  font-size: clamp(7.5rem, 14vw, 12rem);
  line-height: 1;
  transform: translateY(2px);
}

        .cookie-gate-progressWrap {
          width: min(520px, 86vw);
          display: grid;
          gap: 0.45rem;
        }

        .cookie-gate-progressTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 900;
          font-size: 0.74rem;
          opacity: 0.9;
        }

        .cookie-gate-bar {
          height: 14px;
          border-radius: 999px;
          border: 2px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.18);
          overflow: hidden;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.18);
        }

        .cookie-gate-barFill {
          height: 100%;
          width: 0%;
          background: rgba(255,255,255,0.86);
          transition: width 140ms ease;
        }

        .cookie-gate-actions {
          width: min(520px, 86vw);
          display: flex;
          justify-content: center;
          padding-top: 0.35rem;
        }

        .cookie-gate-continue {
          border-radius: 16px;
          padding: 12px 18px;
          border: 2px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.26);
          color: rgba(255, 255, 255, 0.96);
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;
          white-space: nowrap;
        }

        .cookie-gate-continue:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        .cookie-gate-continue:active {
          transform: translateY(0px) scale(0.99);
          filter: brightness(0.98);
        }

        .cookie-gate-continue:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 3px;
        }

        .cookie-gate-continue[disabled] {
          opacity: 0.3;
          cursor: default;
          pointer-events: none;
          transform: none;
          filter: none;
        }

        .cookie-confetti-screen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 90;
}

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
  0% {
    transform: translate3d(var(--drift, 0px), -18vh, 0) rotate(var(--rot, 0deg));
    opacity: 0.95;
  }
  100% {
    transform: translate3d(calc(var(--drift, 0px) * -1), 120vh, 0) rotate(calc(var(--rot, 0deg) + var(--spin, 360deg)));
    opacity: 0.95;
  }
}

        @media (max-width: 900px) {
          .cookie-deck { gap: 12px }
          .cookie-card--side {
            width: min(380px, 28vw);
            height: min(48vh, 560px);
          }
          .cookie-card--center {
            width: min(760px, 62vw);
            height: min(62vh, 700px);
          }
          .cookie-nav {
            height: min(48vh, 560px);
            width: clamp(64px, 5.4vw, 84px);
          }
          .cookie-footer-row { --slot: 138px; }
        }

        @media (max-width: 720px) {
          .cookie-stage { padding: 5.6rem 0.9rem 7.4rem }
          .cookie-deck { height: min(66vh, 740px) }
          .cookie-card--side { display: none }
          .cookie-card--center {
            width: min(980px, 92vw);
            height: min(62vh, 700px);
          }
          .cookie-nav {
            height: 56px;
            width: 56px;
            border-radius: 16px;
          }
          .cookie-nav svg {
            width: 28px;
            height: 28px;
          }
          .cookie-zoom-close {
            width: 44px;
            height: 44px;
            border-radius: 14px;
          }
          .cookie-footer-row { --slot: 126px; }
          .cookie-gate-card { padding: 1rem 0.95rem 0.95rem; }
        }
      `}</style>

      <video className="cookie-bg-video" src="/cookie/cookie-bg-vid.mp4" autoPlay loop muted playsInline />
      <div className="cookie-vignette" />

      <div className="cookie-stage">
        <div className="cookie-deck">
          <button
            className="cookie-nav cookie-nav--left"
            onClick={() => {
              if (!isZoomed) prev();
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
              if (e.key !== "Enter") return;
              e.preventDefault();
              setIsZoomed(true);
            }}
          >
            <img src={active.src} alt={active.alt} />
          </div>

          <div className="cookie-card cookie-card--side" key={`right-${right.key}`}>
            <img src={right.src} alt={right.alt} />
          </div>

          <button
            className="cookie-nav cookie-nav--right"
            onClick={() => {
              if (!isZoomed) next();
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
          <button className="cookie-continue" onClick={openGate} type="button">
            continue
          </button>
        </div>
      </footer>

      {isZoomed && active && (
        <div className="cookie-zoom-overlay" onClick={() => setIsZoomed(false)} role="button" tabIndex={-1}>
          <div className="cookie-zoom-card" onClick={(e) => e.stopPropagation()}>
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
        <div className="cookie-gate-overlay" role="dialog" aria-modal="true" aria-label="Wait modal">
          <div className="cookie-gate-card">
            <div className="cookie-gate-title">{gateComplete ? "YIPPEE!!!" : "WAIT"}</div>
<div className="cookie-gate-subtitle">
  {gateComplete ? "good job chef baker queen masgu 👑" : "before you move on, click this cookie 100 times"}
</div>

            <div className="cookie-gate-body">
              {gateComplete ? (
  <img
    className="cookie-gate-congrats"
    src="/cookie/congrations.jpg"
    alt="Congratulations"
    draggable={false}
  />
) : (
  <button
    type="button"
    className="cookie-gate-cookie"
    onClick={handleGateCookieClick}
    aria-label="Click cookie"
  >
    <div className="cookie-gate-cookie-emoji">🍪</div>
  </button>
)}

              <div className="cookie-gate-progressWrap" aria-label="Progress">
                <div className="cookie-gate-progressTop">
                  <span>{cookieClicks}/{REQUIRED_CLICKS}</span>
                  <span>{gatePct}%</span>
                </div>
                <div className="cookie-gate-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={gatePct}>
                  <div className="cookie-gate-barFill" style={{ width: `${gatePct}%` }} />
                </div>
              </div>

              <div className="cookie-gate-actions">
                <button
                  type="button"
                  className="cookie-gate-continue"
                  onClick={handleGateContinue}
                  disabled={!gateComplete}
                >
                  continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
