'use strict';

const { PERFIS } = require('../config/perfis');
const { ErroAutenticacao } = require('../errors/erros');
const { criarValidador } = require('../utils/validador');

function criarAuthService({ credencialRepository, medicoRepository, enfermeiroRepository, hasher, tokenService }) {
  // Um carregador por perfil. Perfil sem cadastro profissional (recepção) → null.
  const CARREGADOR_PROFISSIONAL = Object.freeze({
    async [PERFIS.MEDICO](id) {
      const medico = await medicoRepository.buscarPorId(id);
      return medico && {
        id: medico.id,
        nome: medico.nome,
        registro: `CRM-${medico.crmUf} ${medico.crmNumero}`,
        especialidade: medico.especialidade,
        statusDisponibilidade: medico.statusDisponibilidade,
      };
    },
    async [PERFIS.ENFERMAGEM](id) {
      const enfermeiro = await enfermeiroRepository.buscarPorId(id);
      return enfermeiro && {
        id: enfermeiro.id,
        nome: enfermeiro.nome,
        registro: `COREN-${enfermeiro.corenUf} ${enfermeiro.corenNumero}`,
        categoria: enfermeiro.categoria,
        especialidade: enfermeiro.especialidade,
        statusDisponibilidade: enfermeiro.statusDisponibilidade,
      };
    },
  });

  async function carregarProfissional({ perfil, id }) {
    const carregar = CARREGADOR_PROFISSIONAL[perfil];
    return carregar ? carregar(id) : null;
  }

  async function montarSessao(credencial) {
    return {
      id: credencial.id,
      login: credencial.login,
      perfil: credencial.perfil,
      nome: credencial.nome,
      profissional: await carregarProfissional(credencial),
    };
  }

  return {
    async login(dados) {
      const v = criarValidador();
      const corpo = dados && typeof dados === 'object' ? dados : {};
      const login = v.texto('login', corpo.login, { max: 60 });
      const senha = typeof corpo.senha === 'string' && corpo.senha.length > 0 && corpo.senha.length <= 72 ? corpo.senha : null;
      if (!senha) v.adicionarErro('senha', 'Informe a senha.');
      v.garantirValido();

      const credencial = await credencialRepository.buscarPorLogin(login.toLowerCase());
      const hash = credencial ? credencial.senhaHash : await hasher.obterHashFicticio();
      const senhaConfere = await hasher.comparar(senha, hash);

      // Mensagem única: não revela se o login existe ou se está inativo.
      if (!credencial || !senhaConfere || !credencial.ativo) {
        throw new ErroAutenticacao('Login ou senha incorretos.');
      }

      await credencialRepository.registrarLogin(credencial.perfil, credencial.id);
      return {
        token: tokenService.gerar(credencial),
        expiraEm: tokenService.expiraEm,
        usuario: await montarSessao(credencial),
      };
    },

    async sessaoAtual(solicitante) {
      const credencial = await credencialRepository.buscarPorPerfilEId(solicitante.perfil, solicitante.id);
      if (!credencial || !credencial.ativo) throw new ErroAutenticacao('Usuário inativo ou inexistente.');
      return montarSessao(credencial);
    },
  };
}

module.exports = { criarAuthService };
