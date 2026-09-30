'use strict';

const { STATUS_ATENDIMENTO, STATUS_MEDICO } = require('../config/dominio');
const { CLASSIFICACOES_MANCHESTER } = require('../config/manchester');
const { PERFIS } = require('../config/perfis');
const {
  ErroAcessoNegado, ErroConflito, ErroNaoEncontrado, ErroRegraNegocio,
} = require('../errors/erros');
const { criarValidador } = require('../utils/validador');
const { montarPaciente, montarTriagem } = require('./apresentacaoClinica');

const VIAS_ADMINISTRACAO = Object.freeze([
  'ORAL', 'SUBLINGUAL', 'INTRAVENOSA', 'INTRAMUSCULAR', 'SUBCUTANEA',
  'INALATORIA', 'NASAL', 'TOPICA', 'OFTALMICA', 'RETAL', 'OUTRA',
]);

/**
 * Painel médico e atendimento (RF09–RF13, RF15, RF19–RF21).
 *
 * Ordem de bloqueio SEMPRE: médico → atendimento. Manter essa ordem em todos
 * os fluxos evita deadlock entre "chamar próximo" e "finalizar".
 */
function criarPainelMedicoService({
  atendimentoRepository, medicoRepository, prescricaoRepository, historicoStatusRepository, transacao,
}) {
  async function obterMedico(solicitante, conexao, opcoes) {
    if (solicitante.perfil !== PERFIS.MEDICO) throw new ErroAcessoNegado();
    const medico = await medicoRepository.buscarPorId(solicitante.id, conexao, opcoes);
    if (!medico) throw new ErroNaoEncontrado('Cadastro de médico não encontrado.');
    if (!medico.ativo) throw new ErroRegraNegocio('Cadastro de médico inativo.');
    return medico;
  }

  function garantirAtendimentoDoMedico(atendimento, medico) {
    if (!atendimento) throw new ErroNaoEncontrado('Atendimento não encontrado.');
    if (atendimento.status === STATUS_ATENDIMENTO.FINALIZADO) {
      throw new ErroRegraNegocio('Atendimento finalizado não pode ser alterado.');
    }
    if (atendimento.status !== STATUS_ATENDIMENTO.EM_ATENDIMENTO_MEDICO) {
      throw new ErroRegraNegocio('Este atendimento não está em atendimento médico.');
    }
    if (atendimento.medicoId !== medico.id) {
      throw new ErroAcessoNegado('Somente o médico responsável pode alterar este atendimento.');
    }
  }

  function montarItemFila(linha, indice, perfil) {
    const triagem = montarTriagem(linha);
    return {
      posicao: indice + 1,
      id: linha.id,
      numeroAtendimento: linha.numeroAtendimento,
      minutosEspera: linha.minutosEspera,
      excedeuTempoAlvo: linha.minutosEspera > triagem.classificacao.tempoAlvoMin,
      paciente: montarPaciente(linha, perfil),
      triagem,
    };
  }

  function montarEmAndamento(linha, prescricoes, perfil) {
    if (!linha) return null;
    return {
      id: linha.id,
      numeroAtendimento: linha.numeroAtendimento,
      confirmadoMedicoEm: linha.confirmadoMedicoEm,
      paciente: montarPaciente(linha, perfil),
      triagem: montarTriagem(linha),
      prescricoes,
    };
  }

  function validarPrescricao(dados) {
    const d = dados && typeof dados === 'object' ? dados : {};
    const v = criarValidador();
    const prescricao = {
      medicamento: v.texto('medicamento', d.medicamento, { min: 2, max: 150 }),
      dosagem: v.texto('dosagem', d.dosagem, { min: 1, max: 60 }),
      viaAdministracao: v.enumeracao('viaAdministracao', d.viaAdministracao, VIAS_ADMINISTRACAO),
      frequencia: v.texto('frequencia', d.frequencia, { min: 2, max: 60 }),
      observacoes: v.texto('observacoes', d.observacoes, { obrigatorio: false, max: 500 }),
    };
    v.garantirValido('Revise os dados da prescrição.');
    return prescricao;
  }

  return {
    viasAdministracao: VIAS_ADMINISTRACAO,

    async visualizar(solicitante) {
      const medico = await obterMedico(solicitante);
      const [linhasFila, linhaEmAndamento] = await Promise.all([
        atendimentoRepository.listarFilaMedica(),
        atendimentoRepository.buscarEmAndamentoDoMedico(medico.id),
      ]);

      const prescricoes = linhaEmAndamento
        ? await prescricaoRepository.listarPorAtendimento(linhaEmAndamento.id)
        : [];

      const fila = linhasFila.map((linha, i) => montarItemFila(linha, i, solicitante.perfil));
      const resumo = CLASSIFICACOES_MANCHESTER.map((c) => ({
        codigo: c.codigo,
        descricao: c.descricao,
        tempoAlvoMin: c.tempoAlvoMin,
        quantidade: fila.filter((item) => item.triagem.classificacao.codigo === c.codigo).length,
      }));

      return {
        medico: {
          id: medico.id,
          nome: medico.nome,
          crm: `CRM-${medico.crmUf} ${medico.crmNumero}`,
          especialidade: medico.especialidade,
          statusDisponibilidade: medico.statusDisponibilidade,
        },
        emAndamento: montarEmAndamento(linhaEmAndamento, prescricoes, solicitante.perfil),
        resumo,
        fila,
        viasAdministracao: VIAS_ADMINISTRACAO,
        atualizadoEm: new Date().toISOString(),
      };
    },

    /**
     * Chama o paciente de maior prioridade (RF09/RF19/RF20).
     * O médico não escolhe paciente fora da ordem: a prioridade é garantida no back-end.
     */
    async chamarProximo(solicitante) {
      return transacao.executar(async (conexao) => {
        const medico = await obterMedico(solicitante, conexao, { bloquear: true });

        if (medico.statusDisponibilidade === STATUS_MEDICO.EM_ATENDIMENTO) {
          throw new ErroConflito('Você já tem um atendimento em andamento. Finalize-o antes de chamar o próximo paciente.');
        }
        if (medico.statusDisponibilidade !== STATUS_MEDICO.DISPONIVEL) {
          throw new ErroRegraNegocio('Altere sua disponibilidade para "Disponível" para chamar pacientes.');
        }

        const candidatos = await atendimentoRepository.listarCandidatosFilaMedica(conexao);
        if (candidatos.length === 0) {
          return { atendimento: null, mensagem: 'Nenhum paciente aguardando atendimento médico.' };
        }

        let atendimentoId = null;
        for (const candidatoId of candidatos) {
          // eslint-disable-next-line no-await-in-loop -- tentativa sequencial é intencional
          if (await atendimentoRepository.vincularMedico(candidatoId, medico.id, conexao) === 1) {
            atendimentoId = candidatoId;
            break;
          }
        }
        if (atendimentoId === null) {
          throw new ErroConflito('Outros médicos chamaram os próximos pacientes neste instante. Tente novamente.');
        }

        await medicoRepository.atualizarDisponibilidade(medico.id, STATUS_MEDICO.EM_ATENDIMENTO, conexao);
        await historicoStatusRepository.registrar({
          atendimentoId,
          statusAnterior: STATUS_ATENDIMENTO.AGUARDANDO_MEDICO,
          statusNovo: STATUS_ATENDIMENTO.EM_ATENDIMENTO_MEDICO,
          responsavel: solicitante,
        }, conexao);

        const linha = await atendimentoRepository.buscarEmAndamentoDoMedico(medico.id, conexao);
        return { atendimento: montarEmAndamento(linha, [], solicitante.perfil) };
      });
    },

    async registrarPrescricao(atendimentoId, dados, solicitante) {
      const prescricao = validarPrescricao(dados);

      return transacao.executar(async (conexao) => {
        const medico = await obterMedico(solicitante, conexao);
        const atendimento = await atendimentoRepository.buscarPorId(atendimentoId, conexao, { bloquear: true });
        garantirAtendimentoDoMedico(atendimento, medico);

        const id = await prescricaoRepository.criar({ ...prescricao, atendimentoId, medicoId: medico.id }, conexao);
        return prescricaoRepository.buscarPorId(id, conexao);
      });
    },

    async finalizar(atendimentoId, solicitante) {
      return transacao.executar(async (conexao) => {
        const medico = await obterMedico(solicitante, conexao, { bloquear: true });
        const atendimento = await atendimentoRepository.buscarPorId(atendimentoId, conexao, { bloquear: true });
        garantirAtendimentoDoMedico(atendimento, medico);

        if (await atendimentoRepository.finalizar(atendimentoId, medico.id, conexao) !== 1) {
          throw new ErroConflito('Não foi possível finalizar: o atendimento foi alterado. Recarregue o painel.');
        }
        await medicoRepository.atualizarDisponibilidade(medico.id, STATUS_MEDICO.DISPONIVEL, conexao);
        await historicoStatusRepository.registrar({
          atendimentoId,
          statusAnterior: STATUS_ATENDIMENTO.EM_ATENDIMENTO_MEDICO,
          statusNovo: STATUS_ATENDIMENTO.FINALIZADO,
          responsavel: solicitante,
        }, conexao);

        return {
          id: atendimento.id,
          numeroAtendimento: atendimento.numeroAtendimento,
          status: STATUS_ATENDIMENTO.FINALIZADO,
        };
      });
    },
  };
}

module.exports = { criarPainelMedicoService, VIAS_ADMINISTRACAO };
