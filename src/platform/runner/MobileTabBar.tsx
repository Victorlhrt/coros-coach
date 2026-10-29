import { BarChart3Icon, CalendarDaysIcon, EllipsisIcon, HomeIcon, MessageCircleIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shadcn/sheet'
import { cn } from '@/lib/utils'

/**
 * Barre d'onglets du bas, sur mobile seulement (la barre latérale reste sur desktop) :
 * les quatre pages principales, et « More » pour le reste.
 */

const TABS = [
  { title: 'Home', path: '/account/home', icon: <HomeIcon /> },
  { title: 'Plan', path: '/account/plan', icon: <CalendarDaysIcon /> },
  { title: 'Analytics', path: '/account/analytics', icon: <BarChart3Icon /> },
  { title: 'Coach', path: '/account/coach', icon: <MessageCircleIcon /> },
]

export function MobileTabBar({ more }: { more: { title: string; path: string; icon: ReactNode }[] }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const inMore = more.some((m) => pathname.startsWith(m.path))
  const tab = 'flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] transition-colors [&>svg]:size-5'
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {TABS.map((t) => {
          const active = pathname.startsWith(t.path)
          return (
            <Link key={t.path} to={t.path} aria-current={active ? 'page' : undefined} className={cn(tab, active ? 'text-foreground' : 'text-muted-foreground')}>
              {t.icon}
              {t.title}
            </Link>
          )
        })}
        <button type="button" onClick={() => setOpen(true)} className={cn(tab, inMore ? 'text-foreground' : 'text-muted-foreground')}>
          <EllipsisIcon />
          More
        </button>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-[28px] pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="px-6 pt-6 pb-2">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <ul className="flex flex-col px-3 pb-4">
            {more.map((m) => (
              <li key={m.path}>
                <Link
                  to={m.path}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm [&>svg]:size-4 [&>svg]:text-muted-foreground',
                    pathname.startsWith(m.path) && 'bg-foreground/[0.06]',
                  )}
                >
                  {m.icon}
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Sous-menus d'une page sur mobile (Analytics › Runs / Fitness), à la place de ceux de la barre latérale. */
export function MobileSubNav({ items }: { items: { title: string; path: string }[] }) {
  const { pathname } = useLocation()
  return (
    <nav aria-label="Section" className="inline-flex self-start rounded-full border bg-foreground/[0.04] p-1 md:hidden">
      {items.map((i) => (
        <Link
          key={i.path}
          to={i.path}
          className={cn('rounded-full px-4 py-1.5 text-sm transition-colors', pathname.startsWith(i.path) ? 'bg-foreground text-background' : 'text-muted-foreground')}
        >
          {i.title}
        </Link>
      ))}
    </nav>
  )
}
