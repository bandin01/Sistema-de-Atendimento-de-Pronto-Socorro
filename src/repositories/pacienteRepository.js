'use strict';

const SELECT_BASE = `
  SELECT p.id,
         p.nome,
         p.endereco,
         p.cpf,
         p.rg,
         p.nome_pai  AS nomePai,
         p.nome_mae  AS nomeMae,
         DATE_FORMAT(p.data_nascimento, '%Y-%m-%d') AS dataNascimento,
         TIMESTAMPDIFF(YEAR, p.data_nascimento, CURDATE()) AS idade
    FROM pacientes p`;

function criarPacienteRepository(pool) {
  return {
    async criar(paciente, conexao = pool) {
      const [resultado] = await conexao.execute(
        `INSERT INTO pacientes (nome, endereco, cpf, rg, nome_pai, nome_mae, data_nascimento)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          paciente.nome, paciente.endereco, paciente.cpf, paciente.rg,
          paciente.nomePai, paciente.nomeMae, paciente.dataNascimento,
        ],
      );
      return resultado.insertId;
    },

    async buscarPorId(id, conexao = pool, { bloquear = false } = {}) {
      const [linhas] = await conexao.execute(`${SELECT_BASE} WHERE p.id = ?${bloquear ? ' FOR UPDATE' : ''}`, [id]);
      return linhas[0] || null;
    },

    /** FOR UPDATE opcional: serializa duas recepções abrindo atendimento para o mesmo CPF. */
    async buscarPorCpf(cpf, conexao = pool, { bloquear = false } = {}) {
      const [linhas] = await conexao.execute(`${SELECT_BASE} WHERE p.cpf = ?${bloquear ? ' FOR UPDATE' : ''}`, [cpf]);
      return linhas[0] || null;
    },

    async atualizar(id, paciente, conexao = pool) {
      await conexao.execute(
        `UPDATE pacientes
            SET nome = ?, endereco = ?, cpf = ?, rg = ?, nome_pai = ?, nome_mae = ?, data_nascimento = ?
          WHERE id = ?`,
        [
          paciente.nome, paciente.endereco, paciente.cpf, paciente.rg,
          paciente.nomePai, paciente.nomeMae, paciente.dataNascimento, id,
        ],
      );
    },
  };
}

module.exports = { criarPacienteRepository };
