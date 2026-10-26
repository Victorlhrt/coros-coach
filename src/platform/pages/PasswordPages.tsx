import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { PasswordField } from '@/components/arc/password-field/password-field'
import { Logo } from '@/components/logo'
import { api } from '../api'
import { siteHref } from '../brand'

/** Carte centrée aux proportions des blocs Arc (rayon des surfaces, champs et bouton pleine largeur). */
function Card({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center gap-8 px-4 py-8">
      <a href={siteHref()}>
        <Logo />
      </a>
      <section className="w-full max-w-[432px] rounded-[34px] border bg-card p-8">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">{title}</h1>
        <p className="mt-2 mb-6 text-muted-foreground text-sm leading-relaxed">{text}</p>
        {children}
      </section>
    </div>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setState('busy')
    setError('')
    try {
      await api('/auth/forgot', { body: { email } })
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <Card title="Regarde tes e-mails" text={`Si un compte existe pour ${email}, un lien vient d’y être envoyé. Il est valable une heure.`}>
        <Link to="/connexion" className="text-muted-foreground text-sm hover:text-foreground">
          Retour à la connexion
        </Link>
      </Card>
    )
  }
  return (
    <Card title="Mot de passe oublié" text="Saisis l’e-mail de ton compte : on t’envoie un lien pour en choisir un nouveau.">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <Input label="E-mail" type="email" autoComplete="email" placeholder="nom@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} error={error || undefined} />
        <Button type="submit" loading={state === 'busy'} disabled={!email}>
          Envoyer le lien
        </Button>
        <Link to="/connexion" className="text-center text-muted-foreground text-sm hover:text-foreground">
          Retour à la connexion
        </Link>
      </form>
    </Card>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('8 caractères minimum.')
    setBusy(true)
    setError('')
    try {
      const res = await api<{ status: string }>('/auth/reset', { body: { token, password } })
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate(res.status === 'active' ? '/compte' : '/connexion', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Card title="Nouveau mot de passe" text="Choisis un mot de passe d’au moins 8 caractères. Tes autres sessions seront déconnectées.">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <PasswordField
          label="Nouveau mot de passe"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          messages={{ showPassword: 'Afficher le mot de passe', hidePassword: 'Masquer le mot de passe' }}
        />
        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} disabled={!token}>
          Enregistrer
        </Button>
      </form>
    </Card>
  )
}
