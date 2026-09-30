'use strict';

const { ErroAutenticacao, ErroAcessoNegado } = require('../errors/erros');

/**
 * RBAC por permissão (RNF08 / RNF10).
 * Uso na rota: autorizar('TRIAGEM_REGISTRAR')
 *
 * Permissão inexistente derruba a aplicação NA INICIALIZAÇÃO (falha fechada):
 * um erro de digitação nunca vira rota liberada.
 */
function criarMiddlewareAutorizacao({ permissoes }) {
  return function autorizar(nomePermissao) {
    const perfisPermitidos = permissoes[nomePermissao];
    if (!Array.isArray(perfisPermitidos)) {
      throw new Error(`Permissão RBAC desconhecida: "${nomePermissao}". Cadastre-a em config/permissoes.js.`);
    }

    return function verificarPermissao(req, res, next) {
      if (!req.usuario) return next(new ErroAutenticacao());
      if (!perfisPermitidos.includes(req.usuario.perfil)) return next(new ErroAcessoNegado());
      return next();
    };
  };
}

module.exports = { criarMiddlewareAutorizacao };
