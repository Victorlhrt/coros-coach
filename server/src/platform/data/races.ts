/**
 * Courses connues, saisies à la main pour l'onboarding (route et trail, France et grands rendez-vous
 * internationaux). Pas de date : elle change chaque année, le coureur la confirme. Distances et dénivelés
 * des trails sont indicatifs (ils varient selon les éditions). Le reste vient de l'API UTMB et des calendriers
 * publics (race-sources.ts : Trace de Trail, Sports'n Connect).
 * Pour une base exhaustive, il faudra un partenariat (Finishers, plateformes d'inscription, ITRA).
 */
export type KnownRace = {
  id: string
  name: string
  city: string
  terrain: 'road' | 'trail'
  distances: { label: string; km: number; elevation?: number }[]
}

const M = { label: 'Marathon', km: 42.195 }
const H = { label: 'Semi-marathon', km: 21.1 }
const K10 = { label: '10 km', km: 10 }

const road = (id: string, name: string, city: string, distances: KnownRace['distances']): KnownRace => ({ id, name, city, terrain: 'road', distances })
const trail = (id: string, name: string, city: string, distances: KnownRace['distances']): KnownRace => ({ id, name, city, terrain: 'trail', distances })

export const KNOWN_RACES: KnownRace[] = [
  // France, route
  road('marathon-paris', 'Marathon de Paris', 'Paris', [M]),
  road('semi-paris', 'Semi-marathon de Paris', 'Paris', [H]),
  road('20km-paris', '20 km de Paris', 'Paris', [{ label: '20 km', km: 20 }]),
  road('paris-versailles', 'Paris-Versailles', 'Paris', [{ label: '16 km', km: 16.2 }]),
  road('marseille-cassis', 'Marseille-Cassis', 'Marseille', [{ label: '20 km', km: 20 }]),
  road('marathon-bordeaux', 'Marathon de Bordeaux Métropole', 'Bordeaux', [M, H]),
  road('run-in-lyon', 'Run In Lyon', 'Lyon', [M, H, K10]),
  road('marathon-nice-cannes', 'Marathon des Alpes-Maritimes Nice-Cannes', 'Nice', [M]),
  road('marathon-toulouse', 'Marathon international de Toulouse Métropole', 'Toulouse', [M, H]),
  road('marathon-nantes', 'Marathon de Nantes', 'Nantes', [M, H, K10]),
  road('marathon-la-rochelle', 'Marathon de La Rochelle', 'La Rochelle', [M]),
  road('marathon-annecy', 'Marathon du lac d’Annecy', 'Annecy', [M, H]),
  road('marathon-medoc', 'Marathon du Médoc', 'Pauillac', [M]),
  road('marathon-rennes', 'Marathon Vert de Rennes', 'Rennes', [M]),
  road('marathon-montpellier', 'Marathon de Montpellier', 'Montpellier', [M]),
  road('marathon-lille', 'Marathon de Lille', 'Lille', [M, H]),
  road('marathon-strasbourg', 'Marathon de Strasbourg', 'Strasbourg', [M, H, K10]),
  road('run-in-reims', 'Run in Reims', 'Reims', [M, H, K10]),
  road('marathon-rouen', 'Marathon de Rouen', 'Rouen', [M]),
  road('semi-boulogne', 'Semi-marathon de Boulogne-Billancourt', 'Boulogne-Billancourt', [H]),
  road('semi-lille', 'Semi-marathon de Lille', 'Lille', [H]),
  road('corrida-houilles', 'Corrida de Houilles', 'Houilles', [K10]),
  // International, route
  road('marathon-berlin', 'Marathon de Berlin', 'Berlin', [M]),
  road('marathon-londres', 'Marathon de Londres', 'Londres', [M]),
  road('marathon-new-york', 'Marathon de New York', 'New York', [M]),
  road('marathon-chicago', 'Marathon de Chicago', 'Chicago', [M]),
  road('marathon-boston', 'Marathon de Boston', 'Boston', [M]),
  road('marathon-tokyo', 'Marathon de Tokyo', 'Tokyo', [M]),
  road('marathon-valence', 'Marathon de Valence', 'Valence', [M]),
  road('marathon-seville', 'Marathon de Séville', 'Séville', [M]),
  road('marathon-rotterdam', 'Marathon de Rotterdam', 'Rotterdam', [M]),
  road('marathon-amsterdam', 'Marathon d’Amsterdam', 'Amsterdam', [M, H]),
  road('marathon-barcelone', 'Marathon de Barcelone', 'Barcelone', [M]),
  road('semi-lisbonne', 'Semi-marathon de Lisbonne', 'Lisbonne', [H]),
  road('semi-berlin', 'Semi-marathon de Berlin', 'Berlin', [H]),
  road('semi-copenhague', 'Semi-marathon de Copenhague', 'Copenhague', [H]),
  road('semi-valence', 'Semi-marathon de Valence', 'Valence', [H]),
  // France, trail (distances et D+ indicatifs ; les courses « by UTMB » viennent de l'API UTMB)
  trail('grand-raid-reunion', 'Grand Raid de La Réunion', 'La Réunion', [
    { label: 'Diagonale des Fous · ≈ 165 km', km: 165, elevation: 10000 },
    { label: 'Trail de Bourbon · ≈ 111 km', km: 111, elevation: 6500 },
    { label: 'Mascareignes · ≈ 67 km', km: 67, elevation: 3500 },
  ]),
  trail('saintelyon', 'SaintéLyon', 'Saint-Étienne → Lyon', [
    { label: 'SaintéLyon · ≈ 78 km', km: 78, elevation: 2000 },
    { label: 'SaintExpress · ≈ 44 km', km: 44, elevation: 1000 },
  ]),
  trail('templiers', 'Festival des Templiers', 'Millau', [
    { label: 'Endurance Trail · ≈ 100 km', km: 100, elevation: 4600 },
    { label: 'Grand Trail des Templiers · ≈ 80 km', km: 80, elevation: 3500 },
    { label: 'Intégrale des Causses · ≈ 61 km', km: 61, elevation: 2900 },
    { label: 'Marathon des Causses · ≈ 34 km', km: 34, elevation: 1700 },
  ]),
  trail('ecotrail-paris', 'EcoTrail Paris', 'Paris', [
    { label: '≈ 80 km', km: 80, elevation: 1500 },
    { label: '≈ 45 km', km: 45, elevation: 800 },
    { label: '≈ 30 km', km: 30, elevation: 450 },
    { label: '≈ 18 km', km: 18, elevation: 200 },
  ]),
  trail('marathon-mont-blanc', 'Marathon du Mont-Blanc', 'Chamonix', [
    { label: '90 km du Mont-Blanc · ≈ 90 km', km: 90, elevation: 6000 },
    { label: 'Marathon · ≈ 42 km', km: 42, elevation: 2500 },
    { label: 'Cross du Mont-Blanc · ≈ 23 km', km: 23, elevation: 1500 },
  ]),
  trail('maxi-race', 'MaXi-Race Annecy', 'Annecy', [
    { label: 'MaXi-Race · ≈ 87 km', km: 87, elevation: 5200 },
    { label: 'Marathon Race · ≈ 44 km', km: 44, elevation: 2800 },
    { label: 'Short Race · ≈ 30 km', km: 30, elevation: 1700 },
  ]),
  trail('grand-raid-pyrenees', 'Grand Raid des Pyrénées', 'Vielle-Aure', [
    { label: 'Ultra · ≈ 160 km', km: 160, elevation: 10000 },
    { label: '≈ 80 km', km: 80, elevation: 5000 },
    { label: '≈ 40 km', km: 40, elevation: 2000 },
  ]),
  trail('echappee-belle', 'L’Échappée Belle', 'Belledonne', [
    { label: 'Intégrale · ≈ 149 km', km: 149, elevation: 11400 },
    { label: 'Traversée Nord · ≈ 85 km', km: 85, elevation: 6000 },
  ]),
  trail('ut4m', 'Ut4M · Ultra Tour des 4 Massifs', 'Grenoble', [
    { label: 'Ut4M 160 · ≈ 160 km', km: 160, elevation: 10000 },
    { label: 'Ut4M 40 · ≈ 40 km', km: 40, elevation: 2500 },
  ]),
  trail('ultra-marin', 'Ultra Marin · Grand Raid du Golfe du Morbihan', 'Vannes', [{ label: '≈ 177 km', km: 177, elevation: 1500 }]),
  trail('trail-sainte-victoire', 'Sainte-Victoire Trail', 'Aix-en-Provence', [{ label: '≈ 30 km', km: 30, elevation: 1500 }]),
  // International, trail
  trail('zegama', 'Zegama-Aizkorri', 'Zegama (Espagne)', [{ label: 'Marathon · ≈ 42 km', km: 42, elevation: 2700 }]),
  trail('sierre-zinal', 'Sierre-Zinal', 'Sierre (Suisse)', [{ label: '≈ 31 km', km: 31, elevation: 2200 }]),
  trail('transvulcania', 'Transvulcania', 'La Palma (Espagne)', [{ label: 'Ultra · ≈ 73 km', km: 73, elevation: 4350 }]),
  trail('western-states', 'Western States 100', 'Olympic Valley (États-Unis)', [{ label: '≈ 161 km', km: 161, elevation: 5500 }]),
  trail('hardrock', 'Hardrock 100', 'Silverton (États-Unis)', [{ label: '≈ 161 km', km: 161, elevation: 10000 }]),
]
