/** Libellés et formats partagés par le site et le back office. */

export const DISTANCE_LABELS: Record<string, string> = {
  '5k': '5 km',
  '10k': '10 km',
  half: 'Half marathon',
  marathon: 'Marathon',
  trail: 'Trail',
}

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

type Tone = 'neutral' | 'success' | 'info' | 'warning' | 'danger'

export const PLAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'info' },
  generating: { label: 'Generating', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
}

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  waitlist: { label: 'Waitlist', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
}

export const VARIANT_STATUS: Record<string, { label: string; tone: Tone }> = {
  live: { label: 'Live', tone: 'success' },
  draft: { label: 'Draft', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'neutral' },
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** `YYYY-MM-DD` est lu en date locale (pas en UTC) pour ne pas décaler d'un jour. */
export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return dateFmt.format(d)
}

export function formatDateTime(value: string | null | undefined) {
  return value ? dateTimeFmt.format(new Date(value)) : '—'
}

export const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0)
