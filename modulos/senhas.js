// Módulo de SENHAS: guarda e confere as senhas dos profissionais (RNF08).
// A senha nunca é gravada no banco. Grava-se só um "hash": o resultado de uma
// conta (scrypt, do módulo nativo crypto) que não dá para desfazer. Para
// conferir, refaz-se a conta com a senha digitada e compara-se o resultado.
//
// Formato gravado na coluna senha_hash:   scrypt$<sal>$<hash>
//   sal  = 16 bytes aleatórios (32 caracteres hexadecimais), um para cada senha:
//          assim duas pessoas com a mesma senha ficam com hashes diferentes.
//   hash = 64 bytes (128 caracteres hexadecimais).
//
// Para gerar o hash de uma senha nova pelo terminal:
//   node modulos/senhas.js "minhaSenha123"
let crypto = require('crypto');

let tamanhoHash = 64;

// Gera o texto que vai para a coluna senha_hash. callback(erro, textoDoHash).
exports.gerarHash = function (senha, callback) {
  let sal = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(String(senha), sal, tamanhoHash, function (err, hash) {
    if (err) {
      return callback(err);
    }
    callback(null, 'scrypt$' + sal + '$' + hash.toString('hex'));
  });
};

// Confere a senha digitada com o texto gravado. callback(erro, confere).
// "confere" é true só se a senha estiver certa. Um valor gravado fora do
// formato (por exemplo, um cadastro antigo sem senha) nunca confere.
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
    // timingSafeEqual leva sempre o mesmo tempo, acertando ou errando: assim
    // ninguém descobre a senha medindo quanto o servidor demora para responder.
    callback(null, crypto.timingSafeEqual(hash, Buffer.from(partes[2], 'hex')));
  });
};

// Uso pelo terminal: node modulos/senhas.js "senha"
if (require.main === module) {
  if (process.argv.length < 3) {
    console.log('Uso: node modulos/senhas.js "senha"');
  } else {
    exports.gerarHash(process.argv[2], function (err, texto) {
      console.log(err ? err : texto);
    });
  }
}
