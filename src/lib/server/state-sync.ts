import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { ApiError, api } from './api'

/**
 * Synchronise l'état de l'app avec le serveur (mêmes données sur mobile et desktop).
 * Chaque modification locale est envoyée après une courte pause ; au retour sur l'app on récupère
 * la version du serveur si un autre appareil l'a changée. En cas de conflit, la version du serveur gagne.
 */

const PLAN_KEYS = ['goal', 'profile', 'zones', 'plan', 'coros', 'links', 'reviews', 'records', 'volume', 'feedback'] as const
const SETTINGS_KEYS = ['model', 'units', 'autoReview'] as const

interface Snapshot {
  plan: Record<string, unknown>
  settings: Record<string, unknown>
}
interface Remote {
  version: number
  data: Snapshot | null
}

let version = 0
let lastSent = ''
let applying = false
let timer: ReturnType<typeof setTimeout> | null = null
let started = false

function pick<T extends object>(obj: T, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, (obj as Record<string, unknown>)[k]]))
}

function snapshot(): Snapshot {
  return { plan: pick(usePlan.getState(), PLAN_KEYS), settings: pick(useSettings.getState(), SETTINGS_KEYS) }
}

function apply(remote: Remote) {
  applying = true
  if (remote.data) {
    usePlan.setState(remote.data.plan as Partial<ReturnType<typeof usePlan.getState>>)
    useSettings.setState(remote.data.settings as Partial<ReturnType<typeof useSettings.getState>>)
  }
  version = remote.version
  lastSent = JSON.stringify(snapshot())
  applying = false
}

async function push() {
  timer = null
  const data = snapshot()
  const json = JSON.stringify(data)
  if (json === lastSent) return
  try {
    const res = await api<{ version: number }>('/state', { method: 'PUT', body: { baseVersion: version, data } })
    version = res.version
    lastSent = json
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      apply((err.body as { current: Remote }).current)
      toast.success('Données mises à jour depuis un autre appareil')
    }
  }
}

function schedule() {
  if (applying) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(push, 1200)
}

async function pull() {
  if (timer) {
    clearTimeout(timer)
    await push()
  }
  const remote = await api<Remote>('/state').catch(() => null)
  if (remote && remote.version > version) apply(remote)
}

/** À lancer une fois connecté. Premier appareil : son état local initialise le serveur. */
export async function startStateSync() {
  if (started) return
  started = true
  const remote = await api<Remote>('/state')
  if (remote.data) apply(remote)
  else {
    version = 0
    await push()
  }
  usePlan.subscribe(schedule)
  useSettings.subscribe(schedule)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pull()
    else if (timer) {
      clearTimeout(timer)
      void push()
    }
  })
}
