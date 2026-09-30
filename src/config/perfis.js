'use strict';

/**
 * Perfis de acesso do sistema (RNF08).
 * O perfil é definido pela tabela em que o profissional está cadastrado
 * (migration 010): não existe tabela de usuários compartilhada.
 */
const PERFIS = Object.freeze({
  RECEPCAO: 'RECEPCAO',
  ENFERMAGEM: 'ENFERMAGEM',
  MEDICO: 'MEDICO',
});

module.exports = { PERFIS };
