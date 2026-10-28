import { MailIcon, MessageCircleIcon, MessageSquareTextIcon, Share2Icon } from 'lucide-react'
import { CopyButton } from '@/components/arc/copy-button/copy-button'

/** Partage d'un lien : WhatsApp, SMS, e-mail, copie, et le partage natif du téléphone quand il existe. */
export function ShareButtons({ url, text, subject }: { url: string; text: string; subject: string }) {
  const message = `${text} ${url}`
  const links = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(message)}`, icon: <MessageCircleIcon /> },
    { label: 'SMS', href: `sms:?&body=${encodeURIComponent(message)}`, icon: <MessageSquareTextIcon /> },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`, icon: <MailIcon /> },
  ]
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-[16px] border bg-background py-1.5 pr-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate text-sm">{url.replace(/^https?:\/\//, '')}</span>
        <CopyButton value={url} label="Copy" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target={l.label === 'WhatsApp' ? '_blank' : undefined}
            rel="noreferrer"
            className="flex flex-col items-center gap-1.5 rounded-[16px] border bg-card p-3 text-xs transition-colors hover:border-foreground/50 [&_svg]:size-5"
          >
            {l.icon}
            {l.label}
          </a>
        ))}
      </div>
      {canShare && (
        <button
          type="button"
          onClick={() => void navigator.share({ title: subject, text, url }).catch(() => {})}
          className="flex items-center justify-center gap-2 rounded-[16px] border p-3 text-sm hover:border-foreground/50"
        >
          <Share2Icon className="size-4" /> More options
        </button>
      )}
    </div>
  )
}
