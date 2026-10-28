import { useEffect, useRef } from 'react'

/**
 * Pied de page façon Default : le logo et « Raice.run » en très grand, dessinés en grille de points.
 * Sous la souris (ou le doigt), les points s'écartent et grossissent comme sous une loupe ; sans pointeur,
 * la loupe balaie seule le mot tant qu'il est à l'écran (sur mobile il n'y a pas de survol).
 * Le mot s'ajuste à la largeur et la grille se resserre sur petit écran. Image figée si le mouvement est réduit.
 */
const R_PATH =
  'M28 24H70C81 24 90 33 90 44C90 53.5 83.5 61.5 74.5 63.5L104 100L100 104H80L54 62.5V50H70C73.3 50 76 47.3 76 44C76 40.7 73.3 38 70 38H20Z'

const IDLE_MS = 2500 // sans pointeur depuis ce délai, la loupe repart seule

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
    let gap = 7 // espacement de la grille (px CSS), resserré sur petit écran
    let lens = 110 // rayon d'influence de la loupe
    const mouse = { x: -9999, y: -9999, target: { x: -9999, y: -9999 } }
    let frame = 0
    let visible = false
    let lastPointer = -Infinity
    const t0 = performance.now()

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
      m.font = `600 ${height * 0.78}px "Inter Variable", Inter, system-ui, sans-serif`
      // Logo + nom tiennent dans la largeur : sur mobile on réduit la taille plutôt que de couper le mot.
      const fit = Math.min(1, (width * 0.97) / (height * 0.78 * 0.98 + m.measureText(text).width))
      const size = height * 0.78 * fit
      const baseline = height * 0.5 + size * 0.46
      gap = Math.max(3, Math.min(7, Math.round(size / 11)))
      lens = Math.max(48, Math.min(110, size * 0.6))
      m.fillStyle = '#fff'
      // Logo R (repère 120 de haut, incliné comme la marque)
      m.save()
      m.translate(0, baseline - size * 0.949)
      m.scale(size / 100, size / 100)
      m.transform(1, 0, Math.tan((-10 * Math.PI) / 180), 1, 8, -2)
      m.translate(-14, -18)
      m.fill(new Path2D(R_PATH))
      m.restore()
      // Nom
      m.font = `600 ${size}px "Inter Variable", Inter, system-ui, sans-serif`
      m.textBaseline = 'alphabetic'
      m.fillText(text, size * 0.98, baseline)
      const data = m.getImageData(0, 0, mask.width, mask.height).data

      dots = []
      for (let y = gap / 2; y < height; y += gap) {
        for (let x = gap / 2; x < width; x += gap) {
          const i = (Math.floor(y) * mask.width + Math.floor(x)) * 4
          dots.push({ x, y, on: data[i + 3] > 128 })
        }
      }
    }

    const ambient = () => !reduce && visible && performance.now() - lastPointer > IDLE_MS

    function draw(now = performance.now()) {
      // Sans pointeur, la loupe suit une courbe lente sur toute la largeur du mot.
      if (ambient()) {
        const t = (now - t0) / 1000
        mouse.target = { x: width * (0.5 + 0.46 * Math.sin(t * 0.55)), y: height * (0.5 + 0.22 * Math.sin(t * 1.3)) }
      }
      // La loupe suit sa cible avec un léger retard, pour un mouvement fluide.
      mouse.x += (mouse.target.x - mouse.x) * 0.18
      mouse.y += (mouse.target.y - mouse.y) * 0.18
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, width, height)
      for (const d of dots) {
        const dx = d.x - mouse.x
        const dy = d.y - mouse.y
        const dist = Math.hypot(dx, dy)
        const k = dist < lens ? 1 - dist / lens : 0
        const push = k * k * gap * 2
        const x = d.x + (dist ? (dx / dist) * push : 0)
        const y = d.y + (dist ? (dy / dist) * push : 0)
        const u = gap / 7
        const r = d.on ? (1.55 + k * 1.6) * u : (0.7 + k * 0.4) * u
        ctx!.fillStyle = d.on ? `rgba(225,225,225,${0.75 + k * 0.25})` : 'rgba(255,255,255,0.07)'
        ctx!.beginPath()
        ctx!.arc(x, y, r, 0, Math.PI * 2)
        ctx!.fill()
      }
      const settling = Math.abs(mouse.target.x - mouse.x) > 0.5 || Math.abs(mouse.target.y - mouse.y) > 0.5
      frame = settling || ambient() ? requestAnimationFrame(draw) : 0
    }
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    const move = (e: PointerEvent) => {
      if (reduce) return
      lastPointer = performance.now()
      const rect = canvas.getBoundingClientRect()
      mouse.target = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      redraw()
    }
    const leave = () => {
      lastPointer = performance.now()
      mouse.target = { x: -9999, y: -9999 }
      redraw()
      // Après la pause, la loupe repart seule.
      window.setTimeout(redraw, IDLE_MS + 50)
    }

    const start = () => {
      layout()
      redraw()
    }
    const ro = new ResizeObserver(start)
    ro.observe(canvas)
    // L'animation ne tourne que si le pied de page est visible.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      redraw()
    })
    io.observe(canvas)
    // Le texte attend la police Inter pour avoir les bonnes formes.
    void document.fonts.ready.then(start)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    return () => {
      ro.disconnect()
      io.disconnect()
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
    }
  }, [text])

  return <canvas ref={canvasRef} aria-label={text} role="img" className="block h-[clamp(72px,18vw,260px)] w-full touch-pan-y" />
}
