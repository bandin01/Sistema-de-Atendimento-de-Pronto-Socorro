'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * Rotas comuns de profissionais. Cada rota declara exatamente UMA permissão
 * RBAC (RNF08/RNF10). Rotas "/me" vêm antes de "/:id".
 */
function criarProfissionalRoutesBase({ controller, autenticar, autorizar, permissoes: p }) {
  const router = express.Router();
  router.use(autenticar);

  router.get('/me', autorizar(p.proprioPerfil), asyncHandler(controller.meuPerfil));
  router.patch('/me/disponibilidade', autorizar(p.proprioPerfil), asyncHandler(controller.alterarMinhaDisponibilidade));

  router.get('/', autorizar(p.listar), asyncHandler(controller.listar));
  router.post('/', autorizar('PROFISSIONAL_CADASTRAR'), asyncHandler(controller.cadastrar));
  router.get('/:id', autorizar(p.detalhar), asyncHandler(controller.detalhar));
  router.patch('/:id/situacao', autorizar('PROFISSIONAL_GERENCIAR'), asyncHandler(controller.alterarSituacaoCadastro));

  return router;
}

module.exports = { criarProfissionalRoutesBase };
