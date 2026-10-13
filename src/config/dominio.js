'use strict';

/**
 * Valores de domínio compartilhados. Espelham os ENUMs do banco
 * (001_schema_base e migrations 010/011/013). Se renomear no banco, renomeie aqui.
 */

/** Status do atendimento: nomeiam a ETAPA do fluxo, nunca o profissional. */
const STATUS_ATENDIMENTO = Object.freeze({
  AGUARDANDO_TRIAGEM: 'AGUARDANDO_TRIAGEM',
  AGUARDANDO_CONSULTA: 'AGUARDANDO_CONSULTA',
  EM_CONSULTA: 'EM_CONSULTA',
  FINALIZADO: 'FINALIZADO',
  CANCELADO: 'CANCELADO',
});

/** Etapas do fluxo do paciente, em ordem cronológica (historico_etapas). */
const ETAPA_ATENDIMENTO = Object.freeze({
  CHEGADA: 'CHEGADA',
  ATENDIMENTO_INICIAL: 'ATENDIMENTO_INICIAL',
  TRIAGEM: 'TRIAGEM',
  CONSULTA: 'CONSULTA',
  DESFECHO: 'DESFECHO',
});

/** Desfecho da consulta (desfechos.tipo). Todos encerram o atendimento. */
const TIPO_DESFECHO = Object.freeze({
  PRESCRICAO: 'PRESCRICAO', // alta com receita (itens em prescricoes)
  EXAMES: 'EXAMES', // alta com pedido de exames
  ENCAMINHAMENTO: 'ENCAMINHAMENTO', // exige destino
  ALTA: 'ALTA', // alta simples
});

/** Status operacional do médico (medicos.status_operacional). */
const STATUS_MEDICO = Object.freeze({
  EM_PLANTAO: 'EM_PLANTAO', // apto a chamar o próximo paciente
  EM_CONSULTA: 'EM_CONSULTA', // controlado pelo sistema, nunca pelo usuário
  PAUSA: 'PAUSA',
  FOLGA: 'FOLGA',
  LICENCA: 'LICENCA',
});

const STATUS_ENFERMEIRO = Object.freeze({
  DISPONIVEL: 'DISPONIVEL',
  PAUSA: 'PAUSA',
  INDISPONIVEL: 'INDISPONIVEL',
});

const CATEGORIA_ENFERMAGEM = Object.freeze({
  ENFERMEIRO: 'ENFERMEIRO',
  TECNICO_ENFERMAGEM: 'TECNICO_ENFERMAGEM',
});

const UFS = Object.freeze([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

module.exports = {
  STATUS_ATENDIMENTO,
  ETAPA_ATENDIMENTO,
  TIPO_DESFECHO,
  STATUS_MEDICO,
  STATUS_ENFERMEIRO,
  CATEGORIA_ENFERMAGEM,
  UFS,
};
