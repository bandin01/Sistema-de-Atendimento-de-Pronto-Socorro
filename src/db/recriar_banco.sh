#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Recria o banco pronto_socorro do zero, aplicando os scripts na ordem:
#   001_schema_base → 010 → 011 → 012
#
# ⚠️ APAGA todos os dados do banco. Use só em desenvolvimento.
#
# Uso:
#   ./src/db/recriar_banco.sh                 # usuário root
#   MYSQL_USER=outro ./src/db/recriar_banco.sh
#   MYSQL_BIN=/caminho/mysql ./src/db/recriar_banco.sh
# -----------------------------------------------------------------------------
set -euo pipefail

DB_NAME="pronto_socorro"
MYSQL_USER="${MYSQL_USER:-root}"
DIR="$(cd "$(dirname "$0")" && pwd)"

SCRIPTS=(
  001_schema_base.sql
  010_recepcionistas_medicos_enfermeiros.sql
  011_integracao_atendimento_triagem_prescricao.sql
  012_historico_status.sql
)

# Instalador oficial do MySQL no macOS não coloca o cliente no PATH.
if [[ -z "${MYSQL_BIN:-}" ]]; then
  if command -v mysql >/dev/null 2>&1; then
    MYSQL_BIN="$(command -v mysql)"
  elif [[ -x /usr/local/mysql/bin/mysql ]]; then
    MYSQL_BIN=/usr/local/mysql/bin/mysql
  else
    echo "Cliente mysql não encontrado. Informe o caminho com MYSQL_BIN=..." >&2
    exit 1
  fi
fi

read -r -p "Isso vai APAGAR o banco '$DB_NAME' e recriá-lo. Continuar? [s/N] " resposta
[[ "$resposta" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }

{
  echo "DROP DATABASE IF EXISTS $DB_NAME;"
  echo "CREATE DATABASE $DB_NAME DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
  echo "USE $DB_NAME;"
  for f in "${SCRIPTS[@]}"; do cat "$DIR/$f"; echo; done
  echo "SHOW TABLES;"
} | "$MYSQL_BIN" -u "$MYSQL_USER" -p

echo "Banco '$DB_NAME' recriado."
