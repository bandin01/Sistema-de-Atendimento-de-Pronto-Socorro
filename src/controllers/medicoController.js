'use strict';

const { criarProfissionalControllerBase } = require('./profissionalControllerBase');

function criarMedicoController({ medicoService }) {
  return criarProfissionalControllerBase({ service: medicoService });
}

module.exports = { criarMedicoController };
