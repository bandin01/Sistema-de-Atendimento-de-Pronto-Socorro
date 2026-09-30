'use strict';

const { ErroValidacao } = require('../errors/erros');
const { UFS } = require('../config/dominio');

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_LOGIN = /^[a-z0-9._-]{3,60}$/;

function vazio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

function somenteDigitos(valor) {
  return String(valor).replace(/\D/g, '');
}

function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (quantidade) => {
    let soma = 0;
    for (let i = 0; i < quantidade; i += 1) soma += Number(cpf[i]) * (quantidade + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

function dataIsoValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const data = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().startsWith(texto) ? data : null;
}

function idadeEmAnos(dataNascimento, hoje = new Date()) {
  let idade = hoje.getUTCFullYear() - dataNascimento.getUTCFullYear();
  const aindaNaoFezAniversario =
    hoje.getUTCMonth() < dataNascimento.getUTCMonth() ||
    (hoje.getUTCMonth() === dataNascimento.getUTCMonth() && hoje.getUTCDate() < dataNascimento.getUTCDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

/**
 * Coletor de erros de validação: acumula TODOS os problemas de um payload
 * e lança um único ErroValidacao com a lista (o front mostra campo a campo).
 * Cada método devolve o valor já normalizado (ou null se opcional e vazio).
 */
function criarValidador() {
  const erros = [];
  const falhar = (campo, mensagem) => {
    erros.push({ campo, mensagem });
    return null;
  };

  const exigir = (campo, valor, obrigatorio) => {
    if (!vazio(valor)) return true;
    if (obrigatorio) falhar(campo, 'Campo obrigatório.');
    return false;
  };

  return {
    erros,

    texto(campo, valor, { obrigatorio = true, min = 1, max = 255 } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      if (typeof valor !== 'string') return falhar(campo, 'Deve ser um texto.');
      const limpo = valor.trim().replace(/\s+/g, ' ');
      if (limpo.length < min) return falhar(campo, `Deve ter ao menos ${min} caracteres.`);
      if (limpo.length > max) return falhar(campo, `Deve ter no máximo ${max} caracteres.`);
      return limpo;
    },

    inteiro(campo, valor, { obrigatorio = true, min, max } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const numero = typeof valor === 'string' ? Number(valor.trim()) : valor;
      if (!Number.isInteger(numero)) return falhar(campo, 'Deve ser um número inteiro.');
      if (min !== undefined && numero < min) return falhar(campo, `Deve ser no mínimo ${min}.`);
      if (max !== undefined && numero > max) return falhar(campo, `Deve ser no máximo ${max}.`);
      return numero;
    },

    decimal(campo, valor, { obrigatorio = true, min, max, casas = 1 } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const numero = typeof valor === 'string' ? Number(valor.trim().replace(',', '.')) : valor;
      if (typeof numero !== 'number' || !Number.isFinite(numero)) return falhar(campo, 'Deve ser um número.');
      if (min !== undefined && numero < min) return falhar(campo, `Deve ser no mínimo ${min}.`);
      if (max !== undefined && numero > max) return falhar(campo, `Deve ser no máximo ${max}.`);
      return Number(numero.toFixed(casas));
    },

    booleano(campo, valor, { obrigatorio = true } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      if (typeof valor !== 'boolean') return falhar(campo, 'Deve ser verdadeiro ou falso.');
      return valor;
    },

    enumeracao(campo, valor, permitidos, { obrigatorio = true } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const normalizado = String(valor).trim().toUpperCase();
      if (!permitidos.includes(normalizado)) {
        return falhar(campo, `Valor inválido. Use: ${permitidos.join(', ')}.`);
      }
      return normalizado;
    },

    cpf(campo, valor, { obrigatorio = true } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const digitos = somenteDigitos(valor);
      return cpfValido(digitos) ? digitos : falhar(campo, 'CPF inválido.');
    },

    rg(campo, valor, { obrigatorio = false } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const limpo = String(valor).toUpperCase().replace(/[^0-9X]/g, '');
      return /^[0-9X]{5,14}$/.test(limpo) ? limpo : falhar(campo, 'RG inválido.');
    },

    email(campo, valor, { obrigatorio = true } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const limpo = String(valor).trim().toLowerCase();
      if (limpo.length > 150 || !REGEX_EMAIL.test(limpo)) return falhar(campo, 'E-mail inválido.');
      return limpo;
    },

    telefone(campo, valor, { obrigatorio = false } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const digitos = somenteDigitos(valor);
      return /^\d{10,11}$/.test(digitos) ? digitos : falhar(campo, 'Telefone deve ter DDD + número (10 ou 11 dígitos).');
    },

    dataNascimento(campo, valor, { obrigatorio = true, idadeMinima = 0, idadeMaxima = 120 } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const data = dataIsoValida(String(valor).trim());
      if (!data) return falhar(campo, 'Data inválida. Use o formato AAAA-MM-DD.');
      const idade = idadeEmAnos(data);
      if (idade < idadeMinima) return falhar(campo, `Idade mínima: ${idadeMinima} anos.`);
      if (idade > idadeMaxima) return falhar(campo, 'Data de nascimento fora do intervalo aceito.');
      return String(valor).trim();
    },

    uf(campo, valor, { obrigatorio = true } = {}) {
      return this.enumeracao(campo, valor, UFS, { obrigatorio });
    },

    registroProfissional(campo, valor, { obrigatorio = true } = {}) {
      if (!exigir(campo, valor, obrigatorio)) return null;
      const digitos = somenteDigitos(valor).replace(/^0+(?=\d)/, '');
      return /^\d{1,10}$/.test(digitos) ? digitos : falhar(campo, 'Número de registro inválido (apenas dígitos).');
    },

    login(campo, valor) {
      if (!exigir(campo, valor, true)) return null;
      const limpo = String(valor).trim().toLowerCase();
      return REGEX_LOGIN.test(limpo)
        ? limpo
        : falhar(campo, 'Login deve ter 3 a 60 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
    },

    senhaNova(campo, valor) {
      if (!exigir(campo, valor, true)) return null;
      if (typeof valor !== 'string' || valor.length < 8 || valor.length > 72) {
        return falhar(campo, 'Senha deve ter entre 8 e 72 caracteres.');
      }
      if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) {
        return falhar(campo, 'Senha deve conter letras e números.');
      }
      return valor;
    },

    adicionarErro(campo, mensagem) {
      falhar(campo, mensagem);
    },

    garantirValido(mensagem = 'Dados inválidos.') {
      if (erros.length > 0) throw new ErroValidacao(mensagem, erros);
    },
  };
}

module.exports = { criarValidador, cpfValido, somenteDigitos };
