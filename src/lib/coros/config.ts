// Serveur régional européen. `mcp.coros.com` répond aussi, mais ses métadonnées
// OAuth annoncent la ressource `mcpeu.coros.com/mcp` : le SDK refuserait le décalage.
export const MCP_URL = 'https://mcpeu.coros.com/mcp'
export const SCOPES = 'openid mcp.tools offline_access'

/** URL de retour OAuth : la racine de l'app (avant le #), identique en dev et en prod. */
export function redirectUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

/** Outils qui modifient le compte COROS : ils passent obligatoirement par `corosWrite`. */
export function isWriteTool(name: string) {
  return /^(create|update|schedule|delete|remove|cancel|move|set)/i.test(name)
}
