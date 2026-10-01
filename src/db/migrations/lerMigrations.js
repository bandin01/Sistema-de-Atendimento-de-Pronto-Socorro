'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Diretório dos scripts versionados (001, 010, 011, 012…). */
const DIRETORIO_PADRAO = path.join(__dirname, '..');

// 000_create_database.sql cria o banco e faz USE: o runner já faz isso sozinho.
const PADRAO_ARQUIVO = /^(\d{3})_.+\.sql$/;

/** Lê as migrations do diretório, ordenadas por nome. */
function listarMigrations(diretorio = DIRETORIO_PADRAO) {
  return fs.readdirSync(diretorio)
    .filter((nome) => PADRAO_ARQUIVO.test(nome) && !nome.startsWith('000_'))
    .sort()
    .map((nome) => {
      const sql = fs.readFileSync(path.join(diretorio, nome), 'utf8');
      return {
        versao: nome.match(PADRAO_ARQUIVO)[1],
        nome,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

const LINHA_DELIMITER = /^\s*DELIMITER\s+(\S+)\s*$/i;
const INSTRUCAO_USE = /^USE\s+\S+$/i;

/**
 * Divide um script SQL em instruções, como o cliente `mysql` faz:
 * entende `DELIMITER $$ … DELIMITER ;` (triggers e procedures) e não divide
 * em delimitadores dentro de strings, identificadores com crase ou comentários.
 * Descarta `USE …` (o banco vem da conexão) e instruções vazias.
 */
function dividirInstrucoes(sql) {
  const instrucoes = [];
  let delimitador = ';';
  let atual = '';
  let i = 0;

  const fecharInstrucao = () => {
    const texto = atual.trim();
    if (texto && !INSTRUCAO_USE.test(texto)) instrucoes.push(texto);
    atual = '';
  };

  while (i < sql.length) {
    // DELIMITER só é reconhecido no início de uma linha
    const inicioLinha = i === 0 || sql[i - 1] === '\n';
    if (inicioLinha) {
      const fimLinha = sql.indexOf('\n', i) === -1 ? sql.length : sql.indexOf('\n', i);
      const correspondencia = sql.slice(i, fimLinha).match(LINHA_DELIMITER);
      if (correspondencia) {
        fecharInstrucao();
        delimitador = correspondencia[1];
        i = fimLinha + 1;
        continue;
      }
    }

    const c = sql[i];
    const proximo = sql[i + 1];

    // comentários de linha: "-- " e "#"
    if ((c === '-' && proximo === '-' && /\s/.test(sql[i + 2] || '\n')) || c === '#') {
      const fim = sql.indexOf('\n', i);
      i = fim === -1 ? sql.length : fim;
      continue;
    }

    // comentário de bloco
    if (c === '/' && proximo === '*') {
      const fim = sql.indexOf('*/', i + 2);
      i = fim === -1 ? sql.length : fim + 2;
      atual += ' ';
      continue;
    }

    // strings e identificadores: copia até a aspa de fechamento
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\' && c !== '`') { j += 2; continue; }
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; } // aspa duplicada = escape
          break;
        }
        j += 1;
      }
      atual += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (sql.startsWith(delimitador, i)) {
      fecharInstrucao();
      i += delimitador.length;
      continue;
    }

    atual += c;
    i += 1;
  }

  fecharInstrucao();
  return instrucoes;
}

module.exports = { listarMigrations, dividirInstrucoes, DIRETORIO_PADRAO };
