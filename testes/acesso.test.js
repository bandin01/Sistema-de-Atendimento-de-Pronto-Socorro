// Testes do controle de acesso por perfil (RNF08), da entrada com login e senha
// e do mascaramento de CPF/RG (RNF09).
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
let crypto = require('crypto');

// ---------------------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------------------
// Hash no mesmo formato de modulos/senhas.js (scrypt$sal$hash), feito aqui de
// forma independente para o teste não depender do próprio módulo que testa.
function hashDe(senha) {
  let sal = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + sal + '$' + crypto.scryptSync(senha, sal, 64).toString('hex');
}
let SENHA = 'senha123';

let profissionais = [];
profissionais['recepcionistas'] = [
  { id: 1, nome: 'Ana Paula Souza', login: 'ana.souza', senha_hash: hashDe(SENHA), ativo: 1 },
  // Profissional desativado: mesmo com a senha certa não entra.
  { id: 4, nome: 'Bruno Henrique Dias', login: 'bruno.dias', senha_hash: hashDe(SENHA), ativo: 0 },
  // Cadastro antigo, ainda sem senha (valor de antes do script 015).
  { id: 5, nome: 'Sem Senha', login: 'sem.senha', senha_hash: 'login-nao-utilizado', ativo: 1 }
];
profissionais['enfermeiros'] = [{ id: 2, nome: 'Marina Lopes', coren_numero: '123456', coren_uf: 'SP',
                                  login: 'marina.lopes', senha_hash: hashDe(SENHA), ativo: 1 }];
profissionais['medicos'] = [{ id: 3, nome: 'Helena Martins', especialidade: 'Clínica Médica',
                             crm_numero: '112233', crm_uf: 'SP', status_operacional: 'EM_PLANTAO',
                             login: 'helena.martins', senha_hash: hashDe(SENHA), ativo: 1 }];

let anotados = [];   // cada consulta recebida: { sql, valores }
let situacaoEnfermeiro = 'DISPONIVEL';   // situação devolvida para a enfermeira Marina

function responderSql(sql, valores) {
  anotados.push({ sql: sql, valores: valores });
  let login = sql.match(/^SELECT id, nome, senha_hash FROM (\w+) WHERE login = \? AND ativo = 1$/);
  if (login) {
    return profissionais[login[1]].filter(function (p) {
      return p.login === valores[0] && p.ativo == 1;
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
  if (sql.indexOf('FROM atendimentos a LEFT JOIN enfermeiros e') != -1) {
    return [{ id: 10, status: 'AGUARDANDO_TRIAGEM', enfermeiro: 'Marina Lopes', status_disponibilidade: situacaoEnfermeiro }];
  }
  if (sql.indexOf('SELECT status_disponibilidade FROM enfermeiros WHERE id = ?') == 0) {
    return [{ status_disponibilidade: situacaoEnfermeiro }];
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

async function entrar(perfil, login) {
  let resposta = await api('POST', '/api/entrar', { perfil: perfil, login: login, senha: SENHA });
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
  { metodo: 'GET', endereco: '/api/triagem/situacao', perfis: ['ENFERMAGEM'] },
  { metodo: 'POST', endereco: '/api/triagem/situacao', perfis: ['ENFERMAGEM'] },
  { metodo: 'GET', endereco: '/api/painel', perfis: ['MEDICO'] },
  { metodo: 'POST', endereco: '/api/painel/chamar', perfis: ['MEDICO'] },
  { metodo: 'POST', endereco: '/api/painel/situacao', perfis: ['MEDICO'] },
  { metodo: 'GET', endereco: '/api/consulta', perfis: ['MEDICO'] },
  { metodo: 'POST', endereco: '/api/consulta/prescricao', perfis: ['MEDICO'] },
  { metodo: 'POST', endereco: '/api/consulta/finalizar', perfis: ['MEDICO'] }
];

let tokens = [];

test.before(async function () {
  tokens['RECEPCAO'] = await entrar('RECEPCAO', 'ana.souza');
  tokens['ENFERMAGEM'] = await entrar('ENFERMAGEM', 'marina.lopes');
  tokens['MEDICO'] = await entrar('MEDICO', 'helena.martins');
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

test('senhas: hash com sal, confere a certa e recusa a errada', async function () {
  let senhas = require(path.join(raiz, 'modulos', 'senhas.js'));
  let gerar = function (senha) {
    return new Promise(function (resolve, reject) {
      senhas.gerarHash(senha, function (err, texto) {
        return err ? reject(err) : resolve(texto);
      });
    });
  };
  let conferir = function (senha, gravado) {
    return new Promise(function (resolve, reject) {
      senhas.conferir(senha, gravado, function (err, confere) {
        return err ? reject(err) : resolve(confere);
      });
    });
  };
  let h1 = await gerar('senha123');
  let h2 = await gerar('senha123');
  assert.match(h1, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.ok(h1.length <= 255, 'cabe na coluna senha_hash VARCHAR(255)');
  assert.notStrictEqual(h1, h2, 'mesma senha, sal diferente, hash diferente');
  assert.strictEqual(h1.indexOf('senha123'), -1, 'a senha não aparece no hash');
  assert.strictEqual(await conferir('senha123', h1), true);
  assert.strictEqual(await conferir('senha124', h1), false);
  assert.strictEqual(await conferir('Senha123', h1), false);
  assert.strictEqual(await conferir('', h1), false);
  // Hash feito por outro código (o do banco falso) também confere: o formato é o mesmo.
  assert.strictEqual(await conferir(SENHA, profissionais['medicos'][0].senha_hash), true);
  // Valores fora do formato nunca conferem.
  for (let gravado of ['login-nao-utilizado', '', 'scrypt$abc$def', null, undefined]) {
    assert.strictEqual(await conferir('senha123', gravado), false, String(gravado));
  }
});

test('entrar: campos obrigatórios', async function () {
  let casos = [
    [{ perfil: 'ADMIN', login: 'ana.souza', senha: SENHA }, /perfil/],
    [{ login: 'ana.souza', senha: SENHA }, /perfil/],
    [{ perfil: 'RECEPCAO', login: '  ', senha: SENHA }, /login/],
    [{ perfil: 'RECEPCAO', login: 'ana.souza', senha: '' }, /senha/],
    [{ perfil: 'RECEPCAO', login: 'ana.souza' }, /senha/],
    [{ perfil: 'RECEPCAO', login: 'ana.souza', senha: 12345678 }, /senha/]
  ];
  for (let caso of casos) {
    let r = await api('POST', '/api/entrar', caso[0]);
    assert.strictEqual(r.status, 400, JSON.stringify(caso[0]));
    assert.match(r.corpo.erro, caso[1], JSON.stringify(caso[0]));
    assert.strictEqual(r.corpo.token, undefined);
  }
});

test('entrar: falhas dão sempre a mesma resposta, sem dizer o que estava errado', async function () {
  let falhas = [
    { perfil: 'RECEPCAO', login: 'ana.souza', senha: 'senhaErrada1' },       // senha errada
    { perfil: 'RECEPCAO', login: 'ana.souza', senha: 'SENHA123' },           // maiúsculas importam na senha
    { perfil: 'RECEPCAO', login: 'nao.existe', senha: SENHA },               // login inexistente
    { perfil: 'MEDICO', login: 'ana.souza', senha: SENHA },                  // login de outro perfil
    { perfil: 'RECEPCAO', login: 'bruno.dias', senha: SENHA },               // profissional inativo
    { perfil: 'RECEPCAO', login: 'sem.senha', senha: 'login-nao-utilizado' }, // cadastro sem hash
    { perfil: 'RECEPCAO', login: 'ana.souza', senha: 'a'.repeat(73) }        // senha longa demais
  ];
  for (let dados of falhas) {
    let r = await api('POST', '/api/entrar', dados);
    assert.strictEqual(r.status, 400, JSON.stringify(dados));
    assert.strictEqual(r.corpo.erro, 'Login ou senha incorretos.', JSON.stringify(dados));
  }
});

test('entrar: sucesso, login sem diferenciar maiúsculas e registro do último acesso', async function () {
  let r = await api('POST', '/api/entrar', { perfil: 'medico', login: '  Helena.Martins ', senha: SENHA });
  assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
  assert.match(r.corpo.token, /^[0-9a-f]{48}$/);
  assert.deepStrictEqual(Object.keys(r.corpo).sort(), ['id', 'nome', 'perfil', 'token']);  // nada de senha_hash
  assert.strictEqual(r.corpo.perfil, 'MEDICO');
  assert.strictEqual(r.corpo.id, 3);
  assert.strictEqual(r.corpo.nome, 'Helena Martins');
  // O banco recebe só o login (já padronizado), nunca a senha.
  assert.deepStrictEqual(ultimaConsulta('SELECT id, nome, senha_hash FROM medicos').valores, ['helena.martins']);
  assert.deepStrictEqual(ultimaConsulta('UPDATE medicos SET ultimo_login_em = NOW()').valores, [3]);
  // A sessão aberta funciona.
  let s = await api('GET', '/api/sessao', undefined, r.corpo.token);
  assert.deepStrictEqual(s.corpo, { perfil: 'MEDICO', id: 3, nome: 'Helena Martins' });
});

test('entrar: o antigo jeito (só perfil + id do profissional) não funciona mais', async function () {
  let r = await api('POST', '/api/entrar', { perfil: 'MEDICO', profissional_id: 3 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.corpo.token, undefined);
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

test('médico: muda a própria situação, mas não escolhe EM_CONSULTA', async function () {
  let r = await api('POST', '/api/painel/situacao', { status_operacional: 'PAUSA', medico_id: 999 }, tokens['MEDICO']);
  assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
  assert.deepStrictEqual(ultimaConsulta('UPDATE medicos SET status_operacional = ?').valores, ['PAUSA', 3]);

  r = await api('POST', '/api/painel/situacao', { status_operacional: 'EM_CONSULTA' }, tokens['MEDICO']);
  assert.strictEqual(r.status, 400);
});

test('enfermagem: muda a própria situação e só tria quando disponível', async function () {
  let r = await api('POST', '/api/triagem/situacao', { status_disponibilidade: 'PAUSA', enfermeiro_id: 999 },
                    tokens['ENFERMAGEM']);
  assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
  assert.deepStrictEqual(ultimaConsulta('UPDATE enfermeiros SET status_disponibilidade = ?').valores, ['PAUSA', 2]);

  r = await api('POST', '/api/triagem/situacao', { status_disponibilidade: 'FOLGA' }, tokens['ENFERMAGEM']);
  assert.strictEqual(r.status, 400);

  situacaoEnfermeiro = 'PAUSA';
  r = await api('GET', '/api/triagem/situacao', undefined, tokens['ENFERMAGEM']);
  assert.deepStrictEqual(r.corpo, { status_disponibilidade: 'PAUSA' });
  let dados = { numero_atendimento: 'AT0010', pressao_sistolica: 120, pressao_diastolica: 80, temperatura: '36,5',
                frequencia_cardiaca: 80, queixa_principal: 'Dor de cabeça', classificacao_manchester: 'VERDE' };
  r = await api('POST', '/api/triagem', dados, tokens['ENFERMAGEM']);
  assert.strictEqual(r.status, 400);
  assert.match(r.corpo.erro, /Disponível/);
  situacaoEnfermeiro = 'DISPONIVEL';
});

test('corpo JSON que não é objeto é recusado', async function () {
  let r = await api('POST', '/api/atendimentos', 'null', tokens['RECEPCAO']);
  assert.strictEqual(r.status, 400);
  r = await api('POST', '/api/entrar', '5');
  assert.strictEqual(r.status, 400);
});

test('sair encerra a sessão', async function () {
  let token = await entrar('RECEPCAO', 'ana.souza');
  let r = await api('POST', '/api/sair', undefined, token);
  assert.strictEqual(r.status, 200);
  r = await api('GET', '/api/sessao', undefined, token);
  assert.strictEqual(r.status, 401);
});
