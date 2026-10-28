import { useMutation } from '@tanstack/react-query'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { ChevronLeft, Copy, Lock, Play, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { corosRead } from '@/lib/coros/client'
import { MCP_URL, isWriteTool } from '@/lib/coros/config'
import { useCorosTools } from '@/lib/coros/hooks'
import { useWriteLog } from '@/lib/coros/write-log'
import { ROUTES } from '@/lib/coach/routes'

/** Écran caché (/#/debug) : outils exposés par le serveur COROS, tels quels. */
export function DebugPage() {
  const connected = useCorosAuth((s) => s.connected)
  const tools = useCorosTools()
  const [filter, setFilter] = useState('')
  const [copied, setCopied] = useState(false)
  const log = useWriteLog((s) => s.entries)

  const visible = (tools.data ?? []).filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))

  async function copyAll() {
    await navigator.clipboard.writeText(JSON.stringify(tools.data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 pt-4">
        <Link to={ROUTES.settings} aria-label="Back" className="-ml-2 p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="flex-1 text-2xl font-medium tracking-tight">Debug MCP</h1>
        <Button size="icon" variant="secondary" aria-label="Reload" onClick={() => tools.refetch()}>
          <RefreshCw className={tools.isFetching ? 'size-5 animate-spin' : 'size-5'} />
        </Button>
      </header>
      <p className="break-all text-xs text-muted-foreground">{MCP_URL}</p>

      {!connected && <Card className="text-sm">Connect COROS in Settings to list the tools.</Card>}
      {tools.isLoading && Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}
      {tools.error && <Card className="text-sm text-destructive">{tools.error.message}</Card>}

      {tools.data && (
        <>
          <div className="flex gap-2">
            <Input placeholder={`Filter ${tools.data.length} tools`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button variant="secondary" onClick={copyAll} className="shrink-0">
              <Copy className="size-4" /> {copied ? 'Copied' : 'JSON'}
            </Button>
          </div>
          {visible.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </>
      )}

      {log.length > 0 && (
        <Card>
          <h2 className="font-medium">Write log</h2>
          <ul className="mt-3 space-y-2 text-xs">
            {log.map((e) => (
              <li key={e.id} className="rounded-lg bg-muted p-2">
                <span className="font-mono">{e.tool}</span> · {e.status} ·{' '}
                {new Date(e.at).toLocaleString('en-GB')}
                <div className="text-muted-foreground">{e.error ?? e.summary}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function ToolCard({ tool }: { tool: Tool }) {
  const write = isWriteTool(tool.name)
  const [args, setArgs] = useState('{}')
  const [copied, setCopied] = useState(false)
  const run = useMutation({ mutationFn: () => corosRead(tool.name, JSON.parse(args) as Record<string, unknown>) })

  return (
    <Card className="p-4">
      <details>
        <summary className="flex cursor-pointer list-none items-start gap-2">
          <div className="flex-1">
            <div className="font-mono text-sm font-medium">{tool.name}</div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tool.description}</p>
          </div>
          {write && <Lock className="mt-0.5 size-4 shrink-0 text-session-tempo" aria-label="Write" />}
        </summary>
        <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-muted p-3 text-[11px] leading-relaxed">
          {JSON.stringify({ description: tool.description, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, annotations: tool.annotations }, null, 2)}
        </pre>
        {write ? (
          <p className="mt-3 text-xs text-muted-foreground">Write tool: cannot be run from debug.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea
              className="h-24 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              spellCheck={false}
            />
            <Button size="sm" variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
              <Play className="size-4" /> Call
            </Button>
            {run.error && <p className="text-xs text-destructive">{run.error.message}</p>}
            {run.data !== undefined && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(typeof run.data === 'string' ? run.data : JSON.stringify(run.data, null, 2))
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  <Copy className="size-4" /> {copied ? 'Copied' : 'Copy result'}
                </Button>
                <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-[11px] whitespace-pre-wrap">
                  {typeof run.data === 'string' ? run.data : JSON.stringify(run.data, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </details>
    </Card>
  )
}
