// Testes do controle de acesso por perfil (RNF08) e do mascaramento de CPF/RG (RNF09).
// Para rodar:  npm test   (ou  node --test testes/)
//
// Não precisam do MySQL: antes de carregar o servidor, o módulo modulos/banco.js
// é trocado por um banco "falso", que responde às consultas com dados fixos e
// anota os valores recebidos. Assim dá para conferir, por exemplo, que o
// profissional gravado é sempre o da sessão, e não o enviado no formulário.
let test = require('node:test');
let assert = require('node:assert');
let http = require('http');
let path = require('path');

// ---------------------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------------------
let profissionais = [];
profissionais['recepcionistas'] = [{ id: 1, nome: 'Ana Paula Souza' }];
profissionais['enfermeiros'] = [{ id: 2, nome: 'Marina Lopes', coren_numero: '123456', coren_uf: 'SP' }];
profissionais['medicos'] = [{ id: 3, nome: 'Helena Martins', especialidade: 'Clínica Médica',
                             crm_numero: '112233', crm_uf: 'SP', status_operacional: 'EM_PLANTAO' }];

let anotados = [];   // cada consulta recebida: { sql, valores }

function responderSql(sql, valores) {
  anotados.push({ sql: sql, valores: valores });
  let login = sql.match(/^SELECT id, nome FROM (\w+) WHERE id = \? AND ativo = 1$/);
  if (login) {
    return profissionais[login[1]].filter(function (p) {
      return p.id == valores[0];
    });
  }
  if (sql.indexOf('FROM recepcionistas WHERE ativo = 1') != -1) {
    return profissionais['recepcionistas'];
  }
  if (sql.indexOf('FROM enfermeiros') != -1 && sql.indexOf('WHERE ativo = 1') != -1) {
    return profissionais['enfermeiros'];
  }
  if (sql.indexOf('FROM medicos WHERE id = ? AND ativo = 1') != -1) {
    return profissionais['medicos'];
  }
  if (sql.indexOf('FROM medicos WHERE ativo = 1') != -1) {
    return profissionais['medicos'];
  }
  if (sql.indexOf('p.cpf, p.rg') != -1) {
    return [{ id: 10, numero_atendimento: 'AT0010', status: 'AGUARDANDO_TRIAGEM', criado_em: '2026-10-26 10:00:00',
              nome: 'Paciente Teste', endereco: 'Rua A, 1', cpf: '52998224725', rg: '284731905',
              data_nascimento: '1990-01-01' }];
  }
  if (sql.indexOf('INSERT INTO pacientes') == 0) {
    return { insertId: 5 };
  }
  if (sql.indexOf('INSERT INTO atendimentos') == 0) {
    return { insertId: 10 };
  }
  if (sql.indexOf('FROM atendimentos a, recepcionistas r') != -1) {
    return [{ numero_atendimento: 'AT0010', recepcionista: 'Ana Paula Souza' }];
  }
  if (sql.indexOf('FROM atendimentos a WHERE a.numero_atendimento = ? FOR UPDATE') != -1) {
    return [{ id: 10, status: 'AGUARDANDO_TRIAGEM', enfermeiro: 'Marina Lopes' }];
  }
  if (sql.indexOf('INSERT') == 0 || sql.indexOf('UPDATE') == 0) {
    return { insertId: 1, affectedRows: 1 };
  }
  return [];
}

let conexaoFalsa = {
  query: function (sql, valores, callback) {
    let resultado = responderSql(sql, valores);
    setImmediate(function () {
      callback(null, resultado);
    });
  }
};

let bancoFalso = {
  executar: function (sql, valores, callback) {
    conexaoFalsa.query(sql, valores, callback);
  },
  executarEmOrdem: function (conexao, comandos, callback) {
    for (let i = 0; i < comandos.length; i++) {
      responderSql(comandos[i].sql, comandos[i].valores);
    }
    setImmediate(callback, null);
  },
  transacao: function (passos, callback) {
    passos(conexaoFalsa, callback);
  }
};

let raiz = path.join(__dirname, '..');
require.cache[require.resolve(path.join(raiz, 'modulos', 'banco.js'))] = {
  id: 'banco-falso', loaded: true, exports: bancoFalso
};

// Sobe o servidor de verdade numa porta própria para os testes.
// http.createServer é "espiado" para guardar o servidor e fechá-lo no fim.
process.env.PORTA = '3999';
let servidor = null;
let createServerOriginal = http.createServer;
http.createServer = function (tratador) {
  servidor = createServerOriginal(tratador);
  return servidor;
};
let logOriginal = console.log;
console.log = function () {};
require(path.join(raiz, 'servidor.js'));
console.log = logOriginal;
http.createServer = createServerOriginal;

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------
function api(metodo, endereco, dados, token) {
  return new Promise(function (resolve, reject) {
    let cabecalhos = { 'Content-Type': 'application/json' };
    if (token) {
      cabecalhos['X-Sessao'] = token;
    }
    let req = http.request({ host: '127.0.0.1', port: 3999, method: metodo, path: endereco, headers: cabecalhos,
                             agent: false },
      function (res) {
        let corpo = '';
        res.on('data', function (pedaco) {
          corpo += pedaco;
        });
        res.on('end', function () {
          resolve({ status: res.statusCode, corpo: JSON.parse(corpo) });
        });
      });
    req.on('error', reject);
    // Se o servidor não responder (por exemplo, por um erro dentro da rota), o teste falha em vez de travar.
    req.setTimeout(3000, function () {
      req.destroy(new Error('O servidor não respondeu a ' + metodo + ' ' + endereco));
    });
    if (dados !== undefined) {
      req.write(typeof dados == 'string' ? dados : JSON.stringify(dados));
    }
    req.end();
  });
}

async function entrar(perfil, id) {
  let resposta = await api('POST', '/api/entrar', { perfil: perfil, profissional_id: id });
  assert.strictEqual(resposta.status, 200, JSON.stringify(resposta.corpo));
  return resposta.corpo.token;
}

function ultimaConsulta(trecho) {
  for (let i = anotados.length - 1; i >= 0; i--) {
    if (anotados[i].sql.indexOf(trecho) != -1) {
      return anotados[i];
    }
  }
  return null;
}

// Rotas protegidas e os perfis que podem usar cada uma.
let rotasProtegidas = [
  { metodo: 'GET', endereco: '/api/atendimentos', perfis: ['RECEPCAO'] },
  { metodo: 'POST', endereco: '/api/atendimentos', perfis: ['RECEPCAO'] },
  { metodo: 'POST', endereco: '/api/atendimentos/alterar', perfis: ['RECEPCAO'] },
  { metodo: 'POST', endereco: '/api/atendimentos/cancelar', perfis: ['RECEPCAO'] },
  { metodo: 'GET', endereco: '/api/triagem/fila', perfis: ['ENFERMAGEM'] },
  { metodo: 'POST', endereco: '/api/triagem', perfis: ['ENFERMAGEM'] },
  { metodo: 'GET', endereco: '/api/painel', perfis: ['MEDICO'] },
  { metodo: 'POST', endereco: '/api/painel/chamar', perfis: ['MEDICO'] },
  { metodo: 'GET', endereco: '/api/consulta', perfis: ['MEDICO'] },
  { metodo: 'POST', endereco: '/api/consulta/prescricao', perfis: ['MEDICO'] },
  { metodo: 'POST', endereco: '/api/consulta/finalizar', perfis: ['MEDICO'] }
];

let tokens = [];

test.before(async function () {
  tokens['RECEPCAO'] = await entrar('RECEPCAO', 1);
  tokens['ENFERMAGEM'] = await entrar('ENFERMAGEM', 2);
  tokens['MEDICO'] = await entrar('MEDICO', 3);
});

test.after(function () {
  servidor.closeAllConnections();
  servidor.close();   // encerra o servidor que ficou escutando a porta
});

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
test('mascaramento de CPF e RG', function () {
  let util = require(path.join(raiz, 'modulos', 'utilitarios.js'));
  assert.strictEqual(util.mascararCpf('52998224725'), '***.***.*47-25');
  assert.strictEqual(util.mascararRg('284731905'), '*****1905');
  assert.strictEqual(util.mascararRg('12345'), '*2345');
  assert.strictEqual(util.mascararCpf(null), null);
  assert.strictEqual(util.mascararRg(null), null);
});

test('entrar: perfil inválido, profissional inexistente e sucesso', async function () {
  let r = await api('POST', '/api/entrar', { perfil: 'ADMIN', profissional_id: 1 });
  assert.strictEqual(r.status, 400);
  r = await api('POST', '/api/entrar', { perfil: 'MEDICO', profissional_id: 999 });
  assert.strictEqual(r.status, 400);
  // id de uma recepcionista não serve para entrar como médico
  r = await api('POST', '/api/entrar', { perfil: 'MEDICO', profissional_id: 1 });
  assert.strictEqual(r.status, 400);
  r = await api('POST', '/api/entrar', { perfil: 'medico', profissional_id: '3' });
  assert.strictEqual(r.status, 200);
  assert.match(r.corpo.token, /^[0-9a-f]{48}$/);
  assert.strictEqual(r.corpo.perfil, 'MEDICO');
  assert.strictEqual(r.corpo.nome, 'Helena Martins');
});

test('rotas públicas funcionam sem sessão', async function () {
  for (let endereco of ['/api/recepcionistas', '/api/enfermeiros', '/api/medicos']) {
    let r = await api('GET', endereco);
    assert.strictEqual(r.status, 200, endereco);
  }
});

test('sem sessão ou com token inválido: 401 em todas as rotas protegidas', async function () {
  let invalidos = [undefined, 'abc', '__proto__', 'constructor', 'f'.repeat(48)];
  for (let rota of rotasProtegidas) {
    for (let token of invalidos) {
      let r = await api(rota.metodo, rota.endereco, rota.metodo == 'POST' ? {} : undefined, token);
      assert.strictEqual(r.status, 401, rota.metodo + ' ' + rota.endereco + ' token=' + token);
    }
  }
});

test('cada perfil só usa as rotas da sua etapa (403 nas outras)', async function () {
  for (let rota of rotasProtegidas) {
    for (let perfil of ['RECEPCAO', 'ENFERMAGEM', 'MEDICO']) {
      let r = await api(rota.metodo, rota.endereco, rota.metodo == 'POST' ? {} : undefined, tokens[perfil]);
      let nome = perfil + ' → ' + rota.metodo + ' ' + rota.endereco + ' (' + r.status + ' ' + JSON.stringify(r.corpo) + ')';
      if (rota.perfis.indexOf(perfil) == -1) {
        assert.strictEqual(r.status, 403, nome);
        assert.match(r.corpo.erro, /Acesso negado/);
      } else {
        assert.notStrictEqual(r.status, 401, nome);
        assert.notStrictEqual(r.status, 403, nome);
      }
    }
  }
});

test('GET /api/sessao devolve quem está logado', async function () {
  let r = await api('GET', '/api/sessao', undefined, tokens['ENFERMAGEM']);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.corpo, { perfil: 'ENFERMAGEM', id: 2, nome: 'Marina Lopes' });
});

test('recepção: o atendimento é registrado pela recepcionista da sessão, não pela do formulário', async function () {
  let dados = { nome: 'Paciente Novo', endereco: 'Rua B, 22', cpf: '', rg: '', data_nascimento: '1990-05-05',
                recepcionista_id: 999 };
  let r = await api('POST', '/api/atendimentos', dados, tokens['RECEPCAO']);
  assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
  assert.deepStrictEqual(ultimaConsulta('FROM atendimentos a, recepcionistas r').valores, [10, 1]);
  assert.deepStrictEqual(ultimaConsulta('INSERT INTO historico_status').valores.slice(-1), [1]);
});

test('triagem: o(a) enfermeiro(a) gravado(a) é o(a) da sessão', async function () {
  let dados = { numero_atendimento: 'AT0010', pressao_sistolica: 120, pressao_diastolica: 80, temperatura: '36,5',
                frequencia_cardiaca: 80, queixa_principal: 'Dor de cabeça', classificacao_manchester: 'VERDE',
                enfermeiro_id: 999 };
  let r = await api('POST', '/api/triagem', dados, tokens['ENFERMAGEM']);
  assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
  assert.strictEqual(ultimaConsulta('INSERT INTO triagens').valores[1], 2);
});

test('médico: a consulta aberta e a prescrição usam o médico da sessão', async function () {
  let r = await api('GET', '/api/consulta?medico=999', undefined, tokens['MEDICO']);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.medico.id, 3);
  assert.deepStrictEqual(ultimaConsulta('c.finalizada_em IS NULL').valores, [3]);

  r = await api('POST', '/api/consulta/prescricao', { medico_id: 999, numero_atendimento: 'AT0010',
    medicamento: 'Dipirona', dosagem: '500 mg', via_administracao: 'ORAL', frequencia: '8/8h' }, tokens['MEDICO']);
  assert.strictEqual(ultimaConsulta('a.numero_atendimento = ?').valores[0], 3);
});

test('consulta de atendimento: CPF/RG completos só para a recepção', async function () {
  let r = await api('GET', '/api/atendimentos?numero=AT0010', undefined, tokens['RECEPCAO']);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.cpf, '52998224725');
  assert.strictEqual(r.corpo.rg, '284731905');
  assert.strictEqual(r.corpo.pode_alterar, true);

  for (let perfil of ['ENFERMAGEM', 'MEDICO']) {
    r = await api('GET', '/api/atendimentos?numero=AT0010', undefined, tokens[perfil]);
    assert.strictEqual(r.status, 200, perfil);
    assert.strictEqual(r.corpo.cpf, '***.***.*47-25', perfil);
    assert.strictEqual(r.corpo.rg, '*****1905', perfil);
    assert.strictEqual(r.corpo.pode_alterar, false, perfil);
  }
});

test('corpo JSON que não é objeto é recusado', async function () {
  let r = await api('POST', '/api/atendimentos', 'null', tokens['RECEPCAO']);
  assert.strictEqual(r.status, 400);
  r = await api('POST', '/api/entrar', '5');
  assert.strictEqual(r.status, 400);
});

test('sair encerra a sessão', async function () {
  let token = await entrar('RECEPCAO', 1);
  let r = await api('POST', '/api/sair', undefined, token);
  assert.strictEqual(r.status, 200);
  r = await api('GET', '/api/sessao', undefined, token);
  assert.strictEqual(r.status, 401);
});
