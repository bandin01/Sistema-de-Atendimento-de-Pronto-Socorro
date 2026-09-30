'use strict';

/**
 * Credenciais de acesso. Não existe tabela de usuários: login e senha_hash
 * ficam em recepcionistas, medicos e enfermeiros (migration 010), e o perfil
 * é dado pela tabela. O login é único entre as três (sp_validar_login_unico).
 */
const { TABELA_POR_PERFIL, tabelaDoPerfil } = require('./tabelasProfissionais');

function mapear(linha) {
  if (!linha) return null;
  return { ...linha, ativo: linha.ativo === 1 };
}

// SELECT de cada tabela com o perfil como literal, unidos por UNION ALL.
function uniaoDasTabelas(colunas) {
  return Object.entries(TABELA_POR_PERFIL)
    .map(([perfil, tabela]) => `SELECT id, '${perfil}' AS perfil, ${colunas} FROM ${tabela} WHERE login = ?`)
    .join(' UNION ALL ');
}

const QUANTIDADE_TABELAS = Object.keys(TABELA_POR_PERFIL).length;

function criarCredencialRepository(pool) {
  return {
    /** Único método que devolve o hash — usado apenas pelo login. */
    async buscarPorLogin(login, conexao = pool) {
      const [linhas] = await conexao.execute(
        `${uniaoDasTabelas('login, nome, ativo, senha_hash AS senhaHash')} LIMIT 1`,
        Array(QUANTIDADE_TABELAS).fill(login),
      );
      return mapear(linhas[0]);
    },

    /** Profissional atual (sem hash) a partir do par (perfil, id) do token. */
    async buscarPorPerfilEId(perfil, id, conexao = pool) {
      const [linhas] = await conexao.execute(
        `SELECT id, login, nome, ativo FROM ${tabelaDoPerfil(perfil)} WHERE id = ?`,
        [id],
      );
      return linhas[0] ? mapear({ ...linhas[0], perfil }) : null;
    },

    async existeLogin(login, conexao = pool) {
      const [linhas] = await conexao.execute(
        `${uniaoDasTabelas('login')} LIMIT 1`,
        Array(QUANTIDADE_TABELAS).fill(login),
      );
      return linhas.length > 0;
    },

    async registrarLogin(perfil, id, conexao = pool) {
      await conexao.execute(`UPDATE ${tabelaDoPerfil(perfil)} SET ultimo_login_em = NOW() WHERE id = ?`, [id]);
    },
  };
}

module.exports = { criarCredencialRepository };
