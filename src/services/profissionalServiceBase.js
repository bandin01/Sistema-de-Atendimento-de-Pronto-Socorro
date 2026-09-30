'use strict';

const { PERFIS } = require('../config/perfis');
const {
  ErroAcessoNegado, ErroConflito, ErroNaoEncontrado, ErroRegraNegocio,
} = require('../errors/erros');
const { criarValidador } = require('../utils/validador');
const { aplicarMascara, politicaDoProfissional } = require('../utils/mascaramento');

/**
 * Regras COMUNS de cadastro e disponibilidade de profissionais.
 *
 * medicoService e enfermeiroService são "configurações" desta base: cada um
 * informa só o que é específico (registro CRM/COREN, status permitidos, bloqueios).
 * Nova categoria profissional = nova configuração, sem mexer aqui (OCP).
 * A base depende apenas do CONTRATO do repository, não da tabela (DIP/LSP).
 */
function criarProfissionalServiceBase({ repository, credencialRepository, transacao, hasher, config }) {
  const {
    perfil,
    statusValidos,
    statusSelecionaveis,
    statusInativo,
    validarCamposEspecificos,
    validarFiltrosEspecificos = () => ({}),
    camposPublicosEspecificos,
    motivoBloqueioDisponibilidade = () => null,
    motivoBloqueioDesativacao = () => null,
  } = config;

  // Ids são por tabela: "é o próprio registro" exige o mesmo perfil E o mesmo id.
  const ehDoSolicitante = (registro, solicitante) => solicitante.perfil === perfil && registro.id === solicitante.id;

  // ---------------------------------------------------------------------------
  // Apresentação (RNF09/RNF11): minimização de dados + máscara por perfil
  // ---------------------------------------------------------------------------
  function apresentar(registro, solicitante) {
    const ehProprioRegistro = ehDoSolicitante(registro, solicitante);
    const publico = {
      id: registro.id,
      nome: registro.nome,
      ...camposPublicosEspecificos(registro),
      statusDisponibilidade: registro.statusDisponibilidade,
      ativo: registro.ativo,
    };

    const podeVerDadosPessoais = ehProprioRegistro || solicitante.perfil === PERFIS.RECEPCAO;
    if (!podeVerDadosPessoais) return publico;

    const documentos = aplicarMascara(registro, politicaDoProfissional(solicitante.perfil, ehProprioRegistro));
    return {
      ...publico,
      login: registro.login,
      cpf: documentos.cpf,
      rg: documentos.rg,
      dataNascimento: registro.dataNascimento,
      telefone: registro.telefone,
      email: registro.email,
      criadoEm: registro.criadoEm,
    };
  }

  function validarCadastro(dados) {
    const d = dados && typeof dados === 'object' ? dados : {};
    const v = criarValidador();
    const cadastro = {
      nome: v.texto('nome', d.nome, { min: 3, max: 150 }),
      cpf: v.cpf('cpf', d.cpf),
      rg: v.rg('rg', d.rg),
      dataNascimento: v.dataNascimento('dataNascimento', d.dataNascimento, { idadeMinima: 18, idadeMaxima: 100 }),
      telefone: v.telefone('telefone', d.telefone),
      email: v.email('email', d.email),
      login: v.login('login', d.login),
      senha: v.senhaNova('senha', d.senha),
      ...validarCamposEspecificos(v, d),
    };
    v.garantirValido();
    return cadastro;
  }

  async function buscarExistente(id, conexao, opcoes) {
    const registro = await repository.buscarPorId(id, conexao, opcoes);
    if (!registro) throw new ErroNaoEncontrado('Profissional não encontrado.');
    return registro;
  }

  function garantirPerfil(solicitante) {
    if (solicitante.perfil !== perfil) throw new ErroAcessoNegado();
  }

  return {
    apresentar,

    async cadastrar(dados, solicitante) {
      const { senha, ...cadastro } = validarCadastro(dados);
      const senhaHash = await hasher.gerarHash(senha); // fora da transação: bcrypt é lento

      return transacao.executar(async (conexao) => {
        const conflitos = await repository.buscarConflitos(cadastro, conexao);
        // Login é único entre recepcionistas, médicos e enfermeiros (sp_validar_login_unico)
        if (await credencialRepository.existeLogin(cadastro.login, conexao)) conflitos.push('login');
        if (conflitos.length > 0) {
          throw new ErroConflito(
            'Já existe cadastro com alguns destes dados.',
            conflitos.map((campo) => ({ campo, mensagem: 'Já cadastrado.' })),
          );
        }

        const id = await repository.criar({ ...cadastro, senhaHash }, conexao);
        return apresentar(await repository.buscarPorId(id, conexao), solicitante);
      });
    },

    async listar(consulta, solicitante) {
      const q = consulta || {};
      const v = criarValidador();
      const filtros = {
        statusDisponibilidade: v.enumeracao('status', q.status, statusValidos, { obrigatorio: false }),
        especialidade: v.texto('especialidade', q.especialidade, { obrigatorio: false, max: 100 }),
        // Só a recepção (gestão de cadastro) enxerga profissionais inativos.
        ativo: solicitante.perfil === PERFIS.RECEPCAO ? q.ativo : true,
        ...validarFiltrosEspecificos(v, q),
      };
      v.garantirValido('Filtros inválidos.');

      const registros = await repository.listar(filtros);
      return registros.map((r) => apresentar(r, solicitante));
    },

    async detalhar(id, solicitante) {
      const registro = await buscarExistente(id);
      if (!registro.ativo && solicitante.perfil !== PERFIS.RECEPCAO) {
        throw new ErroNaoEncontrado('Profissional não encontrado.');
      }
      return apresentar(registro, solicitante);
    },

    async meuPerfil(solicitante) {
      garantirPerfil(solicitante);
      const registro = await repository.buscarPorId(solicitante.id);
      if (!registro) throw new ErroNaoEncontrado('Cadastro profissional não encontrado.');
      return apresentar(registro, solicitante);
    },

    async alterarMinhaDisponibilidade(dados, solicitante) {
      garantirPerfil(solicitante);
      const v = criarValidador();
      const novoStatus = v.enumeracao('statusDisponibilidade', dados && dados.statusDisponibilidade, statusSelecionaveis);
      v.garantirValido();

      return transacao.executar(async (conexao) => {
        // FOR UPDATE: serializa com "chamar próximo"/"finalizar" do mesmo profissional
        const registro = await repository.buscarPorId(solicitante.id, conexao, { bloquear: true });
        if (!registro) throw new ErroNaoEncontrado('Cadastro profissional não encontrado.');
        if (!registro.ativo) throw new ErroRegraNegocio('Cadastro profissional inativo.');

        const motivo = motivoBloqueioDisponibilidade(registro, novoStatus);
        if (motivo) throw new ErroRegraNegocio(motivo);

        await repository.atualizarDisponibilidade(registro.id, novoStatus, conexao);
        return apresentar({ ...registro, statusDisponibilidade: novoStatus }, solicitante);
      });
    },

    async alterarSituacaoCadastro(id, dados, solicitante) {
      const v = criarValidador();
      const ativo = v.booleano('ativo', dados && dados.ativo);
      v.garantirValido();

      return transacao.executar(async (conexao) => {
        const registro = await buscarExistente(id, conexao, { bloquear: true });

        if (!ativo) {
          const motivo = motivoBloqueioDesativacao(registro);
          if (motivo) throw new ErroRegraNegocio(motivo);
        }

        // ativo = 0 também corta o acesso: o middleware autenticar relê o cadastro a cada requisição.
        await repository.atualizarSituacao(id, {
          ativo,
          statusDisponibilidade: ativo ? registro.statusDisponibilidade : statusInativo,
        }, conexao);

        return apresentar(await repository.buscarPorId(id, conexao), solicitante);
      });
    },
  };
}

module.exports = { criarProfissionalServiceBase };
