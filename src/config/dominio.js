'use strict';

/**
 * Valores de domínio compartilhados. Espelham os ENUMs do banco
 * (001_schema_base e migrations 010/011). Se renomear no banco, renomeie aqui.
 */
const STATUS_ATENDIMENTO = Object.freeze({
  AGUARDANDO_TRIAGEM: 'AGUARDANDO_TRIAGEM',
  AGUARDANDO_MEDICO: 'AGUARDANDO_MEDICO',
  EM_ATENDIMENTO_MEDICO: 'EM_ATENDIMENTO_MEDICO',
  FINALIZADO: 'FINALIZADO',
  CANCELADO: 'CANCELADO',
});

const STATUS_MEDICO = Object.freeze({
  DISPONIVEL: 'DISPONIVEL',
  EM_ATENDIMENTO: 'EM_ATENDIMENTO', // controlado pelo sistema, nunca pelo usuário
  PAUSA: 'PAUSA',
  INDISPONIVEL: 'INDISPONIVEL',
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
  STATUS_MEDICO,
  STATUS_ENFERMEIRO,
  CATEGORIA_ENFERMAGEM,
  UFS,
};
