import { useMutation, useQuery } from '@tanstack/react-query'
import { ScanFace } from 'lucide-react'
import { api } from '@/lib/server/api'
import { logout, registerPasskey } from '@/lib/server/auth'
import { toast } from '@/lib/toast'
import { Button } from './ui/button'
import { Card, CardDescription, CardTitle } from './ui/card'

interface Credential {
  id: string
  name: string | null
  created_at: string
  last_used_at: string | null
}

/** Compte : passkeys enregistrés, ajout d'un appareil, déconnexion. */
export function AccountCard() {
  const credentials = useQuery({ queryKey: ['credentials'], queryFn: () => api<Credential[]>('/auth/credentials') })
  const add = useMutation({
    mutationFn: () => registerPasskey(),
    onSuccess: () => {
      toast.success('Passkey ajouté ✓')
      void credentials.refetch()
    },
    onError: toast.error,
  })

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <ScanFace className="size-5 text-session-easy" /> Compte
      </CardTitle>
      <CardDescription className="mt-1">
        Connecté par passkey. Tes données sont synchronisées entre tes appareils. Un passkey iCloud fonctionne aussi sur ton Mac.
      </CardDescription>
      <ul className="mt-3 space-y-1 text-sm">
        {credentials.data?.map((c) => (
          <li key={c.id} className="flex justify-between">
            <span className="font-medium">{c.name ?? 'Passkey'}</span>
            <span className="text-muted-foreground">
              {c.last_used_at ? `utilisé le ${new Date(c.last_used_at).toLocaleDateString('fr-FR')}` : `créé le ${new Date(c.created_at).toLocaleDateString('fr-FR')}`}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" disabled={add.isPending} onClick={() => add.mutate()}>
          Ajouter un passkey
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void logout()}>
          Se déconnecter
        </Button>
      </div>
    </Card>
  )
}
