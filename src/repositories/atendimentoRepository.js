'use strict';

const { STATUS_ATENDIMENTO } = require('../config/dominio');
const { CODIGOS_MANCHESTER } = require('../config/manchester');

const LIMITE_CANDIDATOS_FILA = 10;

// RF09: a ordenação por Manchester acontece AQUI, na query.
// FIELD() usa a ordem de config/manchester.js; empate → quem foi triado antes.
const ORDEM_FILA_MEDICA = `FIELD(t.classificacao_manchester, ${CODIGOS_MANCHESTER.map(() => '?').join(', ')}),
                           t.realizada_em ASC, a.id ASC`;

const COLUNAS_PACIENTE = `
         p.id    AS pacienteId,
         p.nome  AS pacienteNome,
         p.cpf   AS pacienteCpf,
         p.rg    AS pacienteRg,
         TIMESTAMPDIFF(YEAR, p.data_nascimento, CURDATE()) AS pacienteIdade`;

const COLUNAS_TRIAGEM = `
         t.id                       AS triagemId,
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
         t.observacoes              AS observacoesTriagem,
         DATE_FORMAT(t.realizada_em, '%Y-%m-%dT%H:%i:%s') AS triadoEm,
         e.nome                     AS enfermeiroNome`;

/**
 * Acesso à tabela atendimentos (etapa Atendimento Inicial e status do fluxo).
 * O médico NÃO fica no atendimento: o vínculo está em consultas (migration 013).
 * As consultas abaixo trazem o médico/consulta por LEFT JOIN quando a tela precisa.
 */
function criarAtendimentoRepository(pool) {
  return {
    /** O número AT000 é gerado pelo trigger trg_atendimentos_bi_numero (RNF03). */
    async criar({ pacienteId }, conexao = pool) {
      const [resultado] = await conexao.execute('INSERT INTO atendimentos (paciente_id) VALUES (?)', [pacienteId]);
      return resultado.insertId;
    },

    async buscarPorId(id, conexao = pool, { bloquear = false } = {}) {
      const [linhas] = await conexao.execute(
        `SELECT a.id,
                a.numero_atendimento AS numeroAtendimento,
                a.paciente_id        AS pacienteId,
                a.status,
                c.id                 AS consultaId,
                c.medico_id          AS medicoId,
                DATE_FORMAT(c.iniciada_em, '%Y-%m-%dT%H:%i:%s') AS confirmadoMedicoEm
           FROM atendimentos a
           LEFT JOIN consultas c ON c.atendimento_id = a.id
          WHERE a.id = ?${bloquear ? ' FOR UPDATE OF a' : ''}`,
        [id],
      );
      return linhas[0] || null;
    },

    /** Consulta da recepção (RF03/RF11): dados do atendimento + médico da consulta, se houver. */
    async buscarPorNumero(numeroAtendimento, conexao = pool, { bloquear = false } = {}) {
      const [linhas] = await conexao.execute(
        `SELECT a.id,
                a.numero_atendimento AS numeroAtendimento,
                a.paciente_id        AS pacienteId,
                c.medico_id          AS medicoId,
                m.nome               AS medicoNome,
                a.status,
                DATE_FORMAT(a.criado_em, '%Y-%m-%dT%H:%i:%s')     AS abertoEm,
                DATE_FORMAT(c.iniciada_em, '%Y-%m-%dT%H:%i:%s')   AS confirmadoMedicoEm,
                DATE_FORMAT(a.finalizado_em, '%Y-%m-%dT%H:%i:%s') AS finalizadoEm
           FROM atendimentos a
           LEFT JOIN consultas c ON c.atendimento_id = a.id
           LEFT JOIN medicos m   ON m.id = c.medico_id
          WHERE a.numero_atendimento = ?${bloquear ? ' FOR UPDATE OF a' : ''}`,
        [numeroAtendimento],
      );
      return linhas[0] || null;
    },

    /** Atendimento do paciente que ainda não terminou (nem finalizado, nem cancelado). */
    async buscarAtivoDoPaciente(pacienteId, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT a.id, a.numero_atendimento AS numeroAtendimento, a.status
           FROM atendimentos a
          WHERE a.paciente_id = ? AND a.status NOT IN (?, ?)
          LIMIT 1`,
        [pacienteId, STATUS_ATENDIMENTO.FINALIZADO, STATUS_ATENDIMENTO.CANCELADO],
      );
      return linhas[0] || null;
    },

    async listarAguardandoTriagem(conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT a.id,
                a.numero_atendimento AS numeroAtendimento,
                DATE_FORMAT(a.criado_em, '%Y-%m-%dT%H:%i:%s') AS chegadaEm,
                TIMESTAMPDIFF(MINUTE, a.criado_em, NOW()) AS minutosEspera,
                ${COLUNAS_PACIENTE}
           FROM atendimentos a
           JOIN pacientes p ON p.id = a.paciente_id
          WHERE a.status = ?
          ORDER BY a.criado_em ASC, a.id ASC`,
        [STATUS_ATENDIMENTO.AGUARDANDO_TRIAGEM],
      );
      return linhas;
    },

    async listarFilaMedica(conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT a.id,
                a.numero_atendimento AS numeroAtendimento,
                TIMESTAMPDIFF(MINUTE, t.realizada_em, NOW()) AS minutosEspera,
                ${COLUNAS_PACIENTE},
                ${COLUNAS_TRIAGEM}
           FROM atendimentos a
           JOIN triagens t    ON t.atendimento_id = a.id
           JOIN pacientes p   ON p.id = a.paciente_id
           JOIN enfermeiros e ON e.id = t.enfermeiro_id
          WHERE a.status = ?
          ORDER BY ${ORDEM_FILA_MEDICA}`,
        [STATUS_ATENDIMENTO.AGUARDANDO_CONSULTA, ...CODIGOS_MANCHESTER],
      );
      return linhas;
    },

    /** Ids dos primeiros da fila, na ordem de prioridade (leitura sem bloqueio). */
    async listarCandidatosFilaMedica(conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT a.id
           FROM atendimentos a
           JOIN triagens t ON t.atendimento_id = a.id
          WHERE a.status = ?
          ORDER BY ${ORDEM_FILA_MEDICA}
          LIMIT ${LIMITE_CANDIDATOS_FILA}`,
        [STATUS_ATENDIMENTO.AGUARDANDO_CONSULTA, ...CODIGOS_MANCHESTER],
      );
      return linhas.map((l) => l.id);
    },

    /**
     * UPDATE condicional atômico: só um médico "ganha" o atendimento, mesmo com
     * cliques simultâneos. O InnoDB bloqueia a linha e reavalia o WHERE; quem
     * chegar depois recebe affectedRows = 0. Na mesma transação o service cria
     * a consulta (consultaRepository.criar), que registra a confirmação médica.
     */
    async iniciarConsulta(atendimentoId, conexao = pool) {
      const [resultado] = await conexao.execute(
        'UPDATE atendimentos SET status = ? WHERE id = ? AND status = ?',
        [STATUS_ATENDIMENTO.EM_CONSULTA, atendimentoId, STATUS_ATENDIMENTO.AGUARDANDO_CONSULTA],
      );
      return resultado.affectedRows;
    },

    /** Usa o índice único da coluna gerada consultas.medico_em_consulta_id (RF20). */
    async buscarEmAndamentoDoMedico(medicoId, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT a.id,
                a.numero_atendimento AS numeroAtendimento,
                c.id                 AS consultaId,
                DATE_FORMAT(c.iniciada_em, '%Y-%m-%dT%H:%i:%s') AS confirmadoMedicoEm,
                ${COLUNAS_PACIENTE},
                ${COLUNAS_TRIAGEM}
           FROM consultas c
           JOIN atendimentos a ON a.id = c.atendimento_id
           JOIN triagens t     ON t.atendimento_id = a.id
           JOIN pacientes p    ON p.id = a.paciente_id
           JOIN enfermeiros e  ON e.id = t.enfermeiro_id
          WHERE c.medico_em_consulta_id = ?`,
        [medicoId],
      );
      return linhas[0] || null;
    },

    async atualizarStatus(atendimentoId, statusAtual, novoStatus, conexao = pool) {
      const [resultado] = await conexao.execute(
        'UPDATE atendimentos SET status = ? WHERE id = ? AND status = ?',
        [novoStatus, atendimentoId, statusAtual],
      );
      return resultado.affectedRows;
    },

    /** Exige desfecho já registrado (trigger trg_atendimentos_bu_bloqueio). */
    async finalizar(atendimentoId, conexao = pool) {
      const [resultado] = await conexao.execute(
        `UPDATE atendimentos
            SET status = ?, finalizado_em = NOW()
          WHERE id = ? AND status = ?`,
        [STATUS_ATENDIMENTO.FINALIZADO, atendimentoId, STATUS_ATENDIMENTO.EM_CONSULTA],
      );
      return resultado.affectedRows;
    },
  };
}

module.exports = { criarAtendimentoRepository };
