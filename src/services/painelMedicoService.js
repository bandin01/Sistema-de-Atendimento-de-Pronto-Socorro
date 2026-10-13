'use strict';

const {
  STATUS_ATENDIMENTO, ETAPA_ATENDIMENTO, TIPO_DESFECHO, STATUS_MEDICO,
} = require('../config/dominio');
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

const TIPOS_DESFECHO = Object.freeze(Object.values(TIPO_DESFECHO));

const ROTULO_DESFECHO = Object.freeze({
  [TIPO_DESFECHO.PRESCRICAO]: 'alta com prescrição',
  [TIPO_DESFECHO.EXAMES]: 'alta com pedido de exames',
  [TIPO_DESFECHO.ENCAMINHAMENTO]: 'encaminhamento',
  [TIPO_DESFECHO.ALTA]: 'alta',
});

/**
 * Painel médico, etapas Consulta e Desfecho (RF09–RF13, RF15, RF19–RF21, RF24).
 *
 * Ordem de bloqueio SEMPRE: médico → atendimento. Manter essa ordem em todos
 * os fluxos evita deadlock entre "chamar próximo" e "finalizar".
 */
function criarPainelMedicoService({
  atendimentoRepository, consultaRepository, desfechoRepository, medicoRepository, prescricaoRepository,
  historicoStatusRepository, historicoEtapasRepository, transacao,
}) {
  async function obterMedico(solicitante, conexao, opcoes) {
    if (solicitante.perfil !== PERFIS.MEDICO) throw new ErroAcessoNegado();
    const medico = await medicoRepository.buscarPorId(solicitante.id, conexao, opcoes);
    if (!medico) throw new ErroNaoEncontrado('Cadastro de médico não encontrado.');
    if (!medico.ativo) throw new ErroRegraNegocio('Cadastro de médico inativo.');
    return medico;
  }

  function garantirConsultaDoMedico(atendimento, medico) {
    if (!atendimento) throw new ErroNaoEncontrado('Atendimento não encontrado.');
    if (atendimento.status === STATUS_ATENDIMENTO.FINALIZADO) {
      throw new ErroRegraNegocio('Atendimento finalizado não pode ser alterado.');
    }
    if (atendimento.status !== STATUS_ATENDIMENTO.EM_CONSULTA) {
      throw new ErroRegraNegocio('Este atendimento não está em consulta.');
    }
    if (atendimento.medicoId !== medico.id) {
      throw new ErroAcessoNegado('Somente o médico responsável pela consulta pode alterar este atendimento.');
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

  /** RF24: desfecho obrigatório; destino só (e sempre) no encaminhamento. */
  function validarDesfecho(dados) {
    const d = dados && typeof dados === 'object' ? dados : {};
    const v = criarValidador();
    const tipo = v.enumeracao('tipoDesfecho', d.tipoDesfecho, TIPOS_DESFECHO);
    const desfecho = {
      tipo,
      descricao: v.texto('descricao', d.descricao, { min: 3, max: 500 }),
      destinoEncaminhamento: tipo === TIPO_DESFECHO.ENCAMINHAMENTO
        ? v.texto('destinoEncaminhamento', d.destinoEncaminhamento, { min: 3, max: 150 })
        : null,
    };
    v.garantirValido('Revise o desfecho do atendimento.');
    return desfecho;
  }

  function descreverDesfecho(desfecho, medico) {
    const destino = desfecho.destinoEncaminhamento ? ` para ${desfecho.destinoEncaminhamento}` : '';
    return `Desfecho registrado por ${medico.nome}: ${ROTULO_DESFECHO[desfecho.tipo]}${destino}.`;
  }

  return {
    viasAdministracao: VIAS_ADMINISTRACAO,
    tiposDesfecho: TIPOS_DESFECHO,

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
        tiposDesfecho: TIPOS_DESFECHO,
        atualizadoEm: new Date().toISOString(),
      };
    },

    /**
     * Chama o paciente de maior prioridade e abre a Consulta (RF09/RF19/RF20).
     * O médico não escolhe paciente fora da ordem: a prioridade é garantida no back-end.
     */
    async chamarProximo(solicitante) {
      return transacao.executar(async (conexao) => {
        const medico = await obterMedico(solicitante, conexao, { bloquear: true });

        if (medico.statusDisponibilidade === STATUS_MEDICO.EM_CONSULTA) {
          throw new ErroConflito('Você já tem uma consulta em andamento. Registre o desfecho antes de chamar o próximo paciente.');
        }
        if (medico.statusDisponibilidade !== STATUS_MEDICO.EM_PLANTAO) {
          throw new ErroRegraNegocio('Altere seu status para "Em plantão" para chamar pacientes.');
        }

        const candidatos = await atendimentoRepository.listarCandidatosFilaMedica(conexao);
        if (candidatos.length === 0) {
          return { atendimento: null, mensagem: 'Nenhum paciente aguardando consulta.' };
        }

        let atendimentoId = null;
        for (const candidatoId of candidatos) {
          // eslint-disable-next-line no-await-in-loop -- tentativa sequencial é intencional
          if (await atendimentoRepository.iniciarConsulta(candidatoId, conexao) === 1) {
            atendimentoId = candidatoId;
            break;
          }
        }
        if (atendimentoId === null) {
          throw new ErroConflito('Outros médicos chamaram os próximos pacientes neste instante. Tente novamente.');
        }

        await consultaRepository.criar({ atendimentoId, medicoId: medico.id }, conexao);
        await medicoRepository.atualizarDisponibilidade(medico.id, STATUS_MEDICO.EM_CONSULTA, conexao);
        await historicoStatusRepository.registrar({
          atendimentoId,
          statusAnterior: STATUS_ATENDIMENTO.AGUARDANDO_CONSULTA,
          statusNovo: STATUS_ATENDIMENTO.EM_CONSULTA,
          responsavel: solicitante,
        }, conexao);
        await historicoEtapasRepository.registrar({
          atendimentoId,
          etapa: ETAPA_ATENDIMENTO.CONSULTA,
          descricao: `Consulta iniciada por ${medico.nome} (CRM-${medico.crmUf} ${medico.crmNumero}).`,
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
        garantirConsultaDoMedico(atendimento, medico);

        const id = await prescricaoRepository.criar({ ...prescricao, atendimentoId, medicoId: medico.id }, conexao);
        return prescricaoRepository.buscarPorId(id, conexao);
      });
    },

    /**
     * Desfecho/Finalização (RF13, RF24): registra o desfecho, encerra a consulta
     * e finaliza o atendimento, tudo na mesma transação.
     */
    async finalizar(atendimentoId, dados, solicitante) {
      const desfecho = validarDesfecho(dados);

      return transacao.executar(async (conexao) => {
        const medico = await obterMedico(solicitante, conexao, { bloquear: true });
        const atendimento = await atendimentoRepository.buscarPorId(atendimentoId, conexao, { bloquear: true });
        garantirConsultaDoMedico(atendimento, medico);

        if (desfecho.tipo === TIPO_DESFECHO.PRESCRICAO
            && (await prescricaoRepository.listarPorAtendimento(atendimentoId, conexao)).length === 0) {
          throw new ErroRegraNegocio('Desfecho "PRESCRICAO" exige ao menos uma prescrição registrada.');
        }

        await desfechoRepository.criar({ ...desfecho, consultaId: atendimento.consultaId }, conexao);
        if (await consultaRepository.finalizar(atendimento.consultaId, conexao) !== 1
            || await atendimentoRepository.finalizar(atendimentoId, conexao) !== 1) {
          throw new ErroConflito('Não foi possível finalizar: o atendimento foi alterado. Recarregue o painel.');
        }
        await medicoRepository.atualizarDisponibilidade(medico.id, STATUS_MEDICO.EM_PLANTAO, conexao);
        await historicoStatusRepository.registrar({
          atendimentoId,
          statusAnterior: STATUS_ATENDIMENTO.EM_CONSULTA,
          statusNovo: STATUS_ATENDIMENTO.FINALIZADO,
          responsavel: solicitante,
        }, conexao);
        await historicoEtapasRepository.registrar({
          atendimentoId,
          etapa: ETAPA_ATENDIMENTO.DESFECHO,
          descricao: descreverDesfecho(desfecho, medico),
        }, conexao);

        return {
          id: atendimento.id,
          numeroAtendimento: atendimento.numeroAtendimento,
          status: STATUS_ATENDIMENTO.FINALIZADO,
          desfecho: await desfechoRepository.buscarPorAtendimento(atendimentoId, conexao),
        };
      });
    },
  };
}

module.exports = { criarPainelMedicoService, VIAS_ADMINISTRACAO, TIPOS_DESFECHO };
