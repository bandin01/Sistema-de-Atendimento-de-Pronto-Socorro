// Entrega o front-end e responde à API em /api/. Iniciar: node servidor.js → http://localhost:3000
let http = require('http');
let fs = require('fs');
let url = require('url');

let atendimentos = require('./modulos/atendimentos');
let triagem = require('./modulos/triagem');
let medico = require('./modulos/medico');
let sessoes = require('./modulos/sessoes');

let porta = process.env.PORTA || 3000;   // PORTA é trocada nos testes

// rotas['MÉTODO /caminho'] = function (consulta, dados, sessao, callback).
// permissoes[rota] lista os perfis autorizados (RNF08); rota sem permissões é pública.
// O profissional responsável vem sempre da sessão, nunca do corpo da requisição.
let rotas = [];
let permissoes = [];

let RECEPCAO = 'RECEPCAO';
let ENFERMAGEM = 'ENFERMAGEM';
let MEDICO = 'MEDICO';

rotas['POST /api/entrar'] = function (consulta, dados, sessao, callback) {
  sessoes.entrar(dados, callback);
};
rotas['GET /api/sessao'] = function (consulta, dados, sessao, callback) {
  callback(null, { perfil: sessao.perfil, id: sessao.id, nome: sessao.nome });
};
permissoes['GET /api/sessao'] = [RECEPCAO, ENFERMAGEM, MEDICO];
rotas['POST /api/sair'] = function (consulta, dados, sessao, callback, token) {
  sessoes.sair(token);
  callback(null, { saiu: true });
};
permissoes['POST /api/sair'] = [RECEPCAO, ENFERMAGEM, MEDICO];

// Um atendimento: os três perfis (CPF/RG completos só para a recepção, RNF09).
// Lista dos últimos atendimentos: só a recepção.
rotas['GET /api/atendimentos'] = function (consulta, dados, sessao, callback) {
  if (consulta.numero) {
    atendimentos.consultar(consulta.numero, sessao.perfil, callback);
  } else if (sessao.perfil == RECEPCAO) {
    atendimentos.listar(callback);
  } else {
    callback(acessoNegado([RECEPCAO]));
  }
};
permissoes['GET /api/atendimentos'] = [RECEPCAO, ENFERMAGEM, MEDICO];
rotas['POST /api/atendimentos'] = function (consulta, dados, sessao, callback) {
  dados.recepcionista_id = sessao.id;
  atendimentos.abrir(dados, callback);
};
permissoes['POST /api/atendimentos'] = [RECEPCAO];
rotas['POST /api/atendimentos/alterar'] = function (consulta, dados, sessao, callback) {
  atendimentos.alterar(dados, callback);
};
permissoes['POST /api/atendimentos/alterar'] = [RECEPCAO];
rotas['POST /api/atendimentos/cancelar'] = function (consulta, dados, sessao, callback) {
  dados.recepcionista_id = sessao.id;
  atendimentos.cancelar(dados, callback);
};
permissoes['POST /api/atendimentos/cancelar'] = [RECEPCAO];

rotas['GET /api/triagem/fila'] = function (consulta, dados, sessao, callback) {
  triagem.fila(callback);
};
permissoes['GET /api/triagem/fila'] = [ENFERMAGEM];
rotas['POST /api/triagem'] = function (consulta, dados, sessao, callback) {
  dados.enfermeiro_id = sessao.id;
  triagem.registrar(dados, callback);
};
permissoes['POST /api/triagem'] = [ENFERMAGEM];
rotas['GET /api/triagem/situacao'] = function (consulta, dados, sessao, callback) {
  triagem.situacao(sessao.id, callback);
};
permissoes['GET /api/triagem/situacao'] = [ENFERMAGEM];
rotas['POST /api/triagem/situacao'] = function (consulta, dados, sessao, callback) {
  dados.enfermeiro_id = sessao.id;
  triagem.alterarSituacao(dados, callback);
};
permissoes['POST /api/triagem/situacao'] = [ENFERMAGEM];

rotas['GET /api/painel'] = function (consulta, dados, sessao, callback) {
  medico.painel(callback);
};
permissoes['GET /api/painel'] = [MEDICO];
rotas['POST /api/painel/chamar'] = function (consulta, dados, sessao, callback) {
  dados.medico_id = sessao.id;
  medico.chamarProximo(dados, callback);
};
permissoes['POST /api/painel/chamar'] = [MEDICO];
rotas['POST /api/painel/situacao'] = function (consulta, dados, sessao, callback) {
  dados.medico_id = sessao.id;
  medico.alterarSituacao(dados, callback);
};
permissoes['POST /api/painel/situacao'] = [MEDICO];
rotas['GET /api/consulta'] = function (consulta, dados, sessao, callback) {
  medico.consultaAberta(sessao.id, callback);
};
permissoes['GET /api/consulta'] = [MEDICO];
rotas['POST /api/consulta/prescricao'] = function (consulta, dados, sessao, callback) {
  dados.medico_id = sessao.id;
  medico.registrarPrescricao(dados, callback);
};
permissoes['POST /api/consulta/prescricao'] = [MEDICO];
rotas['POST /api/consulta/finalizar'] = function (consulta, dados, sessao, callback) {
  dados.medico_id = sessao.id;
  medico.finalizar(dados, callback);
};
permissoes['POST /api/consulta/finalizar'] = [MEDICO];

function acessoNegado(perfis) {
  let nomes = [];
  for (let i = 0; i < perfis.length; i++) {
    nomes.push(sessoes.nomePerfil(perfis[i]));
  }
  return { status: 403, mensagem: 'Acesso negado: esta função é exclusiva do perfil ' + nomes.join(' / ') + '.' };
}

function lerCorpo(req, callback) {
  let corpo = '';
  req.on('data', function (pedaco) {
    corpo += pedaco;
  });
  req.on('end', function () {
    if (corpo == '') {
      return callback(null, {});
    }
    let dados;
    try {
      dados = JSON.parse(corpo);
    } catch (e) {
      return callback({ status: 400, mensagem: 'Os dados enviados não estão no formato JSON.' });
    }
    if (dados === null || typeof dados != 'object') {
      return callback({ status: 400, mensagem: 'Os dados enviados devem ser um objeto JSON.' });
    }
    callback(null, dados);
  });
}

function descreverErro(err) {
  if (err.status) {
    return { status: err.status, mensagem: err.mensagem };
  }
  if (err.sqlState == '45000') {
    return { status: 400, mensagem: err.sqlMessage };                // regra garantida por trigger do banco
  }
  if (err.code == 'ER_DUP_ENTRY') {
    return { status: 400, mensagem: 'Já existe um cadastro com estes dados (verifique o CPF).' };
  }
  if (err.code == 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return { status: 400, mensagem: 'Dado fora do formato aceito pelo banco: ' + err.sqlMessage };
  }
  if (err.code == 'ER_NO_REFERENCED_ROW_2') {
    return { status: 400, mensagem: 'Profissional responsável não encontrado.' };
  }
  if (err.code == 'ER_LOCK_DEADLOCK' || err.code == 'ER_LOCK_WAIT_TIMEOUT') {
    return { status: 400, mensagem: 'Outro usuário estava alterando este atendimento. Tente novamente.' };
  }
  console.log(err);
  if (err.code == 'ECONNREFUSED' || err.code == 'ER_ACCESS_DENIED_ERROR' || err.code == 'ER_BAD_DB_ERROR') {
    return { status: 500, mensagem: 'Não foi possível acessar o banco de dados. Verifique se o MySQL está ligado, ' +
                                    'se o banco pronto_socorro foi criado e a senha em modulos/banco.js.' };
  }
  return { status: 500, mensagem: 'Erro interno no servidor.' };
}

function responder(res, err, dados) {
  let status = 200;
  let resposta = dados;
  if (err) {
    let erro = descreverErro(err);
    status = erro.status;
    resposta = { erro: erro.mensagem };
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(resposta));
}

function tratarApi(req, res, endereco) {
  let rota = rotas[req.method + ' ' + endereco.pathname];
  if (rota === undefined) {
    return responder(res, { status: 404, mensagem: 'Endereço da API não encontrado.' });
  }
  let token = req.headers['x-sessao'];
  let sessao = null;
  let perfis = permissoes[req.method + ' ' + endereco.pathname];
  if (perfis !== undefined) {
    sessao = sessoes.identificar(token);
    if (sessao == null) {
      return responder(res, { status: 401, mensagem: 'Sessão expirada ou inexistente. Entre novamente pela página inicial.' });
    }
    if (perfis.indexOf(sessao.perfil) == -1) {
      return responder(res, acessoNegado(perfis));
    }
  }
  lerCorpo(req, function (err, dados) {
    if (err) {
      return responder(res, err);
    }
    rota(endereco.query, dados, sessao, function (err, resultado) {
      responder(res, err, resultado);
    }, token);
  });
}

let tipos = [];
tipos['.html'] = 'text/html; charset=utf-8';
tipos['.css'] = 'text/css; charset=utf-8';
tipos['.js'] = 'text/javascript; charset=utf-8';
tipos['.png'] = 'image/png';
tipos['.jpg'] = 'image/jpeg';
tipos['.svg'] = 'image/svg+xml';
tipos['.ico'] = 'image/x-icon';

// Só estas pastas são servidas: nunca modulos/, que contém a senha do banco.
let pastasDoSite = ['/HTMLs/', '/CSSs/', '/javascripts/', '/imagens/'];

function arquivoPermitido(caminho, extensao) {
  if (caminho.indexOf('..') != -1 || tipos[extensao] === undefined) {
    return false;
  }
  if (caminho == '/index.html') {
    return true;
  }
  for (let i = 0; i < pastasDoSite.length; i++) {
    if (caminho.indexOf(pastasDoSite[i]) == 0) {
      return true;
    }
  }
  return false;
}

function entregarArquivo(res, caminho) {
  if (caminho == '/') {
    caminho = '/index.html';
  }
  let extensao = caminho.slice(caminho.lastIndexOf('.'));
  if (!arquivoPermitido(caminho, extensao)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('404 Not Found');
  }
  fs.readFile(__dirname + caminho, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, { 'Content-Type': tipos[extensao] });
    res.write(data);
    res.end();
  });
}

http.createServer(function (req, res) {
  let endereco = url.parse(req.url, true);
  if (endereco.pathname.indexOf('/api/') == 0) {
    tratarApi(req, res, endereco);
  } else {
    entregarArquivo(res, endereco.pathname);
  }
}).listen(porta);

console.log('Servidor do Pronto Socorro funcionando em http://localhost:' + porta);
