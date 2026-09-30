'use strict';

/**
 * Erros de aplicação. Services lançam estes erros; o middleware tratarErros
 * converte cada um no status HTTP correto. Controllers não fazem try/catch.
 */
class ErroAplicacao extends Error {
  constructor(mensagem, { statusHttp = 500, codigo = 'ERRO_INTERNO', detalhes } = {}) {
    super(mensagem);
    this.name = this.constructor.name;
    this.statusHttp = statusHttp;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

class ErroValidacao extends ErroAplicacao {
  constructor(mensagem = 'Dados inválidos.', detalhes) {
    super(mensagem, { statusHttp: 400, codigo: 'VALIDACAO', detalhes });
  }
}

class ErroAutenticacao extends ErroAplicacao {
  constructor(mensagem = 'Autenticação necessária.') {
    super(mensagem, { statusHttp: 401, codigo: 'NAO_AUTENTICADO' });
  }
}

class ErroAcessoNegado extends ErroAplicacao {
  constructor(mensagem = 'Seu perfil não tem permissão para esta ação.') {
    super(mensagem, { statusHttp: 403, codigo: 'ACESSO_NEGADO' });
  }
}

class ErroNaoEncontrado extends ErroAplicacao {
  constructor(mensagem = 'Recurso não encontrado.') {
    super(mensagem, { statusHttp: 404, codigo: 'NAO_ENCONTRADO' });
  }
}

class ErroConflito extends ErroAplicacao {
  constructor(mensagem, detalhes) {
    super(mensagem, { statusHttp: 409, codigo: 'CONFLITO', detalhes });
  }
}

class ErroRegraNegocio extends ErroAplicacao {
  constructor(mensagem, detalhes) {
    super(mensagem, { statusHttp: 422, codigo: 'REGRA_DE_NEGOCIO', detalhes });
  }
}

module.exports = {
  ErroAplicacao,
  ErroValidacao,
  ErroAutenticacao,
  ErroAcessoNegado,
  ErroNaoEncontrado,
  ErroConflito,
  ErroRegraNegocio,
};
