'use strict';

const { parseId } = require('../utils/parsers');

function criarTriagemController({ triagemService }) {
  return {
    async listarFila(req, res) {
      res.status(200).json(await triagemService.listarFila(req.usuario));
    },

    async registrar(req, res) {
      const atendimentoId = parseId(req.body && req.body.atendimentoId, 'atendimentoId');
      const resultado = await triagemService.registrar(atendimentoId, req.body, req.usuario);
      res.status(201).json(resultado);
    },
  };
}

module.exports = { criarTriagemController };
