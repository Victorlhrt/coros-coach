import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { useSettings } from '@/lib/store/settings'

export class MissingApiKeyError extends Error {
  constructor() {
    super('Ajoute ta clé API Anthropic dans Réglages.')
  }
}

function client() {
  const { anthropicKey } = useSettings.getState()
  if (!anthropicKey) throw new MissingApiKeyError()
  // dangerouslyAllowBrowser ajoute l'en-tête anthropic-dangerous-direct-browser-access.
  return new Anthropic({ apiKey: anthropicKey, dangerouslyAllowBrowser: true })
}

/** Message lisible pour une erreur de l'API Anthropic. */
export function claudeErrorMessage(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return 'Clé API Anthropic refusée. Vérifie-la dans Réglages.'
  if (err instanceof Anthropic.RateLimitError) return 'Trop de requêtes vers Claude, réessaie dans une minute.'
  if (err instanceof Anthropic.NotFoundError) return 'Modèle Claude introuvable. Vérifie le modèle dans Réglages.'
  if (err instanceof Anthropic.APIError) return `Erreur Claude ${err.status ?? ''} : ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

interface StructuredOptions<T> {
  system: string
  prompt: string
  schema: z.ZodType<T>
  /** Contrôles métier en plus du schéma ; renvoie la liste des erreurs. */
  validate?: (value: T) => string[]
  maxTokens?: number
  retries?: number
}

/**
 * Appel Claude avec sortie JSON contrainte par un schéma Zod.
 * Si le JSON est invalide (schéma ou règles métier), on relance en donnant les erreurs.
 */
export async function callStructured<T>({
  system,
  prompt,
  schema,
  validate,
  maxTokens = 32000,
  retries = 2,
}: StructuredOptions<T>): Promise<T> {
  const anthropic = client()
  const { model } = useSettings.getState()
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
  let lastErrors: string[] = []

  for (let attempt = 0; attempt <= retries; attempt++) {
    let raw = ''
    let parsed: T | null = null
    try {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: { format: zodOutputFormat(schema) },
      })
      const message = await stream.finalMessage()
      raw = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
      if (message.stop_reason === 'max_tokens') {
        lastErrors = ['La réponse a été coupée (trop longue). Fais plus concis : descriptions courtes.']
      } else if (message.stop_reason === 'refusal') {
        throw new Error('Claude a refusé la demande.')
      } else {
        parsed = (message.parsed_output as T | null) ?? null
        lastErrors = parsed === null ? ['Réponse vide ou non conforme au schéma.'] : (validate?.(parsed) ?? [])
      }
    } catch (err) {
      if (err instanceof Anthropic.APIError || err instanceof MissingApiKeyError) throw err
      if (err instanceof Error && err.message === 'Claude a refusé la demande.') throw err
      lastErrors = [`JSON invalide : ${err instanceof Error ? err.message : String(err)}`]
    }

    if (parsed !== null && lastErrors.length === 0) return parsed
    if (attempt === retries) break
    messages.push(
      { role: 'assistant', content: raw || '{}' },
      {
        role: 'user',
        content: `Ta réponse ne respecte pas les règles :\n- ${lastErrors.slice(0, 20).join('\n- ')}\n\nCorrige et renvoie le JSON complet.`,
      },
    )
  }
  throw new Error(`Claude n’a pas produit un résultat valide :\n${lastErrors.slice(0, 5).join('\n')}`)
}
