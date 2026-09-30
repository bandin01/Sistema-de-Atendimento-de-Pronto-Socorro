'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * POST  /atendimentos                    ATENDIMENTO_ABRIR      (RF01, RF02)
 * GET   /atendimentos/:numero            ATENDIMENTO_CONSULTAR  (RF03, RF11, RF14)
 * PATCH /atendimentos/:numero/paciente   PACIENTE_ALTERAR       (RF04)
 * PATCH /atendimentos/:numero/cancelar   ATENDIMENTO_CANCELAR   (RF05)
 */
function criarAtendimentoRoutes({ atendimentoController: c, autenticar, autorizar }) {
  const router = express.Router();
  router.use(autenticar);

  router.post('/', autorizar('ATENDIMENTO_ABRIR'), asyncHandler(c.abrir));
  router.get('/:numero', autorizar('ATENDIMENTO_CONSULTAR'), asyncHandler(c.consultar));
  router.patch('/:numero/paciente', autorizar('PACIENTE_ALTERAR'), asyncHandler(c.alterarPaciente));
  router.patch('/:numero/cancelar', autorizar('ATENDIMENTO_CANCELAR'), asyncHandler(c.cancelar));

  return router;
}

module.exports = { criarAtendimentoRoutes };
