'use strict';

const bcrypt = require('bcryptjs'); // bcryptjs: sem compilação nativa (funciona igual no Windows e no Mac)

function criarHashSenhaService({ custo = 10 } = {}) {
  let hashFicticio = null;

  return {
    gerarHash: (senha) => bcrypt.hash(senha, custo),
    comparar: (senha, hash) => bcrypt.compare(senha, hash),

    /**
     * Hash usado quando o login não existe: a comparação leva o mesmo tempo
     * e ninguém descobre quais logins existem medindo a resposta.
     */
    async obterHashFicticio() {
      if (!hashFicticio) hashFicticio = await bcrypt.hash('senha-ficticia-anti-enumeracao', custo);
      return hashFicticio;
    },
  };
}

module.exports = { criarHashSenhaService };
