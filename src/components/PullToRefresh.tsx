import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

const THRESHOLD = 72

/** Tirer vers le bas en haut de page recharge les données COROS. */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  return (
    <div
      onTouchStart={(e) => {
        startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null
      }}
      onTouchMove={(e) => {
        if (startY.current === null || refreshing) return
        const dy = e.touches[0].clientY - startY.current
        setPull(dy > 0 ? Math.min(dy * 0.5, THRESHOLD * 1.4) : 0)
      }}
      onTouchEnd={async () => {
        startY.current = null
        if (pull >= THRESHOLD) {
          setRefreshing(true)
          setPull(THRESHOLD * 0.6)
          await queryClient.invalidateQueries({ queryKey: ['coros'] })
          setRefreshing(false)
        }
        setPull(0)
      }}
    >
      <div
        className="flex items-center justify-center overflow-hidden text-muted-foreground transition-[height] duration-150"
        style={{ height: pull }}
      >
        <RefreshCw
          className={refreshing ? 'size-5 animate-spin' : 'size-5'}
          style={{ transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / THRESHOLD) }}
        />
      </div>
      {children}
    </div>
  )
}
