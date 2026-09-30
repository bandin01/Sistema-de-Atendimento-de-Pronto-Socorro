'use strict';

/**
 * Acesso à tabela enfermeiros (login e senha_hash ficam no próprio cadastro).
 * Mesmo contrato de medicoRepository (ver comentário lá).
 */
const SELECT_BASE = `
  SELECT e.id,
         e.login,
         e.nome,
         e.cpf,
         e.rg,
         DATE_FORMAT(e.data_nascimento, '%Y-%m-%d') AS dataNascimento,
         e.telefone,
         e.email,
         e.coren_numero            AS corenNumero,
         e.coren_uf                AS corenUf,
         e.categoria,
         e.especialidade,
         e.status_disponibilidade  AS statusDisponibilidade,
         e.ativo,
         DATE_FORMAT(e.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm
    FROM enfermeiros e`;

function mapear(linha) {
  if (!linha) return null;
  return { ...linha, ativo: linha.ativo === 1 };
}

function sufixoBloqueio({ bloquear = false } = {}) {
  return bloquear ? ' FOR UPDATE' : '';
}

function criarEnfermeiroRepository(pool) {
  return {
    async criar(enfermeiro, conexao = pool) {
      const [resultado] = await conexao.execute(
        `INSERT INTO enfermeiros
           (nome, cpf, rg, data_nascimento, telefone, email,
            coren_numero, coren_uf, categoria, especialidade, login, senha_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          enfermeiro.nome, enfermeiro.cpf, enfermeiro.rg, enfermeiro.dataNascimento,
          enfermeiro.telefone, enfermeiro.email, enfermeiro.corenNumero, enfermeiro.corenUf,
          enfermeiro.categoria, enfermeiro.especialidade, enfermeiro.login, enfermeiro.senhaHash,
        ],
      );
      return resultado.insertId;
    },

    async buscarPorId(id, conexao = pool, opcoes) {
      const [linhas] = await conexao.execute(`${SELECT_BASE} WHERE e.id = ?${sufixoBloqueio(opcoes)}`, [id]);
      return mapear(linhas[0]);
    },

    async listar({ statusDisponibilidade, especialidade, ativo, categoria } = {}, conexao = pool) {
      const condicoes = [];
      const parametros = [];
      if (statusDisponibilidade) {
        condicoes.push('e.status_disponibilidade = ?');
        parametros.push(statusDisponibilidade);
      }
      if (categoria) {
        condicoes.push('e.categoria = ?');
        parametros.push(categoria);
      }
      if (especialidade) {
        condicoes.push('e.especialidade LIKE ?');
        parametros.push(`%${especialidade}%`);
      }
      if (typeof ativo === 'boolean') {
        condicoes.push('e.ativo = ?');
        parametros.push(ativo ? 1 : 0);
      }
      const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
      const [linhas] = await conexao.execute(`${SELECT_BASE}${where} ORDER BY e.nome ASC`, parametros);
      return linhas.map(mapear);
    },

    async buscarConflitos({ cpf, email, corenNumero, corenUf }, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT (cpf = ?) AS cpf,
                (email = ?) AS email,
                (coren_numero = ? AND coren_uf = ?) AS coren
           FROM enfermeiros
          WHERE cpf = ? OR email = ? OR (coren_numero = ? AND coren_uf = ?)`,
        [cpf, email, corenNumero, corenUf, cpf, email, corenNumero, corenUf],
      );
      const campos = new Set();
      linhas.forEach((l) => {
        if (l.cpf) campos.add('cpf');
        if (l.email) campos.add('email');
        if (l.coren) campos.add('corenNumero');
      });
      return [...campos];
    },

    async atualizarDisponibilidade(id, statusDisponibilidade, conexao = pool) {
      await conexao.execute('UPDATE enfermeiros SET status_disponibilidade = ? WHERE id = ?', [statusDisponibilidade, id]);
    },

    async atualizarSituacao(id, { ativo, statusDisponibilidade }, conexao = pool) {
      await conexao.execute(
        'UPDATE enfermeiros SET ativo = ?, status_disponibilidade = ? WHERE id = ?',
        [ativo ? 1 : 0, statusDisponibilidade, id],
      );
    },
  };
}

module.exports = { criarEnfermeiroRepository };
