'use strict';

const { parseId, parseBooleanoQuery } = require('../utils/parsers');

/**
 * Handlers HTTP comuns a médicos e enfermeiros. Recebe o service por
 * injeção; não conhece banco nem regra de negócio.
 */
function criarProfissionalControllerBase({ service }) {
  return {
    async cadastrar(req, res) {
      const profissional = await service.cadastrar(req.body, req.usuario);
      res.status(201).location(`${req.baseUrl}/${profissional.id}`).json(profissional);
    },

    async listar(req, res) {
      const consulta = {
        status: req.query.status,
        especialidade: req.query.especialidade,
        categoria: req.query.categoria,
        ativo: parseBooleanoQuery(req.query.ativo),
      };
      res.status(200).json(await service.listar(consulta, req.usuario));
    },

    async detalhar(req, res) {
      res.status(200).json(await service.detalhar(parseId(req.params.id), req.usuario));
    },

    async meuPerfil(req, res) {
      res.status(200).json(await service.meuPerfil(req.usuario));
    },

    async alterarMinhaDisponibilidade(req, res) {
      res.status(200).json(await service.alterarMinhaDisponibilidade(req.body, req.usuario));
    },

    async alterarSituacaoCadastro(req, res) {
      res.status(200).json(await service.alterarSituacaoCadastro(parseId(req.params.id), req.body, req.usuario));
    },
  };
}

module.exports = { criarProfissionalControllerBase };
