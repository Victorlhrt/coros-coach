import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { Panel, PanelHeader } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { disconnectCoros, startCorosLogin } from '@/lib/coros/client'
import { RENEW_WITHIN_DAYS, daysLeft, formatExpiry, useGarminStatus } from '@/lib/garmin/client'
import { BrandLogo } from './brands'
import { GarminSheet } from './GarminConnect'

/**
 * Montres et applications : COROS (OAuth) et Garmin (clé Personal API) se connectent, les autres sont
 * affichées avec leur logo et arrivent ensuite. Strava indique l'import fait pendant l'onboarding.
 */

const SOON = [
  { brand: 'Apple', name: 'Apple Health', detail: 'Workouts and recovery' },
  { brand: 'Suunto', detail: 'Activities and workouts' },
  { brand: 'Polar', detail: 'Activities and recovery' },
  { brand: 'Huawei', name: 'Huawei Health', detail: 'Activities' },
  { brand: 'Samsung', name: 'Samsung Health', detail: 'Activities' },
  { brand: 'Fitbit', detail: 'Activities and sleep' },
  { brand: 'Whoop', detail: 'Recovery and strain' },
  { brand: 'Komoot', detail: 'Routes and trail courses' },
]

export function Integrations({ stravaRuns }: { stravaRuns?: number }) {
  const connected = useCorosAuth((s) => s.connected)
  const login = useMutation({ mutationFn: startCorosLogin })
  const logout = useMutation({ mutationFn: disconnectCoros })
  const garmin = useGarminStatus()
  const [garminOpen, setGarminOpen] = useState(false)
  const g = garmin.data
  const left = daysLeft(g?.expiresAt)
  const renewSoon = !!g?.connected && left !== null && left <= RENEW_WITHIN_DAYS
  const garminDetail = g?.connected
    ? g.expiresAt
      ? `Connected · Expires ${formatExpiry(g.expiresAt)}`
      : 'Connected · activities and laps'
    : g?.error
      ? g.error
      : 'Activities and laps'
  return (
    <Panel>
      <PanelHeader title="Watches & apps" />
      <ul className="grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-3">
        <Tile brand="COROS" detail={connected ? 'Connected · activities, sleep, HRV' : 'Activities, sleep, HRV, workouts to watch'} live>
          {connected ? (
            <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={() => login.mutate()} disabled={login.isPending}>
              {login.isPending ? 'Redirecting…' : 'Connect'}
            </Button>
          )}
        </Tile>
        <Tile brand="Garmin" detail={garminDetail} live>
          {g?.connected ? (
            <Button variant={renewSoon ? 'default' : 'outline'} size="sm" onClick={() => setGarminOpen(true)}>
              {renewSoon ? 'Renew' : 'Manage'}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setGarminOpen(true)} disabled={garmin.isPending}>
              {g?.error ? 'Reconnect' : 'Connect'}
            </Button>
          )}
        </Tile>
        <Tile brand="Strava" detail={stravaRuns ? `${stravaRuns} runs imported` : 'History import from your Strava export'} live={!!stravaRuns}>
          <Badge size="sm" tone={stravaRuns ? 'success' : 'neutral'}>
            {stravaRuns ? 'Imported' : 'Not imported'}
          </Badge>
        </Tile>
        {SOON.map((s) => (
          <Tile key={s.brand} brand={s.brand} name={s.name} detail={s.detail}>
            <Badge size="sm" tone="neutral">
              Coming soon
            </Badge>
          </Tile>
        ))}
        {/* 11 tuiles : une case vide teintée comme les autres complète la grille en 2 ou 3 colonnes. */}
        <li aria-hidden className="hidden bg-card sm:block" />
      </ul>
      {login.error && <p className="border-t px-6 py-3 text-destructive text-sm">{login.error.message}</p>}
      <GarminSheet open={garminOpen} status={g} onClose={() => setGarminOpen(false)} />
    </Panel>
  )
}

function Tile({ brand, name, detail, live, children }: { brand: string; name?: string; detail: string; live?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-3 bg-card px-4 py-4 sm:gap-4 sm:px-6">
      <span className={`flex h-11 w-16 shrink-0 items-center sm:h-12 sm:w-20 justify-center rounded-2xl border bg-background px-2.5 ${live ? '' : 'opacity-70'}`}>
        <BrandLogo brand={brand} className="max-h-6 max-w-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm">{name ?? brand}</span>
        <span className="block truncate text-muted-foreground text-xs">{detail}</span>
      </span>
      {children}
    </li>
  )
}
