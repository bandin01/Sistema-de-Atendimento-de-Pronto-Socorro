// Módulo de acesso ao banco de dados MySQL.
// Usa o módulo mysql2 (instalado com "npm install"), que permite ao Node.js
// enviar comandos SQL para o MySQL.
let mysql = require('mysql2');

// Dados de conexão com o MySQL: altere a senha para a do seu computador.
let configuracao = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'root',
  database: 'pronto_socorro',
  dateStrings: true      // devolve datas como texto: '2026-10-15 14:30:00'
};

// Um "pool" mantém algumas conexões abertas e reaproveita cada uma delas,
// permitindo que vários usuários usem o sistema ao mesmo tempo.
let conexoes = mysql.createPool(configuracao);

// Executa um comando SQL. Os "?" do comando são trocados pelos valores,
// na ordem, sempre de forma segura (o mysql2 trata aspas e caracteres especiais).
exports.executar = function (sql, valores, callback) {
  conexoes.query(sql, valores, callback);
};

// Executa uma lista de comandos { sql, valores }, um depois do outro, na mesma
// conexão. Para no primeiro erro.
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

// Executa vários comandos como uma TRANSAÇÃO: ou todos são gravados, ou nenhum.
// "passos" é uma função que recebe a conexão e uma função "concluir(erro, resultado)",
// que deve ser chamada quando todos os comandos terminarem.
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
          // Algo deu errado: desfaz tudo o que foi feito nesta transação.
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
