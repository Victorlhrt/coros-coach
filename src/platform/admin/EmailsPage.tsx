import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SendIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type Template = { id: string; label: string; when: string; subject: string }
type LogRow = { id: string; recipient: string; template: string; subject: string; status: 'sent' | 'failed' | 'skipped'; error: string | null; created_at: string }
type Data = { configured: boolean; from: string; templates: Template[]; log: LogRow[] }

const STATUS = {
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Not sent', tone: 'warning' },
} as const

const columns: DataColumn<LogRow>[] = [
  { key: 'created_at', label: 'Date', sortable: true, render: (v) => formatDateTime(v as string) },
  { key: 'recipient', label: 'Recipient', sortable: true },
  { key: 'template', label: 'Template', sortable: true },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (_, r) => (
      <span title={r.error ?? undefined}>
        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
      </span>
    ),
  },
]

/** Modèles d'e-mails transactionnels (Resend) : aperçu, envoi de test, journal. */
export function EmailsPage() {
  const qc = useQueryClient()
  const data = useQuery({ queryKey: ['admin', 'emails'], queryFn: () => api<Data>('/admin/emails') })
  const [selected, setSelected] = useState('welcome')
  const test = useMutation({
    mutationFn: (id: string) => api<{ to: string }>(`/admin/emails/${id}/test`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'emails'] }),
  })
  const current = data.data?.templates.find((t) => t.id === selected)

  return (
    <>
      <PageTitle
        title="Emails"
        description={data.data ? `Sent by Resend from ${data.data.from}.` : undefined}
        actions={
          data.data && (
            <Badge tone={data.data.configured ? 'success' : 'warning'}>{data.data.configured ? 'Resend connected' : 'RESEND_API_KEY missing'}</Badge>
          )
        }
      />
      <div className="flex flex-col gap-4">
        <ErrorNote error={data.error ?? test.error} />
        {data.data && (
          <SegmentedControl
            label="Template"
            options={data.data.templates.map((t) => ({ value: t.id, label: t.label }))}
            value={selected}
            onValueChange={(v) => {
              setSelected(v)
              test.reset()
            }}
          />
        )}
        {current && (
          <Panel
            title={current.subject}
            description={`Sent when: ${current.when}.`}
            actions={
              <div className="flex items-center gap-3">
                {test.isSuccess && <span className="text-muted-foreground text-xs">Sent to {test.data.to}</span>}
                <Button size="sm" variant="outline" disabled={!data.data?.configured || test.isPending} onClick={() => test.mutate(current.id)}>
                  <SendIcon /> Send me a test
                </Button>
              </div>
            }
          >
            <iframe
              key={current.id}
              title={`Preview: ${current.label}`}
              src={`/api/platform/admin/emails/${current.id}/preview`}
              className="h-[640px] w-full rounded-lg border bg-black"
            />
          </Panel>
        )}
        <Panel title="Recent sends" description="The last 100 emails, with their Resend status.">
          <SortableDataTable
            rows={data.data?.log ?? []}
            columns={columns}
            rowKey="id"
            caption="Recent sends"
            emptyMessage="No emails sent yet"
            defaultSort={{ key: 'created_at', direction: 'desc' }}
            itemName={{ one: 'email', other: 'emails' }}
          />
        </Panel>
      </div>
    </>
  )
}
