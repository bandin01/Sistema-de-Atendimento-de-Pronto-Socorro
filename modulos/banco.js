// Acesso ao MySQL (mysql2).
let mysql = require('mysql2');

// Altere a senha para a do MySQL do seu computador.
let configuracao = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'root',
  database: 'pronto_socorro',
  dateStrings: true      // devolve datas como texto: '2026-10-15 14:30:00'
};

let conexoes = mysql.createPool(configuracao);

// Os "?" são trocados pelos valores com escape (evita SQL injection).
exports.executar = function (sql, valores, callback) {
  conexoes.query(sql, valores, callback);
};

// Executa [{ sql, valores }] em sequência na mesma conexão; para no primeiro erro.
exports.executarEmOrdem = function (conexao, comandos, callback) {
  let i = 0;
  function proximo(err) {
    if (err) {
      return callback(err);
    }
    if (i == comandos.length) {
      return callback(null);
    }
    let comando = comandos[i];
    i++;
    conexao.query(comando.sql, comando.valores, function (err) {
      proximo(err);
    });
  }
  proximo(null);
};

// TRANSAÇÃO: passos(conexao, concluir) chama concluir(erro, resultado) no fim; com erro, ROLLBACK.
exports.transacao = function (passos, callback) {
  conexoes.getConnection(function (err, conexao) {
    if (err) {
      return callback(err);
    }
    conexao.beginTransaction(function (err) {
      if (err) {
        conexao.release();
        return callback(err);
      }
      passos(conexao, function (erro, resultado) {
        if (erro) {
          conexao.rollback(function () {
            conexao.release();
            callback(erro);
          });
          return;
        }
        conexao.commit(function (err) {
          if (err) {
            conexao.rollback(function () {
              conexao.release();
              callback(err);
            });
            return;
          }
          conexao.release();
          callback(null, resultado);
        });
      });
    });
  });
};
