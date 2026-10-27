/**
 * Courses connues, saisies à la main pour l'onboarding (route et trail, France et grands rendez-vous
 * internationaux). Pas de date : elle change chaque année, le coureur la confirme. Distances et dénivelés
 * des trails sont indicatifs (ils varient selon les éditions). Le reste du trail vient de l'API UTMB.
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
  // France, trail (distances et D+ indicatifs)
  trail('diagonale-des-fous', 'Grand Raid de La Réunion · Diagonale des Fous', 'La Réunion', [{ label: '≈ 165 km', km: 165, elevation: 10000 }]),
  trail('saintelyon', 'SaintéLyon', 'Saint-Étienne → Lyon', [{ label: '≈ 78 km', km: 78, elevation: 2000 }]),
  trail('templiers', 'Festival des Templiers · Grand Trail', 'Millau', [{ label: '≈ 80 km', km: 80, elevation: 3500 }]),
  trail('ecotrail-paris', 'EcoTrail Paris', 'Paris', [{ label: '≈ 80 km', km: 80, elevation: 1500 }]),
  trail('marathon-mont-blanc', 'Marathon du Mont-Blanc', 'Chamonix', [{ label: '≈ 42 km', km: 42, elevation: 2500 }]),
]
