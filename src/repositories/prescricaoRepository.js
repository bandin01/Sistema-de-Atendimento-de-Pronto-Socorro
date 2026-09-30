'use strict';

const SELECT_BASE = `
  SELECT pr.id,
         pr.atendimento_id    AS atendimentoId,
         pr.medico_id         AS medicoId,
         m.nome               AS medicoNome,
         CONCAT('CRM-', m.crm_uf, ' ', m.crm_numero) AS medicoCrm,
         pr.medicamento,
         pr.dosagem,
         pr.via_administracao AS viaAdministracao,
         pr.frequencia,
         pr.observacoes,
         DATE_FORMAT(pr.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm
    FROM prescricoes pr
    JOIN medicos m ON m.id = pr.medico_id`;

function criarPrescricaoRepository(pool) {
  return {
    async criar(prescricao, conexao = pool) {
      const [resultado] = await conexao.execute(
        `INSERT INTO prescricoes
           (atendimento_id, medico_id, medicamento, dosagem, via_administracao, frequencia, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          prescricao.atendimentoId, prescricao.medicoId, prescricao.medicamento, prescricao.dosagem,
          prescricao.viaAdministracao, prescricao.frequencia, prescricao.observacoes,
        ],
      );
      return resultado.insertId;
    },

    async buscarPorId(id, conexao = pool) {
      const [linhas] = await conexao.execute(`${SELECT_BASE} WHERE pr.id = ?`, [id]);
      return linhas[0] || null;
    },

    async listarPorAtendimento(atendimentoId, conexao = pool) {
      const [linhas] = await conexao.execute(
        `${SELECT_BASE} WHERE pr.atendimento_id = ? ORDER BY pr.criado_em ASC, pr.id ASC`,
        [atendimentoId],
      );
      return linhas;
    },
  };
}

module.exports = { criarPrescricaoRepository };
