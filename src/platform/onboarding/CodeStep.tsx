import { ArrowLeftIcon, SendIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { checkInviteCode, joinWaitlist, storedWaitlistStatus, waitlistShareUrl, type WaitlistStatus } from '../invite/invite'
import { ShareButtons } from '../invite/ShareButtons'
import { CoachBubble, TypingBubble, UserBubble } from './ChatBubbles'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Pacer « tape » ses répliques avant de les afficher : `ready` passe à vrai après un court délai, à chaque changement de `key`. */
function useTyped(key: string) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    const t = window.setTimeout(() => setReady(true), 900)
    return () => window.clearTimeout(t)
  }, [key])
  return ready
}

/**
 * Première question de l'onboarding (accès sur invitation) : le code, dans la conversation avec Pacer.
 * Un lien `?code=` est vérifié tout seul ; sans code, la personne rejoint la liste d'attente (avec le `?ref=`
 * d'un ami) et reçoit son lien de parrainage. Le parcours ne démarre côté serveur qu'avec un code valide.
 */
export function CodeStep({
  initialCode,
  referrer,
  error: outerError,
  onValid,
}: {
  initialCode: string | null
  referrer: string | null
  /** Erreur au démarrage du parcours (code épuisé entre-temps…). */
  error?: string
  onValid: (code: string) => void
}) {
  const [mode, setMode] = useState<'code' | 'waitlist'>('code')
  const [code, setCode] = useState(initialCode ?? '')
  const [checking, setChecking] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [join, setJoin] = useState({ firstName: '', email: '' })
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [status, setStatus] = useState<WaitlistStatus | null>(null)
  const [joined, setJoined] = useState<{ firstName: string; email: string } | null>(null)
  const autoChecked = useRef(false)

  async function check(value: string) {
    setChecking(true)
    setCodeError('')
    try {
      const valid = await checkInviteCode(value.trim())
      if (valid) onValid(valid)
      else setCodeError('This code isn’t valid or has already been used.')
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  // Lien reçu avec le code : vérification directe. Déjà inscrit sur la liste depuis cet appareil : rang réaffiché.
  useEffect(() => {
    if (initialCode && !autoChecked.current) {
      autoChecked.current = true
      void check(initialCode)
    }
    void storedWaitlistStatus().then((st) => st && setStatus(st))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitWaitlist() {
    setJoining(true)
    setJoinError('')
    try {
      const person = { firstName: join.firstName.trim(), email: join.email.trim() }
      const res = await joinWaitlist({ ...person, ref: referrer })
      setJoined(person)
      setStatus(res)
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : String(e))
    } finally {
      setJoining(false)
    }
  }

  const typed = useTyped(`${mode}-${status ? 'joined' : 'form'}`)
  const pill =
    'rounded-full border bg-card px-4 py-2.5 text-sm transition-colors hover:border-foreground/50 hover:bg-foreground hover:text-background disabled:opacity-50'

  if (mode === 'code') {
    const error = codeError || outerError
    return (
      <>
        <div className="flex animate-[fade-in_300ms_ease-out] justify-end">
          <button type="button" disabled={checking} onClick={() => setMode('waitlist')} className={pill}>
            I don’t have a code
          </button>
        </div>
        <form
          className="flex animate-[fade-in_300ms_ease-out] flex-col gap-6 rounded-[26px] border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim() && !checking) void check(code)
          }}
        >
          <Input
            label="Invite code"
            placeholder="E.g. victor43"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!initialCode}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <Button type="submit" loading={checking} disabled={!code.trim()}>
              Send <SendIcon className="size-4" />
            </Button>
          </div>
        </form>
      </>
    )
  }

  const first = (joined?.firstName || status?.first_name || '').trim()
  return (
    <>
      <UserBubble>I don’t have a code</UserBubble>
      {status && !joined ? (
        // Déjà inscrit depuis cet appareil : Pacer redonne le rang sans redemander l'e-mail.
        <Joined status={status} first={first} typed={typed} again onBack={() => setMode('code')} />
      ) : (
        !typed && !joined ? (
          <TypingBubble avatar />
        ) : (
        <>
          <div className="flex flex-col gap-2">
            <CoachBubble first>No problem.</CoachBubble>
            <CoachBubble first={false}>
              {referrer
                ? 'Join the waitlist: it moves the friend who sent you up too. I’ll email you as soon as a spot opens.'
                : 'Join the waitlist: I’ll email you as soon as a spot opens.'}
            </CoachBubble>
          </div>
          {joined && status ? (
            <>
              <UserBubble>
                {joined.firstName ? `${joined.firstName} · ` : ''}
                {joined.email}
              </UserBubble>
              <Joined status={status} first={first} typed={typed} onBack={() => setMode('code')} />
            </>
          ) : (
            <form
              className="flex animate-[fade-in_300ms_ease-out] flex-col gap-6 rounded-[26px] border bg-card p-5"
              onSubmit={(e) => {
                e.preventDefault()
                if (EMAIL.test(join.email.trim()) && !joining) void submitWaitlist()
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="First name" autoComplete="given-name" value={join.firstName} onChange={(e) => setJoin({ ...join, firstName: e.target.value })} />
                <Input
                  label="Email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={join.email}
                  onChange={(e) => setJoin({ ...join, email: e.target.value })}
                />
              </div>
              {joinError && (
                <p role="alert" className="text-destructive text-sm">
                  {joinError}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <Button type="button" variant="ghost" size="sm" disabled={joining} onClick={() => setMode('code')}>
                  <ArrowLeftIcon className="size-4" /> I have a code
                </Button>
                <Button type="submit" loading={joining} disabled={!EMAIL.test(join.email.trim())}>
                  Join the list <SendIcon className="size-4" />
                </Button>
              </div>
            </form>
          )}
        </>
        )
      )}
    </>
  )
}

/** Confirmation de la liste d'attente : rang, parrainages et lien à partager. */
function Joined({ status, first, typed, again, onBack }: { status: WaitlistStatus; first: string; typed: boolean; again?: boolean; onBack: () => void }) {
  if (!typed) return <TypingBubble avatar />
  return (
    <>
      <div className="flex flex-col gap-2">
        <CoachBubble first>
          {again ? `You’re already on the list${first ? `, ${first}` : ''}.` : `You’re on the list${first ? `, ${first}` : ''}! Check your inbox.`}
        </CoachBubble>
        <CoachBubble first={false}>
          You’re #{status.position} out of {status.total}
          {status.referrals ? `, with ${status.referrals} friend${status.referrals !== 1 ? 's' : ''} referred` : ''}. Every friend who signs up with your link moves you up.
        </CoachBubble>
      </div>
      <div className="flex animate-[fade-in_300ms_ease-out] flex-col gap-4 rounded-[26px] border bg-card p-5">
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
        <ShareButtons
          url={waitlistShareUrl(status.refCode)}
          subject="Join me on Raice.run"
          text="I just signed up for Raice.run, a running coach that builds a plan tailored to you. Sign up with my link and we both move up the list:"
        />
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
          <ArrowLeftIcon className="size-3" /> I got a code
        </button>
      </div>
    </>
  )
}
