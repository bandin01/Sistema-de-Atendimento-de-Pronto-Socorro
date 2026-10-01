'use strict';

/**
 * Aplica as migrations de src/db no banco configurado no .env.
 *
 *   npm run migrate            → aplica as pendentes (cria o banco se não existir)
 *   npm run migrate:status     → lista aplicadas e pendentes
 *   npm run migrate:baseline   → banco criado pelo recriar_banco.sh: marca tudo como aplicado
 */
require('dotenv').config();

const mysql = require('mysql2/promise');
const { listarMigrations } = require('./migrations/lerMigrations');
const { criarMigrador, ErroMigration } = require('./migrations/migrador');

/** Conecta sem banco, cria-o se faltar e posiciona a conexão nele. */
async function conectar(config = process.env) {
  const banco = config.DB_NAME || 'pronto_socorro';
  if (!/^\w+$/.test(banco)) throw new ErroMigration(`DB_NAME inválido: ${banco}`);

  const conexao = await mysql.createConnection({
    host: config.DB_HOST || '127.0.0.1',
    port: Number(config.DB_PORT || 3306),
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    charset: 'utf8mb4',
  });
  await conexao.query(
    `CREATE DATABASE IF NOT EXISTS \`${banco}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await conexao.query(`USE \`${banco}\``);
  return { conexao, banco };
}

async function main(argumentos) {
  const { conexao, banco } = await conectar();
  try {
    const migrador = criarMigrador({ conexao, migrations: listarMigrations() });

    if (argumentos.includes('--status')) {
      const { migrations, orfas } = await migrador.status();
      console.log(`Banco: ${banco}`);
      for (const m of migrations) {
        console.log(`  ${m.aplicadaEm ? 'aplicada ' : 'PENDENTE '} ${m.nome}${m.aplicadaEm ? `  (${m.aplicadaEm.toISOString()})` : ''}`);
      }
      for (const nome of orfas) console.log(`  ⚠️  aplicada no banco, arquivo ausente: ${nome}`);
      return;
    }

    if (argumentos.includes('--baseline')) {
      const { marcadas } = await migrador.baseline();
      console.log(`Baseline em ${banco}: ${marcadas.length} migration(s) marcadas como aplicadas.`);
      for (const nome of marcadas) console.log(`  ${nome}`);
      return;
    }

    const { aplicadas, orfas } = await migrador.aplicar();
    for (const nome of orfas) console.warn(`⚠️  aplicada no banco, arquivo ausente: ${nome}`);
    if (aplicadas.length === 0) {
      console.log(`Banco ${banco}: nenhuma migration pendente.`);
    } else {
      console.log(`Banco ${banco}: ${aplicadas.length} migration(s) aplicada(s).`);
      for (const nome of aplicadas) console.log(`  ${nome}`);
    }
  } finally {
    await conexao.end();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((erro) => {
    console.error(erro instanceof ErroMigration ? erro.message : erro);
    process.exitCode = 1;
  });
}

module.exports = { conectar };
