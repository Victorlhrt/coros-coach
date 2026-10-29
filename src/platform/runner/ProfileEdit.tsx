import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CameraIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/shadcn/sheet'
import { toast } from '@/lib/toast'
import { api, type Me } from '../api'
import type { CompleteAnswers } from '../onboarding/CompleteOnboarding'
import { RunnerAvatar, useRunnerPhoto } from './RunnerAvatar'

/**
 * Profil modifiable depuis l'espace coureur : l'onboarding ne se fait qu'une fois,
 * ensuite nom, sexe, année de naissance, niveau, ville et photo se changent ici.
 */

const SEXES = [
  { value: 'f', label: 'Female' },
  { value: 'm', label: 'Male' },
  { value: 'x', label: 'Other' },
]
const LEVEL_OPTIONS = [
  { value: 'debutant', label: 'Beginner' },
  { value: 'intermediaire', label: 'Intermediate' },
  { value: 'confirme', label: 'Advanced' },
]

type Draft = { firstName: string; lastName: string; sex: string; birthYear: string; level: string; city: string }

function draftFrom(me: Me, a: CompleteAnswers | null | undefined): Draft {
  const [first = '', ...rest] = me.name.trim().split(/\s+/)
  return {
    firstName: a?.identity?.firstName ?? first,
    lastName: a?.identity?.lastName ?? rest.join(' '),
    sex: a?.about?.sex ?? '',
    birthYear: a?.about?.birthYear ? String(a.about.birthYear) : '',
    level: a?.level ?? '',
    city: a?.city ?? '',
  }
}

function useProfileRefresh() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['me'] }), qc.invalidateQueries({ queryKey: ['account', 'overview'] })])
}

export function ProfileSheet({ open, me, answers, onClose }: { open: boolean; me: Me; answers: CompleteAnswers | null | undefined; onClose: () => void }) {
  const refresh = useProfileRefresh()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(me, answers))
  const [shown, setShown] = useState(false)
  // Recharge le brouillon à chaque ouverture.
  if (open && !shown) {
    setShown(true)
    setDraft(draftFrom(me, answers))
  }
  if (!open && shown) setShown(false)
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const hasAnswers = !!answers
  const save = useMutation({
    mutationFn: () => {
      const year = Number(draft.birthYear)
      return api('/account/profile', {
        method: 'PATCH',
        body: {
          firstName: draft.firstName,
          lastName: draft.lastName,
          ...(hasAnswers && {
            sex: draft.sex || null,
            birthYear: draft.birthYear.trim() && Number.isFinite(year) ? Math.round(year) : null,
            level: draft.level || null,
            city: draft.city.trim(),
          }),
        },
      })
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-6">
          <SheetTitle>Edit profile</SheetTitle>
        </SheetHeader>
        <form
          id="profile-form"
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-6"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" autoComplete="given-name" maxLength={80} value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} />
            <Input label="Last name" autoComplete="family-name" maxLength={80} value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </div>
          {hasAnswers && (
            <>
              <div className="flex flex-col gap-2">
                <span className="font-medium text-sm">Sex</span>
                <SegmentedControl label="Sex" options={SEXES} value={draft.sex} onValueChange={(sex) => set({ sex })} />
              </div>
              <Input
                label="Year of birth"
                type="number"
                inputMode="numeric"
                min={1900}
                max={new Date().getFullYear() - 5}
                placeholder="E.g. 1990"
                value={draft.birthYear}
                onChange={(e) => set({ birthYear: e.target.value })}
              />
              <div className="flex flex-col gap-2">
                <span className="font-medium text-sm">Level</span>
                <SegmentedControl label="Level" options={LEVEL_OPTIONS} value={draft.level} onValueChange={(level) => set({ level })} />
              </div>
              <Input label="City" autoComplete="address-level2" placeholder="E.g. Montpellier" maxLength={80} value={draft.city} onChange={(e) => set({ city: e.target.value })} />
            </>
          )}
          {save.error && <p className="text-destructive text-sm">{save.error.message}</p>}
        </form>
        <SheetFooter className="flex-row gap-2 border-t p-6">
          <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button className="flex-1" type="submit" form="profile-form" loading={save.isPending} disabled={!draft.firstName.trim()}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ---------- Photo ----------

const PHOTO_SIZE = 256
const PHOTO_TARGET_BYTES = 60 * 1024
const dataUrlBytes = (url: string) => Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4)

/** Recadre la photo au carré (centre), la réduit à 256 × 256 et la compresse (WebP, JPEG si le navigateur n'encode pas le WebP). */
async function squarePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    if (!side) throw new Error('This image can’t be read.')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = PHOTO_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This image can’t be read.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
    const webp = canvas.toDataURL('image/webp', 0.5).startsWith('data:image/webp')
    const type = webp ? 'image/webp' : 'image/jpeg'
    let out = ''
    for (const quality of [0.85, 0.75, 0.65, 0.5, 0.35]) {
      out = canvas.toDataURL(type, quality)
      if (dataUrlBytes(out) <= PHOTO_TARGET_BYTES) break
    }
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** En-tête du profil : un clic sur l'avatar ouvre le choix d'une photo ; « Remove photo » repasse aux initiales. */
export function ProfileHeader({ name }: { name: string }) {
  const input = useRef<HTMLInputElement>(null)
  const refresh = useProfileRefresh()
  const { src } = useRunnerPhoto()
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Pick an image.')
      return api('/account/photo', { method: 'PUT', body: { dataUrl: await squarePhoto(file) } })
    },
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e),
  })
  const remove = useMutation({
    mutationFn: () => api('/account/photo', { method: 'DELETE' }),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e),
  })
  const busy = upload.isPending || remove.isPending

  return (
    <div className="mb-6 flex items-center gap-4">
      <button
        type="button"
        aria-label={src ? 'Change photo' : 'Add a photo'}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="group relative flex shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <RunnerAvatar name={name} size="xl" />
        <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors group-hover:text-foreground">
          <CameraIcon className="size-3.5" />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) upload.mutate(file)
        }}
      />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <h1 className="font-heading text-2xl">{name}</h1>
        {src && (
          <button type="button" disabled={busy} onClick={() => remove.mutate()} className="text-muted-foreground text-xs hover:text-foreground disabled:opacity-60">
            Remove photo
          </button>
        )}
      </div>
    </div>
  )
}
