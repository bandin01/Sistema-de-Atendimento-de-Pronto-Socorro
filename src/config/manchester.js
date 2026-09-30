'use strict';

/**
 * Protocolo de Manchester (RF08, RF09).
 * A ORDEM deste array define a ordem do painel médico: a query do
 * atendimentoRepository usa FIELD() com estes códigos. Espelha o ENUM
 * triagens.classificacao_manchester (001_schema_base).
 *
 * vitaisOpcionais: proposta RN18.4 — na emergência o paciente vai direto ao
 * médico e os sinais vitais podem ser registrados depois.
 */
const CLASSIFICACOES_MANCHESTER = Object.freeze([
  Object.freeze({ codigo: 'VERMELHO', descricao: 'Emergência', tempoAlvoMin: 0, vitaisOpcionais: true }),
  Object.freeze({ codigo: 'LARANJA', descricao: 'Muito urgente', tempoAlvoMin: 10, vitaisOpcionais: false }),
  Object.freeze({ codigo: 'AMARELO', descricao: 'Urgente', tempoAlvoMin: 60, vitaisOpcionais: false }),
  Object.freeze({ codigo: 'VERDE', descricao: 'Pouco urgente', tempoAlvoMin: 120, vitaisOpcionais: false }),
  Object.freeze({ codigo: 'AZUL', descricao: 'Não urgente', tempoAlvoMin: 240, vitaisOpcionais: false }),
]);

const CODIGOS_MANCHESTER = Object.freeze(CLASSIFICACOES_MANCHESTER.map((c) => c.codigo));

function buscarClassificacao(codigo) {
  return CLASSIFICACOES_MANCHESTER.find((c) => c.codigo === codigo) || null;
}

module.exports = { CLASSIFICACOES_MANCHESTER, CODIGOS_MANCHESTER, buscarClassificacao };
