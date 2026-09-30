'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');

/** POST /auth/login é a ÚNICA rota pública do sistema. */
function criarAuthRoutes({ authController, autenticar }) {
  const router = express.Router();

  router.post('/login', asyncHandler(authController.login));
  router.get('/sessao', autenticar, asyncHandler(authController.sessaoAtual));

  return router;
}

module.exports = { criarAuthRoutes };
