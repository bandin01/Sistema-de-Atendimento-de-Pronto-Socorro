'use strict';

const { dividirInstrucoes } = require('./lerMigrations');

const NOME_LOCK = 'pronto_socorro_migrations';
const TIMEOUT_LOCK_SEGUNDOS = 10;

const CRIAR_TABELA_CONTROLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    versao       CHAR(3)      NOT NULL,
    nome         VARCHAR(255) NOT NULL,
    checksum     CHAR(64)     NOT NULL,
    aplicada_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (versao)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

class ErroMigration extends Error {}

/**
 * Aplica as migrations pendentes e registra cada uma em schema_migrations.
 * `conexao` é uma conexão mysql2/promise já posicionada no banco (USE).
 * `migrations` vem de listarMigrations(): [{ versao, nome, sql, checksum }].
 * Usa conexao.query (não execute): CREATE TRIGGER/PROCEDURE não aceitam prepared statement.
 */
function criarMigrador({ conexao, migrations }) {
  async function comLock(trabalho) {
    await conexao.query(CRIAR_TABELA_CONTROLE);
    const [[{ obtido }]] = await conexao.query('SELECT GET_LOCK(?, ?) AS obtido', [NOME_LOCK, TIMEOUT_LOCK_SEGUNDOS]);
    if (obtido !== 1) throw new ErroMigration('Outra execução de migrations está em andamento.');
    try {
      return await trabalho();
    } finally {
      await conexao.query('SELECT RELEASE_LOCK(?)', [NOME_LOCK]);
    }
  }

  async function aplicadasNoBanco() {
    const [linhas] = await conexao.query('SELECT versao, nome, checksum, aplicada_em FROM schema_migrations ORDER BY versao');
    return new Map(linhas.map((linha) => [linha.versao, linha]));
  }

  /** Separa pendentes das aplicadas e falha se uma aplicada foi editada depois. */
  function compararComArquivos(aplicadas) {
    const pendentes = [];
    for (const migration of migrations) {
      const registro = aplicadas.get(migration.versao);
      if (!registro) {
        pendentes.push(migration);
      } else if (registro.checksum !== migration.checksum) {
        throw new ErroMigration(
          `Migration ${migration.nome} foi alterada depois de aplicada. `
          + 'Não edite migrations aplicadas: crie uma nova (ex.: 013_…sql).',
        );
      }
    }
    const versoesArquivo = new Set(migrations.map((m) => m.versao));
    const orfas = [...aplicadas.values()].filter((r) => !versoesArquivo.has(r.versao));
    return { pendentes, orfas };
  }

  async function executarMigration(migration) {
    const instrucoes = dividirInstrucoes(migration.sql);
    for (let n = 0; n < instrucoes.length; n += 1) {
      try {
        await conexao.query(instrucoes[n]);
      } catch (erro) {
        throw new ErroMigration(
          `Falha em ${migration.nome}, instrução ${n + 1}/${instrucoes.length}: ${erro.message}\n`
          + 'DDL no MySQL não tem rollback: as instruções anteriores desta migration já foram aplicadas.',
        );
      }
    }
    await registrar(migration);
  }

  async function registrar(migration) {
    await conexao.query(
      'INSERT INTO schema_migrations (versao, nome, checksum) VALUES (?, ?, ?)',
      [migration.versao, migration.nome, migration.checksum],
    );
  }

  return {
    /** Aplica as pendentes em ordem. Retorna { aplicadas: [nomes], orfas: [nomes] }. */
    aplicar() {
      return comLock(async () => {
        const { pendentes, orfas } = compararComArquivos(await aplicadasNoBanco());
        for (const migration of pendentes) await executarMigration(migration);
        return { aplicadas: pendentes.map((m) => m.nome), orfas: orfas.map((r) => r.nome) };
      });
    },

    /** Lista cada migration com aplicada_em (null = pendente). */
    status() {
      return comLock(async () => {
        const aplicadas = await aplicadasNoBanco();
        const { orfas } = compararComArquivos(aplicadas);
        return {
          migrations: migrations.map((m) => ({
            nome: m.nome,
            aplicadaEm: aplicadas.get(m.versao)?.aplicada_em ?? null,
          })),
          orfas: orfas.map((r) => r.nome),
        };
      });
    },

    /**
     * Marca todas as migrations atuais como aplicadas sem executá-las.
     * Para bancos criados antes do runner (via recriar_banco.sh).
     */
    baseline() {
      return comLock(async () => {
        if ((await aplicadasNoBanco()).size > 0) {
          throw new ErroMigration('Baseline recusado: schema_migrations já tem registros.');
        }
        const [tabelas] = await conexao.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'atendimentos'",
        );
        if (tabelas.length === 0) {
          throw new ErroMigration('Baseline recusado: o banco não tem o schema. Use a migração normal.');
        }
        for (const migration of migrations) await registrar(migration);
        return { marcadas: migrations.map((m) => m.nome) };
      });
    },
  };
}

module.exports = { criarMigrador, ErroMigration };
