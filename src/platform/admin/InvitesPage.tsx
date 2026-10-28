import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Switch } from '@/components/arc/switch/switch'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type Code = { code: string; label: string; max_uses: number | null; uses: number; active: boolean; created_at: string; owner: string | null }
type Waiting = {
  id: string
  email: string
  first_name: string
  ref_code: string
  referred_by: string | null
  referrals: number
  invite_code: string | null
  invited_at: string | null
  created_at: string
  position: number
}

/** Codes d'invitation (création, désactivation) et liste d'attente classée par parrainages. */
export function InvitesPage() {
  const qc = useQueryClient()
  const data = useQuery({ queryKey: ['admin', 'invites'], queryFn: () => api<{ codes: Code[]; waitlist: Waiting[] }>('/admin/invites') })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
  const [form, setForm] = useState({ code: '', label: '', maxUses: '' })
  const create = useMutation({
    mutationFn: () => api('/admin/invites', { body: { code: form.code, label: form.label, maxUses: form.maxUses ? Number(form.maxUses) : null } }),
    onSuccess: () => {
      setForm({ code: '', label: '', maxUses: '' })
      void refresh()
    },
  })
  const toggle = useMutation({ mutationFn: (c: Code) => api(`/admin/invites/${c.code}`, { method: 'PATCH', body: { active: !c.active } }), onSuccess: refresh })
  const invite = useMutation({ mutationFn: (w: Waiting) => api<{ code: string }>(`/admin/waitlist/${w.id}/invite`, { method: 'POST' }), onSuccess: refresh })

  const codeColumns: DataColumn<Code>[] = [
    { key: 'code', label: 'Code', sortable: true, render: (v) => <code className="font-medium">{v as string}</code> },
    { key: 'label', label: 'Label', render: (v, row) => (v as string) || row.owner || '—' },
    { key: 'uses', label: 'Uses', sortable: true, render: (v, row) => `${v as number}${row.max_uses === null ? ' · unlimited' : ` / ${row.max_uses}`}` },
    { key: 'created_at', label: 'Created', sortable: true, render: (v) => formatDateTime(v as string) },
    { key: 'active', label: 'Active', render: (_, row) => <Switch aria-label={`Enable ${row.code}`} checked={row.active} onCheckedChange={() => toggle.mutate(row)} /> },
  ]
  const waitColumns: DataColumn<Waiting>[] = [
    { key: 'position', label: 'Rank', sortable: true },
    { key: 'email', label: 'Person', sortable: true, render: (v, row) => `${row.first_name ? `${row.first_name} · ` : ''}${v as string}` },
    { key: 'referrals', label: 'Referrals', sortable: true },
    { key: 'referred_by', label: 'Referred by', render: (v) => (v as string | null) ?? '—' },
    { key: 'created_at', label: 'Joined', sortable: true, render: (v) => formatDateTime(v as string) },
    {
      key: 'invite_code',
      label: 'Invite',
      render: (v, row) =>
        v ? (
          <Badge size="sm" tone="success">
            {v as string}
          </Badge>
        ) : (
          <Button size="sm" variant="secondary" loading={invite.isPending && invite.variables?.id === row.id} onClick={() => invite.mutate(row)}>
            Invite
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageTitle title="Invitations" description="Onboarding requires a code. Without one, people join the waitlist and move up by referring friends." />
      <div className="flex flex-col gap-4">
        <ErrorNote error={data.error ?? create.error ?? toggle.error ?? invite.error} />
        <Panel title="New code">
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <Input label="Code" placeholder="e.g. club-asm" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input label="Label" placeholder="Who is it for?" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <Input label="Max uses" placeholder="Unlimited" inputMode="numeric" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value.replace(/\D/g, '') })} />
            <Button type="submit" loading={create.isPending} disabled={form.code.trim().length < 3}>
              Create
            </Button>
          </form>
        </Panel>
        <Panel title={`Codes (${data.data?.codes.length ?? 0})`}>{data.data && <SortableDataTable columns={codeColumns} rows={data.data.codes} rowKey="code" />}</Panel>
        <Panel title={`Waitlist (${data.data?.waitlist.length ?? 0})`}>
          {data.data && <SortableDataTable columns={waitColumns} rows={data.data.waitlist} rowKey="id" />}
        </Panel>
      </div>
    </>
  )
}
