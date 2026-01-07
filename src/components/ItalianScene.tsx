// src/components/ItalianScene.tsx
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import Matter from "matter-js"

type ItalianSceneProps = {
    onNextScene?: () => void
}

type QuizQuestion = {
    prompt: string
    subtitle: string
    choices: string[]
    answer: string
    note?: string
}

type TokenDef = {
    id: string
    emoji: string
    size: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const { Engine, World, Bodies, Body, Composite } = Matter

const CAT_TOKEN = 0x0001
const CAT_MOUSE = 0x0002
const CAT_WALL = 0x0004
const CAT_OBS = 0x0008

const wallRestitution = 0.72
const obstacleRestitution = 0.35
const itemRestitution = 0.58

const frictionAir = 0.012
const maxSpeed = 3.8

const driftKick = 0.00006
const driftTurn = 0.028

const mouseRadius = 34
const mouseVelScale = 0.35
const mouseVelMax = 18

const MODAL_FADE_MS = 220

function rectFromEl(root: HTMLElement, el: HTMLElement) {
    const rr = root.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const x = r.left - rr.left
    const y = r.top - rr.top
    const w = r.width
    const h = r.height
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
}

function useFade(open: boolean, ms: number) {
    const [mounted, setMounted] = useState(open)
    const [visible, setVisible] = useState(open)

    useEffect(() => {
        if (open) {
            setMounted(true)
            requestAnimationFrame(() => setVisible(true))
            return
        }

        setVisible(false)
        const t = window.setTimeout(() => setMounted(false), ms)
        return () => window.clearTimeout(t)
    }, [open, ms])

    return { mounted, visible }
}

type FeedbackState = {
    open: boolean
    ok: boolean
    gif: string
    title: string
    sub: string
}

export function ItalianScene({ onNextScene }: ItalianSceneProps) {
    const questions: QuizQuestion[] = useMemo(
        () => [
            {
                prompt: "Translate",
                subtitle: "Good morning",
                choices: ["Buongiorno", "Buonanotte", "Arrivederci", "Scusa"],
                answer: "Buongiorno",
                note: "Buongiorno is used in the morning and early day",
            },
            {
                prompt: "Pick the meaning",
                subtitle: "Grazie",
                choices: ["Please", "Sorry", "Thank you", "Hello"],
                answer: "Thank you",
                note: "Grazie means thank you",
            },
            {
                prompt: "Translate",
                subtitle: "How are you",
                choices: ["Come ti chiami", "Come stai", "Dove sei", "Che ore sono"],
                answer: "Come stai",
                note: "Come stai means how are you",
            },
            {
                prompt: "Pick the phrase",
                subtitle: "Nice to meet you",
                choices: ["Piacere di conoscerti", "Mi dispiace", "Per favore", "A presto"],
                answer: "Piacere di conoscerti",
                note: "Piacere di conoscerti means nice to meet you",
            },
            {
                prompt: "Translate",
                subtitle: "See you soon",
                choices: ["A domani", "A presto", "Buonasera", "Benvenuto"],
                answer: "A presto",
                note: "A presto means see you soon",
            },
        ],
        []
    )

    const backgrounds = useMemo(
        () => [
            "/italy/pexels-pixabay-531602.jpg",
            "/italy/pexels-pixabay-417344.jpg",
            "/italy/pexels-meperdinaviagem-2064827.jpg",
            "/italy/pexels-fotios-photos-1279330.jpg",
            "/italy/image.jpg",
        ],
        []
    )

    const correctPerQ = useMemo(
        () => [
            "/italy/correct/spongebob-correct.gif",
            "/italy/correct/rigby-correct.gif",
            "/italy/correct/kuromi-correct.gif",
            "/italy/correct/hk-correct.gif",
            "/italy/correct/dt-correct.gif",
        ],
        []
    )

    const wrongPerQ = useMemo(
        () => [
            "/italy/wrong/spongebob-wrong.gif",
            "/italy/wrong/rigby-wrong.gif",
            "/italy/wrong/kuromi-wrong.gif",
            "/italy/wrong/hk-wrong.gif",
            "/italy/wrong/dt-wrong.gif",
        ],
        []
    )

    const tokenDefs: TokenDef[] = useMemo(() => {
        const base = [
            "🍕",
            "🍝",
            "🍅",
            "🧀",
            "🌿",
            "🫒",
            "🥖",
            "☕️",
            "🍷",
            "🍾",
            "🌙",
            "⭐️",
            "🧡",
            "💚",
            "❤️",
            "🤍",
            "🩷",
            "💛",
            "💙",
            "🩵",
            "💜",
            "🤎",
            "🖤",
            "🩶",
            "❤️‍🔥",
            "❤️‍🩹",
            "❣️",
            "💕",
            "💞",
            "💓",
            "💗",
            "💖",
            "💘",
            "💝",
            "💌",
            "🤌🏻",
            "🎈",
            "🎉",
            "🎁",
            "🎂",
        ]

        const count = 150
        const out: TokenDef[] = []
        for (let i = 0; i < count; i += 1) {
            const emoji = base[i % base.length]
            const size = 56 + Math.round(Math.random() * 14)
            out.push({ id: `t${i + 1}`, emoji, size })
        }
        return out
    }, [])

    const [mounted, setMounted] = useState(false)
    const [idx, setIdx] = useState(0)
    const [selected, setSelected] = useState<string | null>(null)
    const [result, setResult] = useState<"idle" | "correct" | "wrong">("idle")
    const [score, setScore] = useState(0)
    const [shake, setShake] = useState(false)
    const [done, setDone] = useState(false)

    const [introOpen, setIntroOpen] = useState(true)
    const [feedback, setFeedback] = useState<FeedbackState>({
        open: false,
        ok: true,
        gif: "",
        title: "",
        sub: "",
    })

    const introFade = useFade(introOpen, MODAL_FADE_MS)
    const feedbackFade = useFade(feedback.open, MODAL_FADE_MS)

    const q = questions[clamp(idx, 0, Math.max(questions.length - 1, 0))]
    const progress = questions.length > 0 ? (idx / questions.length) * 100 : 0

    const [bgFlip, setBgFlip] = useState(false)
    const [bgA, setBgA] = useState(backgrounds[0] ?? "")
    const [bgB, setBgB] = useState(backgrounds[1] ?? "")

    const rootRef = useRef<HTMLDivElement | null>(null)
    const topRef = useRef<HTMLDivElement | null>(null)
    const cardRef = useRef<HTMLDivElement | null>(null)

    const tokenElsRef = useRef<Record<string, HTMLDivElement | null>>({})
    const setTokenEl = (id: string) => (el: HTMLDivElement | null) => {
        tokenElsRef.current[id] = el
    }

    const engineRef = useRef<Matter.Engine | null>(null)
    const tokenBodiesRef = useRef<Record<string, Matter.Body>>({})
    const wallsRef = useRef<Matter.Body[]>([])
    const obstaclesRef = useRef<Matter.Body[]>([])
    const mouseBodyRef = useRef<Matter.Body | null>(null)
    const rafRef = useRef<number | null>(null)

    const mouseRef = useRef({ x: 0, y: 0, active: false })
    const mouseKinRef = useRef({ lastX: -9999, lastY: -9999 })

    const startQuiz = () => {
        setIntroOpen(false)
    }

    const gifForAnswer = (ok: boolean, questionIndex: number) => {
        const arr = ok ? correctPerQ : wrongPerQ
        const safe = Math.max(arr.length, 1)
        return arr[questionIndex % safe] ?? ""
    }

    const finalScoreGif = useMemo(() => {
        if (score === 5) return "/italy/correct/perfect-score.gif"
        if (score >= 3) return "/italy/correct/good-score.gif"
        if (score >= 1) return "/italy/wrong/bad-score.gif"
        return "/italy/wrong/zero-score.gif"
    }, [score])

    const finalLabel = useMemo(() => {
        if (score === 5) return "Perfecto 🏆"
        if (score >= 3) return "Fantastico 🙂"
        if (score >= 1) return "Eh 🙄"
        return "Try again loser 🫥"
    }, [score])

    useEffect(() => {
        setMounted(false)
        const t = window.setTimeout(() => setMounted(true), 30)
        return () => window.clearTimeout(t)
    }, [])

    useEffect(() => {
        const nextBg = backgrounds[idx % Math.max(backgrounds.length, 1)] ?? ""
        if (!bgFlip) {
            setBgB(nextBg)
            setBgFlip(true)
            return
        }
        setBgA(nextBg)
        setBgFlip(false)
    }, [idx, backgrounds, bgFlip])

    useEffect(() => {
        const root = rootRef.current
        if (!root) return

        const engine = Engine.create()
        engine.gravity.x = 0
        engine.gravity.y = 0
        engineRef.current = engine

        const world = engine.world

        const mouseBody = Bodies.circle(-2000, -2000, mouseRadius, {
            restitution: 0.95,
            friction: 0,
            frictionAir: 0,
            density: 0.06,
            collisionFilter: { category: CAT_MOUSE, mask: CAT_TOKEN },
        })
        Body.setInertia(mouseBody, Infinity)
        World.add(world, mouseBody)
        mouseBodyRef.current = mouseBody

        const removeStatics = () => {
            if (wallsRef.current.length) World.remove(world, wallsRef.current)
            if (obstaclesRef.current.length) World.remove(world, obstaclesRef.current)
            wallsRef.current = []
            obstaclesRef.current = []
        }

        const addWallsAndObstacles = () => {
            const w = root.clientWidth
            const h = root.clientHeight

            const thick = 80
            const pad = 2

            const wallOpts = {
                isStatic: true,
                restitution: wallRestitution,
                friction: 0.02,
                collisionFilter: { category: CAT_WALL, mask: CAT_TOKEN },
            }

            const left = Bodies.rectangle(-thick / 2 + pad, h / 2, thick, h + thick * 2, wallOpts)
            const right = Bodies.rectangle(w + thick / 2 - pad, h / 2, thick, h + thick * 2, wallOpts)
            const top = Bodies.rectangle(w / 2, -thick / 2 + pad, w + thick * 2, thick, wallOpts)
            const bottom = Bodies.rectangle(w / 2, h + thick / 2 - pad, w + thick * 2, thick, wallOpts)

            World.add(world, [left, right, top, bottom])
            wallsRef.current = [left, right, top, bottom]

            const obs: Matter.Body[] = []
            const obsOpts = {
                isStatic: true,
                restitution: obstacleRestitution,
                friction: 0.02,
                collisionFilter: { category: CAT_OBS, mask: CAT_TOKEN },
            }

            const addObs = (el: HTMLElement | null, padding: number) => {
                if (!el) return
                const r = rectFromEl(root, el)
                const bw = r.w + padding * 2
                const bh = r.h + padding * 2
                const b = Bodies.rectangle(r.cx, r.cy, bw, bh, obsOpts)
                obs.push(b)
            }

            addObs(topRef.current, 12)
            addObs(cardRef.current, 16)

            if (obs.length) World.add(world, obs)
            obstaclesRef.current = obs
        }

        const syncStatics = () => {
            removeStatics()
            addWallsAndObstacles()
        }

        const spawnTokens = () => {
            const w = root.clientWidth
            const h = root.clientHeight

            const avoid = (() => {
                const el = cardRef.current
                if (!el) return null
                return rectFromEl(root, el)
            })()

            const bodies: Record<string, Matter.Body> = {}
            for (const t of tokenDefs) {
                const s = t.size
                let x = Math.random() * (w - 2 * s) + s
                let y = Math.random() * (h - 2 * s) + s

                if (avoid) {
                    let tries = 0
                    while (
                        tries < 60 &&
                        x > avoid.x - s &&
                        x < avoid.x + avoid.w + s &&
                        y > avoid.y - s &&
                        y < avoid.y + avoid.h + s
                    ) {
                        x = Math.random() * (w - 2 * s) + s
                        y = Math.random() * (h - 2 * s) + s
                        tries += 1
                    }
                }

                const b = Bodies.rectangle(x, y, s, s, {
                    restitution: itemRestitution,
                    friction: 0.01,
                    frictionAir,
                    density: 0.0012,
                    collisionFilter: {
                        category: CAT_TOKEN,
                        mask: CAT_TOKEN | CAT_WALL | CAT_OBS | CAT_MOUSE,
                    },
                })

                const vx = (Math.random() - 0.5) * 1.6
                const vy = (Math.random() - 0.5) * 1.6
                Body.setVelocity(b, { x: vx, y: vy })
                Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.06)

                bodies[t.id] = b
            }

            World.add(world, Object.values(bodies))
            tokenBodiesRef.current = bodies
        }

        syncStatics()
        spawnTokens()

        const ro = new ResizeObserver(() => {
            syncStatics()
        })
        ro.observe(root)

        let last = performance.now()

        const tick = () => {
            const now = performance.now()
            const dtMs = clamp(now - last, 8, 34)
            last = now

            const mb = mouseBodyRef.current
            const m = mouseRef.current

            const rr = root.getBoundingClientRect()
            const mx = m.x - rr.left
            const my = m.y - rr.top

            if (mb) {
                if (m.active) {
                    const dx = mx - mouseKinRef.current.lastX
                    const dy = my - mouseKinRef.current.lastY

                    let vx = Number.isFinite(dx) ? dx * mouseVelScale : 0
                    let vy = Number.isFinite(dy) ? dy * mouseVelScale : 0

                    const sp = Math.hypot(vx, vy)
                    if (sp > mouseVelMax) {
                        const k = mouseVelMax / sp
                        vx *= k
                        vy *= k
                    }

                    Body.setPosition(mb, { x: mx, y: my })
                    Body.setVelocity(mb, { x: vx, y: vy })

                    mouseKinRef.current.lastX = mx
                    mouseKinRef.current.lastY = my
                } else {
                    Body.setPosition(mb, { x: -2000, y: -2000 })
                    Body.setVelocity(mb, { x: 0, y: 0 })
                    mouseKinRef.current.lastX = -9999
                    mouseKinRef.current.lastY = -9999
                }
            }

            const bodies = tokenBodiesRef.current
            for (const id of Object.keys(bodies)) {
                const b = bodies[id]
                if (!b) continue

                if (Math.random() < 0.03) {
                    const fx = (Math.random() - 0.5) * driftKick
                    const fy = (Math.random() - 0.5) * driftKick
                    Body.applyForce(b, b.position, { x: fx, y: fy })
                    Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * driftTurn * 0.003)
                }

                const sp = Math.hypot(b.velocity.x, b.velocity.y)
                if (sp > maxSpeed) {
                    const k = maxSpeed / sp
                    Body.setVelocity(b, { x: b.velocity.x * k, y: b.velocity.y * k })
                }

                if (Math.hypot(b.velocity.x, b.velocity.y) < 0.012) {
                    Body.setVelocity(b, { x: 0, y: 0 })
                }
            }

            Engine.update(engine, dtMs)

            for (const def of tokenDefs) {
                const el = tokenElsRef.current[def.id]
                const b = tokenBodiesRef.current[def.id]
                if (!el || !b) continue
                const s = def.size
                const x = b.position.x - s / 2
                const y = b.position.y - s / 2
                const a = b.angle
                el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${a}rad)`
            }

            rafRef.current = window.requestAnimationFrame(tick)
        }

        rafRef.current = window.requestAnimationFrame(tick)

        return () => {
            ro.disconnect()
            if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
            rafRef.current = null

            try {
                const bodies = Composite.allBodies(world)
                if (bodies.length) World.remove(world, bodies)
            } catch { }

            engineRef.current = null
            tokenBodiesRef.current = {}
            wallsRef.current = []
            obstaclesRef.current = []
            mouseBodyRef.current = null
        }
    }, [tokenDefs])

    const openFeedback = (ok: boolean) => {
        const gif = gifForAnswer(ok, idx)
        if (ok) {
            setFeedback({
                open: true,
                ok: true,
                gif,
                title: "Correct",
                sub: q.note ? q.note : "Nice",
            })
            return
        }

        setFeedback({
            open: true,
            ok: false,
            gif,
            title: "Wrong",
            sub: `Correct answer is ${q.answer}`,
        })
    }

    const check = () => {
        if (introOpen) return
        if (!selected) return

        const ok = selected === q.answer
        if (ok) {
            setResult("correct")
            setScore((s) => s + 1)
            openFeedback(true)
            return
        }

        setResult("wrong")
        setShake(true)
        window.setTimeout(() => setShake(false), 220)
        openFeedback(false)
    }

    const goNext = () => {
        if (idx + 1 >= questions.length) {
            setDone(true)
            setResult("idle")
            setSelected(null)
            return
        }
        setIdx((v) => v + 1)
        setSelected(null)
        setResult("idle")
    }

    const closeFeedbackAndContinue = () => {
        setFeedback((f) => ({ ...f, open: false }))
        if (done) return
        goNext()
    }

    const restart = () => {
        setIdx(0)
        setSelected(null)
        setResult("idle")
        setScore(0)
        setDone(false)
        setFeedback((f) => ({ ...f, open: false }))
        setIntroOpen(true)
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key

            if (introOpen) {
                if (e.code === "Space" || key === " " || e.code === "Enter" || key === "Enter") {
                    e.preventDefault()
                    startQuiz()
                }
                return
            }

            if (feedback.open) {
                if (e.code === "Enter" || key === "Enter" || e.code === "Space" || key === " ") {
                    e.preventDefault()
                    closeFeedbackAndContinue()
                }
                return
            }

            if (done) {
                if (e.code === "Space" || key === " ") {
                    e.preventDefault()
                    onNextScene?.()
                }
                return
            }

            if (result === "idle") {
                if (key === "1" || key === "2" || key === "3" || key === "4") {
                    const i = Number(key) - 1
                    if (q.choices[i]) setSelected(q.choices[i])
                    return
                }

                if (e.code === "Enter" || key === "Enter") {
                    e.preventDefault()
                    check()
                    return
                }
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [introOpen, feedback.open, done, onNextScene, q.answer, q.choices, result, selected, idx])

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        mouseRef.current.x = e.clientX
        mouseRef.current.y = e.clientY
        mouseRef.current.active = true
    }

    const onPointerLeave = () => {
        mouseRef.current.active = false
    }

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        mouseRef.current.x = e.clientX
        mouseRef.current.y = e.clientY
        mouseRef.current.active = true
    }

    const onPointerUp = () => {
        mouseRef.current.active = false
    }

    const sceneStyle: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        zIndex: 90,
        overflow: "hidden",
        fontFamily: 'ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, Arial',
        color: "#121316",
    }

    const bgLayerBase: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        backgroundSize: "cover",
        backgroundPosition: "center",
        transition: "opacity 650ms ease",
        transform: "scale(1.02)",
    }

    const overlayStyle: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        background: "radial-gradient(900px 520px at 50% 18%, rgba(0,0,0,0.10), rgba(0,0,0,0.30))",
        pointerEvents: "none",
    }

    const wrapStyle: React.CSSProperties = {
        position: "relative",
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "14px",
        padding: "16px 16px 18px",
    }

    const topStyle: React.CSSProperties = {
        width: "min(1200px, 96vw)",
        justifySelf: "center",
        display: "grid",
        gridTemplateColumns: "1fr",
        alignItems: "center",
        gap: 12,
    }

    const brandStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        fontWeight: 980,
        fontSize: "clamp(22px, 2.9vw, 40px)",
        color: "rgba(255,255,255,0.98)",
        textShadow: "0 18px 46px rgba(0,0,0,0.40)",
    }

    const badgeStyle: React.CSSProperties = {
        width: 52,
        height: 52,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.26)",
        border: "1px solid rgba(255,255,255,0.22)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
        fontSize: 22,
    }

    const centerStyle: React.CSSProperties = {
        width: "min(1100px, 96vw)",
        justifySelf: "center",
        display: "grid",
        placeItems: "center",
        position: "relative",
    }

    const cardWrapStyle: React.CSSProperties = {
        width: "min(980px, 96vw)",
        borderRadius: 30,
        padding: 7,
        background: "linear-gradient(90deg, rgba(0,155,72,0.98), rgba(255,255,255,0.98), rgba(206,43,55,0.98))",
        boxShadow: "0 34px 90px rgba(0,0,0,0.22)",
        transform: mounted ? "translateY(0px)" : "translateY(12px)",
        opacity: mounted ? 1 : 0,
        transition: "transform 520ms ease, opacity 520ms ease",
    }

    const cardInnerStyle: React.CSSProperties = {
        borderRadius: 24,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "#ffffff",
        padding: "26px 26px 22px",
    }

    const shakeStyle: React.CSSProperties = shake ? { animation: "itShake 220ms ease" } : {}

    const promptSmallStyle: React.CSSProperties = {
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        fontWeight: 950,
        fontSize: 13,
        color: "rgba(20,22,26,0.70)",
    }

    const promptBigStyle: React.CSSProperties = {
        fontWeight: 980,
        fontSize: "clamp(26px, 2.8vw, 40px)",
        lineHeight: 1.1,
        marginTop: 8,
    }

    const choicesStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginTop: 18,
    }

    const pillStyleBase: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "#ffffff",
        letterSpacing: "0.08em",
        fontWeight: 900,
        textTransform: "uppercase",
        fontSize: 12,
        color: "rgba(14,16,18,0.86)",
    }

    const btnBase: React.CSSProperties = {
        borderRadius: 16,
        padding: "12px 14px",
        border: "1px solid rgba(0,0,0,0.14)",
        background: "#ffffff",
        color: "rgba(12,14,16,0.92)",
        fontWeight: 950,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        cursor: "pointer",
        boxShadow: "0 14px 46px rgba(0,0,0,0.16)",
        transition: "transform 140ms ease, filter 140ms ease",
    }

    const btnPrimary: React.CSSProperties = {
        ...btnBase,
        border: "1px solid rgba(0,155,72,0.40)",
        background: "#dff3e8",
    }

    const btnDisabled: React.CSSProperties = {
        ...btnBase,
        background: "#ececec",
        color: "rgba(12,14,16,0.45)",
        border: "1px solid rgba(0,0,0,0.10)",
        cursor: "not-allowed",
        boxShadow: "none",
    }

    const tokenLayerStyle: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
    }

    const uiLayerStyle: React.CSSProperties = {
        position: "relative",
        zIndex: 5,
    }

    const progressWrapInCardStyle: React.CSSProperties = {
        width: "100%",
        height: 16,
        borderRadius: 999,
        background: "rgba(0,0,0,0.12)",
        border: "1px solid rgba(0,0,0,0.14)",
        overflow: "hidden",
    }

    const progressFillStyle: React.CSSProperties = {
        height: "100%",
        width: `${done ? 100 : progress}%`,
        transition: "width 420ms ease",
        background: "linear-gradient(90deg, rgba(0,155,72,1), rgba(255,255,255,1), rgba(206,43,55,1))",
    }

    const modalOverlayBase: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        padding: 16,
        transition: `opacity ${MODAL_FADE_MS}ms ease`,
    }

    const modalCardBase: React.CSSProperties = {
        width: "min(760px, 96vw)",
        borderRadius: 26,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(0,0,0,0.70)",
        boxShadow: "0 40px 110px rgba(0,0,0,0.55)",
        overflow: "hidden",
        transition: `opacity ${MODAL_FADE_MS}ms ease, transform ${MODAL_FADE_MS}ms ease`,
    }

    const modalTopStyle: React.CSSProperties = {
        padding: "18px 18px 12px",
        color: "rgba(255,255,255,0.96)",
        display: "grid",
        gap: 8,
    }

    const modalTitleStyle: React.CSSProperties = {
        fontWeight: 980,
        fontSize: "clamp(20px, 2.2vw, 30px)",
        letterSpacing: "0.02em",
        lineHeight: 1.1,
    }

    const modalSubStyle: React.CSSProperties = {
        opacity: 0.86,
        fontSize: 14,
        lineHeight: 1.35,
    }

    const modalFooterStyle: React.CSSProperties = {
        padding: "14px 18px 18px",
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
    }

    const modalMediaWrap: React.CSSProperties = {
        width: "100%",
        aspectRatio: "16 / 9",
        minHeight: 260,
        maxHeight: "60vh",
        background: "rgba(0,0,0,0.35)",
        borderTop: "1px solid rgba(255,255,255,0.14)",
        borderBottom: "1px solid rgba(255,255,255,0.14)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 10,
        overflow: "hidden",
    }

    const modalGif: React.CSSProperties = {
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        display: "block",
    }

    return (
        <div
            ref={rootRef}
            style={sceneStyle}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
        >
            <div style={{ ...bgLayerBase, backgroundImage: `url(${bgA})`, opacity: bgFlip ? 0 : 1 }} />
            <div style={{ ...bgLayerBase, backgroundImage: `url(${bgB})`, opacity: bgFlip ? 1 : 0 }} />
            <div style={overlayStyle} />

            <div style={tokenLayerStyle} aria-hidden="true">
                {tokenDefs.map((t) => (
                    <div
                        key={t.id}
                        ref={setTokenEl(t.id)}
                        style={{
                            position: "absolute",
                            width: t.size,
                            height: t.size,
                            display: "grid",
                            placeItems: "center",
                            fontSize: Math.round(t.size * 0.78),
                            filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.18))",
                            transform: "translate3d(-2000px, -2000px, 0)",
                            willChange: "transform",
                            userSelect: "none",
                        }}
                    >
                        {t.emoji}
                    </div>
                ))}
            </div>

            <div style={wrapStyle}>
                <div ref={topRef} style={{ ...topStyle, ...uiLayerStyle }}>
                    <div style={brandStyle}>
                        <div style={badgeStyle} aria-hidden="true">
                            🦉
                        </div>
                        <div>italian duolingo quiz</div>
                    </div>
                </div>

                <div style={{ ...centerStyle, ...uiLayerStyle }}>
                    <div style={{ ...cardWrapStyle, ...shakeStyle }}>
                        <div ref={cardRef} style={cardInnerStyle}>
                            <style>
                                {`
                  @keyframes itShake {
                    0% { transform: translateY(0px) translateX(0px) }
                    25% { transform: translateY(0px) translateX(-10px) }
                    50% { transform: translateY(0px) translateX(10px) }
                    75% { transform: translateY(0px) translateX(-6px) }
                    100% { transform: translateY(0px) translateX(0px) }
                  }
                  @media (max-width: 760px) {
                    .itChoicesGrid { grid-template-columns: 1fr !important }
                  }
                `}
                            </style>

                            {done ? (
                                <div style={{ textAlign: "center", display: "grid", gap: 12, padding: "6px 0 2px" }}>
                                    <img
                                        src={finalScoreGif}
                                        alt="score"
                                        style={{
                                            width: "100%",
                                            height: 300,
                                            objectFit: "contain",
                                            display: "block",
                                            background: "rgba(0,0,0,0.04)",
                                            borderRadius: 18,
                                        }}
                                    />

                                    <div style={{ fontWeight: 980, fontSize: "clamp(24px, 2.6vw, 40px)", marginTop: 2 }}>
                                        {finalLabel}
                                    </div>

                                    <div
                                        style={{
                                            opacity: 0.82,
                                            letterSpacing: "0.12em",
                                            textTransform: "uppercase",
                                            fontWeight: 900,
                                            fontSize: 12,
                                        }}
                                    >
                                        score {score} of {questions.length}
                                    </div>

                                    <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
                                        <button style={btnBase} onClick={restart}>
                                            restart
                                        </button>
                                        <button style={btnPrimary} onClick={onNextScene}>
                                            continue
                                        </button>
                                    </div>

                                    <div style={{ marginTop: 2, opacity: 0.76, fontSize: 13 }}>Press space to continue</div>

                                    <div style={{ marginTop: 10 }}>
                                        <div style={progressWrapInCardStyle} aria-label="progress">
                                            <div style={progressFillStyle} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: "grid", gap: 6, textAlign: "left", marginBottom: 10 }}>
                                        <div style={promptSmallStyle}>
                                            {q.prompt} {idx + 1} of {questions.length}
                                        </div>
                                        <div style={promptBigStyle}>{q.subtitle}</div>
                                    </div>

                                    <div className="itChoicesGrid" style={choicesStyle}>
                                        {q.choices.map((c, i) => {
                                            const isSelected = selected === c
                                            const dim = result !== "idle" && !isSelected

                                            const choiceStyle: React.CSSProperties = {
                                                borderRadius: 18,
                                                border: isSelected ? "1px solid rgba(0,155,72,0.45)" : "1px solid rgba(0,0,0,0.12)",
                                                background: "#ffffff",
                                                padding: "14px 14px",
                                                cursor: introOpen || feedback.open ? "default" : result === "idle" ? "pointer" : "default",
                                                userSelect: "none",
                                                boxShadow: "0 16px 46px rgba(0,0,0,0.12)",
                                                transition: "transform 140ms ease, filter 140ms ease",
                                                opacity: dim ? 0.65 : 1,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 12,
                                            }

                                            const keyStyle: React.CSSProperties = {
                                                display: "inline-grid",
                                                placeItems: "center",
                                                minWidth: 38,
                                                height: 34,
                                                borderRadius: 12,
                                                border: "1px solid rgba(0,0,0,0.12)",
                                                background: "#ffffff",
                                                fontWeight: 950,
                                                letterSpacing: "0.08em",
                                                color: "rgba(12,14,16,0.82)",
                                                flexShrink: 0,
                                                fontSize: 13,
                                            }

                                            return (
                                                <div
                                                    key={c}
                                                    style={choiceStyle}
                                                    onClick={() => {
                                                        if (introOpen) return
                                                        if (feedback.open) return
                                                        if (result !== "idle") return
                                                        setSelected(c)
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                >
                                                    <span style={keyStyle}>{i + 1}</span>
                                                    <span style={{ fontWeight: 850, color: "rgba(12,14,16,0.92)", fontSize: 16 }}>{c}</span>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
                                        <div style={{ height: 1, background: "rgba(0,0,0,0.10)" }} />

                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                            <div>
                                                {result === "correct" && (
                                                    <div style={{ ...pillStyleBase, border: "1px solid rgba(0,155,72,0.30)", background: "#dff3e8" }}>
                                                        correct
                                                    </div>
                                                )}
                                                {result === "wrong" && (
                                                    <div style={{ ...pillStyleBase, border: "1px solid rgba(206,43,55,0.30)", background: "#f6d7db" }}>
                                                        try again
                                                    </div>
                                                )}
                                                {result === "idle" && <div style={pillStyleBase}>score {score}/{questions.length}</div>}
                                            </div>

                                            {selected && result === "idle" && !introOpen && !feedback.open ? (
                                                <button style={btnPrimary} onClick={check}>
                                                    check
                                                </button>
                                            ) : (
                                                <button style={btnDisabled} onClick={() => { }} aria-disabled="true">
                                                    check
                                                </button>
                                            )}
                                        </div>

                                        <div style={{ opacity: 0.86, fontSize: 15, lineHeight: 1.38 }}>
                                            {result === "idle" && <>Tip: press 1 to 4 to pick, then press enter to check</>}
                                            {result === "wrong" && (
                                                <>
                                                    Correct answer is <b>{q.answer}</b>
                                                    {q.note ? <span> · {q.note}</span> : null}
                                                </>
                                            )}
                                            {result === "correct" && (
                                                <>
                                                    Nice
                                                    {q.note ? <span> · {q.note}</span> : null}
                                                </>
                                            )}
                                        </div>

                                        <div style={{ marginTop: 8 }}>
                                            <div style={progressWrapInCardStyle} aria-label="progress">
                                                <div style={progressFillStyle} />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {introFade.mounted && (
                <div
                    style={{
                        ...modalOverlayBase,
                        opacity: introFade.visible ? 1 : 0,
                        pointerEvents: introFade.visible ? "auto" : "none",
                    }}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        style={{
                            ...modalCardBase,
                            opacity: introFade.visible ? 1 : 0,
                            transform: introFade.visible ? "translateY(0px) scale(1)" : "translateY(10px) scale(0.98)",
                        }}
                    >
                        <div style={modalTopStyle}>
                            <div style={modalTitleStyle}>learnt italian this year, are you ready to test yourself?</div>
                            <div style={modalSubStyle}>NO CHEATING!!! 😛</div>
                        </div>

                        <div style={modalMediaWrap}>
                            <img src="/italy/duolingo.gif" alt="Duolingo" style={modalGif} />
                        </div>

                        <div style={modalFooterStyle}>
                            <button style={btnPrimary} onClick={startQuiz}>
                                start
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {feedbackFade.mounted && (
                <div
                    style={{
                        ...modalOverlayBase,
                        opacity: feedbackFade.visible ? 1 : 0,
                        pointerEvents: feedbackFade.visible ? "auto" : "none",
                    }}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        style={{
                            ...modalCardBase,
                            opacity: feedbackFade.visible ? 1 : 0,
                            transform: feedbackFade.visible ? "translateY(0px) scale(1)" : "translateY(10px) scale(0.98)",
                        }}
                    >
                        <div style={modalTopStyle}>
                            <div style={modalTitleStyle}>{feedback.title}</div>
                            <div style={modalSubStyle}>{feedback.sub}</div>
                        </div>

                        <div style={modalMediaWrap}>
                            <img src={feedback.gif} alt={feedback.ok ? "correct" : "wrong"} style={modalGif} />
                        </div>

                        <div style={modalFooterStyle}>
                            <button style={btnPrimary} onClick={closeFeedbackAndContinue}>
                                continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
