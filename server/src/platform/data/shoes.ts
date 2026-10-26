/**
 * Modèles de chaussures de running courants, saisis à la main (marque, modèle, usage).
 * Liste de départ pour l'onboarding : à compléter depuis le back office ou par un partenaire.
 */
export type Shoe = { brand: string; model: string; use: 'route' | 'trail' | 'compétition' }

const road = (brand: string, models: string[]): Shoe[] => models.map((model) => ({ brand, model, use: 'route' }))
const trail = (brand: string, models: string[]): Shoe[] => models.map((model) => ({ brand, model, use: 'trail' }))
const race = (brand: string, models: string[]): Shoe[] => models.map((model) => ({ brand, model, use: 'compétition' }))

export const SHOES: Shoe[] = [
  ...road('Nike', ['Pegasus', 'Vomero', 'Invincible Run', 'Structure', 'Zoom Fly']),
  ...race('Nike', ['Vaporfly', 'Alphafly', 'Streakfly']),
  ...trail('Nike', ['Pegasus Trail', 'Ultrafly', 'Wildhorse']),
  ...road('Asics', ['Gel-Nimbus', 'Gel-Kayano', 'Novablast', 'Gel-Cumulus', 'GT-2000', 'Superblast']),
  ...race('Asics', ['Metaspeed Sky', 'Metaspeed Edge', 'Magic Speed']),
  ...trail('Asics', ['Trabuco', 'Gel-Trabuco', 'Fuji Lite']),
  ...road('Hoka', ['Clifton', 'Bondi', 'Mach', 'Arahi', 'Skyward X', 'Rincon']),
  ...race('Hoka', ['Rocket X', 'Cielo X1']),
  ...trail('Hoka', ['Speedgoat', 'Mafate Speed', 'Challenger ATR', 'Tecton X', 'Zinal']),
  ...road('Adidas', ['Adizero SL', 'Adizero Boston', 'Supernova', 'Ultraboost']),
  ...race('Adidas', ['Adizero Adios Pro', 'Adizero Takumi Sen']),
  ...trail('Adidas', ['Terrex Agravic', 'Terrex Speed']),
  ...road('Saucony', ['Ride', 'Triumph', 'Guide', 'Kinvara', 'Endorphin Speed']),
  ...race('Saucony', ['Endorphin Pro', 'Endorphin Elite']),
  ...trail('Saucony', ['Peregrine', 'Xodus', 'Endorphin Edge']),
  ...road('Brooks', ['Ghost', 'Glycerin', 'Adrenaline GTS', 'Launch', 'Hyperion']),
  ...race('Brooks', ['Hyperion Elite']),
  ...trail('Brooks', ['Cascadia', 'Catamount', 'Caldera']),
  ...road('New Balance', ['Fresh Foam 1080', 'FuelCell Rebel', 'Fresh Foam 880', 'FuelCell Propel']),
  ...race('New Balance', ['FuelCell SC Elite', 'FuelCell SC Trainer']),
  ...trail('New Balance', ['Fresh Foam Hierro', 'FuelCell Summit Unknown']),
  ...road('On', ['Cloudmonster', 'Cloudsurfer', 'Cloudrunner', 'Cloudflow']),
  ...race('On', ['Cloudboom Echo', 'Cloudboom Strike']),
  ...trail('On', ['Cloudultra', 'Cloudvista']),
  ...road('Puma', ['Deviate Nitro', 'Velocity Nitro', 'Magnify Nitro']),
  ...race('Puma', ['Fast-R Nitro Elite']),
  ...road('Mizuno', ['Wave Rider', 'Wave Inspire', 'Neo Vista']),
  ...trail('Salomon', ['Speedcross', 'S/Lab Genesis', 'Sense Ride', 'Ultra Glide', 'Thundercross']),
  ...trail('La Sportiva', ['Bushido', 'Prodigio', 'Akasha', 'Jackal']),
  ...trail('Scott', ['Supertrac', 'Kinabalu']),
  ...trail('Altra', ['Lone Peak', 'Mont Blanc', 'Olympus']),
  ...road('Altra', ['Torin', 'Escalante', 'Via Olympus']),
  ...road('Kiprun', ['KS900', 'KD900', 'Jogflow']),
  ...race('Kiprun', ['KD900X']),
  ...trail('Kiprun', ['MT Cushion', 'XT8']),
  ...trail('Inov8', ['Trailfly', 'Mudtalon']),
]
