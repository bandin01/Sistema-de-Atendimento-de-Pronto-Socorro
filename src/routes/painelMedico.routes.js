'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * GET   /painel-medico                                    PAINEL_MEDICO_VER
 * POST  /painel-medico/chamar-proximo                     ATENDIMENTO_CHAMAR_PROXIMO
 * POST  /painel-medico/atendimentos/:atendimentoId/prescricoes  PRESCRICAO_REGISTRAR
 * PATCH /painel-medico/atendimentos/:atendimentoId/finalizar    ATENDIMENTO_FINALIZAR
 */
function criarPainelMedicoRoutes({ painelMedicoController: c, autenticar, autorizar }) {
  const router = express.Router();
  router.use(autenticar);

  router.get('/', autorizar('PAINEL_MEDICO_VER'), asyncHandler(c.visualizar));
  router.post('/chamar-proximo', autorizar('ATENDIMENTO_CHAMAR_PROXIMO'), asyncHandler(c.chamarProximo));
  router.post('/atendimentos/:atendimentoId/prescricoes', autorizar('PRESCRICAO_REGISTRAR'), asyncHandler(c.registrarPrescricao));
  router.patch('/atendimentos/:atendimentoId/finalizar', autorizar('ATENDIMENTO_FINALIZAR'), asyncHandler(c.finalizar));

  return router;
}

module.exports = { criarPainelMedicoRoutes };
