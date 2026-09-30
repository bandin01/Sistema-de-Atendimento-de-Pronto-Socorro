'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { criarContainer } = require('./container');
const { registrarRotas } = require('./routes');
const { criarTratadorErros, rotaNaoEncontrada } = require('./middlewares/tratarErros');

/**
 * Monta a API: cors só para a origem do front-end, JSON com limite,
 * rotas, e os tratadores de 404/erro POR ÚLTIMO.
 */
function criarApp(container = criarContainer()) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({
    origin: (process.env.CORS_ORIGIN || 'http://127.0.0.1:5500').split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '100kb' }));

  registrarRotas(app, container, { prefixo: '/api' });

  app.use(rotaNaoEncontrada);
  app.use(criarTratadorErros());
  return app;
}

if (require.main === module) {
  const porta = Number(process.env.PORT || 3000);
  criarApp().listen(porta, () => {
    console.log(`API do Pronto-Socorro em http://localhost:${porta}/api`);
  });
}

module.exports = { criarApp };
