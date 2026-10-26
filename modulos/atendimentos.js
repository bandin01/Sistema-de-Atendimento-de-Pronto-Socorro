// Módulo da RECEPÇÃO: inclusão, consulta, alteração e cancelamento do atendimento.
let banco = require('./banco');
let historico = require('./historico');
let util = require('./utilitarios');

// A recepção só pode alterar ou cancelar o atendimento enquanto ele ainda não
// foi confirmado pelo médico, ou seja, nestes dois status (RF04, RF05).
let statusAlteraveis = ['AGUARDANDO_TRIAGEM', 'AGUARDANDO_CONSULTA'];

// Lê os dados do paciente enviados pelo formulário.
function lerPaciente(dados) {
  return {
    nome: util.texto(dados.nome),
    endereco: util.texto(dados.endereco),
    cpf: util.somenteDigitos(dados.cpf),
    rg: util.texto(dados.rg).toUpperCase().replace(/[^0-9X]/g, ''),
    nome_pai: util.texto(dados.nome_pai),
    nome_mae: util.texto(dados.nome_mae),
    data_nascimento: util.texto(dados.data_nascimento)
  };
}

// Devolve a mensagem do primeiro problema encontrado, ou "" se estiver tudo certo.
// CPF, RG e nome dos pais são opcionais: o pronto-socorro atende quem chega sem documento.
function validarPaciente(paciente) {
  if (paciente.nome.length < 3 || paciente.nome.length > 150) {
    return 'Informe o nome completo do paciente.';
  }
  if (paciente.endereco.length < 5 || paciente.endereco.length > 255) {
    return 'Informe o endereço do paciente.';
  }
  if (paciente.cpf != '' && paciente.cpf.length != 11) {
    return 'O CPF deve ter 11 dígitos.';
  }
  if (paciente.rg != '' && (paciente.rg.length < 5 || paciente.rg.length > 9)) {
    return 'O RG deve ter de 5 a 9 caracteres (números ou X).';
  }
  if (paciente.nome_pai.length > 150 || paciente.nome_mae.length > 150) {
    return 'O nome do pai e o da mãe podem ter no máximo 150 caracteres.';
  }
  if (!util.dataValida(paciente.data_nascimento)) {
    return 'Informe uma data de nascimento válida (não pode ser uma data futura).';
  }
  return '';
}

// Valores na ordem das colunas: nome, endereco, cpf, rg, nome_pai, nome_mae, data_nascimento.
function valoresDoPaciente(paciente) {
  return [
    paciente.nome,
    paciente.endereco,
    util.nuloSeVazio(paciente.cpf),
    util.nuloSeVazio(paciente.rg),
    util.nuloSeVazio(paciente.nome_pai),
    util.nuloSeVazio(paciente.nome_mae),
    paciente.data_nascimento
  ];
}

function inserirPaciente(conexao, paciente, callback) {
  let sql = 'INSERT INTO pacientes (nome, endereco, cpf, rg, nome_pai, nome_mae, data_nascimento) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?)';
  conexao.query(sql, valoresDoPaciente(paciente), function (err, resultado) {
    if (err) {
      return callback(err);
    }
    callback(null, resultado.insertId);
  });
}

function atualizarPaciente(conexao, pacienteId, paciente, callback) {
  let sql = 'UPDATE pacientes SET nome = ?, endereco = ?, cpf = ?, rg = ?, nome_pai = ?, nome_mae = ?, ' +
            'data_nascimento = ? WHERE id = ?';
  let valores = valoresDoPaciente(paciente);
  valores.push(pacienteId);
  conexao.query(sql, valores, callback);
}

// Quem volta ao pronto-socorro é reconhecido pelo CPF e reaproveita o cadastro
// (com os dados atualizados). Sem CPF, é sempre um cadastro novo.
// Devolve o id do paciente.
function gravarPaciente(conexao, paciente, callback) {
  if (paciente.cpf == '') {
    return inserirPaciente(conexao, paciente, callback);
  }
  conexao.query('SELECT id FROM pacientes WHERE cpf = ?', [paciente.cpf], function (err, linhas) {
    if (err) {
      return callback(err);
    }
    if (linhas.length == 0) {
      return inserirPaciente(conexao, paciente, callback);
    }
    let pacienteId = linhas[0].id;
    let sql = "SELECT numero_atendimento FROM atendimentos " +
              "WHERE paciente_id = ? AND status NOT IN ('FINALIZADO', 'CANCELADO')";
    conexao.query(sql, [pacienteId], function (err, abertos) {
      if (err) {
        return callback(err);
      }
      if (abertos.length > 0) {
        return callback(util.erro(400, 'Este paciente já está em atendimento: ' + abertos[0].numero_atendimento + '.'));
      }
      atualizarPaciente(conexao, pacienteId, paciente, function (err) {
        callback(err, pacienteId);
      });
    });
  });
}

// Confere se o atendimento existe e se ainda pode ser alterado/cancelado.
// Devolve um erro, ou null se estiver liberado.
function verificarAlteravel(numero, linhas) {
  if (linhas.length == 0) {
    return util.erro(404, 'Atendimento ' + numero + ' não encontrado.');
  }
  let status = linhas[0].status;
  if (status == 'FINALIZADO') {
    return util.erro(400, 'Atendimento finalizado não pode ser alterado nem cancelado.');
  }
  if (status == 'CANCELADO') {
    return util.erro(400, 'Atendimento cancelado não pode ser alterado.');
  }
  if (statusAlteraveis.indexOf(status) == -1) {
    return util.erro(400, 'Atendimento já confirmado pelo médico: não pode ser alterado nem cancelado.');
  }
  return null;
}

// INCLUSÃO (RF01, RF02): cadastra o paciente e gera o número do atendimento.
// O número (AT0001, AT0002...) é gerado pelo próprio banco, no trigger
// trg_atendimentos_bi_numero, e nunca se repete.
exports.abrir = function (dados, callback) {
  let recepcionistaId = parseInt(dados.recepcionista_id, 10);
  if (isNaN(recepcionistaId)) {
    return callback(util.erro(400, 'Selecione a recepcionista responsável.'));
  }
  let paciente = lerPaciente(dados);
  let problema = validarPaciente(paciente);
  if (problema != '') {
    return callback(util.erro(400, problema));
  }

  banco.transacao(function (conexao, concluir) {
    gravarPaciente(conexao, paciente, function (err, pacienteId) {
      if (err) {
        return concluir(err);
      }
      conexao.query('INSERT INTO atendimentos (paciente_id) VALUES (?)', [pacienteId], function (err, resultado) {
        if (err) {
          return concluir(err);
        }
        let atendimentoId = resultado.insertId;
        let sql = 'SELECT a.numero_atendimento, r.nome AS recepcionista ' +
                  'FROM atendimentos a, recepcionistas r WHERE a.id = ? AND r.id = ?';
        conexao.query(sql, [atendimentoId, recepcionistaId], function (err, linhas) {
          if (err) {
            return concluir(err);
          }
          if (linhas.length == 0) {
            return concluir(util.erro(400, 'Recepcionista não encontrada.'));
          }
          let numero = linhas[0].numero_atendimento;
          historico.registrar(conexao, {
            atendimentoId: atendimentoId,
            statusAnterior: null,
            statusNovo: 'AGUARDANDO_TRIAGEM',
            responsavel: 'recepcionista_id',
            responsavelId: recepcionistaId,
            etapas: [
              { etapa: 'CHEGADA', descricao: 'Chegada do paciente ao pronto-socorro.' },
              { etapa: 'ATENDIMENTO_INICIAL',
                descricao: 'Atendimento inicial na recepção (' + linhas[0].recepcionista +
                           '): cadastro do paciente e número ' + numero + ' gerado.' }
            ]
          }, function (err) {
            concluir(err, { numero_atendimento: numero, status: 'AGUARDANDO_TRIAGEM' });
          });
        });
      });
    });
  }, callback);
};

// CONSULTA (RF03): dados do paciente, situação e histórico do atendimento.
exports.consultar = function (numero, callback) {
  numero = util.numeroAtendimento(numero);
  let sql = 'SELECT a.id, a.numero_atendimento, a.status, a.criado_em, a.finalizado_em, ' +
            'p.nome, p.endereco, p.cpf, p.rg, p.nome_pai, p.nome_mae, p.data_nascimento, ' +
            'c.iniciada_em AS confirmado_em, m.nome AS medico ' +
            'FROM atendimentos a ' +
            'JOIN pacientes p ON p.id = a.paciente_id ' +
            'LEFT JOIN consultas c ON c.atendimento_id = a.id ' +
            'LEFT JOIN medicos m ON m.id = c.medico_id ' +
            'WHERE a.numero_atendimento = ?';
  banco.executar(sql, [numero], function (err, linhas) {
    if (err) {
      return callback(err);
    }
    if (linhas.length == 0) {
      return callback(util.erro(404, 'Atendimento ' + numero + ' não encontrado.'));
    }
    let atendimento = linhas[0];
    atendimento.pode_alterar = statusAlteraveis.indexOf(atendimento.status) != -1;

    let sqlEtapas = 'SELECT etapa, descricao, registrado_em FROM historico_etapas ' +
                    'WHERE atendimento_id = ? ORDER BY registrado_em, id';
    banco.executar(sqlEtapas, [atendimento.id], function (err, etapas) {
      if (err) {
        return callback(err);
      }
      atendimento.etapas = etapas;

      let sqlStatus = 'SELECT h.status_anterior, h.status_novo, h.data_hora, ' +
                      'COALESCE(r.nome, e.nome, m.nome) AS responsavel ' +
                      'FROM historico_status h ' +
                      'LEFT JOIN recepcionistas r ON r.id = h.recepcionista_id ' +
                      'LEFT JOIN enfermeiros e ON e.id = h.enfermeiro_id ' +
                      'LEFT JOIN medicos m ON m.id = h.medico_id ' +
                      'WHERE h.atendimento_id = ? ORDER BY h.data_hora, h.id';
      banco.executar(sqlStatus, [atendimento.id], function (err, mudancas) {
        if (err) {
          return callback(err);
        }
        atendimento.historico_status = mudancas;
        callback(null, atendimento);
      });
    });
  });
};

// Lista os últimos atendimentos abertos, para a recepção acompanhar o movimento.
exports.listar = function (callback) {
  let sql = 'SELECT a.numero_atendimento, p.nome, a.status, a.criado_em ' +
            'FROM atendimentos a JOIN pacientes p ON p.id = a.paciente_id ' +
            'ORDER BY a.id DESC LIMIT 50';
  banco.executar(sql, [], callback);
};

// ALTERAÇÃO (RF04): corrige os dados do paciente, só antes da confirmação médica.
exports.alterar = function (dados, callback) {
  let numero = util.numeroAtendimento(dados.numero_atendimento);
  let paciente = lerPaciente(dados);
  let problema = validarPaciente(paciente);
  if (problema != '') {
    return callback(util.erro(400, problema));
  }

  banco.transacao(function (conexao, concluir) {
    // FOR UPDATE trava o atendimento até o fim da transação: assim o médico
    // não consegue chamar este paciente no meio da alteração.
    let sql = 'SELECT paciente_id, status FROM atendimentos WHERE numero_atendimento = ? FOR UPDATE';
    conexao.query(sql, [numero], function (err, linhas) {
      if (err) {
        return concluir(err);
      }
      let erro = verificarAlteravel(numero, linhas);
      if (erro) {
        return concluir(erro);
      }
      atualizarPaciente(conexao, linhas[0].paciente_id, paciente, function (err) {
        concluir(err, { numero_atendimento: numero });
      });
    });
  }, callback);
};

// CANCELAMENTO (RF05): só antes da confirmação médica.
// O banco também impede (trigger trg_atendimentos_bu_bloqueio).
exports.cancelar = function (dados, callback) {
  let numero = util.numeroAtendimento(dados.numero_atendimento);
  let recepcionistaId = parseInt(dados.recepcionista_id, 10);
  if (isNaN(recepcionistaId)) {
    return callback(util.erro(400, 'Selecione a recepcionista responsável.'));
  }

  banco.transacao(function (conexao, concluir) {
    let sql = 'SELECT id, status FROM atendimentos WHERE numero_atendimento = ? FOR UPDATE';
    conexao.query(sql, [numero], function (err, linhas) {
      if (err) {
        return concluir(err);
      }
      let erro = verificarAlteravel(numero, linhas);
      if (erro) {
        return concluir(erro);
      }
      let atendimento = linhas[0];
      conexao.query("UPDATE atendimentos SET status = 'CANCELADO' WHERE id = ?", [atendimento.id], function (err) {
        if (err) {
          return concluir(err);
        }
        historico.registrar(conexao, {
          atendimentoId: atendimento.id,
          statusAnterior: atendimento.status,
          statusNovo: 'CANCELADO',
          responsavel: 'recepcionista_id',
          responsavelId: recepcionistaId,
          etapas: []
        }, function (err) {
          concluir(err, { numero_atendimento: numero, status: 'CANCELADO' });
        });
      });
    });
  }, callback);
};
