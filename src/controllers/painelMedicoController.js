'use strict';

const { parseId } = require('../utils/parsers');

function criarPainelMedicoController({ painelMedicoService }) {
  return {
    async visualizar(req, res) {
      res.status(200).json(await painelMedicoService.visualizar(req.usuario));
    },

    async chamarProximo(req, res) {
      res.status(200).json(await painelMedicoService.chamarProximo(req.usuario));
    },

    async registrarPrescricao(req, res) {
      const atendimentoId = parseId(req.params.atendimentoId, 'atendimentoId');
      const prescricao = await painelMedicoService.registrarPrescricao(atendimentoId, req.body, req.usuario);
      res.status(201).json(prescricao);
    },

    async finalizar(req, res) {
      const atendimentoId = parseId(req.params.atendimentoId, 'atendimentoId');
      res.status(200).json(await painelMedicoService.finalizar(atendimentoId, req.usuario));
    },
  };
}

module.exports = { criarPainelMedicoController };
