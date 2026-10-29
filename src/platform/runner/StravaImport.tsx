import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FileDropzone } from '@/components/arc/file-dropzone/file-dropzone'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shadcn/sheet'
import { formatDay } from '@/lib/coach/dates'
import { IMPORTED_KEY, STRAVA_STATUS_KEY, deleteStravaImport, uploadStravaImport, useStravaImportStatus } from '@/lib/strava/imported'
import { toast } from '@/lib/toast'
import { readStravaArchive } from '../onboarding/strava'
import { BrandLogo } from './brands'

/**
 * Import de l'archive Strava depuis les réglages : l'API Strava interdit l'usage de ses données par une IA,
 * le coureur importe donc son propre export. Le ZIP est lu dans le navigateur ; seuls le résumé et la liste
 * des sorties course (deux ans) partent au serveur, puis comptent comme les sorties de la montre.
 * Libellés Strava : article « How Do I Export My Strava Data? » (support.strava.com, septembre 2026).
 */

const STRAVA_ACCOUNT_URL = 'https://www.strava.com/account'

export function StravaImport() {
  const qc = useQueryClient()
  const { data: status } = useStravaImportStatus()
  const [open, setOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: STRAVA_STATUS_KEY })
    void qc.invalidateQueries({ queryKey: IMPORTED_KEY })
    void qc.invalidateQueries({ queryKey: ['coros', 'activities'] })
    void qc.invalidateQueries({ queryKey: ['account', 'overview'] })
  }
  const remove = useMutation({
    mutationFn: deleteStravaImport,
    onSuccess: () => {
      setConfirmRemove(false)
      refresh()
      toast.success('Strava import removed')
    },
  })

  const summary = status?.summary
  const imported = !!status?.importedAt || !!summary
  return (
    <Panel className="mt-4">
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            <BrandLogo brand="strava" className="h-5 w-auto" />
            Strava
          </span>
        }
        actions={
          <Button size="sm" variant={imported ? 'outline' : 'default'} onClick={() => setOpen(true)}>
            {imported ? 'Import again' : 'Import my Strava archive'}
          </Button>
        }
      />
      {imported && (
        <>
          <PanelSection divided className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={status?.runs ?? 0} label="runs (2 years)" />
            <Stat value={summary?.runs ?? '—'} label="runs in total" />
            <Stat value={summary ? `${summary.recent.weeklyKm} km` : '—'} label="per week (12 wks)" />
            <Stat value={summary?.since ? formatDay(summary.since, { month: 'short', year: 'numeric' }) : '—'} label="first run" />
          </PanelSection>
          <PanelFooter>
            <p className="text-muted-foreground text-sm">
              {status?.importedAt ? `Imported ${formatDay(status.importedAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Imported during onboarding'}
            </p>
            {confirmRemove ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  {remove.isPending ? 'Removing…' : 'Remove import'}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            )}
          </PanelFooter>
        </>
      )}
      {remove.error && <p className="border-t px-6 py-3 text-destructive text-sm">{remove.error.message}</p>}
      <ImportSheet
        open={open}
        onClose={() => setOpen(false)}
        onImported={(runs) => {
          refresh()
          setOpen(false)
          toast.success(`${runs} Strava runs imported`)
        }}
      />
    </Panel>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="font-semibold text-xl tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}

function ImportSheet({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (runs: number) => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-6">
          <SheetTitle>Import your Strava archive</SheetTitle>
        </SheetHeader>
        <ol className="flex flex-col gap-5 p-6 text-sm">
          <Step n={1}>
            <p>
              On a computer, open strava.com, then <b>Settings</b> → <b>My Account</b>.
            </p>
            <p className="text-muted-foreground text-xs">The Strava mobile app can’t export your data.</p>
            <Button asChild size="sm" variant="outline" className="self-start">
              <a href={STRAVA_ACCOUNT_URL} target="_blank" rel="noreferrer">
                Open Strava settings <ExternalLinkIcon className="size-3.5" />
              </a>
            </Button>
          </Step>
          <Step n={2}>
            <p>
              Under <b>Download your account</b>, select <b>Get Started</b>, then <b>Request download</b>.
            </p>
          </Step>
          <Step n={3}>
            <p>Strava emails you a download link (this can take a few hours). Download the ZIP, no need to unzip it.</p>
          </Step>
          <Step n={4}>
            <p>Drop the ZIP here.</p>
            <FileDropzone
              accept=".zip,application/zip"
              multiple={false}
              maxFiles={1}
              label="Drop your Strava export (ZIP)"
              description="or choose the file on your computer"
              dropLabel="Drop the ZIP here"
              note="Read in your browser, only your runs are sent"
              onUpload={async (item, { onProgress }) => {
                if (!item.file) throw new Error('File not found')
                const { summary, runs } = await readStravaArchive(item.file, onProgress)
                if (!runs.length) throw new Error('No runs found in this export.')
                const res = await uploadStravaImport(summary, runs)
                onProgress(100)
                onImported(res.runs)
              }}
            />
          </Step>
        </ol>
      </SheetContent>
    </Sheet>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-medium text-xs tabular-nums">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">{children}</div>
    </li>
  )
}
