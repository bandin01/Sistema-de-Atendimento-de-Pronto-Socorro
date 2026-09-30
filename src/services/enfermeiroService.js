'use strict';

const { PERFIS } = require('../config/perfis');
const { STATUS_ENFERMEIRO, CATEGORIA_ENFERMAGEM } = require('../config/dominio');
const { criarProfissionalServiceBase } = require('./profissionalServiceBase');

/** Regras específicas da equipe de enfermagem (RF17, RF22). */
function criarEnfermeiroService({ enfermeiroRepository, credencialRepository, transacao, hasher }) {
  const categorias = Object.values(CATEGORIA_ENFERMAGEM);

  return criarProfissionalServiceBase({
    repository: enfermeiroRepository,
    credencialRepository,
    transacao,
    hasher,
    config: {
      perfil: PERFIS.ENFERMAGEM,
      statusValidos: Object.values(STATUS_ENFERMEIRO),
      statusSelecionaveis: Object.values(STATUS_ENFERMEIRO),
      statusInativo: STATUS_ENFERMEIRO.INDISPONIVEL,

      validarCamposEspecificos: (v, d) => ({
        corenNumero: v.registroProfissional('corenNumero', d.corenNumero),
        corenUf: v.uf('corenUf', d.corenUf),
        categoria: d.categoria === undefined
          ? CATEGORIA_ENFERMAGEM.ENFERMEIRO
          : v.enumeracao('categoria', d.categoria, categorias),
        especialidade: v.texto('especialidade', d.especialidade, { obrigatorio: false, min: 3, max: 100 }),
      }),

      validarFiltrosEspecificos: (v, q) => ({
        categoria: v.enumeracao('categoria', q.categoria, categorias, { obrigatorio: false }),
      }),

      camposPublicosEspecificos: (r) => ({
        coren: `COREN-${r.corenUf} ${r.corenNumero}`,
        corenNumero: r.corenNumero,
        corenUf: r.corenUf,
        categoria: r.categoria,
        especialidade: r.especialidade,
      }),
    },
  });
}

module.exports = { criarEnfermeiroService };
