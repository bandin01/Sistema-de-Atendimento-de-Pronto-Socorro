'use strict';

const { PERFIS } = require('./perfis');

const { RECEPCAO, ENFERMAGEM, MEDICO } = PERFIS;

/**
 * Matriz RBAC (RNF08 / RNF10).
 *
 * Cada rota declara UMA permissão (ação), nunca uma lista de perfis solta.
 * Assim, mudar quem pode fazer o quê é alterar uma linha aqui (OCP), e a
 * matriz documentada em requisitos_extensao_profissionais.md fica espelhada
 * em um único lugar do código.
 *
 * ⚠️ PROFISSIONAL_CADASTRAR / PROFISSIONAL_GERENCIAR: decisão pendente (ver
 * seção "Pontos a validar" dos requisitos). Padrão atual: RECEPCAO, que é o
 * setor administrativo que já existe nos três perfis do projeto.
 */
const PERMISSOES = Object.freeze({
  // Cadastro de profissionais
  PROFISSIONAL_CADASTRAR: Object.freeze([RECEPCAO]),
  PROFISSIONAL_GERENCIAR: Object.freeze([RECEPCAO]),

  // Consulta de profissionais
  MEDICO_LISTAR: Object.freeze([RECEPCAO, ENFERMAGEM, MEDICO]),
  MEDICO_DETALHAR: Object.freeze([RECEPCAO, MEDICO]),
  ENFERMEIRO_LISTAR: Object.freeze([RECEPCAO, ENFERMAGEM, MEDICO]),
  ENFERMEIRO_DETALHAR: Object.freeze([RECEPCAO, ENFERMAGEM]),

  // Autosserviço do profissional logado
  MEDICO_PROPRIO_PERFIL: Object.freeze([MEDICO]),
  ENFERMEIRO_PROPRIO_PERFIL: Object.freeze([ENFERMAGEM]),

  // Recepção (RF01–RF05). Consultar também serve à enfermagem e ao médico (RF11);
  // os documentos saem mascarados conforme o perfil (RNF09).
  ATENDIMENTO_ABRIR: Object.freeze([RECEPCAO]),
  ATENDIMENTO_CONSULTAR: Object.freeze([RECEPCAO, ENFERMAGEM, MEDICO]),
  PACIENTE_ALTERAR: Object.freeze([RECEPCAO]),
  ATENDIMENTO_CANCELAR: Object.freeze([RECEPCAO]),

  // Triagem (RF18)
  TRIAGEM_VER_FILA: Object.freeze([ENFERMAGEM]),
  TRIAGEM_REGISTRAR: Object.freeze([ENFERMAGEM]),

  // Painel médico / atendimento (RF09, RF19, RF21)
  PAINEL_MEDICO_VER: Object.freeze([MEDICO]),
  ATENDIMENTO_CHAMAR_PROXIMO: Object.freeze([MEDICO]),
  PRESCRICAO_REGISTRAR: Object.freeze([MEDICO]),
  ATENDIMENTO_FINALIZAR: Object.freeze([MEDICO]),
});

module.exports = { PERMISSOES };
