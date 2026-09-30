'use strict';

const SELECT_BASE = `
  SELECT t.id,
         t.atendimento_id           AS atendimentoId,
         t.enfermeiro_id            AS enfermeiroId,
         e.nome                     AS enfermeiroNome,
         t.classificacao_manchester AS classificacao,
         t.queixa_principal         AS queixaPrincipal,
         t.pressao_sistolica        AS pressaoSistolica,
         t.pressao_diastolica       AS pressaoDiastolica,
         t.frequencia_cardiaca      AS frequenciaCardiaca,
         t.frequencia_respiratoria  AS frequenciaRespiratoria,
         t.temperatura,
         t.saturacao_o2             AS saturacaoO2,
         t.glicemia,
         t.escala_dor               AS escalaDor,
         t.observacoes,
         DATE_FORMAT(t.realizada_em, '%Y-%m-%dT%H:%i:%s') AS realizadaEm
    FROM triagens t
    JOIN enfermeiros e ON e.id = t.enfermeiro_id`;

function criarTriagemRepository(pool) {
  return {
    async criar(triagem, conexao = pool) {
      const [resultado] = await conexao.execute(
        `INSERT INTO triagens
           (atendimento_id, enfermeiro_id, classificacao_manchester, queixa_principal,
            pressao_sistolica, pressao_diastolica, frequencia_cardiaca, frequencia_respiratoria,
            temperatura, saturacao_o2, glicemia, escala_dor, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          triagem.atendimentoId, triagem.enfermeiroId, triagem.classificacao, triagem.queixaPrincipal,
          triagem.pressaoSistolica, triagem.pressaoDiastolica, triagem.frequenciaCardiaca,
          triagem.frequenciaRespiratoria, triagem.temperatura, triagem.saturacaoO2,
          triagem.glicemia, triagem.escalaDor, triagem.observacoes,
        ],
      );
      return resultado.insertId;
    },

    async buscarPorId(id, conexao = pool) {
      const [linhas] = await conexao.execute(`${SELECT_BASE} WHERE t.id = ?`, [id]);
      return linhas[0] || null;
    },

    async buscarPorAtendimentoId(atendimentoId, conexao = pool) {
      const [linhas] = await conexao.execute(`${SELECT_BASE} WHERE t.atendimento_id = ?`, [atendimentoId]);
      return linhas[0] || null;
    },
  };
}

module.exports = { criarTriagemRepository };
