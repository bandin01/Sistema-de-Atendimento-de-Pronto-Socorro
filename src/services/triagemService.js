'use strict';

const { STATUS_ATENDIMENTO, STATUS_ENFERMEIRO, CATEGORIA_ENFERMAGEM } = require('../config/dominio');
const { CODIGOS_MANCHESTER, buscarClassificacao } = require('../config/manchester');
const { PERFIS } = require('../config/perfis');
const {
  ErroAcessoNegado, ErroConflito, ErroNaoEncontrado, ErroRegraNegocio,
} = require('../errors/erros');
const { criarValidador } = require('../utils/validador');
const { montarPaciente } = require('./apresentacaoClinica');

/**
 * Triagem (RF06–RF08, RF18, RNF04): exclusiva do perfil ENFERMAGEM, categoria
 * ENFERMEIRO (Resolução Cofen nº 661/2021), sempre sobre um atendimento válido.
 */
function criarTriagemService({
  atendimentoRepository, triagemRepository, enfermeiroRepository, historicoStatusRepository, transacao,
}) {
  function validarTriagem(dados) {
    const d = dados && typeof dados === 'object' ? dados : {};
    const v = criarValidador();

    const classificacao = v.enumeracao('classificacao', d.classificacao, CODIGOS_MANCHESTER);
    // Proposta (RN18.4): a classificação define se os sinais vitais podem vir depois (config/manchester.js).
    const vitaisObrigatorios = classificacao !== null && !buscarClassificacao(classificacao).vitaisOpcionais;

    const triagem = {
      classificacao,
      queixaPrincipal: v.texto('queixaPrincipal', d.queixaPrincipal, { min: 3, max: 500 }),
      pressaoSistolica: v.inteiro('pressaoSistolica', d.pressaoSistolica, { obrigatorio: vitaisObrigatorios, min: 40, max: 300 }),
      pressaoDiastolica: v.inteiro('pressaoDiastolica', d.pressaoDiastolica, { obrigatorio: vitaisObrigatorios, min: 20, max: 200 }),
      frequenciaCardiaca: v.inteiro('frequenciaCardiaca', d.frequenciaCardiaca, { obrigatorio: vitaisObrigatorios, min: 20, max: 250 }),
      frequenciaRespiratoria: v.inteiro('frequenciaRespiratoria', d.frequenciaRespiratoria, { obrigatorio: vitaisObrigatorios, min: 4, max: 80 }),
      temperatura: v.decimal('temperatura', d.temperatura, { obrigatorio: vitaisObrigatorios, min: 30, max: 45, casas: 1 }),
      saturacaoO2: v.inteiro('saturacaoO2', d.saturacaoO2, { obrigatorio: vitaisObrigatorios, min: 50, max: 100 }),
      glicemia: v.inteiro('glicemia', d.glicemia, { obrigatorio: false, min: 10, max: 1000 }),
      escalaDor: v.inteiro('escalaDor', d.escalaDor, { obrigatorio: false, min: 0, max: 10 }),
      observacoes: v.texto('observacoes', d.observacoes, { obrigatorio: false, max: 2000 }),
    };

    if (triagem.pressaoSistolica !== null && triagem.pressaoDiastolica !== null
        && triagem.pressaoSistolica <= triagem.pressaoDiastolica) {
      v.adicionarErro('pressaoDiastolica', 'A pressão diastólica deve ser menor que a sistólica.');
    }

    v.garantirValido('Revise os dados da triagem.');
    return triagem;
  }

  async function obterEnfermeiroApto(solicitante, conexao) {
    if (solicitante.perfil !== PERFIS.ENFERMAGEM) throw new ErroAcessoNegado();
    const enfermeiro = await enfermeiroRepository.buscarPorId(solicitante.id, conexao);
    if (!enfermeiro) throw new ErroNaoEncontrado('Cadastro de enfermagem não encontrado.');
    if (!enfermeiro.ativo) throw new ErroRegraNegocio('Cadastro de enfermagem inativo.');
    if (enfermeiro.categoria !== CATEGORIA_ENFERMAGEM.ENFERMEIRO) {
      throw new ErroAcessoNegado('A classificação de risco é privativa do(a) enfermeiro(a).');
    }
    if (enfermeiro.statusDisponibilidade !== STATUS_ENFERMEIRO.DISPONIVEL) {
      throw new ErroRegraNegocio('Altere sua disponibilidade para "Disponível" para registrar triagens.');
    }
    return enfermeiro;
  }

  function garantirAguardandoTriagem(atendimento) {
    if (!atendimento) throw new ErroNaoEncontrado('Atendimento não encontrado.');
    switch (atendimento.status) {
      case STATUS_ATENDIMENTO.AGUARDANDO_TRIAGEM:
        return;
      case STATUS_ATENDIMENTO.FINALIZADO:
        throw new ErroRegraNegocio('Atendimento finalizado não pode ser alterado.');
      case STATUS_ATENDIMENTO.CANCELADO:
        throw new ErroRegraNegocio('Atendimento cancelado não pode receber triagem.');
      default:
        throw new ErroConflito('Este atendimento já foi triado.');
    }
  }

  return {
    async listarFila(solicitante) {
      const linhas = await atendimentoRepository.listarAguardandoTriagem();
      return linhas.map((linha) => ({
        id: linha.id,
        numeroAtendimento: linha.numeroAtendimento,
        chegadaEm: linha.chegadaEm,
        minutosEspera: linha.minutosEspera,
        paciente: montarPaciente(linha, solicitante.perfil),
      }));
    },

    async registrar(atendimentoId, dados, solicitante) {
      const triagem = validarTriagem(dados);

      return transacao.executar(async (conexao) => {
        const enfermeiro = await obterEnfermeiroApto(solicitante, conexao);

        // FOR UPDATE: duas enfermeiras não triam o mesmo paciente ao mesmo tempo
        const atendimento = await atendimentoRepository.buscarPorId(atendimentoId, conexao, { bloquear: true });
        garantirAguardandoTriagem(atendimento);

        const triagemId = await triagemRepository.criar(
          { ...triagem, atendimentoId, enfermeiroId: enfermeiro.id },
          conexao,
        );

        const atualizados = await atendimentoRepository.atualizarStatus(
          atendimentoId,
          STATUS_ATENDIMENTO.AGUARDANDO_TRIAGEM,
          STATUS_ATENDIMENTO.AGUARDANDO_MEDICO,
          conexao,
        );
        if (atualizados !== 1) throw new ErroConflito('O atendimento mudou durante o registro. Recarregue a fila.');

        await historicoStatusRepository.registrar({
          atendimentoId,
          statusAnterior: STATUS_ATENDIMENTO.AGUARDANDO_TRIAGEM,
          statusNovo: STATUS_ATENDIMENTO.AGUARDANDO_MEDICO,
          responsavel: solicitante,
        }, conexao);

        return {
          atendimento: {
            id: atendimento.id,
            numeroAtendimento: atendimento.numeroAtendimento,
            status: STATUS_ATENDIMENTO.AGUARDANDO_MEDICO,
          },
          triagem: await triagemRepository.buscarPorId(triagemId, conexao),
        };
      });
    },
  };
}

module.exports = { criarTriagemService };
