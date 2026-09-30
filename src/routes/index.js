'use strict';

const { criarAuthRoutes } = require('./auth.routes');
const { criarAtendimentoRoutes } = require('./atendimento.routes');
const { criarMedicoRoutes } = require('./medico.routes');
const { criarEnfermeiroRoutes } = require('./enfermeiro.routes');
const { criarTriagemRoutes } = require('./triagem.routes');
const { criarPainelMedicoRoutes } = require('./painelMedico.routes');

/** Registro de todas as rotas. Toda rota nova usa autenticar + autorizar (RNF08). */
function registrarRotas(app, container, { prefixo = '/api' } = {}) {
  app.use(`${prefixo}/auth`, criarAuthRoutes(container));
  app.use(`${prefixo}/atendimentos`, criarAtendimentoRoutes(container));
  app.use(`${prefixo}/medicos`, criarMedicoRoutes(container));
  app.use(`${prefixo}/enfermeiros`, criarEnfermeiroRoutes(container));
  app.use(`${prefixo}/triagens`, criarTriagemRoutes(container));
  app.use(`${prefixo}/painel-medico`, criarPainelMedicoRoutes(container));
}

module.exports = { registrarRotas };
