'use strict';

const { ErroAplicacao } = require('../errors/erros');

const SQLSTATE_REGRA_TRIGGER = '45000';

function responder(res, statusHttp, codigo, mensagem, detalhes) {
  const corpo = { erro: { codigo, mensagem } };
  if (detalhes) corpo.erro.detalhes = detalhes;
  return res.status(statusHttp).json(corpo);
}

function criarTratadorErros({ logger = console } = {}) {
  // eslint-disable-next-line no-unused-vars
  return function tratarErros(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof ErroAplicacao) {
      return responder(res, err.statusHttp, err.codigo, err.message, err.detalhes);
    }

    if (err.type === 'entity.parse.failed') {
      return responder(res, 400, 'JSON_INVALIDO', 'Corpo da requisição não é um JSON válido.');
    }

    // Regras garantidas por trigger (SIGNAL SQLSTATE '45000'): a mensagem foi escrita por nós.
    if (err.sqlState === SQLSTATE_REGRA_TRIGGER) {
      return responder(res, 422, 'REGRA_DE_NEGOCIO', err.sqlMessage);
    }

    if (err.code === 'ER_DUP_ENTRY') {
      return responder(res, 409, 'CONFLITO', 'Registro duplicado.');
    }

    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.code === 'ER_NO_REFERENCED_ROW_2') {
      return responder(res, 422, 'REGRA_DE_NEGOCIO', 'Os dados violam uma regra de integridade.');
    }

    // Nunca devolver SQL, stack ou dados internos ao cliente.
    logger.error('[erro não tratado]', err);
    return responder(res, 500, 'ERRO_INTERNO', 'Erro interno. Tente novamente em instantes.');
  };
}

function rotaNaoEncontrada(req, res) {
  return responder(res, 404, 'ROTA_NAO_ENCONTRADA', 'Rota não encontrada.');
}

module.exports = { criarTratadorErros, rotaNaoEncontrada };
