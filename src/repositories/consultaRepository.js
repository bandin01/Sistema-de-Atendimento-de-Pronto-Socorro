'use strict';

/**
 * Etapa Consulta (migration 013): vínculo atendimento ↔ médico responsável.
 * iniciada_em é a confirmação médica (RF04/RF05). Enquanto finalizada_em é
 * NULL, a coluna gerada medico_em_consulta_id garante uma consulta aberta por
 * médico (RF20). Triggers: trg_consultas_bi_medico, trg_consultas_bu_bloqueio.
 */
function criarConsultaRepository(pool) {
  return {
    /** Chamar depois de atendimentoRepository.iniciarConsulta, na mesma transação. */
    async criar({ atendimentoId, medicoId }, conexao = pool) {
      const [resultado] = await conexao.execute(
        'INSERT INTO consultas (atendimento_id, medico_id) VALUES (?, ?)',
        [atendimentoId, medicoId],
      );
      return resultado.insertId;
    },

    /** Exige desfecho já registrado para a consulta (trigger). */
    async finalizar(consultaId, conexao = pool) {
      const [resultado] = await conexao.execute(
        'UPDATE consultas SET finalizada_em = NOW() WHERE id = ? AND finalizada_em IS NULL',
        [consultaId],
      );
      return resultado.affectedRows;
    },
  };
}

module.exports = { criarConsultaRepository };
