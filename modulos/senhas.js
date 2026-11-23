// Senhas (RNF08): só o hash scrypt é gravado, como scrypt$<sal: 32 hex>$<hash: 128 hex>.
// O sal aleatório faz senhas iguais terem hashes diferentes.
// Gerar um hash pelo terminal: node modulos/senhas.js "minhaSenha123"
let crypto = require('crypto');

let tamanhoHash = 64;

exports.gerarHash = function (senha, callback) {
  let sal = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(String(senha), sal, tamanhoHash, function (err, hash) {
    if (err) {
      return callback(err);
    }
    callback(null, 'scrypt$' + sal + '$' + hash.toString('hex'));
  });
};

// Valor gravado fora do formato (ex.: cadastro antigo sem senha) nunca confere.
exports.conferir = function (senha, gravado, callback) {
  let partes = String(gravado).split('$');
  if (partes.length != 3 || partes[0] != 'scrypt' || !/^[0-9a-f]{32}$/.test(partes[1]) ||
      !/^[0-9a-f]{128}$/.test(partes[2])) {
    return callback(null, false);
  }
  crypto.scrypt(String(senha), partes[1], tamanhoHash, function (err, hash) {
    if (err) {
      return callback(err);
    }
    // timingSafeEqual: tempo constante, ninguém descobre a senha medindo a resposta.
    callback(null, crypto.timingSafeEqual(hash, Buffer.from(partes[2], 'hex')));
  });
};

if (require.main === module) {
  if (process.argv.length < 3) {
    console.log('Uso: node modulos/senhas.js "senha"');
  } else {
    exports.gerarHash(process.argv[2], function (err, texto) {
      console.log(err ? err : texto);
    });
  }
}
