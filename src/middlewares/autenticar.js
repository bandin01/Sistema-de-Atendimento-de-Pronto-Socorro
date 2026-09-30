'use strict';

const { PERFIS } = require('../config/perfis');
const { ErroAutenticacao } = require('../errors/erros');

const PERFIS_VALIDOS = Object.values(PERFIS);

/**
 * Valida o Bearer token e recarrega o profissional ATUAL do banco, na tabela
 * do perfil do token. Se ele for desativado, o acesso é cortado na hora (RNF08).
 */
function criarMiddlewareAutenticacao({ tokenService, credencialRepository }) {
  return async function autenticar(req, res, next) {
    try {
      const [tipo, token] = (req.headers.authorization || '').split(' ');
      if (tipo !== 'Bearer' || !token) throw new ErroAutenticacao('Faça login para continuar.');

      let payload;
      try {
        payload = tokenService.verificar(token);
      } catch (_) {
        throw new ErroAutenticacao('Sessão inválida ou expirada. Faça login novamente.');
      }
      if (!PERFIS_VALIDOS.includes(payload.perfil)) {
        throw new ErroAutenticacao('Sessão inválida ou expirada. Faça login novamente.');
      }

      const credencial = await credencialRepository.buscarPorPerfilEId(payload.perfil, Number(payload.sub));
      if (!credencial || !credencial.ativo) throw new ErroAutenticacao('Usuário inativo ou inexistente.');

      req.usuario = Object.freeze({ id: credencial.id, login: credencial.login, perfil: credencial.perfil });
      return next();
    } catch (erro) {
      return next(erro);
    }
  };
}

module.exports = { criarMiddlewareAutenticacao };
