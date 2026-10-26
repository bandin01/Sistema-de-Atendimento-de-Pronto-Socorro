// Módulo de SESSÕES: controle de acesso por perfil (RNF08).
// Na página inicial o profissional escolhe o seu perfil e o seu nome. O
// servidor confere no banco se ele existe e está ativo, e devolve um "token"
// (um código aleatório). O navegador envia esse token em toda chamada à API,
// no cabeçalho X-Sessao, e o servidor descobre por ele quem está usando o
// sistema e qual é o seu perfil.
let crypto = require('crypto');
let banco = require('./banco');
let util = require('./utilitarios');

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

// ENTRAR: dados = { perfil, profissional_id }. Devolve { token, perfil, id, nome }.
exports.entrar = function (dados, callback) {
  let perfil = util.texto(dados.perfil).toUpperCase();
  let profissionalId = parseInt(dados.profissional_id, 10);
  if (tabelas[perfil] === undefined) {
    return callback(util.erro(400, 'Selecione o seu perfil.'));
  }
  if (isNaN(profissionalId)) {
    return callback(util.erro(400, 'Selecione o seu nome.'));
  }
  let sql = 'SELECT id, nome FROM ' + tabelas[perfil] + ' WHERE id = ? AND ativo = 1';
  banco.executar(sql, [profissionalId], function (err, linhas) {
    if (err) {
      return callback(err);
    }
    if (linhas.length == 0) {
      return callback(util.erro(400, 'Profissional não encontrado ou inativo neste perfil.'));
    }
    let token = crypto.randomBytes(24).toString('hex');
    sessoes[token] = {
      perfil: perfil,
      id: linhas[0].id,
      nome: linhas[0].nome,
      expiraEm: Date.now() + duracaoMinutos * 60 * 1000
    };
    callback(null, { token: token, perfil: perfil, id: linhas[0].id, nome: linhas[0].nome });
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
