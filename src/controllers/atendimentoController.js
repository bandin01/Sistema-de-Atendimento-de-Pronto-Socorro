'use strict';

const { parseNumeroAtendimento } = require('../utils/parsers');

function criarAtendimentoController({ atendimentoService }) {
  return {
    async abrir(req, res) {
      const resultado = await atendimentoService.abrir(req.body, req.usuario);
      res.status(201)
        .location(`${req.baseUrl}/${resultado.atendimento.numeroAtendimento}`)
        .json(resultado);
    },

    async consultar(req, res) {
      res.status(200).json(await atendimentoService.consultar(parseNumeroAtendimento(req.params.numero), req.usuario));
    },

    async alterarPaciente(req, res) {
      const numero = parseNumeroAtendimento(req.params.numero);
      res.status(200).json(await atendimentoService.alterarPaciente(numero, req.body, req.usuario));
    },

    async cancelar(req, res) {
      res.status(200).json(await atendimentoService.cancelar(parseNumeroAtendimento(req.params.numero), req.usuario));
    },
  };
}

module.exports = { criarAtendimentoController };
