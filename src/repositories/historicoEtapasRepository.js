'use strict';

const LIMITE_DESCRICAO = 255; // historico_etapas.descricao VARCHAR(255)

/**
 * Histórico de etapas do paciente (migration 013): Chegada → Atendimento
 * Inicial → Triagem → Consulta → Desfecho, com a descrição textual de cada uma.
 * Gravado pelo service na mesma transação da mudança de etapa.
 */
function criarHistoricoEtapasRepository(pool) {
  return {
    async registrar({ atendimentoId, etapa, descricao }, conexao = pool) {
      await conexao.execute(
        'INSERT INTO historico_etapas (atendimento_id, etapa, descricao) VALUES (?, ?, ?)',
        [atendimentoId, etapa, descricao.slice(0, LIMITE_DESCRICAO)],
      );
    },

    async listarPorAtendimento(atendimentoId, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT h.etapa,
                h.descricao,
                DATE_FORMAT(h.registrado_em, '%Y-%m-%dT%H:%i:%s') AS registradoEm
           FROM historico_etapas h
          WHERE h.atendimento_id = ?
          ORDER BY h.registrado_em ASC, h.id ASC`,
        [atendimentoId],
      );
      return linhas;
    },
  };
}

module.exports = { criarHistoricoEtapasRepository };
