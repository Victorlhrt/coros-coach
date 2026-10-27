import { useEffect, useRef } from 'react'

/**
 * Pied de page façon Default : le logo et « Raice.run » en très grand, dessinés en grille de points.
 * Sous la souris, les points s'écartent et grossissent comme sous une loupe. Fond de points discret partout.
 * Rendu canvas ; image figée si le mouvement est réduit.
 */
const R_PATH =
  'M28 24H70C81 24 90 33 90 44C90 53.5 83.5 61.5 74.5 63.5L104 100L100 104H80L54 62.5V50H70C73.3 50 76 47.3 76 44C76 40.7 73.3 38 70 38H20Z'

const GAP = 7 // espacement de la grille (px CSS)
const LENS = 110 // rayon d'influence de la souris

type Dot = { x: number; y: number; on: boolean }

export function DotWordmark({ text = 'Raice.run' }: { text?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let dots: Dot[] = []
    let width = 0
    let height = 0
    let dpr = 1
    const mouse = { x: -9999, y: -9999, target: { x: -9999, y: -9999 } }
    let frame = 0

    /** Masque : logo + texte dessinés hors écran, puis échantillonnés sur la grille. */
    function layout() {
      const rect = canvas!.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)

      const mask = document.createElement('canvas')
      mask.width = Math.round(width)
      mask.height = Math.round(height)
      const m = mask.getContext('2d')!
      const size = height * 0.78
      m.fillStyle = '#fff'
      // Logo R (repère 120 de haut, incliné comme la marque)
      m.save()
      m.translate(0, height * 0.12)
      m.scale(size / 100, size / 100)
      m.transform(1, 0, Math.tan((-10 * Math.PI) / 180), 1, 8, -2)
      m.translate(-14, -18)
      m.fill(new Path2D(R_PATH))
      m.restore()
      // Nom
      m.font = `600 ${size}px "Inter Variable", Inter, system-ui, sans-serif`
      m.textBaseline = 'alphabetic'
      m.fillText(text, size * 0.98, height * 0.86)
      const data = m.getImageData(0, 0, mask.width, mask.height).data

      dots = []
      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          const i = (Math.floor(y) * mask.width + Math.floor(x)) * 4
          dots.push({ x, y, on: data[i + 3] > 128 })
        }
      }
    }

    function draw() {
      // La loupe suit la souris avec un léger retard, pour un mouvement fluide.
      mouse.x += (mouse.target.x - mouse.x) * 0.18
      mouse.y += (mouse.target.y - mouse.y) * 0.18
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, width, height)
      for (const d of dots) {
        const dx = d.x - mouse.x
        const dy = d.y - mouse.y
        const dist = Math.hypot(dx, dy)
        const k = dist < LENS ? 1 - dist / LENS : 0
        const push = k * k * 14
        const x = d.x + (dist ? (dx / dist) * push : 0)
        const y = d.y + (dist ? (dy / dist) * push : 0)
        const r = d.on ? 1.55 + k * 1.6 : 0.7 + k * 0.4
        ctx!.fillStyle = d.on ? `rgba(225,225,225,${0.75 + k * 0.25})` : 'rgba(255,255,255,0.07)'
        ctx!.beginPath()
        ctx!.arc(x, y, r, 0, Math.PI * 2)
        ctx!.fill()
      }
      const settling = Math.abs(mouse.target.x - mouse.x) > 0.5 || Math.abs(mouse.target.y - mouse.y) > 0.5
      frame = settling ? requestAnimationFrame(draw) : 0
    }
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    const move = (e: PointerEvent) => {
      if (reduce) return
      const rect = canvas.getBoundingClientRect()
      mouse.target = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      redraw()
    }
    const leave = () => {
      mouse.target = { x: -9999, y: -9999 }
      mouse.x = mouse.y = -9999
      redraw()
    }

    const start = () => {
      layout()
      redraw()
    }
    const ro = new ResizeObserver(start)
    ro.observe(canvas)
    // Le texte attend la police Inter pour avoir les bonnes formes.
    void document.fonts.ready.then(start)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
    }
  }, [text])

  return <canvas ref={canvasRef} aria-label={text} role="img" className="block h-[clamp(120px,18vw,260px)] w-full" />
}
