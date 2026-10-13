'use strict';

/**
 * Etapa Desfecho (migration 013): um por consulta, imutável depois de gravado.
 * O médico responsável é o da consulta. Triggers: trg_desfechos_bi_validacao
 * (consulta aberta; PRESCRICAO exige prescrição) e trg_desfechos_bu_bloqueio.
 */
function criarDesfechoRepository(pool) {
  return {
    async criar({ consultaId, tipo, descricao, destinoEncaminhamento }, conexao = pool) {
      const [resultado] = await conexao.execute(
        `INSERT INTO desfechos (consulta_id, tipo, descricao, destino_encaminhamento)
         VALUES (?, ?, ?, ?)`,
        [consultaId, tipo, descricao, destinoEncaminhamento],
      );
      return resultado.insertId;
    },

    async buscarPorAtendimento(atendimentoId, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT d.id,
                d.tipo,
                d.descricao,
                d.destino_encaminhamento AS destinoEncaminhamento,
                DATE_FORMAT(d.registrado_em, '%Y-%m-%dT%H:%i:%s') AS registradoEm,
                m.nome AS medicoNome,
                CONCAT('CRM-', m.crm_uf, ' ', m.crm_numero) AS medicoCrm
           FROM desfechos d
           JOIN consultas c ON c.id = d.consulta_id
           JOIN medicos m   ON m.id = c.medico_id
          WHERE c.atendimento_id = ?`,
        [atendimentoId],
      );
      return linhas[0] || null;
    },
  };
}

module.exports = { criarDesfechoRepository };
