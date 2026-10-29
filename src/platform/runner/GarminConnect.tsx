import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Alert } from '@/components/arc/alert/alert'
import { Button } from '@/components/arc/button/button'
import { PasswordField } from '@/components/arc/password-field/password-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/shadcn/sheet'
import { GARMIN_KEY_URL, GARMIN_STATUS_KEY, RENEW_WITHIN_DAYS, connectGarmin, daysLeft, disconnectGarmin, formatExpiry, type GarminExpiry, type GarminStatus } from '@/lib/garmin/client'
import { BrandLogo } from './brands'

/**
 * Connexion Garmin par clé Personal API : guide en 4 étapes (ouvrir Garmin Connect, créer la clé sur 1 an,
 * la copier, la coller ici). Le formulaire sert aux réglages (feuille) et à l'onboarding (sans compte).
 */

const EXPIRIES: { value: string; label: string }[] = [
  { value: '30', label: '30 d' },
  { value: '90', label: '90 d' },
  { value: '180', label: '180 d' },
  { value: '365', label: '1 year' },
]

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-card font-medium text-xs tabular-nums">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
        <p className="text-sm">{title}</p>
        {children}
      </div>
    </li>
  )
}

export function GarminKeyForm({
  onSubmit,
  pending,
  error,
  submitLabel = 'Connect',
}: {
  onSubmit: (apiKey: string, expiryDays: GarminExpiry) => void
  pending: boolean
  error?: string | null
  submitLabel?: string
}) {
  const [key, setKey] = useState('')
  const [expiry, setExpiry] = useState('365')
  const ready = key.trim().length >= 16
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !pending) onSubmit(key.trim(), Number(expiry) as GarminExpiry)
      }}
    >
      <ol className="flex flex-col gap-5">
        <Step n={1} title="Open Garmin Connect and sign in.">
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => window.open(GARMIN_KEY_URL, '_blank', 'noopener,noreferrer')}>
            Open Garmin Connect <ExternalLinkIcon className="size-3.5" />
          </Button>
        </Step>
        <Step n={2} title="In Personal API, select Create, accept the terms and choose 1 year." />
        <Step n={3} title="Copy the key. Garmin shows it only once." />
        <Step n={4} title="Paste it here, then connect.">
          <PasswordField
            label="Personal API key"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your key"
          />
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">Expiry you chose</span>
            <SegmentedControl label="Key expiry" options={EXPIRIES} value={expiry} onValueChange={setExpiry} />
          </div>
        </Step>
      </ol>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" loading={pending} disabled={!ready}>
        {submitLabel}
      </Button>
    </form>
  )
}

/** Feuille des réglages : guide quand Garmin n'est pas connecté (ou à renouveler), état et déconnexion sinon. */
export function GarminSheet({ open, status, onClose }: { open: boolean; status: GarminStatus | undefined; onClose: () => void }) {
  const qc = useQueryClient()
  const [renewing, setRenewing] = useState(false)
  const connect = useMutation({
    mutationFn: ({ apiKey, expiryDays }: { apiKey: string; expiryDays: GarminExpiry }) => connectGarmin(apiKey, expiryDays),
    onSuccess: async () => {
      setRenewing(false)
      await qc.invalidateQueries({ queryKey: GARMIN_STATUS_KEY })
      void qc.invalidateQueries({ queryKey: ['coros'] })
      void qc.invalidateQueries({ queryKey: ['account', 'overview'] })
    },
  })
  const disconnect = useMutation({
    mutationFn: disconnectGarmin,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: GARMIN_STATUS_KEY })
      void qc.invalidateQueries({ queryKey: ['coros'] })
      onClose()
    },
  })
  const connected = !!status?.connected
  const left = daysLeft(status?.expiresAt)
  const soon = connected && left !== null && left <= RENEW_WITHIN_DAYS
  const showForm = !connected || renewing
  const close = () => {
    setRenewing(false)
    connect.reset()
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-6">
          <SheetTitle>{connected && showForm ? 'Renew Garmin key' : 'Garmin'}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex h-20 items-center justify-center rounded-2xl border bg-card">
            <BrandLogo brand="garmin" className="max-h-8 max-w-[50%]" />
          </div>
          {status?.error && !connected && (
            <Alert tone="warning" title={status.error}>
              Create a new key in Garmin Connect and paste it below.
            </Alert>
          )}
          {connected && !showForm && (
            <div className="flex flex-col gap-4">
              {soon && (
                <Alert tone="warning" title={left! <= 0 ? 'Your Garmin key expires today' : `Your Garmin key expires in ${left} day${left === 1 ? '' : 's'}`}>
                  Create a new key to keep your runs syncing.
                </Alert>
              )}
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border text-sm">
                <div className="bg-card px-4 py-3">
                  <dt className="text-muted-foreground text-xs">Status</dt>
                  <dd className="mt-1 font-medium">Connected</dd>
                </div>
                <div className="bg-card px-4 py-3">
                  <dt className="text-muted-foreground text-xs">Key</dt>
                  <dd className="mt-1 font-medium">{status?.expiresAt ? `Expires ${formatExpiry(status.expiresAt)}` : 'Expiry unknown'}</dd>
                </div>
              </dl>
            </div>
          )}
          {showForm && (
            <GarminKeyForm
              pending={connect.isPending}
              error={connect.error?.message}
              submitLabel={connected ? 'Save new key' : 'Connect'}
              onSubmit={(apiKey, expiryDays) => connect.mutate({ apiKey, expiryDays })}
            />
          )}
        </div>
        {connected && !showForm && (
          <SheetFooter className="flex-row gap-2 border-t p-6">
            <Button variant="secondary" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
              Disconnect
            </Button>
            <Button className="flex-1" onClick={() => setRenewing(true)}>
              Renew key
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
