// Histórico do atendimento (RF14): mudanças de status com o responsável e etapas percorridas.
// registro = {
//   atendimentoId, statusAnterior, statusNovo,
//   responsavel: 'recepcionista_id' | 'enfermeiro_id' | 'medico_id'   (vai direto no SQL: só estes valores),
//   responsavelId,
//   etapas: [ { etapa: 'TRIAGEM', descricao: '...' }, ... ]   (pode ser vazio)
// }
exports.registrar = function (conexao, registro, callback) {
  let sqlStatus = 'INSERT INTO historico_status (atendimento_id, status_anterior, status_novo, ' +
                  registro.responsavel + ') VALUES (?, ?, ?, ?)';
  let valoresStatus = [registro.atendimentoId, registro.statusAnterior, registro.statusNovo, registro.responsavelId];

  conexao.query(sqlStatus, valoresStatus, function (err) {
    if (err) {
      return callback(err);
    }
    if (registro.etapas.length == 0) {
      return callback(null);
    }

    let sqlEtapas = 'INSERT INTO historico_etapas (atendimento_id, etapa, descricao) VALUES ';
    let valoresEtapas = [];
    for (let i = 0; i < registro.etapas.length; i++) {
      if (i > 0) {
        sqlEtapas += ', ';
      }
      sqlEtapas += '(?, ?, ?)';
      valoresEtapas.push(registro.atendimentoId, registro.etapas[i].etapa, registro.etapas[i].descricao.slice(0, 255));
    }
    conexao.query(sqlEtapas, valoresEtapas, function (err) {
      callback(err);
    });
  });
};
