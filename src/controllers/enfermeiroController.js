'use strict';

const { criarProfissionalControllerBase } = require('./profissionalControllerBase');

function criarEnfermeiroController({ enfermeiroService }) {
  return criarProfissionalControllerBase({ service: enfermeiroService });
}

module.exports = { criarEnfermeiroController };
