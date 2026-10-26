// Módulo da TRIAGEM (enfermagem): sinais vitais, queixas e classificação de Manchester.
let banco = require('./banco');
let historico = require('./historico');
let util = require('./utilitarios');

// Cores do protocolo de Manchester, da mais urgente para a menos urgente.
let classificacoes = ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'];

// Pacientes que já passaram pela recepção e esperam a triagem, por ordem de chegada.
exports.fila = function (callback) {
  let sql = 'SELECT a.numero_atendimento, p.nome, p.data_nascimento, ' +
            'TIMESTAMPDIFF(YEAR, p.data_nascimento, CURDATE()) AS idade, a.criado_em ' +
            'FROM atendimentos a JOIN pacientes p ON p.id = a.paciente_id ' +
            "WHERE a.status = 'AGUARDANDO_TRIAGEM' " +
            'ORDER BY a.criado_em, a.id';
  banco.executar(sql, [], callback);
};

// Lê e valida os dados da triagem. Devolve { triagem, problema }.
function lerTriagem(dados) {
  let triagem = {
    pressao_sistolica: parseInt(dados.pressao_sistolica, 10),
    pressao_diastolica: parseInt(dados.pressao_diastolica, 10),
    temperatura: parseFloat(util.texto(dados.temperatura).replace(',', '.')),
    frequencia_cardiaca: parseInt(dados.frequencia_cardiaca, 10),
    queixa_principal: util.texto(dados.queixa_principal),
    classificacao_manchester: util.texto(dados.classificacao_manchester).toUpperCase()
  };
  let problema = '';

  if (isNaN(triagem.pressao_sistolica) || triagem.pressao_sistolica < 50 || triagem.pressao_sistolica > 300) {
    problema = 'Pressão sistólica inválida (de 50 a 300 mmHg).';
  } else if (isNaN(triagem.pressao_diastolica) || triagem.pressao_diastolica < 20 || triagem.pressao_diastolica > 200) {
    problema = 'Pressão diastólica inválida (de 20 a 200 mmHg).';
  } else if (triagem.pressao_diastolica >= triagem.pressao_sistolica) {
    problema = 'A pressão diastólica deve ser menor que a sistólica.';
  } else if (isNaN(triagem.temperatura) || triagem.temperatura < 30 || triagem.temperatura > 45) {
    problema = 'Temperatura inválida (de 30 a 45 °C).';
  } else if (isNaN(triagem.frequencia_cardiaca) || triagem.frequencia_cardiaca < 20 || triagem.frequencia_cardiaca > 250) {
    problema = 'Batimentos cardíacos inválidos (de 20 a 250 bpm).';
  } else if (triagem.queixa_principal.length < 3 || triagem.queixa_principal.length > 500) {
    problema = 'Informe as principais queixas do paciente.';
  } else if (classificacoes.indexOf(triagem.classificacao_manchester) == -1) {
    problema = 'Selecione a classificação de Manchester.';
  }
  return { triagem: triagem, problema: problema };
}

// Registra a triagem (RF06, RF07, RF08) e envia o paciente para a fila do médico.
exports.registrar = function (dados, callback) {
  let numero = util.numeroAtendimento(dados.numero_atendimento);
  let enfermeiroId = parseInt(dados.enfermeiro_id, 10);
  if (isNaN(enfermeiroId)) {
    return callback(util.erro(400, 'Selecione o(a) enfermeiro(a) responsável.'));
  }
  let lido = lerTriagem(dados);
  if (lido.problema != '') {
    return callback(util.erro(400, lido.problema));
  }
  let triagem = lido.triagem;

  banco.transacao(function (conexao, concluir) {
    let sql = 'SELECT a.id, a.status, (SELECT e.nome FROM enfermeiros e WHERE e.id = ?) AS enfermeiro ' +
              'FROM atendimentos a WHERE a.numero_atendimento = ? FOR UPDATE';
    conexao.query(sql, [enfermeiroId, numero], function (err, linhas) {
      if (err) {
        return concluir(err);
      }
      if (linhas.length == 0) {
        return concluir(util.erro(404, 'Atendimento ' + numero + ' não encontrado.'));
      }
      let atendimento = linhas[0];
      if (atendimento.status != 'AGUARDANDO_TRIAGEM') {
        return concluir(util.erro(400, 'O atendimento ' + numero + ' não está aguardando triagem.'));
      }

      // O trigger trg_triagens_bi_enfermeiro confere, no banco, se quem triou
      // é um(a) enfermeiro(a) ativo(a) da categoria ENFERMEIRO.
      let sqlTriagem = 'INSERT INTO triagens (atendimento_id, enfermeiro_id, classificacao_manchester, ' +
                       'queixa_principal, pressao_sistolica, pressao_diastolica, frequencia_cardiaca, temperatura) ' +
                       'VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
      let valores = [atendimento.id, enfermeiroId, triagem.classificacao_manchester, triagem.queixa_principal,
                     triagem.pressao_sistolica, triagem.pressao_diastolica, triagem.frequencia_cardiaca,
                     triagem.temperatura];
      conexao.query(sqlTriagem, valores, function (err) {
        if (err) {
          return concluir(err);
        }
        let sqlStatus = "UPDATE atendimentos SET status = 'AGUARDANDO_CONSULTA' WHERE id = ?";
        conexao.query(sqlStatus, [atendimento.id], function (err) {
          if (err) {
            return concluir(err);
          }
          historico.registrar(conexao, {
            atendimentoId: atendimento.id,
            statusAnterior: 'AGUARDANDO_TRIAGEM',
            statusNovo: 'AGUARDANDO_CONSULTA',
            responsavel: 'enfermeiro_id',
            responsavelId: enfermeiroId,
            etapas: [
              { etapa: 'TRIAGEM',
                descricao: 'Triagem realizada por ' + atendimento.enfermeiro +
                           ': classificação ' + triagem.classificacao_manchester + '.' }
            ]
          }, function (err) {
            concluir(err, { numero_atendimento: numero, status: 'AGUARDANDO_CONSULTA' });
          });
        });
      });
    });
  }, callback);
};
