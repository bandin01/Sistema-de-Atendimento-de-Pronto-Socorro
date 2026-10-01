#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Recria o banco pronto_socorro do zero: apaga com o cliente mysql e depois
# aplica todas as migrations com `node src/db/migrar.js` (lê o .env).
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

echo "DROP DATABASE IF EXISTS $DB_NAME;" | "$MYSQL_BIN" -u "$MYSQL_USER" -p

# Cria o banco e aplica 001, 010, 011, 012… registrando em schema_migrations.
node "$DIR/migrar.js"

echo "Banco '$DB_NAME' recriado."
