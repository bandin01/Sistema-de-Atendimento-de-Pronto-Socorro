'use strict';

const { buscarClassificacao } = require('../config/manchester');
const { aplicarMascara, politicaDoPaciente } = require('../utils/mascaramento');

/**
 * Monta os objetos de resposta de paciente/triagem a partir das linhas do
 * repository. A máscara de CPF/RG é aplicada AQUI, dentro do service, para
 * que nenhum controller consiga devolver documento sem máscara (RNF09).
 */
function montarPaciente(linha, perfilSolicitante) {
  const documentos = aplicarMascara(
    { cpf: linha.pacienteCpf, rg: linha.pacienteRg },
    politicaDoPaciente(perfilSolicitante),
  );
  return {
    id: linha.pacienteId,
    nome: linha.pacienteNome,
    idade: linha.pacienteIdade,
    cpf: documentos.cpf,
    rg: documentos.rg,
  };
}

function montarClassificacao(codigo) {
  const c = buscarClassificacao(codigo);
  return c ? { codigo: c.codigo, descricao: c.descricao, tempoAlvoMin: c.tempoAlvoMin } : null;
}

function montarTriagem(linha) {
  return {
    id: linha.triagemId,
    classificacao: montarClassificacao(linha.classificacao),
    queixaPrincipal: linha.queixaPrincipal,
    sinaisVitais: {
      pressaoSistolica: linha.pressaoSistolica,
      pressaoDiastolica: linha.pressaoDiastolica,
      frequenciaCardiaca: linha.frequenciaCardiaca,
      frequenciaRespiratoria: linha.frequenciaRespiratoria,
      temperatura: linha.temperatura,
      saturacaoO2: linha.saturacaoO2,
      glicemia: linha.glicemia,
      escalaDor: linha.escalaDor,
    },
    observacoes: linha.observacoesTriagem,
    realizadaEm: linha.triadoEm,
    enfermeiroNome: linha.enfermeiroNome,
  };
}

module.exports = { montarPaciente, montarClassificacao, montarTriagem };
