'use strict';

const ER_LOCK_DEADLOCK = 1213;
const MAX_TENTATIVAS = 3;

/**
 * Executa um bloco de trabalho em transação, na MESMA conexão.
 * Services usam isto quando várias operações precisam ser atômicas
 * (ex.: vincular médico ao atendimento + mudar status do médico + histórico).
 * Em deadlock (raro, mas possível sob concorrência), repete até 3 vezes.
 */
function criarGerenciadorTransacao(pool) {
  async function executarUmaVez(trabalho) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const resultado = await trabalho(conexao);
      await conexao.commit();
      return resultado;
    } catch (erro) {
      try {
        await conexao.rollback();
      } catch (_) {
        // conexão pode ter caído; o erro original é o que importa
      }
      throw erro;
    } finally {
      conexao.release();
    }
  }

  return {
    async executar(trabalho) {
      for (let tentativa = 1; ; tentativa += 1) {
        try {
          return await executarUmaVez(trabalho);
        } catch (erro) {
          if (erro.errno !== ER_LOCK_DEADLOCK || tentativa >= MAX_TENTATIVAS) throw erro;
        }
      }
    },
  };
}

module.exports = { criarGerenciadorTransacao };
