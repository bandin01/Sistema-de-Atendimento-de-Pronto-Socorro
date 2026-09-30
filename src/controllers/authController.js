'use strict';

/** Controller: só lê a requisição e escreve a resposta. Regras ficam no service. */
function criarAuthController({ authService }) {
  return {
    async login(req, res) {
      const resultado = await authService.login(req.body);
      res.status(200).json(resultado);
    },

    async sessaoAtual(req, res) {
      res.status(200).json(await authService.sessaoAtual(req.usuario));
    },
  };
}

module.exports = { criarAuthController };
