// Módulo de SESSÕES: controle de acesso por perfil (RNF08).
// Na página inicial o profissional escolhe o seu perfil e digita o seu login e
// a sua senha. O servidor procura o login na tabela do perfil, confere se o
// profissional está ativo e se a senha está certa, e devolve um "token"
// (um código aleatório). O navegador envia esse token em toda chamada à API,
// no cabeçalho X-Sessao, e o servidor descobre por ele quem está usando o
// sistema e qual é o seu perfil.
let crypto = require('crypto');
let banco = require('./banco');
let util = require('./utilitarios');
let senhas = require('./senhas');

// Cada perfil corresponde a uma tabela de profissionais.
let tabelas = [];
tabelas['RECEPCAO'] = 'recepcionistas';
tabelas['ENFERMAGEM'] = 'enfermeiros';
tabelas['MEDICO'] = 'medicos';

let nomesPerfil = [];
nomesPerfil['RECEPCAO'] = 'Recepção';
nomesPerfil['ENFERMAGEM'] = 'Enfermagem';
nomesPerfil['MEDICO'] = 'Médico';

// Uma sessão dura um plantão (12 horas). Depois disso é preciso entrar de novo.
let duracaoMinutos = 12 * 60;

// Sessões abertas, guardadas na memória do servidor: sessoes[token] = { perfil, id, nome, expiraEm }.
// Ao reiniciar o servidor, todos precisam entrar de novo.
let sessoes = [];

exports.nomePerfil = function (perfil) {
  return nomesPerfil[perfil];
};

// Resposta única para login inexistente, profissional inativo e senha errada:
// assim quem tenta adivinhar não descobre quais logins existem.
let mensagemFalha = 'Login ou senha incorretos.';

// Hash qualquer, usado quando o login não existe: a senha é conferida mesmo
// assim, para a resposta demorar o mesmo tempo nos dois casos.
let hashDeMentira = 'scrypt$' + '0'.repeat(32) + '$' + '0'.repeat(128);

// ENTRAR: dados = { perfil, login, senha }. Devolve { token, perfil, id, nome }.
exports.entrar = function (dados, callback) {
  let perfil = util.texto(dados.perfil).toUpperCase();
  let login = util.texto(dados.login).toLowerCase();
  let senha = (typeof dados.senha == 'string') ? dados.senha : '';
  if (tabelas[perfil] === undefined) {
    return callback(util.erro(400, 'Selecione o seu perfil.'));
  }
  if (login == '') {
    return callback(util.erro(400, 'Digite o seu login.'));
  }
  if (senha == '') {
    return callback(util.erro(400, 'Digite a sua senha.'));
  }
  // Senhas válidas têm no máximo 72 caracteres (RN16.3). Uma maior nem é
  // conferida, para ninguém ocupar o servidor com textos enormes.
  if (senha.length > 72) {
    return callback(util.erro(400, mensagemFalha));
  }
  let sql = 'SELECT id, nome, senha_hash FROM ' + tabelas[perfil] + ' WHERE login = ? AND ativo = 1';
  banco.executar(sql, [login], function (err, linhas) {
    if (err) {
      return callback(err);
    }
    let gravado = (linhas.length == 0) ? hashDeMentira : linhas[0].senha_hash;
    senhas.conferir(senha, gravado, function (err, confere) {
      if (err) {
        return callback(err);
      }
      if (linhas.length == 0 || !confere) {
        return callback(util.erro(400, mensagemFalha));
      }
      let profissional = linhas[0];
      // Guarda a data e a hora do último acesso (coluna ultimo_login_em).
      let sqlAcesso = 'UPDATE ' + tabelas[perfil] + ' SET ultimo_login_em = NOW() WHERE id = ?';
      banco.executar(sqlAcesso, [profissional.id], function (err) {
        if (err) {
          return callback(err);
        }
        let token = crypto.randomBytes(24).toString('hex');
        sessoes[token] = {
          perfil: perfil,
          id: profissional.id,
          nome: profissional.nome,
          expiraEm: Date.now() + duracaoMinutos * 60 * 1000
        };
        callback(null, { token: token, perfil: perfil, id: profissional.id, nome: profissional.nome });
      });
    });
  });
};

// Devolve a sessão do token, ou null se ele não existir ou já tiver expirado.
exports.identificar = function (token) {
  token = util.texto(token);
  // O token é sempre formado por 48 caracteres hexadecimais; qualquer outra
  // coisa (inclusive nomes como "__proto__") é recusada antes de olhar a lista.
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return null;
  }
  let sessao = sessoes[token];
  if (sessao === undefined) {
    return null;
  }
  if (sessao.expiraEm < Date.now()) {
    delete sessoes[token];
    return null;
  }
  return sessao;
};

// SAIR: encerra a sessão do token.
exports.sair = function (token) {
  delete sessoes[util.texto(token)];
};
