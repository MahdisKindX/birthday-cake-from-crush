// src/components/Reflection.tsx
import { useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"

type TLRect = { x0: number; y0: number; x1: number; y1: number }
type ReflectionProps = { onNextScene?: () => void }

const WORKSHEET_URL = "/new-year-worksheet.pdf"
const RESOLUTIONS_URL = "/new-years-resolutions.pdf"

// Put one of these fonts in public/fonts (or keep all). First one found will be used.
const CUTE_FONT_URLS = [
  "/fonts/Quicksand-Regular.ttf",
  "/fonts/Nunito-Regular.ttf",
  "/fonts/PatrickHand-Regular.ttf",
  "/fonts/Poppins-Regular.ttf",
]

const REFLECTION_BG_URL = "/reflection/kitty-bg.jpg"

const GIFS = [
  { src: "/reflection/sanrio-cute.gif", top: 12, left: 12 },
  { src: "/reflection/nini1.gif", top: 14, right: 12 },

  { src: "/reflection/kuromi-sanrio.gif", top: "10%", left: 14 },
  { src: "/reflection/kuromi-happy.gif", top: "10%", right: 14 },

  { src: "/reflection/kuromi-dance-melody-dance.gif", top: "28%", left: 12 },
  { src: "/reflection/hop-on-dbd-hop-on-dead-by-daylight.gif", top: "28%", right: 12 },

  { src: "/reflection/hello-kitty.gif", top: "42%", left: 12 },
  { src: "/reflection/hello-kitty-sanrio.gif", top: "42%", right: 12 },

  { src: "/reflection/hello-kitty-hello-kitty-dance.gif", top: "56%", left: 14 },
  { src: "/reflection/heart-eyes.gif", top: "56%", right: 14 },

  { src: "/reflection/dancing-white-cat-dance.gif", top: "64%", left: 14 },
  { src: "/reflection/cingcing-my-melody.gif", top: "64%", right: 14 },
] as const

const CONTENT_NUDGE_Y = 11
const LIST_NUDGE_Y = 7
const NAME_DATE_NUDGE_Y = 7

// Page 2 (resolutions) tuning
const RESOLUTION_X_START = 200 // pushed right
const RESOLUTION_MAX_X = 600 // safe before the flowers on the right
const RESOLUTION_LINE_YS_TL: [number, number, number, number, number] = [308, 390, 470, 550, 630] // was [440.5, 481.5, 521.5, 562.5, 602.0]
const RESOLUTION_FONT_SIZE_BASE = 18
const RESOLUTION_MAX_LINES = 2
const RESOLUTION_WRAP_LINE_GAP_TL = 41 // 2nd line goes lower (more TL y)

const TL = {
  nameRect: { x0: 108.52230834960938, y0: 95.08523559570312, x1: 245.764892578125, y1: 120.18102264404297 },
  dateRect: { x0: 398.70166015625, y0: 95.08523559570312, x1: 535.9442138671875, y1: 120.18102264404297 },

  topLeftBox: { x0: 59.54999542236328, y0: 251.7754364013672, x1: 285.0685729980469, y1: 484.6353759765625 },
  topRightBox: { x0: 310.42181396484375, y0: 251.7754364013672, x1: 535.9403686523438, y1: 484.6353759765625 },
  bottomLeftBox: { x0: 59.54999542236328, y0: 511.6429138183594, x1: 285.0685729980469, y1: 746.8674926757812 },
  bottomRightBox: { x0: 310.42181396484375, y0: 511.6429138183594, x1: 535.9403686523438, y1: 746.8674926757812 },

  topLeftHeader: { x0: 59.549991607666016, y0: 253.49014282226562, x1: 285.13623046875, y1: 301.695556640625 },
  topRightHeader: { x0: 310.42181396484375, y0: 253.49014282226562, x1: 536.008056640625, y1: 301.695556640625 },
  bottomLeftHeader: { x0: 59.549991607666016, y0: 513.36181640625, x1: 285.13623046875, y1: 561.5671997070312 },
  bottomRightHeader: { x0: 310.42181396484375, y0: 513.36181640625, x1: 536.008056640625, y1: 561.5671997070312 },

  listAnchors: [
    { x: 81.5855941772461 + 6, y: 583.4214477539062 + 12 },
    { x: 84.55364990234375 + 6, y: 640.34423828125 + 12 },
    { x: 84.85318756103516 + 6, y: 697.2670288085938 + 12 },
  ],
} satisfies Record<string, unknown>

const fixedName = "Massa Alahmar"

const todayString = () =>
  new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

const contentRect = (box: TLRect, header: TLRect, pad: number): TLRect => ({
  x0: box.x0 + pad,
  y0: header.y1 + pad,
  x1: box.x1 - pad,
  y1: box.y1 - pad,
})

const tlPointToBl = (x: number, y: number, pageHeight: number) => ({
  x,
  y: pageHeight - y,
})

const tlRectToBl = (r: TLRect, pageHeight: number) => ({
  x0: r.x0,
  y0: pageHeight - r.y1,
  x1: r.x1,
  y1: pageHeight - r.y0,
})

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim()
}

function ellipsizeToWidth(text: string, font: any, fontSize: number, maxWidth: number) {
  const t = normalizeSpaces(text)
  if (!t) return ""

  if (font.widthOfTextAtSize(t, fontSize) <= maxWidth) return t

  const ellipsis = "…"
  let out = t
  while (out.length > 0 && font.widthOfTextAtSize(out + ellipsis, fontSize) > maxWidth) {
    out = out.slice(0, -1)
  }
  return out ? out + ellipsis : ""
}

function wrapTextMaxLines(text: string, font: any, fontSize: number, maxWidth: number, maxLines: number) {
  const all = wrapText(text, font, fontSize, maxWidth).filter((l) => l.trim().length > 0)
  if (all.length <= maxLines) return all

  const cut = all.slice(0, maxLines)
  cut[maxLines - 1] = ellipsizeToWidth(cut[maxLines - 1], font, fontSize, maxWidth)
  return cut
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number) {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n")
  const lines: string[] = []

  for (const p of paragraphs) {
    const raw = normalizeSpaces(p)
    if (!raw) {
      lines.push("")
      continue
    }

    const words = raw.split(" ")
    let line = ""

    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      const width = font.widthOfTextAtSize(next, fontSize)
      if (width <= maxWidth) {
        line = next
        continue
      }

      if (line) lines.push(line)

      if (font.widthOfTextAtSize(w, fontSize) <= maxWidth) {
        line = w
      } else {
        let chunk = ""
        for (const ch of w) {
          const nextChunk = chunk + ch
          if (font.widthOfTextAtSize(nextChunk, fontSize) <= maxWidth) {
            chunk = nextChunk
          } else {
            if (chunk) lines.push(chunk)
            chunk = ch
          }
        }
        line = chunk
      }
    }

    if (line) lines.push(line)
  }

  while (lines.length && lines[lines.length - 1] === "") lines.pop()
  return lines
}


async function fetchArrayBuffer(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)
  return await res.arrayBuffer()
}

async function fetchFirstOk(urls: string[]) {
  let lastErr: unknown = null
  for (const url of urls) {
    try {
      return await fetchArrayBuffer(url)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error("Failed to fetch resource.")
}

async function fetchCuteFontBytes(): Promise<ArrayBuffer | null> {
  try {
    return await fetchFirstOk(CUTE_FONT_URLS)
  } catch {
    return null
  }
}

async function generateCombinedPdf(args: {
  favoriteMemory: string
  lookingForward: string
  newThings: [string, string, string]
  newSkill: string
  resolutions: [string, string, string, string, string]
}) {
  const [worksheetBytes, resolutionsBytes, cuteFontBytes] = await Promise.all([
    fetchArrayBuffer(WORKSHEET_URL),
    fetchArrayBuffer(RESOLUTIONS_URL),
    fetchCuteFontBytes(),
  ])

  const worksheetDoc = await PDFDocument.load(worksheetBytes)
  const resolutionsDoc = await PDFDocument.load(resolutionsBytes)

  worksheetDoc.registerFontkit(fontkit)
  resolutionsDoc.registerFontkit(fontkit)

  const font1 = cuteFontBytes
    ? await worksheetDoc.embedFont(cuteFontBytes, { subset: true })
    : await worksheetDoc.embedFont(StandardFonts.Helvetica)

  const font2 = cuteFontBytes
    ? await resolutionsDoc.embedFont(cuteFontBytes, { subset: true })
    : await resolutionsDoc.embedFont(StandardFonts.Helvetica)

  const color = rgb(0.08, 0.06, 0.08)

  // Page 1: worksheet
  {
    const page = worksheetDoc.getPages()[0]
    const { height } = page.getSize()

    const drawInRectTL = (rect: TLRect, text: string, fontSize: number, lineHeight: number) => {
      const bl = tlRectToBl(rect, height)
      const pad = 6
      const maxW = bl.x1 - bl.x0 - pad * 2
      const lines = wrapText(text, font1, fontSize, maxW)

      const x = bl.x0 + pad
      let y = bl.y1 - pad - fontSize + CONTENT_NUDGE_Y

      for (const line of lines) {
        if (y < bl.y0 + pad) break
        page.drawText(line, { x, y, size: fontSize, font: font1, color })
        y -= lineHeight
      }
    }

    const drawCenteredLeftInRectTL = (rect: TLRect, text: string, fontSize: number) => {
      const bl = tlRectToBl(rect, height)
      const padX = 6
      const y = bl.y0 + (bl.y1 - bl.y0 - fontSize) / 2 + 2 + NAME_DATE_NUDGE_Y
      page.drawText(text, { x: bl.x0 + padX, y, size: fontSize, font: font1, color })
    }

    drawCenteredLeftInRectTL(TL.nameRect, fixedName, 14)
    drawCenteredLeftInRectTL(TL.dateRect, todayString(), 12)

    const memRect = contentRect(TL.topLeftBox, TL.topLeftHeader, 10)
    const fwdRect = contentRect(TL.topRightBox, TL.topRightHeader, 10)
    const learnRect = contentRect(TL.bottomRightBox, TL.bottomRightHeader, 10)

    drawInRectTL(memRect, args.favoriteMemory, 12, 16)
    drawInRectTL(fwdRect, args.lookingForward, 12, 16)
    drawInRectTL(learnRect, args.newSkill, 12, 16)

    for (let i = 0; i < 3; i++) {
      const v = args.newThings[i] ?? ""
      if (!v.trim()) continue
      const a = TL.listAnchors[i]
      const pt = tlPointToBl(a.x, a.y, height)
      page.drawText(v, { x: pt.x, y: pt.y + LIST_NUDGE_Y, size: 12, font: font1, color })
    }
  }

  // Page 2: resolutions (pushed right and spaced to match the lines)
  {
const page = resolutionsDoc.getPages()[0]
const { width, height } = page.getSize()

const x = RESOLUTION_X_START
const maxW = Math.max(10, Math.min(RESOLUTION_MAX_X, width - 20) - x)

for (let i = 0; i < 5; i++) {
  const raw = args.resolutions[i] ?? ""
  if (!normalizeSpaces(raw)) continue

  const yTl = RESOLUTION_LINE_YS_TL[i] ?? RESOLUTION_LINE_YS_TL[0]

  const lines = wrapTextMaxLines(raw, font2, RESOLUTION_FONT_SIZE_BASE, maxW, RESOLUTION_MAX_LINES)

  for (let li = 0; li < lines.length; li++) {
    const pt = tlPointToBl(x, yTl + li * RESOLUTION_WRAP_LINE_GAP_TL, height)
    page.drawText(lines[li], {
      x: pt.x,
      y: pt.y,
      size: RESOLUTION_FONT_SIZE_BASE,
      font: font2,
      color,
    })
  }
}
  }

  const outDoc = await PDFDocument.create()
  const [p1] = await outDoc.copyPages(worksheetDoc, [0])
  const [p2] = await outDoc.copyPages(resolutionsDoc, [0])
  outDoc.addPage(p1)
  outDoc.addPage(p2)

  const out = await outDoc.save()
  const bytes = new Uint8Array(out.byteLength)
  bytes.set(out)

  return new Blob([bytes], { type: "application/pdf" })
}

function Sparkle() {
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.55), transparent 22%)," +
      "radial-gradient(circle at 86% 22%, rgba(255,255,255,0.40), transparent 26%)," +
      "radial-gradient(circle at 32% 78%, rgba(255,255,255,0.30), transparent 24%)," +
      "radial-gradient(circle at 78% 84%, rgba(255,255,255,0.34), transparent 26%)",
    opacity: 0.35,
    filter: "blur(0.2px)",
  }
  return <div style={style} />
}

function DecorGifs() {
  const layer: CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    pointerEvents: "none",
    overflow: "hidden",
  }

  const baseImg: CSSProperties = {
    position: "absolute",
    width: "clamp(64px, 10vw, 140px)",
    height: "auto",
    opacity: 0.95,
    filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.25))",
  }

  return (
    <div style={layer} aria-hidden="true">
      {GIFS.map((g) => (
        <img key={g.src} src={g.src} style={{ ...baseImg, ...g }} alt="" />
      ))}
    </div>
  )
}

export function Reflection({ onNextScene }: ReflectionProps) {
  const [favoriteMemory, setFavoriteMemory] = useState("")
  const [lookingForward, setLookingForward] = useState("")
  const [newThings, setNewThings] = useState<[string, string, string]>(["", "", ""])
  const [newSkill, setNewSkill] = useState("")
  const [resolutions, setResolutions] = useState<[string, string, string, string, string]>(["", "", "", "", ""])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = useMemo(() => !busy, [busy])

const container: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 90,
  display: "grid",
  placeItems: "center",
  padding: 16,
  backgroundImage: `url(${REFLECTION_BG_URL})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  overflow: "hidden",
}

// add a subtle overlay (new)
const bgTint: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  background:
    "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.10), rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.42) 100%)",
}

  const card: CSSProperties = {
    width: "min(980px, 96vw)",
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255, 245, 252, 0.10)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 40px 120px rgba(0,0,0,0.45)",
    overflow: "hidden",
    color: "rgba(255,255,255,0.96)",
  }

  const top: CSSProperties = {
    padding: 18,
    display: "grid",
    gap: 8,
  }

  const title: CSSProperties = {
    fontWeight: 950,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontSize: "clamp(18px, 2.2vw, 28px)",
    lineHeight: 1.1,
  }

  const sub: CSSProperties = {
    opacity: 0.88,
    fontSize: 14,
    lineHeight: 1.35,
  }

  const body: CSSProperties = {
    padding: 18,
    display: "grid",
    gap: 14,
  }

  const grid: CSSProperties = {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  }

  const field: CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(10,10,12,0.35)",
    padding: 14,
    display: "grid",
    gap: 10,
  }

  const label: CSSProperties = {
    fontWeight: 950,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontSize: 12,
    opacity: 0.95,
  }

  const input: CSSProperties = {
    width: "100%",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.95)",
    padding: "12px 12px",
    outline: "none",
    fontSize: 14,
  }

  const textarea: CSSProperties = {
    ...input,
    minHeight: 110,
    resize: "vertical",
    lineHeight: 1.35,
  }

  const threeRow: CSSProperties = {
    display: "grid",
    gap: 10,
  }

  const fiveRow: CSSProperties = {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  }

  const footer: CSSProperties = {
    padding: 18,
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    alignItems: "center",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10,10,12,0.18)",
  }

  const pill: CSSProperties = {
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255, 180, 224, 0.18)",
    color: "rgba(255,255,255,0.96)",
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontSize: 12,
  }

const button: CSSProperties = {
    borderRadius: 18,
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255, 235, 247, 0.92)",
    color: "rgba(10,10,12,0.92)",
    fontWeight: 950,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    cursor: canGenerate ? "pointer" : "not-allowed",
    opacity: canGenerate ? 1 : 0.65,
    boxShadow: "0 16px 60px rgba(0,0,0,0.25)",
  }

  const secondaryButton: CSSProperties = {
    ...button,
    background: "rgba(10,10,12,0.32)",
    color: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow: "0 16px 60px rgba(0,0,0,0.18)",
  }


  const setNewThing = (idx: 0 | 1 | 2, v: string) => {
    setNewThings((prev) => {
      const next: [string, string, string] = [prev[0], prev[1], prev[2]]
      next[idx] = v
      return next
    })
  }

  const setResolution = (idx: 0 | 1 | 2 | 3 | 4, v: string) => {
    setResolutions((prev) => {
      const next: [string, string, string, string, string] = [prev[0], prev[1], prev[2], prev[3], prev[4]]
      next[idx] = v
      return next
    })
  }

  const onGenerate = async () => {
    setError(null)
    setBusy(true)
    try {
      const blob = await generateCombinedPdf({
        favoriteMemory,
        lookingForward,
        newThings,
        newSkill,
        resolutions,
      })

      const stamp = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `reflection-${stamp}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate PDF.")
    } finally {
      setBusy(false)
    }
  }

  return (
<div style={container}>
    <div style={bgTint} />
    <DecorGifs />

    <div style={{ ...card, position: "relative", zIndex: 2 }}>
      <div style={{ position: "relative" }}>
        <Sparkle />
        <div style={top}>
          <div style={title}>reflection</div>
          <div style={sub}>
            Fill this in, then generate your combined PDF. Name is set to <b>{fixedName}</b>.
          </div>
        </div>
      </div>

        <div style={body}>
          <div style={grid}>
            <div style={field}>
              <div style={label}>A FAVORITE MEMORY FROM THIS PAST YEAR:</div>
              <textarea style={textarea} value={favoriteMemory} onChange={(e) => setFavoriteMemory(e.target.value)} />
            </div>

            <div style={field}>
              <div style={label}>SOMETHING I AM LOOKING FORWARD TO NEXT YEAR:</div>
              <textarea style={textarea} value={lookingForward} onChange={(e) => setLookingForward(e.target.value)} />
            </div>

            <div style={field}>
              <div style={label}>THREE NEW THINGS I WANT TO TRY:</div>
              <div style={threeRow}>
                <input style={input} value={newThings[0]} onChange={(e) => setNewThing(0, e.target.value)} placeholder="1." />
                <input style={input} value={newThings[1]} onChange={(e) => setNewThing(1, e.target.value)} placeholder="2." />
                <input style={input} value={newThings[2]} onChange={(e) => setNewThing(2, e.target.value)} placeholder="3." />
              </div>
            </div>

            <div style={field}>
              <div style={label}>SOMETHING NEW I WANT TO LEARN:</div>
              <textarea style={textarea} value={newSkill} onChange={(e) => setNewSkill(e.target.value)} />
            </div>

            <div style={{ ...field, gridColumn: "1 / -1" }}>
              <div style={label}>NEW YEAR&apos;S RESOLUTIONS (5):</div>
              <div style={fiveRow}>
                <input style={input} value={resolutions[0]} onChange={(e) => setResolution(0, e.target.value)} placeholder="1." />
                <input style={input} value={resolutions[1]} onChange={(e) => setResolution(1, e.target.value)} placeholder="2." />
                <input style={input} value={resolutions[2]} onChange={(e) => setResolution(2, e.target.value)} placeholder="3." />
                <input style={input} value={resolutions[3]} onChange={(e) => setResolution(3, e.target.value)} placeholder="4." />
                <input style={input} value={resolutions[4]} onChange={(e) => setResolution(4, e.target.value)} placeholder="5." />
              </div>
            </div>
          </div>
        </div>

        <div style={footer}>
          <div style={pill}>{busy ? "generating..." : `date: ${todayString()}`}</div>

          {onNextScene && (
            <button style={secondaryButton} onClick={onNextScene} disabled={!canGenerate}>
              continue
            </button>
          )}

          <button style={button} onClick={onGenerate} disabled={!canGenerate}>
            generate pdf
          </button>
        </div>

        {error && (
          <div style={{ padding: 14, color: "rgba(255,230,245,0.98)", background: "rgba(200,0,90,0.18)" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
