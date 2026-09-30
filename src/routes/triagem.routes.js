'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * GET  /triagens/fila   TRIAGEM_VER_FILA   (atendimentos aguardando triagem)
 * POST /triagens        TRIAGEM_REGISTRAR  { atendimentoId, classificacao, ... }
 */
function criarTriagemRoutes({ triagemController, autenticar, autorizar }) {
  const router = express.Router();
  router.use(autenticar);

  router.get('/fila', autorizar('TRIAGEM_VER_FILA'), asyncHandler(triagemController.listarFila));
  router.post('/', autorizar('TRIAGEM_REGISTRAR'), asyncHandler(triagemController.registrar));

  return router;
}

module.exports = { criarTriagemRoutes };
