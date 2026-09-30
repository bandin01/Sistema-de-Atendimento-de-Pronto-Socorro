'use strict';

/**
 * Encaminha erros de handlers async para o middleware de erros.
 * Necessário no Express 4 (no Express 5 é redundante, mas inofensivo).
 */
function asyncHandler(handler) {
  return function handlerComTratamento(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
