'use strict';

/** Acesso à tabela recepcionistas. Hoje só o seed cadastra recepcionistas. */
function criarRecepcionistaRepository(pool) {
  return {
    async criar(recepcionista, conexao = pool) {
      const [resultado] = await conexao.execute(
        `INSERT INTO recepcionistas
           (nome, cpf, rg, data_nascimento, telefone, email, login, senha_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recepcionista.nome, recepcionista.cpf, recepcionista.rg ?? null, recepcionista.dataNascimento,
          recepcionista.telefone ?? null, recepcionista.email, recepcionista.login, recepcionista.senhaHash,
        ],
      );
      return resultado.insertId;
    },

    async buscarPorLogin(login, conexao = pool) {
      const [linhas] = await conexao.execute('SELECT id, nome, login FROM recepcionistas WHERE login = ?', [login]);
      return linhas[0] || null;
    },
  };
}

module.exports = { criarRecepcionistaRepository };
