'use strict';

const {
  NIVEL,
  POLITICA_PACIENTE,
  POLITICA_PROFISSIONAL,
  POLITICA_PROPRIO_REGISTRO,
  POLITICA_PADRAO,
} = require('../config/politicaMascaramento');

function mascararCpf(cpf, nivel) {
  if (!cpf) return null;
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return null;
  if (nivel === NIVEL.COMPLETO) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (nivel === NIVEL.PARCIAL) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  return null; // OCULTO ou nível desconhecido: falha fechada
}

function mascararRg(rg, nivel) {
  if (!rg) return null;
  const texto = String(rg);
  if (nivel === NIVEL.COMPLETO) return texto;
  if (nivel === NIVEL.PARCIAL) return `${'*'.repeat(Math.max(texto.length - 2, 3))}${texto.slice(-2)}`;
  return null;
}

function politicaDoPaciente(perfil) {
  return POLITICA_PACIENTE[perfil] || POLITICA_PADRAO;
}

function politicaDoProfissional(perfil, ehProprioRegistro) {
  if (ehProprioRegistro) return POLITICA_PROPRIO_REGISTRO;
  return POLITICA_PROFISSIONAL[perfil] || POLITICA_PADRAO;
}

function aplicarMascara({ cpf, rg }, politica) {
  return { cpf: mascararCpf(cpf, politica.cpf), rg: mascararRg(rg, politica.rg) };
}

module.exports = {
  mascararCpf,
  mascararRg,
  politicaDoPaciente,
  politicaDoProfissional,
  aplicarMascara,
};
