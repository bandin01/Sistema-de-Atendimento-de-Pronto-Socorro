// Módulo do MÉDICO: painel de atendimentos, chamada do próximo paciente,
// registro de medicações e finalização (confirmação) do atendimento.
let banco = require('./banco');
let historico = require('./historico');
let util = require('./utilitarios');

let vias = ['ORAL', 'SUBLINGUAL', 'INTRAVENOSA', 'INTRAMUSCULAR', 'SUBCUTANEA', 'INALATORIA',
            'NASAL', 'TOPICA', 'OFTALMICA', 'RETAL', 'OUTRA'];
let tiposDesfecho = ['PRESCRICAO', 'EXAMES', 'ENCAMINHAMENTO', 'ALTA'];

// Ordem do protocolo de Manchester, usada no ORDER BY do painel e da chamada.
let ordemManchester = "FIELD(t.classificacao_manchester, 'VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL')";

// PAINEL (RF09, RF10): pacientes já triados, esperando o médico, na ordem de
// Manchester; dentro da mesma cor, quem foi triado primeiro vem antes.
exports.painel = function (callback) {
  let sql = 'SELECT a.numero_atendimento, p.nome, p.data_nascimento, ' +
            'TIMESTAMPDIFF(YEAR, p.data_nascimento, CURDATE()) AS idade, ' +
            't.classificacao_manchester, t.queixa_principal, t.realizada_em, ' +
            'TIMESTAMPDIFF(MINUTE, t.realizada_em, NOW()) AS espera_minutos ' +
            'FROM atendimentos a ' +
            'JOIN pacientes p ON p.id = a.paciente_id ' +
            'JOIN triagens t ON t.atendimento_id = a.id ' +
            "WHERE a.status = 'AGUARDANDO_CONSULTA' " +
            'ORDER BY ' + ordemManchester + ', t.realizada_em, a.id';
  banco.executar(sql, [], callback);
};

// Marca o atendimento como EM_CONSULTA, abre a consulta e coloca o médico em consulta.
function abrirConsulta(conexao, medicoId, atendimentoId, callback) {
  // O "AND status = ..." garante que dois médicos não peguem o mesmo paciente.
  let sql = "UPDATE atendimentos SET status = 'EM_CONSULTA' WHERE id = ? AND status = 'AGUARDANDO_CONSULTA'";
  conexao.query(sql, [atendimentoId], function (err, resultado) {
    if (err) {
      return callback(err);
    }
    if (resultado.affectedRows == 0) {
      return callback(util.erro(400, 'Este paciente acabou de ser chamado por outro médico. Tente novamente.'));
    }
    banco.executarEmOrdem(conexao, [
      { sql: 'INSERT INTO consultas (atendimento_id, medico_id) VALUES (?, ?)', valores: [atendimentoId, medicoId] },
      { sql: "UPDATE medicos SET status_operacional = 'EM_CONSULTA' WHERE id = ?", valores: [medicoId] }
    ], callback);
  });
}

// CHAMAR PRÓXIMO: o médico chama o paciente de maior prioridade. Este é o
// momento da CONFIRMAÇÃO MÉDICA: depois dele a recepção não altera nem
// cancela mais o atendimento.
exports.chamarProximo = function (dados, callback) {
  let medicoId = parseInt(dados.medico_id, 10);
  if (isNaN(medicoId)) {
    return callback(util.erro(400, 'Selecione o médico.'));
  }

  banco.transacao(function (conexao, concluir) {
    let sqlMedico = 'SELECT nome, crm_numero, crm_uf, status_operacional FROM medicos ' +
                    'WHERE id = ? AND ativo = 1 FOR UPDATE';
    conexao.query(sqlMedico, [medicoId], function (err, medicos) {
      if (err) {
        return concluir(err);
      }
      if (medicos.length == 0) {
        return concluir(util.erro(404, 'Médico não encontrado.'));
      }
      let medico = medicos[0];
      if (medico.status_operacional == 'EM_CONSULTA') {
        return concluir(util.erro(400, 'Você já tem uma consulta em andamento. Finalize-a antes de chamar o próximo paciente.'));
      }
      if (medico.status_operacional != 'EM_PLANTAO') {
        return concluir(util.erro(400, 'O médico precisa estar em plantão para chamar pacientes.'));
      }

      let sqlFila = 'SELECT a.id, a.numero_atendimento FROM atendimentos a ' +
                    'JOIN triagens t ON t.atendimento_id = a.id ' +
                    "WHERE a.status = 'AGUARDANDO_CONSULTA' " +
                    'ORDER BY ' + ordemManchester + ', t.realizada_em, a.id LIMIT 1 FOR UPDATE';
      conexao.query(sqlFila, [], function (err, fila) {
        if (err) {
          return concluir(err);
        }
        if (fila.length == 0) {
          return concluir(util.erro(400, 'Não há pacientes aguardando atendimento.'));
        }
        let atendimento = fila[0];
        abrirConsulta(conexao, medicoId, atendimento.id, function (err) {
          if (err) {
            return concluir(err);
          }
          historico.registrar(conexao, {
            atendimentoId: atendimento.id,
            statusAnterior: 'AGUARDANDO_CONSULTA',
            statusNovo: 'EM_CONSULTA',
            responsavel: 'medico_id',
            responsavelId: medicoId,
            etapas: [
              { etapa: 'CONSULTA',
                descricao: 'Consulta iniciada por ' + medico.nome + ' (CRM-' + medico.crm_uf + ' ' + medico.crm_numero + ').' }
            ]
          }, function (err) {
            concluir(err, { numero_atendimento: atendimento.numero_atendimento, status: 'EM_CONSULTA' });
          });
        });
      });
    });
  }, callback);
};

// Dados da consulta em andamento do médico (RF11): paciente, triagem e medicações.
// Não devolve CPF nem RG: o médico não precisa deles (RNF09).
exports.consultaAberta = function (medicoId, callback) {
  medicoId = parseInt(medicoId, 10);
  if (isNaN(medicoId)) {
    return callback(util.erro(404, 'Médico não encontrado.'));
  }
  let sqlMedico = 'SELECT id, nome, especialidade, crm_numero, crm_uf, status_operacional ' +
                  'FROM medicos WHERE id = ? AND ativo = 1';
  banco.executar(sqlMedico, [medicoId], function (err, medicos) {
    if (err) {
      return callback(err);
    }
    if (medicos.length == 0) {
      return callback(util.erro(404, 'Médico não encontrado.'));
    }
    let resposta = { medico: medicos[0], consulta: null, prescricoes: [] };

    let sql = 'SELECT a.id, a.numero_atendimento, a.status, c.iniciada_em, ' +
              'p.nome, p.data_nascimento, p.nome_mae, ' +
              'TIMESTAMPDIFF(YEAR, p.data_nascimento, CURDATE()) AS idade, ' +
              't.classificacao_manchester, t.queixa_principal, t.pressao_sistolica, t.pressao_diastolica, ' +
              't.temperatura, t.frequencia_cardiaca, t.realizada_em, e.nome AS enfermeiro ' +
              'FROM consultas c ' +
              'JOIN atendimentos a ON a.id = c.atendimento_id ' +
              'JOIN pacientes p ON p.id = a.paciente_id ' +
              'JOIN triagens t ON t.atendimento_id = a.id ' +
              'JOIN enfermeiros e ON e.id = t.enfermeiro_id ' +
              'WHERE c.medico_id = ? AND c.finalizada_em IS NULL';
    banco.executar(sql, [medicoId], function (err, consultas) {
      if (err) {
        return callback(err);
      }
      if (consultas.length == 0) {
        return callback(null, resposta);
      }
      resposta.consulta = consultas[0];
      let sqlPrescricoes = 'SELECT medicamento, dosagem, via_administracao, frequencia, observacoes, criado_em ' +
                           'FROM prescricoes WHERE atendimento_id = ? ORDER BY id';
      banco.executar(sqlPrescricoes, [resposta.consulta.id], function (err, prescricoes) {
        if (err) {
          return callback(err);
        }
        resposta.prescricoes = prescricoes;
        callback(null, resposta);
      });
    });
  });
};

// MEDICAÇÕES (RF12): só o médico da consulta aberta pode prescrever.
// O banco também confere (trigger trg_prescricoes_bi_medico).
exports.registrarPrescricao = function (dados, callback) {
  let medicoId = parseInt(dados.medico_id, 10);
  let numero = util.numeroAtendimento(dados.numero_atendimento);
  let prescricao = {
    medicamento: util.texto(dados.medicamento),
    dosagem: util.texto(dados.dosagem),
    via_administracao: util.texto(dados.via_administracao).toUpperCase(),
    frequencia: util.texto(dados.frequencia),
    observacoes: util.texto(dados.observacoes)
  };

  if (isNaN(medicoId)) {
    return callback(util.erro(400, 'Selecione o médico.'));
  }
  if (prescricao.medicamento.length < 2 || prescricao.medicamento.length > 150) {
    return callback(util.erro(400, 'Informe o medicamento.'));
  }
  if (prescricao.dosagem.length < 1 || prescricao.dosagem.length > 60) {
    return callback(util.erro(400, 'Informe a dosagem (ex.: 500 mg).'));
  }
  if (vias.indexOf(prescricao.via_administracao) == -1) {
    return callback(util.erro(400, 'Selecione a via de administração.'));
  }
  if (prescricao.frequencia.length < 1 || prescricao.frequencia.length > 60) {
    return callback(util.erro(400, 'Informe a frequência (ex.: de 8 em 8 horas).'));
  }
  if (prescricao.observacoes.length > 500) {
    return callback(util.erro(400, 'As observações podem ter no máximo 500 caracteres.'));
  }

  let sqlConsulta = 'SELECT a.id FROM consultas c JOIN atendimentos a ON a.id = c.atendimento_id ' +
                    'WHERE c.medico_id = ? AND c.finalizada_em IS NULL AND a.numero_atendimento = ?';
  banco.executar(sqlConsulta, [medicoId, numero], function (err, linhas) {
    if (err) {
      return callback(err);
    }
    if (linhas.length == 0) {
      return callback(util.erro(400, 'Este médico não tem consulta aberta para o atendimento ' + numero + '.'));
    }
    let sql = 'INSERT INTO prescricoes (atendimento_id, medico_id, medicamento, dosagem, via_administracao, ' +
              'frequencia, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)';
    let valores = [linhas[0].id, medicoId, prescricao.medicamento, prescricao.dosagem, prescricao.via_administracao,
                   prescricao.frequencia, util.nuloSeVazio(prescricao.observacoes)];
    banco.executar(sql, valores, function (err) {
      if (err) {
        return callback(err);
      }
      callback(null, { numero_atendimento: numero, medicamento: prescricao.medicamento });
    });
  });
};

// FINALIZAÇÃO (RF13): o médico confirma o atendimento registrando o desfecho
// da consulta (prescrição, pedido de exames, encaminhamento ou alta).
exports.finalizar = function (dados, callback) {
  let medicoId = parseInt(dados.medico_id, 10);
  let numero = util.numeroAtendimento(dados.numero_atendimento);
  let tipo = util.texto(dados.tipo).toUpperCase();
  let descricao = util.texto(dados.descricao);
  let destino = util.texto(dados.destino_encaminhamento);

  if (isNaN(medicoId)) {
    return callback(util.erro(400, 'Selecione o médico.'));
  }
  if (tiposDesfecho.indexOf(tipo) == -1) {
    return callback(util.erro(400, 'Selecione o desfecho do atendimento.'));
  }
  if (descricao.length < 3 || descricao.length > 500) {
    return callback(util.erro(400, 'Descreva a conduta / orientações (de 3 a 500 caracteres).'));
  }
  if (tipo == 'ENCAMINHAMENTO' && (destino.length < 3 || destino.length > 150)) {
    return callback(util.erro(400, 'Informe para onde o paciente será encaminhado.'));
  }
  if (tipo != 'ENCAMINHAMENTO') {
    destino = '';   // o destino só é gravado no encaminhamento
  }

  banco.transacao(function (conexao, concluir) {
    let sql = 'SELECT c.id AS consulta_id, a.id AS atendimento_id, ' +
              '(SELECT COUNT(*) FROM prescricoes pr WHERE pr.atendimento_id = a.id) AS total_prescricoes ' +
              'FROM consultas c JOIN atendimentos a ON a.id = c.atendimento_id ' +
              'WHERE c.medico_id = ? AND c.finalizada_em IS NULL AND a.numero_atendimento = ? FOR UPDATE';
    conexao.query(sql, [medicoId, numero], function (err, linhas) {
      if (err) {
        return concluir(err);
      }
      if (linhas.length == 0) {
        return concluir(util.erro(400, 'Este médico não tem consulta aberta para o atendimento ' + numero + '.'));
      }
      let consulta = linhas[0];
      if (tipo == 'PRESCRICAO' && consulta.total_prescricoes == 0) {
        return concluir(util.erro(400, 'Para o desfecho Prescrição, registre ao menos uma medicação.'));
      }

      // Desfecho, fim da consulta, fim do atendimento e médico de volta ao plantão.
      // Os triggers do banco garantem que nada disso aconteça sem o desfecho.
      banco.executarEmOrdem(conexao, [
        { sql: 'INSERT INTO desfechos (consulta_id, tipo, descricao, destino_encaminhamento) VALUES (?, ?, ?, ?)',
          valores: [consulta.consulta_id, tipo, descricao, util.nuloSeVazio(destino)] },
        { sql: 'UPDATE consultas SET finalizada_em = NOW() WHERE id = ?',
          valores: [consulta.consulta_id] },
        { sql: "UPDATE atendimentos SET status = 'FINALIZADO', finalizado_em = NOW() WHERE id = ?",
          valores: [consulta.atendimento_id] },
        { sql: "UPDATE medicos SET status_operacional = 'EM_PLANTAO' WHERE id = ?",
          valores: [medicoId] }
      ], function (err) {
        if (err) {
          return concluir(err);
        }
        let texto = 'Desfecho registrado: ' + tipo + '.';
        if (tipo == 'ENCAMINHAMENTO') {
          texto = 'Desfecho registrado: ENCAMINHAMENTO para ' + destino + '.';
        }
        historico.registrar(conexao, {
          atendimentoId: consulta.atendimento_id,
          statusAnterior: 'EM_CONSULTA',
          statusNovo: 'FINALIZADO',
          responsavel: 'medico_id',
          responsavelId: medicoId,
          etapas: [ { etapa: 'DESFECHO', descricao: texto } ]
        }, function (err) {
          concluir(err, { numero_atendimento: numero, status: 'FINALIZADO' });
        });
      });
    });
  }, callback);
};
