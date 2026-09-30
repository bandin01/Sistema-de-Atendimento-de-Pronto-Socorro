'use strict';

const { PERFIS } = require('../config/perfis');

/**
 * Histórico de status do atendimento (RF14, migration 012).
 * Cada linha tem exatamente um responsável: a coluna preenchida depende do
 * perfil de quem fez a mudança (CHECK chk_historico_status_um_responsavel).
 */
const COLUNA_RESPONSAVEL = Object.freeze({
  [PERFIS.RECEPCAO]: 'recepcionista_id',
  [PERFIS.ENFERMAGEM]: 'enfermeiro_id',
  [PERFIS.MEDICO]: 'medico_id',
});

function criarHistoricoStatusRepository(pool) {
  return {
    /** responsavel: { perfil, id } — o mesmo formato de req.usuario. */
    async registrar({ atendimentoId, statusAnterior, statusNovo, responsavel }, conexao = pool) {
      const coluna = COLUNA_RESPONSAVEL[responsavel.perfil];
      if (!coluna) throw new Error(`Perfil sem coluna de responsável no histórico: "${responsavel.perfil}".`);
      await conexao.execute(
        `INSERT INTO historico_status (atendimento_id, status_anterior, status_novo, ${coluna})
         VALUES (?, ?, ?, ?)`,
        [atendimentoId, statusAnterior, statusNovo, responsavel.id],
      );
    },

    /** Linha do tempo do atendimento (RF14), com quem fez cada mudança. */
    async listarPorAtendimento(atendimentoId, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT h.status_anterior AS statusAnterior,
                h.status_novo     AS statusNovo,
                DATE_FORMAT(h.data_hora, '%Y-%m-%dT%H:%i:%s') AS dataHora,
                CASE
                  WHEN h.recepcionista_id IS NOT NULL THEN ?
                  WHEN h.enfermeiro_id    IS NOT NULL THEN ?
                  ELSE ?
                END AS responsavelPerfil,
                COALESCE(r.nome, e.nome, m.nome) AS responsavelNome
           FROM historico_status h
           LEFT JOIN recepcionistas r ON r.id = h.recepcionista_id
           LEFT JOIN enfermeiros e    ON e.id = h.enfermeiro_id
           LEFT JOIN medicos m        ON m.id = h.medico_id
          WHERE h.atendimento_id = ?
          ORDER BY h.data_hora ASC, h.id ASC`,
        [PERFIS.RECEPCAO, PERFIS.ENFERMAGEM, PERFIS.MEDICO, atendimentoId],
      );
      return linhas;
    },
  };
}

module.exports = { criarHistoricoStatusRepository };
