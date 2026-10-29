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
 * Montres et applications : COROS (OAuth), Garmin (clé Personal API) et Strava (import d'archive) en tête ;
 * les autres, à venir, sont repliées sous un dégradé.
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
  const [more, setMore] = useState(false)
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
        <Tile brand="COROS" detail={connected ? 'Connected · activities, sleep, HRV' : 'Activities, sleep, HRV'} live>
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
      </ul>
      {/* Les applications à venir : repliées sous un dégradé, « See more » les déplie. */}
      <div className="relative border-t">
        <ul className={`grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-3 ${more ? '' : 'max-h-[76px] overflow-hidden sm:max-h-[80px]'}`}>
          {SOON.map((s) => (
            <Tile key={s.brand} brand={s.brand} name={s.name} detail={s.detail}>
              <Badge size="sm" tone="neutral">
                Coming soon
              </Badge>
            </Tile>
          ))}
          <li aria-hidden className="hidden bg-card xl:block" />
        </ul>
        {more ? (
          <div className="flex justify-center border-t bg-card py-3">
            <Button variant="ghost" size="sm" onClick={() => setMore(false)}>
              See less
            </Button>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-end justify-center bg-linear-to-b from-card/10 via-card/80 to-card pb-3">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setMore(true)}>
              See more · {SOON.length}
            </Button>
          </div>
        )}
      </div>
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
