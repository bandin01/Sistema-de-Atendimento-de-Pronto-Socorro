// Sessões (RNF08): perfil + login + senha geram um token aleatório, enviado depois no cabeçalho X-Sessao.
let crypto = require('crypto');
let banco = require('./banco');
let util = require('./utilitarios');
let senhas = require('./senhas');

let tabelas = [];
tabelas['RECEPCAO'] = 'recepcionistas';
tabelas['ENFERMAGEM'] = 'enfermeiros';
tabelas['MEDICO'] = 'medicos';

let nomesPerfil = [];
nomesPerfil['RECEPCAO'] = 'Recepção';
nomesPerfil['ENFERMAGEM'] = 'Enfermagem';
nomesPerfil['MEDICO'] = 'Médico';

// Uma sessão dura um plantão (12 horas).
let duracaoMinutos = 12 * 60;

// Em memória: reiniciar o servidor encerra todas as sessões.
let sessoes = [];

exports.nomePerfil = function (perfil) {
  return nomesPerfil[perfil];
};

// Mesma resposta para login inexistente, inativo ou senha errada: não revela quais logins existem.
let mensagemFalha = 'Login ou senha incorretos.';

// Conferido quando o login não existe, para o tempo de resposta não denunciar.
let hashDeMentira = 'scrypt$' + '0'.repeat(32) + '$' + '0'.repeat(128);

// Devolve { token, perfil, id, nome }.
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
  // Máximo de 72 caracteres (RN16.3): senha maior nem é conferida, para não ocupar o servidor.
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

exports.identificar = function (token) {
  token = util.texto(token);
  // Só 48 caracteres hex (recusa também nomes como "__proto__").
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

exports.sair = function (token) {
  delete sessoes[util.texto(token)];
};
