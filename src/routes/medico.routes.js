'use strict';

const { criarProfissionalRoutesBase } = require('./profissionalRoutesBase');

/**
 * GET    /medicos                  MEDICO_LISTAR
 * POST   /medicos                  PROFISSIONAL_CADASTRAR
 * GET    /medicos/me               MEDICO_PROPRIO_PERFIL
 * PATCH  /medicos/me/disponibilidade  MEDICO_PROPRIO_PERFIL
 * GET    /medicos/:id              MEDICO_DETALHAR
 * PATCH  /medicos/:id/situacao     PROFISSIONAL_GERENCIAR
 */
function criarMedicoRoutes({ medicoController, autenticar, autorizar }) {
  return criarProfissionalRoutesBase({
    controller: medicoController,
    autenticar,
    autorizar,
    permissoes: { listar: 'MEDICO_LISTAR', detalhar: 'MEDICO_DETALHAR', proprioPerfil: 'MEDICO_PROPRIO_PERFIL' },
  });
}

module.exports = { criarMedicoRoutes };
