/**
 * Grandes courses sur route en France, saisies à la main pour la version de test de l'onboarding.
 * Pas de date : elle change chaque année, le coureur la confirme. Le trail vient de l'API UTMB.
 * Pour une base exhaustive, il faudra un partenariat (Finishers, FFA).
 */
export type RoadRace = { id: string; name: string; city: string; distances: { label: string; km: number }[] }

const M = { label: 'Marathon', km: 42.195 }
const H = { label: 'Semi-marathon', km: 21.1 }
const K10 = { label: '10 km', km: 10 }

export const ROAD_RACES: RoadRace[] = [
  { id: 'marathon-paris', name: 'Marathon de Paris', city: 'Paris', distances: [M] },
  { id: 'semi-paris', name: 'Semi-marathon de Paris', city: 'Paris', distances: [H] },
  { id: '20km-paris', name: '20 km de Paris', city: 'Paris', distances: [{ label: '20 km', km: 20 }] },
  { id: 'paris-versailles', name: 'Paris-Versailles', city: 'Paris', distances: [{ label: '16 km', km: 16.2 }] },
  { id: 'marseille-cassis', name: 'Marseille-Cassis', city: 'Marseille', distances: [{ label: '20 km', km: 20 }] },
  { id: 'marathon-bordeaux', name: 'Marathon de Bordeaux Métropole', city: 'Bordeaux', distances: [M, H] },
  { id: 'run-in-lyon', name: 'Run In Lyon', city: 'Lyon', distances: [M, H, K10] },
  { id: 'marathon-nice-cannes', name: 'Marathon des Alpes-Maritimes Nice-Cannes', city: 'Nice', distances: [M] },
  { id: 'marathon-toulouse', name: 'Marathon international de Toulouse Métropole', city: 'Toulouse', distances: [M, H] },
  { id: 'marathon-nantes', name: 'Marathon de Nantes', city: 'Nantes', distances: [M, H, K10] },
  { id: 'marathon-la-rochelle', name: 'Marathon de La Rochelle', city: 'La Rochelle', distances: [M] },
  { id: 'marathon-annecy', name: 'Marathon du lac d’Annecy', city: 'Annecy', distances: [M, H] },
  { id: 'marathon-medoc', name: 'Marathon du Médoc', city: 'Pauillac', distances: [M] },
  { id: 'marathon-rennes', name: 'Marathon Vert de Rennes', city: 'Rennes', distances: [M] },
  { id: 'marathon-montpellier', name: 'Marathon de Montpellier', city: 'Montpellier', distances: [M] },
  { id: 'marathon-lille', name: 'Marathon de Lille', city: 'Lille', distances: [M, H] },
  { id: 'marathon-strasbourg', name: 'Marathon de Strasbourg', city: 'Strasbourg', distances: [M, H, K10] },
  { id: 'marathon-reims', name: 'Run in Reims', city: 'Reims', distances: [M, H, K10] },
  { id: 'marathon-rouen', name: 'Marathon de Rouen', city: 'Rouen', distances: [M] },
  { id: 'semi-boulogne', name: 'Semi-marathon de Boulogne-Billancourt', city: 'Boulogne-Billancourt', distances: [H] },
  { id: 'semi-lille', name: 'Semi-marathon de Lille', city: 'Lille', distances: [H] },
  { id: 'corrida-houilles', name: 'Corrida de Houilles', city: 'Houilles', distances: [K10] },
]
