#!/usr/bin/env bash
# Mise en place Stripe de Raice.run (sandbox) : produits Pro et Expert, 4 prix EUR récurrents retrouvés par lookup_key,
# et configuration du portail client (résiliation, changement entre les 4 prix, moyen de paiement, factures).
# Relançable : les produits, prix et la configuration du portail déjà présents sont réutilisés.
#
# Sécurité : refuse de tourner si la CLI ne vise pas la sandbox « Raice.run ». Jamais de --live.
#   stripe login            # puis choisir la sandbox Raice.run (acct_1UVu63FPlmoHGbzG)
#   bash scripts/stripe-setup.sh
set -euo pipefail

SANDBOX_ACCOUNT="${SANDBOX_ACCOUNT:-acct_1UVu63FPlmoHGbzG}"
RETURN_URL="${RETURN_URL:-https://app.raice.run/account/billing}"

command -v stripe >/dev/null || { echo "Stripe CLI introuvable"; exit 1; }
command -v jq >/dev/null || { echo "jq introuvable"; exit 1; }

# 1. Garde-fou : la CLI doit être connectée à la sandbox, sinon on s'arrête.
account=$(stripe config --list | awk -F"'" '/^account_id/ {print $2; exit}')
if [[ "$account" != "$SANDBOX_ACCOUNT" ]]; then
  echo "La CLI Stripe vise « ${account:-aucun compte} », pas la sandbox $SANDBOX_ACCOUNT. Lancez « stripe login » sur la sandbox Raice.run." >&2
  exit 1
fi
for arg in "$@"; do [[ "$arg" == "--live" ]] && { echo "--live interdit" >&2; exit 1; }; done
banner=$(stripe products list --limit 1 2>&1 || true)
if [[ "$banner" != *"Running in Raice.run · sandbox"* ]]; then
  echo "La CLI Stripe n'indique pas « Running in Raice.run · sandbox » : arrêt." >&2
  exit 1
fi

# Pas de TVA (franchise en base, art. 293 B du CGI) : prix TTC = HT, mention légale ajoutée par le serveur
# (texte de Checkout et pied de facture du client). Pied de facture par défaut du compte : Dashboard → Settings → Invoices.

# 2. Produits (retrouvés par metadata.plan).
product_for() {
  local plan=$1 name=$2 id
  # Liste plutôt que /search : l'index de recherche a du retard juste après une création.
  id=$(stripe get /v1/products -d "active=true" -d "limit=100" 2>/dev/null | jq -r --arg plan "$plan" '[.data[] | select(.metadata.plan == $plan and .metadata.app == "raice")][0].id // empty')
  if [[ -z "$id" ]]; then
    id=$(stripe post /v1/products -d "name=$name" -d "metadata[plan]=$plan" -d "metadata[app]=raice" 2>/dev/null | jq -r '.id')
    echo "Produit créé : $name ($id)" >&2
  else
    echo "Produit existant : $name ($id)" >&2
  fi
  echo "$id"
}
PRO=$(product_for pro "Raice.run Pro")
EXPERT=$(product_for expert "Raice.run Expert")

# 3. Prix (retrouvés par lookup_key).
price_for() {
  local key=$1 product=$2 amount=$3 interval=$4 id
  id=$(stripe get /v1/prices -d "lookup_keys[]=$key" -d "active=true" 2>/dev/null | jq -r '.data[0].id // empty')
  if [[ -z "$id" ]]; then
    id=$(stripe post /v1/prices \
      -d "product=$product" -d "currency=eur" -d "unit_amount=$amount" \
      -d "recurring[interval]=$interval" -d "lookup_key=$key" -d "tax_behavior=inclusive" \
      -d "metadata[app]=raice" 2>/dev/null | jq -r '.id')
    echo "Prix créé : $key ($id)" >&2
  else
    echo "Prix existant : $key ($id)" >&2
  fi
  echo "$id"
}
PRO_M=$(price_for pro_monthly "$PRO" 1299 month)
PRO_Y=$(price_for pro_yearly "$PRO" 9900 year)
EXPERT_M=$(price_for expert_monthly "$EXPERT" 2499 month)
EXPERT_Y=$(price_for expert_yearly "$EXPERT" 19900 year)

# 4. Portail client (metadata.app = raice : c'est celle que le serveur utilise).
portal_args=(
  -d "business_profile[headline]=Raice.run"
  -d "default_return_url=$RETURN_URL"
  -d "features[customer_update][enabled]=true"
  -d "features[customer_update][allowed_updates][]=email"
  -d "features[customer_update][allowed_updates][]=name"
  -d "features[customer_update][allowed_updates][]=address"
  -d "features[invoice_history][enabled]=true"
  -d "features[payment_method_update][enabled]=true"
  -d "features[subscription_cancel][enabled]=true"
  -d "features[subscription_cancel][mode]=at_period_end"
  -d "features[subscription_update][enabled]=true"
  -d "features[subscription_update][default_allowed_updates][]=price"
  -d "features[subscription_update][proration_behavior]=create_prorations"
  -d "features[subscription_update][products][0][product]=$PRO"
  -d "features[subscription_update][products][0][prices][]=$PRO_M"
  -d "features[subscription_update][products][0][prices][]=$PRO_Y"
  -d "features[subscription_update][products][1][product]=$EXPERT"
  -d "features[subscription_update][products][1][prices][]=$EXPERT_M"
  -d "features[subscription_update][products][1][prices][]=$EXPERT_Y"
  -d "metadata[app]=raice"
)
PORTAL=$(stripe get /v1/billing_portal/configurations -d "active=true" -d "limit=20" 2>/dev/null | jq -r '[.data[] | select(.metadata.app == "raice")][0].id // empty')
if [[ -z "$PORTAL" ]]; then
  PORTAL=$(stripe post /v1/billing_portal/configurations "${portal_args[@]}" 2>/dev/null | jq -r '.id')
  echo "Portail créé : $PORTAL" >&2
else
  stripe post "/v1/billing_portal/configurations/$PORTAL" "${portal_args[@]}" >/dev/null
  echo "Portail mis à jour : $PORTAL" >&2
fi

cat <<EOF
Produits : Pro $PRO · Expert $EXPERT
Prix     : pro_monthly $PRO_M · pro_yearly $PRO_Y · expert_monthly $EXPERT_M · expert_yearly $EXPERT_Y
Portail  : $PORTAL
EOF
