// Testes do runner de migrations. Uso: npm run test:migracoes
// Unitários rodam sempre; os de integração usam o MySQL do .env num banco
// descartável (pronto_socorro_teste_migracoes) e são pulados se o MySQL não responder.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('dotenv').config();
const { listarMigrations, dividirInstrucoes } = require('../src/db/migrations/lerMigrations');
const { criarMigrador } = require('../src/db/migrations/migrador');
const { conectar } = require('../src/db/migrar');

const contar = (instrucoes, regex) => instrucoes.filter((i) => regex.test(i)).length;

describe('dividirInstrucoes', () => {
  test('divide por ;', () => {
    assert.deepEqual(dividirInstrucoes('SELECT 1;\nSELECT 2;\n  SELECT 3'), ['SELECT 1', 'SELECT 2', 'SELECT 3']);
  });

  test('bloco DELIMITER mantém o trigger inteiro', () => {
    const sql = [
      'DROP TRIGGER IF EXISTS t;',
      'DELIMITER $$',
      'CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW',
      'BEGIN',
      '  SET NEW.a = 1;',
      '  SET NEW.b = 2;',
      'END$$',
      'DELIMITER ;',
      'SELECT 1;',
    ].join('\n');
    const instrucoes = dividirInstrucoes(sql);
    assert.equal(instrucoes.length, 3);
    assert.match(instrucoes[1], /^CREATE TRIGGER t[\s\S]*SET NEW\.b = 2;\nEND$/);
  });

  test('; em string, crase e comentário não divide', () => {
    const sql = "INSERT INTO x VALUES ('a;b', \"c;d\", 'it''s;');\n-- comentário; aqui\n# outro; aqui\nSELECT `col;x` /* bloco; */ FROM y;";
    const instrucoes = dividirInstrucoes(sql);
    assert.equal(instrucoes.length, 2);
    assert.equal(instrucoes[0], "INSERT INTO x VALUES ('a;b', \"c;d\", 'it''s;')");
    assert.match(instrucoes[1], /^SELECT `col;x`\s+FROM y$/);
  });

  test('descarta USE e instruções vazias', () => {
    assert.deepEqual(dividirInstrucoes('USE pronto_socorro;\n;;\nSELECT 1;'), ['SELECT 1']);
  });

  test('arquivos reais: triggers e procedure inteiros', () => {
    const porVersao = Object.fromEntries(listarMigrations().map((m) => [m.versao, dividirInstrucoes(m.sql)]));
    assert.deepEqual(Object.keys(porVersao), ['001', '010', '011', '012']);
    assert.equal(contar(porVersao['001'], /^CREATE TRIGGER/), 1);
    assert.equal(contar(porVersao['010'], /^CREATE TRIGGER/), 6);
    assert.equal(contar(porVersao['010'], /^CREATE PROCEDURE/), 1);
    assert.equal(contar(porVersao['011'], /^CREATE TRIGGER/), 6);
    for (const instrucoes of Object.values(porVersao)) {
      for (const i of instrucoes) assert.doesNotMatch(i, /DELIMITER|\$\$/);
      for (const i of instrucoes.filter((x) => /^CREATE (TRIGGER|PROCEDURE)/.test(x))) assert.match(i, /END$/);
    }
  });
});

const BANCO_TESTE = 'pronto_socorro_teste_migracoes';
let conexao = null;
try {
  ({ conexao } = await conectar({ ...process.env, DB_NAME: BANCO_TESTE }));
} catch (erro) {
  console.warn(`MySQL indisponível, integração pulada: ${erro.message}`);
}

describe('migrador (integração)', { skip: !conexao }, () => {
  const migrations = listarMigrations();

  async function recriarBanco() {
    await conexao.query(`DROP DATABASE IF EXISTS ${BANCO_TESTE}`);
    await conexao.query(`CREATE DATABASE ${BANCO_TESTE} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conexao.query(`USE ${BANCO_TESTE}`);
  }
  const consultar = async (sql, params) => (await conexao.query(sql, params))[0];

  before(recriarBanco);
  after(async () => {
    await conexao.query(`DROP DATABASE IF EXISTS ${BANCO_TESTE}`);
    await conexao.end();
  });

  test('banco vazio: aplica tudo', async () => {
    const { aplicadas } = await criarMigrador({ conexao, migrations }).aplicar();
    assert.deepEqual(aplicadas, migrations.map((m) => m.nome));

    const tabelas = (await consultar('SHOW TABLES')).map((l) => Object.values(l)[0]);
    for (const t of ['pacientes', 'atendimentos', 'triagens', 'prescricoes', 'recepcionistas', 'medicos', 'enfermeiros', 'historico_status', 'schema_migrations']) {
      assert.ok(tabelas.includes(t), `tabela ${t}`);
    }
    const [{ n: triggers }] = await consultar('SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema = DATABASE()');
    assert.equal(triggers, 13);
    const [{ n: procedures }] = await consultar("SELECT COUNT(*) AS n FROM information_schema.routines WHERE routine_schema = DATABASE() AND routine_type = 'PROCEDURE'");
    assert.equal(procedures, 1);
    assert.equal((await consultar('SELECT versao FROM schema_migrations')).length, 4);
  });

  test('segunda execução não aplica nada', async () => {
    const { aplicadas } = await criarMigrador({ conexao, migrations }).aplicar();
    assert.deepEqual(aplicadas, []);
  });

  test('trigger do AT000 funciona (RNF03)', async () => {
    const { insertId } = (await conexao.query(
      "INSERT INTO pacientes (nome, endereco, data_nascimento) VALUES ('Teste Migração', 'Rua X', '1990-01-01')",
    ))[0];
    await conexao.query('INSERT INTO atendimentos (paciente_id) VALUES (?)', [insertId]);
    const [{ numero_atendimento: numero }] = await consultar('SELECT numero_atendimento FROM atendimentos');
    assert.match(numero, /^AT\d{3,}$/);
  });

  test('migration aplicada alterada → erro', async () => {
    const alteradas = migrations.map((m, i) => (i === 0 ? { ...m, checksum: 'x'.repeat(64) } : m));
    await assert.rejects(criarMigrador({ conexao, migrations: alteradas }).aplicar(), /foi alterada depois de aplicada/);
  });

  test('baseline: banco com schema e sem registros → marca todas', async () => {
    await conexao.query('DROP TABLE schema_migrations');
    const { marcadas } = await criarMigrador({ conexao, migrations }).baseline();
    assert.equal(marcadas.length, 4);
    await assert.rejects(criarMigrador({ conexao, migrations }).baseline(), /já tem registros/);
  });

  test('baseline: banco vazio → recusa', async () => {
    await recriarBanco();
    await assert.rejects(criarMigrador({ conexao, migrations }).baseline(), /não tem o schema/);
  });
});
