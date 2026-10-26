/**
 * Mise en page des e-mails Raice.run, dans le style Arc UI du produit : fond noir, carte à grand rayon,
 * bouton blanc en pilule, chiffres en avant. Uniquement des tableaux et des styles en ligne, pour tenir
 * dans Gmail, Apple Mail et Outlook.
 */

import { config } from '../../config.js'

export type Email = { subject: string; html: string; text: string }

const FONT = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
const C = {
  background: '#000000',
  surface: '#0B0B0B',
  raised: '#141414',
  border: '#262626',
  muted: '#8C8C8C',
  body: '#B4B4B4',
  foreground: '#EDEDED',
  primary: '#FFFFFF',
}

export const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Blocs de contenu de la carte, assemblés dans l'ordre. */
export type Block =
  | { kind: 'eyebrow'; text: string }
  | { kind: 'title'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'button'; label: string; href: string }
  | { kind: 'metrics'; items: { label: string; value: string }[] }
  | { kind: 'note'; text: string }
  | { kind: 'code'; text: string }

function block(b: Block): string {
  switch (b.kind) {
    case 'eyebrow':
      return `<tr><td style="padding:0 0 14px;font-family:${MONO};font-size:12px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${escape(b.text)}</td></tr>`
    case 'title':
      return `<tr><td style="padding:0 0 16px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:600;letter-spacing:-0.03em;color:${C.primary};">${escape(b.text)}</td></tr>`
    case 'paragraph':
      return `<tr><td style="padding:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.body};">${escape(b.text)}</td></tr>`
    case 'note':
      return `<tr><td style="padding:8px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${escape(b.text)}</td></tr>`
    case 'code':
      return `<tr><td style="padding:4px 0 20px;"><div style="font-family:${MONO};font-size:13px;line-height:20px;color:${C.foreground};background:${C.raised};border:1px solid ${C.border};border-radius:12px;padding:12px 14px;word-break:break-all;">${escape(b.text)}</div></td></tr>`
    case 'button':
      // Bouton « pare-balles » : un tableau cliquable entier, pilule blanche au rayon des contrôles Arc (18 px).
      return `<tr><td style="padding:8px 0 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${C.primary}" style="border-radius:18px;">
      <a href="${escape(b.href)}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:500;color:#000000;text-decoration:none;border-radius:18px;">${escape(b.label)}&nbsp;&rarr;</a>
    </td>
  </tr></table>
</td></tr>`
    case 'metrics': {
      // Comme la MetricCard d'Arc : libellé discret au-dessus, valeur grande et serrée.
      const cells = b.items
        .map(
          (m) => `<td valign="top" style="padding:14px 14px;background:${C.raised};border:1px solid ${C.border};border-radius:20px;">
  <div style="font-family:${FONT};font-size:13px;line-height:18px;color:${C.muted};">${escape(m.label)}</div>
  <div style="padding-top:10px;font-family:${FONT};font-size:20px;line-height:24px;font-weight:600;letter-spacing:-0.02em;white-space:nowrap;color:${C.primary};">${escape(m.value)}</div>
</td>`,
        )
        .join('<td style="width:8px;font-size:0;">&nbsp;</td>')
      return `<tr><td style="padding:4px 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>`
    }
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case 'eyebrow':
      return b.text.toUpperCase()
    case 'button':
      return `${b.label} : ${b.href}`
    case 'metrics':
      return b.items.map((m) => `${m.label} : ${m.value}`).join('\n')
    default:
      return b.text
  }
}

export function render({ subject, preheader, blocks, footer }: { subject: string; preheader: string; blocks: Block[]; footer?: string }): Email {
  const foot = footer ?? 'Tu reçois cet e-mail parce que tu as un compte Raice.run.'
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.background};" bgcolor="${C.background}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.background}" style="background:${C.background};">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td style="padding:0 8px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:8px;"><img src="${config.origin}/logo-email.png" width="24" height="23" alt="" style="display:block;border:0;"></td>
        <td style="font-family:${FONT};font-size:18px;line-height:24px;font-weight:600;font-style:italic;letter-spacing:-0.03em;color:${C.primary};">Raice<span style="color:${C.muted};">.run</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.surface};border:1px solid ${C.border};border-radius:34px;padding:40px 36px 28px;" bgcolor="${C.surface}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${blocks.map(block).join('\n')}
      </table>
    </td></tr>
    <tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">${escape(foot)}<br>Raice.run · ton plan de course, écrit par l’IA, synchronisé sur ta montre.</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
  const text = [...blocks.map(blockText), '', '—', foot, 'Raice.run'].join('\n\n')
  return { subject, html, text }
}
