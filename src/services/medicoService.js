'use strict';

const { PERFIS } = require('../config/perfis');
const { STATUS_MEDICO } = require('../config/dominio');
const { criarProfissionalServiceBase } = require('./profissionalServiceBase');

/**
 * Regras específicas de médicos (RF16, RF22).
 * EM_ATENDIMENTO é controlado pelo painelMedicoService: o médico não escolhe
 * esse status nem sai dele sem finalizar o atendimento.
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
      statusSelecionaveis: [STATUS_MEDICO.DISPONIVEL, STATUS_MEDICO.PAUSA, STATUS_MEDICO.INDISPONIVEL],
      statusInativo: STATUS_MEDICO.INDISPONIVEL,

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
        r.statusDisponibilidade === STATUS_MEDICO.EM_ATENDIMENTO
          ? 'Finalize o atendimento em andamento antes de alterar sua disponibilidade.'
          : null
      ),

      motivoBloqueioDesativacao: (r) => (
        r.statusDisponibilidade === STATUS_MEDICO.EM_ATENDIMENTO
          ? 'Médico com atendimento em andamento não pode ser desativado.'
          : null
      ),
    },
  });
}

module.exports = { criarMedicoService };
