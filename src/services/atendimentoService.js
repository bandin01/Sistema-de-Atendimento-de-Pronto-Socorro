'use strict';

const { STATUS_ATENDIMENTO } = require('../config/dominio');
const { PERFIS } = require('../config/perfis');
const {
  ErroAcessoNegado, ErroConflito, ErroNaoEncontrado, ErroRegraNegocio,
} = require('../errors/erros');
const { criarValidador } = require('../utils/validador');
const { aplicarMascara, politicaDoPaciente } = require('../utils/mascaramento');
const { montarClassificacao } = require('./apresentacaoClinica');

/** Triagem e prescrições só interessam a quem atende o paciente (RNF06/RNF09). */
const PERFIS_CLINICOS = Object.freeze([PERFIS.ENFERMAGEM, PERFIS.MEDICO]);

/**
 * Por que um atendimento não aceita mais alteração/cancelamento da recepção,
 * ou null se aceita. RF04/RF05/RNF05: nada depois da confirmação médica.
 * RF15: nada depois de finalizado. O trigger trg_atendimentos_bu_medico
 * garante o mesmo no banco para o cancelamento.
 */
function motivoBloqueioRecepcao(atendimento) {
  if (atendimento.status === STATUS_ATENDIMENTO.FINALIZADO) return 'Atendimento finalizado não pode ser alterado.';
  if (atendimento.status === STATUS_ATENDIMENTO.CANCELADO) return 'Atendimento cancelado não pode ser alterado.';
  if (atendimento.confirmadoMedicoEm || atendimento.status === STATUS_ATENDIMENTO.EM_ATENDIMENTO_MEDICO) {
    return 'Atendimento já confirmado pelo médico não pode ser alterado nem cancelado.';
  }
  return null;
}

/**
 * Recepção (RF01–RF05) e consulta de atendimento (RF03, RF11, RF14).
 *
 * Os dados do paciente são cadastrais e compartilhados entre os atendimentos
 * dele: quem volta ao PS é reconhecido pelo CPF e reaproveita o cadastro.
 */
function criarAtendimentoService({
  atendimentoRepository, pacienteRepository, triagemRepository, prescricaoRepository,
  historicoStatusRepository, transacao,
}) {
  function validarPaciente(dados) {
    const d = dados && typeof dados === 'object' ? dados : {};
    const v = criarValidador();
    // RF01. CPF, RG e filiação são opcionais: o PS atende quem chega sem documento.
    const paciente = {
      nome: v.texto('nome', d.nome, { min: 3, max: 150 }),
      endereco: v.texto('endereco', d.endereco, { min: 5, max: 255 }),
      cpf: v.cpf('cpf', d.cpf, { obrigatorio: false }),
      rg: v.rg('rg', d.rg),
      nomePai: v.texto('nomePai', d.nomePai, { obrigatorio: false, min: 3, max: 150 }),
      nomeMae: v.texto('nomeMae', d.nomeMae, { obrigatorio: false, min: 3, max: 150 }),
      dataNascimento: v.dataNascimento('dataNascimento', d.dataNascimento, { idadeMinima: 0, idadeMaxima: 130 }),
    };
    v.garantirValido('Revise os dados do paciente.');
    return paciente;
  }

  function garantirRecepcao(solicitante) {
    if (solicitante.perfil !== PERFIS.RECEPCAO) throw new ErroAcessoNegado();
  }

  async function buscarPorNumeroExistente(numeroAtendimento, conexao, opcoes) {
    const atendimento = await atendimentoRepository.buscarPorNumero(numeroAtendimento, conexao, opcoes);
    if (!atendimento) throw new ErroNaoEncontrado('Atendimento não encontrado.');
    return atendimento;
  }

  function montarPaciente(paciente, perfil) {
    const documentos = aplicarMascara(paciente, politicaDoPaciente(perfil));
    return {
      id: paciente.id,
      nome: paciente.nome,
      endereco: paciente.endereco,
      cpf: documentos.cpf,
      rg: documentos.rg,
      nomePai: paciente.nomePai,
      nomeMae: paciente.nomeMae,
      dataNascimento: paciente.dataNascimento,
      idade: paciente.idade,
    };
  }

  async function montarAtendimento(atendimento, solicitante, conexao) {
    const [paciente, historico] = await Promise.all([
      pacienteRepository.buscarPorId(atendimento.pacienteId, conexao),
      historicoStatusRepository.listarPorAtendimento(atendimento.id, conexao),
    ]);

    const resposta = {
      id: atendimento.id,
      numeroAtendimento: atendimento.numeroAtendimento,
      status: atendimento.status,
      abertoEm: atendimento.abertoEm,
      confirmadoMedicoEm: atendimento.confirmadoMedicoEm,
      finalizadoEm: atendimento.finalizadoEm,
      medicoResponsavel: atendimento.medicoNome || null,
      // Para a tela desabilitar edição/cancelamento; a regra real é validada de novo em cada ação.
      podeAlterar: motivoBloqueioRecepcao(atendimento) === null,
      paciente: montarPaciente(paciente, solicitante.perfil),
      historico,
    };

    if (PERFIS_CLINICOS.includes(solicitante.perfil)) {
      const [triagem, prescricoes] = await Promise.all([
        triagemRepository.buscarPorAtendimentoId(atendimento.id, conexao),
        prescricaoRepository.listarPorAtendimento(atendimento.id, conexao),
      ]);
      resposta.triagem = triagem && { ...triagem, classificacao: montarClassificacao(triagem.classificacao) };
      resposta.prescricoes = prescricoes;
    }
    return resposta;
  }

  return {
    /** RF01 + RF02: o número AT000 é gerado pelo trigger do banco (RNF03). */
    async abrir(dados, solicitante) {
      garantirRecepcao(solicitante);
      const dadosPaciente = validarPaciente(dados);

      return transacao.executar(async (conexao) => {
        // FOR UPDATE: duas recepções abrindo para o mesmo CPF são serializadas
        const existente = dadosPaciente.cpf
          ? await pacienteRepository.buscarPorCpf(dadosPaciente.cpf, conexao, { bloquear: true })
          : null;

        let pacienteId;
        if (existente) {
          const ativo = await atendimentoRepository.buscarAtivoDoPaciente(existente.id, conexao);
          if (ativo) {
            throw new ErroConflito(
              `Este paciente já está em atendimento (${ativo.numeroAtendimento}).`,
              [{ campo: 'cpf', mensagem: `Atendimento ${ativo.numeroAtendimento} ainda em andamento.` }],
            );
          }
          // Paciente que volta ao PS: o cadastro existente é mantido; correções usam RF04.
          pacienteId = existente.id;
        } else {
          pacienteId = await pacienteRepository.criar(dadosPaciente, conexao);
        }

        const atendimentoId = await atendimentoRepository.criar({ pacienteId }, conexao);
        await historicoStatusRepository.registrar({
          atendimentoId,
          statusAnterior: null,
          statusNovo: STATUS_ATENDIMENTO.AGUARDANDO_TRIAGEM,
          responsavel: solicitante,
        }, conexao);

        const { numeroAtendimento } = await atendimentoRepository.buscarPorId(atendimentoId, conexao);
        const atendimento = await atendimentoRepository.buscarPorNumero(numeroAtendimento, conexao);
        return {
          pacienteJaCadastrado: Boolean(existente),
          atendimento: await montarAtendimento(atendimento, solicitante, conexao),
        };
      });
    },

    /** RF03 (recepção) e RF11 (médico acessa o atendimento). */
    async consultar(numeroAtendimento, solicitante) {
      const atendimento = await buscarPorNumeroExistente(numeroAtendimento);
      return montarAtendimento(atendimento, solicitante);
    },

    /** RF04: só antes da confirmação médica. */
    async alterarPaciente(numeroAtendimento, dados, solicitante) {
      garantirRecepcao(solicitante);
      const dadosPaciente = validarPaciente(dados);

      return transacao.executar(async (conexao) => {
        // Bloqueio do atendimento serializa com "chamar próximo" do médico.
        const atendimento = await buscarPorNumeroExistente(numeroAtendimento, conexao, { bloquear: true });
        const motivo = motivoBloqueioRecepcao(atendimento);
        if (motivo) throw new ErroRegraNegocio(motivo);

        if (dadosPaciente.cpf) {
          const dono = await pacienteRepository.buscarPorCpf(dadosPaciente.cpf, conexao);
          if (dono && dono.id !== atendimento.pacienteId) {
            throw new ErroConflito('CPF já cadastrado para outro paciente.', [{ campo: 'cpf', mensagem: 'Já cadastrado.' }]);
          }
        }

        await pacienteRepository.buscarPorId(atendimento.pacienteId, conexao, { bloquear: true });
        await pacienteRepository.atualizar(atendimento.pacienteId, dadosPaciente, conexao);
        return montarAtendimento(atendimento, solicitante, conexao);
      });
    },

    /** RF05: só antes da confirmação médica. */
    async cancelar(numeroAtendimento, solicitante) {
      garantirRecepcao(solicitante);

      return transacao.executar(async (conexao) => {
        const atendimento = await buscarPorNumeroExistente(numeroAtendimento, conexao, { bloquear: true });
        const motivo = motivoBloqueioRecepcao(atendimento);
        if (motivo) throw new ErroRegraNegocio(motivo);

        const atualizados = await atendimentoRepository.atualizarStatus(
          atendimento.id, atendimento.status, STATUS_ATENDIMENTO.CANCELADO, conexao,
        );
        if (atualizados !== 1) throw new ErroConflito('O atendimento mudou durante o cancelamento. Consulte-o novamente.');

        await historicoStatusRepository.registrar({
          atendimentoId: atendimento.id,
          statusAnterior: atendimento.status,
          statusNovo: STATUS_ATENDIMENTO.CANCELADO,
          responsavel: solicitante,
        }, conexao);

        return montarAtendimento({ ...atendimento, status: STATUS_ATENDIMENTO.CANCELADO }, solicitante, conexao);
      });
    },
  };
}

module.exports = { criarAtendimentoService, motivoBloqueioRecepcao };
