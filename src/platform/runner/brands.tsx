import { cn } from '@/lib/utils'

/**
 * Logos des marques (chaussures, montres, applications), servis depuis /brands.
 * Tous sont affichés en blanc (noir en thème clair) ; une marque sans fichier retombe sur son nom composé en capitales.
 */
const LOGOS: Record<string, string> = {
  adidas: 'adidas.svg',
  altra: 'altra.svg',
  asics: 'asics.svg',
  brooks: 'brooks.svg',
  craft: 'craft.svg',
  diadora: 'diadora.svg',
  hoka: 'hoka.svg',
  'hoka one one': 'hoka.svg',
  'inov-8': 'inov8.png',
  inov8: 'inov8.png',
  'la sportiva': 'lasportiva.svg',
  merrell: 'merrell.svg',
  mizuno: 'mizuno.svg',
  'new balance': 'newbalance.svg',
  nike: 'nike.svg',
  norda: 'norda.svg',
  on: 'on.svg',
  'on running': 'on.svg',
  puma: 'puma.svg',
  reebok: 'reebok.svg',
  salomon: 'salomon.svg',
  saucony: 'saucony.svg',
  scott: 'scott.svg',
  'under armour': 'underarmour.svg',
  coros: 'coros.png',
  garmin: 'garmin.svg',
  apple: 'apple.svg',
  polar: 'polar.svg',
  suunto: 'suunto.svg',
  strava: 'strava.svg',
  fitbit: 'fitbit.svg',
  huawei: 'huawei.svg',
  samsung: 'samsung.svg',
  whoop: 'whoop.svg',
  komoot: 'komoot.svg',
}

function brandLogo(brand: string) {
  const file = LOGOS[brand.trim().toLowerCase()]
  return file ? `/brands/${file}` : null
}

export function BrandLogo({ brand, className }: { brand: string; className?: string }) {
  const src = brandLogo(brand)
  if (!src) return <span className={cn('whitespace-nowrap font-bold uppercase italic leading-none tracking-tight', className)}>{brand}</span>
  return <img src={src} alt={brand} className={cn('object-contain brightness-0 dark:invert', className)} draggable={false} />
}
