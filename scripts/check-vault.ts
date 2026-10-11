// Coffre : migration des anciennes données en clair, chiffrement, mauvais code, bon code.
import './node-env'
const SECRET = 'sk-ant-test-123456'
const TOKENS = JSON.stringify({ access_token: 'tok-abc', refresh_token: 'ref-xyz' })
// État d'avant : tokens COROS en clair, ancienne clé API dans le coffre et dans les réglages.
localStorage.setItem('coach.settings', JSON.stringify({ state: { anthropicKey: SECRET, model: 'claude-haiku-4-5' }, version: 1 }))
localStorage.setItem('coros.tokens', TOKENS)
localStorage.setItem('vault.v1', JSON.stringify({ mode: 'plain', data: { 'coros.tokens': TOKENS, anthropicKey: SECRET } }))

const { initVault, enableLock, unlockWithPin, vault, useVault } = await import('../src/lib/lock/vault')
const { useSettings } = await import('../src/lib/store/settings')

const fails: string[] = []
const expect = (c: boolean, label: string) => (c ? console.log('✓', label) : fails.push(label))
const dump = () => JSON.stringify(['vault.v1', 'coach.settings', 'coros.tokens'].map((k) => localStorage.getItem(k)))

initVault()
expect(vault.get('coros.tokens') === TOKENS, 'tokens COROS présents')
expect(vault.get('anthropicKey') === undefined, 'ancienne clé API effacée du coffre')
useSettings.getState().set({ theme: 'dark' }) // réécrit les réglages : la clé ne doit plus y figurer
await new Promise((r) => setTimeout(r, 50))
expect(!dump().includes(SECRET), 'clé API absente de tout le stockage')

await enableLock('123456')
await new Promise((r) => setTimeout(r, 50))
const raw = dump()
expect(!raw.includes(SECRET) && !raw.includes('tok-abc'), 'aucun secret en clair après activation du verrou')

// Relance de l'app : coffre verrouillé.
initVault()
expect(useVault.getState().status === 'locked', 'app verrouillée au lancement')
let refused = false
await unlockWithPin('000000').catch(() => (refused = true))
expect(refused && useVault.getState().status === 'locked', 'mauvais code refusé')
await unlockWithPin('123456')
expect(useVault.getState().status === 'open', 'bon code accepté')
expect(vault.get('coros.tokens') === TOKENS, 'secrets restaurés')

// Une modification après déverrouillage reste chiffrée.
vault.set('coros.tokens', JSON.stringify({ access_token: 'tok-new' }))
await new Promise((r) => setTimeout(r, 50))
expect(!dump().includes('tok-new'), 'nouvelle écriture chiffrée')

console.log(fails.length ? `ÉCHEC :\n${fails.join('\n')}` : 'OK')
