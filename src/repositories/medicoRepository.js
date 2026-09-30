'use strict';

/**
 * Acesso à tabela medicos (login e senha_hash ficam no próprio cadastro).
 *
 * Contrato compartilhado com enfermeiroRepository (o profissionalServiceBase
 * depende só destes métodos — LSP/DIP):
 *   criar, buscarPorId, listar, buscarConflitos,
 *   atualizarDisponibilidade, atualizarSituacao
 */
const SELECT_BASE = `
  SELECT m.id,
         m.login,
         m.nome,
         m.cpf,
         m.rg,
         DATE_FORMAT(m.data_nascimento, '%Y-%m-%d') AS dataNascimento,
         m.telefone,
         m.email,
         m.crm_numero              AS crmNumero,
         m.crm_uf                  AS crmUf,
         m.especialidade,
         m.status_disponibilidade  AS statusDisponibilidade,
         m.ativo,
         DATE_FORMAT(m.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm
    FROM medicos m`;

function mapear(linha) {
  if (!linha) return null;
  return { ...linha, ativo: linha.ativo === 1 };
}

function sufixoBloqueio({ bloquear = false } = {}) {
  return bloquear ? ' FOR UPDATE' : '';
}

function criarMedicoRepository(pool) {
  return {
    async criar(medico, conexao = pool) {
      const [resultado] = await conexao.execute(
        `INSERT INTO medicos
           (nome, cpf, rg, data_nascimento, telefone, email,
            crm_numero, crm_uf, especialidade, login, senha_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          medico.nome, medico.cpf, medico.rg, medico.dataNascimento, medico.telefone, medico.email,
          medico.crmNumero, medico.crmUf, medico.especialidade, medico.login, medico.senhaHash,
        ],
      );
      return resultado.insertId;
    },

    async buscarPorId(id, conexao = pool, opcoes) {
      const [linhas] = await conexao.execute(`${SELECT_BASE} WHERE m.id = ?${sufixoBloqueio(opcoes)}`, [id]);
      return mapear(linhas[0]);
    },

    async listar({ statusDisponibilidade, especialidade, ativo } = {}, conexao = pool) {
      const condicoes = [];
      const parametros = [];
      if (statusDisponibilidade) {
        condicoes.push('m.status_disponibilidade = ?');
        parametros.push(statusDisponibilidade);
      }
      if (especialidade) {
        condicoes.push('m.especialidade LIKE ?');
        parametros.push(`%${especialidade}%`);
      }
      if (typeof ativo === 'boolean') {
        condicoes.push('m.ativo = ?');
        parametros.push(ativo ? 1 : 0);
      }
      const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
      const [linhas] = await conexao.execute(`${SELECT_BASE}${where} ORDER BY m.nome ASC`, parametros);
      return linhas.map(mapear);
    },

    /** Devolve os nomes dos campos que já existem em outro cadastro. */
    async buscarConflitos({ cpf, email, crmNumero, crmUf }, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT (cpf = ?) AS cpf,
                (email = ?) AS email,
                (crm_numero = ? AND crm_uf = ?) AS crm
           FROM medicos
          WHERE cpf = ? OR email = ? OR (crm_numero = ? AND crm_uf = ?)`,
        [cpf, email, crmNumero, crmUf, cpf, email, crmNumero, crmUf],
      );
      const campos = new Set();
      linhas.forEach((l) => {
        if (l.cpf) campos.add('cpf');
        if (l.email) campos.add('email');
        if (l.crm) campos.add('crmNumero');
      });
      return [...campos];
    },

    async atualizarDisponibilidade(id, statusDisponibilidade, conexao = pool) {
      await conexao.execute('UPDATE medicos SET status_disponibilidade = ? WHERE id = ?', [statusDisponibilidade, id]);
    },

    async atualizarSituacao(id, { ativo, statusDisponibilidade }, conexao = pool) {
      await conexao.execute(
        'UPDATE medicos SET ativo = ?, status_disponibilidade = ? WHERE id = ?',
        [ativo ? 1 : 0, statusDisponibilidade, id],
      );
    },
  };
}

module.exports = { criarMedicoRepository };
