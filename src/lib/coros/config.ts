// Serveur régional européen. `mcp.coros.com` répond aussi, mais ses métadonnées
// OAuth annoncent la ressource `mcpeu.coros.com/mcp` : le SDK refuserait le décalage.
export const MCP_URL = 'https://mcpeu.coros.com/mcp'
export const SCOPES = 'openid mcp.tools offline_access'

/** Le coach est servi sous /app/ (la racine est le site public). */
export const COACH_BASE = '/app/'

/** URL de retour OAuth : les réglages de l'espace coureur, identique en dev et en prod. */
export function redirectUrl() {
  return `${window.location.origin}/compte/settings`
}

/** Outils qui modifient le compte COROS : ils passent obligatoirement par `corosWrite`. */
export function isWriteTool(name: string) {
  return /^(create|update|schedule|delete|remove|cancel|move|set)/i.test(name)
}
