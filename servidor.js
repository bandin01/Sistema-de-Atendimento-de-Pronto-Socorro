// Servidor do Sistema de Atendimento de Pronto Socorro.
// Para iniciar, abra o terminal nesta pasta e digite:  node servidor.js
// Depois, abra no navegador:  http://localhost:3000
//
// O mesmo servidor faz duas coisas:
//   1) entrega as páginas do site (front-end): index.html, HTMLs, CSSs, javascripts e imagens;
//   2) responde à API (back-end) em JSON, nos endereços que começam com /api/.
let http = require('http');
let fs = require('fs');
let url = require('url');

let atendimentos = require('./modulos/atendimentos');
let triagem = require('./modulos/triagem');
let medico = require('./modulos/medico');
let profissionais = require('./modulos/profissionais');

let porta = 3000;

// ---------------------------------------------------------------------------
// API: cada rota é "MÉTODO /caminho" e aponta para uma função.
// "consulta" são os parâmetros da URL (?numero=AT0001) e "dados" é o JSON
// enviado pelo navegador no corpo da requisição.
// ---------------------------------------------------------------------------
let rotas = [];

// Profissionais (listas para os campos "Profissional responsável")
rotas['GET /api/recepcionistas'] = function (consulta, dados, callback) {
  profissionais.recepcionistas(callback);
};
rotas['GET /api/enfermeiros'] = function (consulta, dados, callback) {
  profissionais.enfermeiros(callback);
};
rotas['GET /api/medicos'] = function (consulta, dados, callback) {
  profissionais.medicos(callback);
};

// Recepção
rotas['GET /api/atendimentos'] = function (consulta, dados, callback) {
  if (consulta.numero) {
    atendimentos.consultar(consulta.numero, callback);   // consulta de um atendimento
  } else {
    atendimentos.listar(callback);                         // últimos atendimentos
  }
};
rotas['POST /api/atendimentos'] = function (consulta, dados, callback) {
  atendimentos.abrir(dados, callback);
};
rotas['POST /api/atendimentos/alterar'] = function (consulta, dados, callback) {
  atendimentos.alterar(dados, callback);
};
rotas['POST /api/atendimentos/cancelar'] = function (consulta, dados, callback) {
  atendimentos.cancelar(dados, callback);
};

// Triagem
rotas['GET /api/triagem/fila'] = function (consulta, dados, callback) {
  triagem.fila(callback);
};
rotas['POST /api/triagem'] = function (consulta, dados, callback) {
  triagem.registrar(dados, callback);
};

// Médico
rotas['GET /api/painel'] = function (consulta, dados, callback) {
  medico.painel(callback);
};
rotas['POST /api/painel/chamar'] = function (consulta, dados, callback) {
  medico.chamarProximo(dados, callback);
};
rotas['GET /api/consulta'] = function (consulta, dados, callback) {
  medico.consultaAberta(consulta.medico, callback);
};
rotas['POST /api/consulta/prescricao'] = function (consulta, dados, callback) {
  medico.registrarPrescricao(dados, callback);
};
rotas['POST /api/consulta/finalizar'] = function (consulta, dados, callback) {
  medico.finalizar(dados, callback);
};

// Lê o corpo da requisição (o JSON enviado pelo navegador) e o converte em objeto.
function lerCorpo(req, callback) {
  let corpo = '';
  req.on('data', function (pedaco) {
    corpo += pedaco;
  });
  req.on('end', function () {
    if (corpo == '') {
      return callback(null, {});
    }
    try {
      callback(null, JSON.parse(corpo));
    } catch (e) {
      callback({ status: 400, mensagem: 'Os dados enviados não estão no formato JSON.' });
    }
  });
}

// Traduz um erro em código HTTP + mensagem para o usuário.
function descreverErro(err) {
  if (err.status) {
    return { status: err.status, mensagem: err.mensagem };           // erro das regras do sistema
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

// Envia a resposta da API em JSON.
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
  lerCorpo(req, function (err, dados) {
    if (err) {
      return responder(res, err);
    }
    rota(endereco.query, dados, function (err, resultado) {
      responder(res, err, resultado);
    });
  });
}

// ---------------------------------------------------------------------------
// SITE: entrega os arquivos do front-end (como no exercício do slide de Node).
// ---------------------------------------------------------------------------
let tipos = [];
tipos['.html'] = 'text/html; charset=utf-8';
tipos['.css'] = 'text/css; charset=utf-8';
tipos['.js'] = 'text/javascript; charset=utf-8';
tipos['.png'] = 'image/png';
tipos['.jpg'] = 'image/jpeg';
tipos['.svg'] = 'image/svg+xml';
tipos['.ico'] = 'image/x-icon';

// Só os arquivos do site podem ser baixados (nunca os módulos do servidor,
// que contêm a senha do banco).
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
    caminho = '/index.html';    // página inicial do site
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
