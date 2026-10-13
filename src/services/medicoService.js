'use strict';

const { PERFIS } = require('../config/perfis');
const { STATUS_MEDICO } = require('../config/dominio');
const { criarProfissionalServiceBase } = require('./profissionalServiceBase');

/**
 * Regras específicas de médicos (RF16, RF22).
 * O status operacional fica na própria tabela medicos (status_operacional).
 * EM_CONSULTA é controlado pelo painelMedicoService: o médico não escolhe
 * esse status nem sai dele sem registrar o desfecho da consulta.
 */
function criarMedicoService({ medicoRepository, credencialRepository, transacao, hasher }) {
  return criarProfissionalServiceBase({
    repository: medicoRepository,
    credencialRepository,
    transacao,
    hasher,
    config: {
      perfil: PERFIS.MEDICO,
      statusValidos: Object.values(STATUS_MEDICO),
      statusSelecionaveis: [STATUS_MEDICO.EM_PLANTAO, STATUS_MEDICO.PAUSA, STATUS_MEDICO.FOLGA, STATUS_MEDICO.LICENCA],
      statusInativo: STATUS_MEDICO.FOLGA,

      validarCamposEspecificos: (v, d) => ({
        crmNumero: v.registroProfissional('crmNumero', d.crmNumero),
        crmUf: v.uf('crmUf', d.crmUf),
        especialidade: v.texto('especialidade', d.especialidade, { min: 3, max: 100 }),
      }),

      camposPublicosEspecificos: (r) => ({
        crm: `CRM-${r.crmUf} ${r.crmNumero}`,
        crmNumero: r.crmNumero,
        crmUf: r.crmUf,
        especialidade: r.especialidade,
      }),

      motivoBloqueioDisponibilidade: (r) => (
        r.statusDisponibilidade === STATUS_MEDICO.EM_CONSULTA
          ? 'Registre o desfecho da consulta em andamento antes de alterar seu status.'
          : null
      ),

      motivoBloqueioDesativacao: (r) => (
        r.statusDisponibilidade === STATUS_MEDICO.EM_CONSULTA
          ? 'Médico com consulta em andamento não pode ser desativado.'
          : null
      ),
    },
  });
}

module.exports = { criarMedicoService };
