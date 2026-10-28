import { TicketIcon, UsersIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { api } from '../api'
import { CoachAvatar } from '../onboarding/CoachAvatar'
import { ShareButtons } from './ShareButtons'

/** Code d'invitation validé, gardé le temps de la visite. */
export const INVITE_KEY = 'platform.inviteCode'
/** Lien de parrainage de la personne inscrite sur la liste d'attente, pour lui réafficher son rang. */
const WAITLIST_KEY = 'platform.waitlistRef'

const store = {
  get: (k: string, s: Storage = sessionStorage) => {
    try {
      return s.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string, s: Storage = sessionStorage) => {
    try {
      s.setItem(k, v)
    } catch {
      /* sans stockage, on redemandera le code */
    }
  },
}

export const storedInviteCode = () => store.get(INVITE_KEY)

type Status = { refCode: string; position: number; total: number; referrals: number; first_name: string }

/**
 * Accès à l'onboarding sur invitation : saisie du code (pré-rempli par `?code=`), ou inscription sur la
 * liste d'attente (avec `?ref=` d'un ami), puis lien de parrainage à partager.
 */
export function InviteGate({ initialCode, referrer, onValid }: { initialCode: string | null; referrer: string | null; onValid: (code: string) => void }) {
  const [code, setCode] = useState(initialCode ?? '')
  const [checking, setChecking] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [join, setJoin] = useState({ firstName: '', email: '' })
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [status, setStatus] = useState<Status | null>(null)

  async function check(value: string) {
    setChecking(true)
    setCodeError('')
    try {
      const res = await api<{ valid: boolean; code?: string }>('/invites/check', { body: { code: value } })
      if (res.valid && res.code) {
        store.set(INVITE_KEY, res.code)
        onValid(res.code)
      } else setCodeError('This code isn’t valid or has already been used.')
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  // Lien reçu avec le code : vérification directe. Déjà inscrit sur la liste : on réaffiche son rang.
  useEffect(() => {
    if (initialCode) void check(initialCode)
    const ref = store.get(WAITLIST_KEY, localStorage)
    if (ref) api<Status>(`/invites/waitlist/${ref}`).then(setStatus, () => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function joinWaitlist() {
    setJoining(true)
    setJoinError('')
    try {
      const res = await api<Status>('/invites/waitlist', { body: { ...join, ref: referrer ?? undefined } })
      store.set(WAITLIST_KEY, res.refCode, localStorage)
      setStatus(res)
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : String(e))
    } finally {
      setJoining(false)
    }
  }

  const shareUrl = status ? `${window.location.origin}/onboarding?ref=${status.refCode}` : ''

  return (
    <div className="flex flex-col gap-6">
      <div className="relative h-44 overflow-hidden rounded-[26px] border sm:h-56">
        <img src="/visuals/invite.webp" alt="" className="absolute inset-0 size-full object-cover object-[50%_40%]" />
        <div className="absolute inset-0 bg-linear-to-t from-background/90 via-background/10 to-transparent" />
        <p className="absolute bottom-4 left-5 font-medium text-lg">Running is better together.</p>
      </div>
      <div className="flex items-start gap-3">
        <CoachAvatar className="size-11" />
        <div className="flex flex-col gap-2">
          <p className="w-fit rounded-2xl border bg-card px-4 py-2.5 text-sm">Hi! Raice.run is invite-only for now, opening in small waves.</p>
          <p className="w-fit rounded-2xl border bg-card px-4 py-2.5 text-sm">
            {referrer ? 'A friend sent you here. Got a code? If not, join the list: it moves them up too.' : 'Got a code? If not, join the waitlist.'}
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-4 rounded-[26px] border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) void check(code)
        }}
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          <TicketIcon className="size-4 text-muted-foreground" /> I have a code
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Invite code" placeholder="E.g. victor43" autoCapitalize="none" autoCorrect="off" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <Button type="submit" loading={checking} disabled={!code.trim()}>
            Continue
          </Button>
        </div>
        {codeError && (
          <p role="alert" className="text-destructive text-sm">
            {codeError}
          </p>
        )}
      </form>

      {status ? (
        <section className="flex flex-col gap-4 rounded-[26px] border bg-card p-5">
          <div className="flex items-center gap-2 font-medium text-sm">
            <UsersIcon className="size-4 text-muted-foreground" /> Waitlist
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-semibold text-5xl tabular-nums tracking-tight">#{status.position}</p>
              <p className="mt-1 text-muted-foreground text-sm">out of {status.total} on the list</p>
            </div>
            <p className="text-right text-sm">
              <span className="font-semibold text-xl tabular-nums">{status.referrals}</span>
              <br />
              <span className="text-muted-foreground">friend{status.referrals !== 1 ? 's' : ''} referred</span>
            </p>
          </div>
          <p className="text-sm">Every friend who signs up with your link moves you up. Share it:</p>
          <ShareButtons
            url={shareUrl}
            subject="Join me on Raice.run"
            text="I just signed up for Raice.run, a running coach that builds a plan tailored to you. Sign up with my link and we both move up the list:"
          />
        </section>
      ) : (
        <form
          className="flex flex-col gap-4 rounded-[26px] border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault()
            void joinWaitlist()
          }}
        >
          <div className="flex items-center gap-2 font-medium text-sm">
            <UsersIcon className="size-4 text-muted-foreground" /> No code? Join the waitlist
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" autoComplete="given-name" value={join.firstName} onChange={(e) => setJoin({ ...join, firstName: e.target.value })} />
            <Input label="Email" type="email" autoComplete="email" placeholder="name@example.com" value={join.email} onChange={(e) => setJoin({ ...join, email: e.target.value })} />
          </div>
          {joinError && (
            <p role="alert" className="text-destructive text-sm">
              {joinError}
            </p>
          )}
          <Button type="submit" variant="secondary" loading={joining} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(join.email.trim())}>
            Join the list
          </Button>
        </form>
      )}
    </div>
  )
}
