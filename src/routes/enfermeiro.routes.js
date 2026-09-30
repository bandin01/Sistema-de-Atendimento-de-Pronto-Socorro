'use strict';

const { criarProfissionalRoutesBase } = require('./profissionalRoutesBase');

/**
 * GET    /enfermeiros                  ENFERMEIRO_LISTAR
 * POST   /enfermeiros                  PROFISSIONAL_CADASTRAR
 * GET    /enfermeiros/me               ENFERMEIRO_PROPRIO_PERFIL
 * PATCH  /enfermeiros/me/disponibilidade  ENFERMEIRO_PROPRIO_PERFIL
 * GET    /enfermeiros/:id              ENFERMEIRO_DETALHAR
 * PATCH  /enfermeiros/:id/situacao     PROFISSIONAL_GERENCIAR
 */
function criarEnfermeiroRoutes({ enfermeiroController, autenticar, autorizar }) {
  return criarProfissionalRoutesBase({
    controller: enfermeiroController,
    autenticar,
    autorizar,
    permissoes: {
      listar: 'ENFERMEIRO_LISTAR',
      detalhar: 'ENFERMEIRO_DETALHAR',
      proprioPerfil: 'ENFERMEIRO_PROPRIO_PERFIL',
    },
  });
}

module.exports = { criarEnfermeiroRoutes };
