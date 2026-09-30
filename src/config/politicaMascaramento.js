'use strict';

const { PERFIS } = require('./perfis');

/**
 * Política de exibição de documentos por perfil (RNF09 / RNF11).
 *
 *   COMPLETO → 12345678909       (formatado: 123.456.789-09)
 *   PARCIAL  → ***.456.789-**
 *   OCULTO   → null
 *
 * Perfil desconhecido cai em OCULTO (falha fechada).
 */
const NIVEL = Object.freeze({ COMPLETO: 'COMPLETO', PARCIAL: 'PARCIAL', OCULTO: 'OCULTO' });

const POLITICA_PACIENTE = Object.freeze({
  [PERFIS.RECEPCAO]: Object.freeze({ cpf: NIVEL.COMPLETO, rg: NIVEL.COMPLETO }),
  [PERFIS.ENFERMAGEM]: Object.freeze({ cpf: NIVEL.PARCIAL, rg: NIVEL.OCULTO }),
  [PERFIS.MEDICO]: Object.freeze({ cpf: NIVEL.PARCIAL, rg: NIVEL.OCULTO }),
});

/** Documentos de profissionais: quem não é o dono do registro nunca vê completo. */
const POLITICA_PROFISSIONAL = Object.freeze({
  [PERFIS.RECEPCAO]: Object.freeze({ cpf: NIVEL.PARCIAL, rg: NIVEL.PARCIAL }),
  [PERFIS.ENFERMAGEM]: Object.freeze({ cpf: NIVEL.OCULTO, rg: NIVEL.OCULTO }),
  [PERFIS.MEDICO]: Object.freeze({ cpf: NIVEL.OCULTO, rg: NIVEL.OCULTO }),
});

const POLITICA_PROPRIO_REGISTRO = Object.freeze({ cpf: NIVEL.COMPLETO, rg: NIVEL.COMPLETO });
const POLITICA_PADRAO = Object.freeze({ cpf: NIVEL.OCULTO, rg: NIVEL.OCULTO });

module.exports = {
  NIVEL,
  POLITICA_PACIENTE,
  POLITICA_PROFISSIONAL,
  POLITICA_PROPRIO_REGISTRO,
  POLITICA_PADRAO,
};
