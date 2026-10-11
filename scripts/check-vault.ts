// Coffre : migration des anciennes données en clair, chiffrement, mauvais code, bon code.
import './node-env'
const SECRET = 'sk-ant-test-123456'
const TOKENS = JSON.stringify({ access_token: 'tok-abc', refresh_token: 'ref-xyz' })
// État d'avant la mise à jour : clé dans les réglages, tokens COROS en clair.
localStorage.setItem('coach.settings', JSON.stringify({ state: { anthropicKey: SECRET, model: 'claude-haiku-4-5' }, version: 1 }))
localStorage.setItem('coros.tokens', TOKENS)

const { initVault, enableLock, unlockWithPin, vault, useVault } = await import('../src/lib/lock/vault')
const { useSettings } = await import('../src/lib/store/settings')

const fails: string[] = []
const expect = (c: boolean, label: string) => (c ? console.log('✓', label) : fails.push(label))
const dump = () => JSON.stringify(['vault.v1', 'coach.settings', 'coros.tokens'].map((k) => localStorage.getItem(k)))

initVault()
expect(useSettings.getState().anthropicKey === SECRET, 'clé API migrée dans le coffre')
expect(vault.get('coros.tokens') === TOKENS, 'tokens COROS migrés')
expect(localStorage.getItem('coros.tokens') === null, 'anciens tokens en clair supprimés')
useSettings.getState().set({ theme: 'dark' }) // réécrit les réglages : la clé ne doit plus y figurer
expect(!localStorage.getItem('coach.settings')!.includes(SECRET), 'clé absente des réglages persistés')

await enableLock('123456')
await new Promise((r) => setTimeout(r, 50))
const raw = dump()
expect(!raw.includes(SECRET) && !raw.includes('tok-abc'), 'aucun secret en clair après activation du verrou')

// Relance de l'app : coffre verrouillé.
useSettings.setState({ anthropicKey: '' })
initVault()
expect(useVault.getState().status === 'locked', 'app verrouillée au lancement')
let refused = false
await unlockWithPin('000000').catch(() => (refused = true))
expect(refused && useVault.getState().status === 'locked', 'mauvais code refusé')
await unlockWithPin('123456')
expect(useVault.getState().status === 'open', 'bon code accepté')
expect(useSettings.getState().anthropicKey === SECRET && vault.get('coros.tokens') === TOKENS, 'secrets restaurés')

// Une modification après déverrouillage reste chiffrée.
vault.set('coros.tokens', JSON.stringify({ access_token: 'tok-new' }))
await new Promise((r) => setTimeout(r, 50))
expect(!dump().includes('tok-new'), 'nouvelle écriture chiffrée')

console.log(fails.length ? `ÉCHEC :\n${fails.join('\n')}` : 'OK')
