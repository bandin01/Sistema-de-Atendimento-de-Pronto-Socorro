'use strict';

const { ErroValidacao } = require('../errors/erros');

/** Converte parâmetro de rota em id inteiro positivo (parsing de request). */
function parseId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero <= 0) {
    throw new ErroValidacao('Identificador inválido.', [{ campo, mensagem: 'Deve ser um inteiro positivo.' }]);
  }
  return numero;
}

/** Número de atendimento da URL ("at007" → "AT007"), no formato gerado pelo banco (RF02). */
function parseNumeroAtendimento(valor) {
  const numero = String(valor || '').trim().toUpperCase();
  if (!/^AT\d{3,9}$/.test(numero)) {
    throw new ErroValidacao('Número de atendimento inválido.', [{ campo: 'numero', mensagem: 'Use o formato AT000.' }]);
  }
  return numero;
}

/** Query string "true"/"false" → boolean; ausente → undefined. */
function parseBooleanoQuery(valor) {
  if (valor === undefined) return undefined;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new ErroValidacao('Filtro inválido.', [{ campo: 'ativo', mensagem: 'Use true ou false.' }]);
}

module.exports = { parseId, parseNumeroAtendimento, parseBooleanoQuery };
