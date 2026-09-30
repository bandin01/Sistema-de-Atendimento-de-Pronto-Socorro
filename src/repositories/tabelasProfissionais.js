'use strict';

const { PERFIS } = require('../config/perfis');

/**
 * Perfil → tabela (migration 010). Nomes de tabela vêm SÓ deste mapa fixo,
 * nunca de entrada do usuário, por isso podem ser interpolados no SQL.
 */
const TABELA_POR_PERFIL = Object.freeze({
  [PERFIS.RECEPCAO]: 'recepcionistas',
  [PERFIS.ENFERMAGEM]: 'enfermeiros',
  [PERFIS.MEDICO]: 'medicos',
});

function tabelaDoPerfil(perfil) {
  const tabela = TABELA_POR_PERFIL[perfil];
  if (!tabela) throw new Error(`Perfil sem tabela de profissional: "${perfil}".`);
  return tabela;
}

module.exports = { TABELA_POR_PERFIL, tabelaDoPerfil };
