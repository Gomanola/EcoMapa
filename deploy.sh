#!/usr/bin/env bash
#
# EcoMapa - Script de despliegue completo
# Despliega el backend (CDK) y el frontend (S3 + CloudFront)
#
# Uso:
#   ./deploy.sh           # Despliega todo (backend + frontend)
#   ./deploy.sh backend   # Solo backend
#   ./deploy.sh frontend  # Solo frontend (requiere backend ya desplegado)
#
# Requisitos:
#   - Node.js 20+
#   - AWS CLI configurado (aws login)
#   - CDK bootstrapado (npx cdk bootstrap)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
OUTPUTS_FILE="$BACKEND_DIR/cdk-outputs.json"

# Use the Alexis AWS profile
export AWS_PROFILE="${AWS_PROFILE:-Alexis}"

echo "============================================"
echo "  EcoMapa - Despliegue"
echo "============================================"

# --- Check AWS credentials ---
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo ""
  echo "Error: No hay credenciales de AWS validas."
  echo "Tu sesion pudo haber expirado. Ejecuta:"
  echo ""
  echo "  aws login"
  echo ""
  echo "Y luego vuelve a ejecutar este script."
  exit 1
fi

echo "  Cuenta AWS verificada: $(aws sts get-caller-identity --query Account --output text 2>/dev/null)"

# --- Backend deployment ---
deploy_backend() {
  echo ""
  echo "[1/2] Desplegando backend con CDK..."
  cd "$BACKEND_DIR"

  if [ ! -d node_modules ]; then
    echo "  Instalando dependencias del backend..."
    npm install
  fi

  # Bootstrap CDK (idempotent, safe to run multiple times)
  echo "  Verificando CDK bootstrap..."
  npx cdk bootstrap 2>&1 || true

  echo "  Desplegando stack EcoMapaStack..."
  npx cdk deploy --require-approval never --outputs-file "$OUTPUTS_FILE"

  echo "  Backend desplegado."
  echo ""
  echo "  Outputs:"
  cat "$OUTPUTS_FILE" | python3 -m json.tool 2>/dev/null || cat "$OUTPUTS_FILE"
}

# --- Frontend deployment ---
deploy_frontend() {
  echo ""
  echo "[2/2] Desplegando frontend a S3 + CloudFront..."

  if [ ! -f "$OUTPUTS_FILE" ]; then
    echo "  Error: No se encontro cdk-outputs.json. Despliega el backend primero."
    exit 1
  fi

  # Extract values from CDK outputs
  BUCKET_NAME=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['EcoMapaStack']['FrontendBucketName'])")
  DIST_ID=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['EcoMapaStack']['DistributionId'])")
  API_URL=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['EcoMapaStack']['ApiUrl'])")

  cd "$FRONTEND_DIR"

  if [ ! -d node_modules ]; then
    echo "  Instalando dependencias del frontend..."
    npm install
  fi

  echo "  Construyendo frontend..."
  npm run build

  # Create config.json with the API URL so the frontend can auto-configure.
  # This must be in dist/ before the s3 sync, otherwise --delete removes it.
  echo "  Creando config.json con URL del API: $API_URL"
  echo "{\"apiUrl\": \"$API_URL\"}" > dist/config.json

  echo "  Subiendo a S3 (bucket: $BUCKET_NAME)..."
  aws s3 sync dist/ "s3://$BUCKET_NAME" --delete

  echo "  Invalidando cache de CloudFront ($DIST_ID)..."
  aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/*"

  FRONTEND_URL=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['EcoMapaStack']['FrontendUrl'])")
  echo ""
  echo "  Frontend desplegado en: $FRONTEND_URL"
  echo "  API disponible en: $API_URL"
}

# --- Main ---
TARGET="${1:-all}"

case "$TARGET" in
  all)
    deploy_backend
    deploy_frontend
    ;;
  backend)
    deploy_backend
    ;;
  frontend)
    deploy_frontend
    ;;
  *)
    echo "Uso: $0 [all|backend|frontend]"
    exit 1
    ;;
esac

echo ""
echo "============================================"
echo "  Despliegue completado!"
echo "============================================"
