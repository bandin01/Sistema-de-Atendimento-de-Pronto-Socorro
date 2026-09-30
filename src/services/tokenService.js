'use strict';

const jwt = require('jsonwebtoken');

/**
 * Adaptador de JWT. Isolado para que services/middlewares não dependam da lib (DIP).
 * O token identifica o profissional pelo par (perfil, id): os ids são por
 * tabela (recepcionistas, medicos, enfermeiros), então o perfil faz parte da chave.
 */
function criarTokenService({ segredo, expiraEm = '8h' }) {
  if (!segredo || segredo.length < 32) {
    throw new Error('JWT_SECRET ausente ou curto demais (mínimo 32 caracteres).');
  }

  return {
    expiraEm,

    gerar({ id, perfil }) {
      return jwt.sign({ perfil }, segredo, {
        subject: String(id),
        expiresIn: expiraEm,
        algorithm: 'HS256',
      });
    },

    verificar(token) {
      return jwt.verify(token, segredo, { algorithms: ['HS256'] });
    },
  };
}

module.exports = { criarTokenService };
