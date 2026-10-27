// Listas de profissionais para o campo "Profissional responsável" de cada tela.
let banco = require('./banco');

exports.recepcionistas = function (callback) {
  banco.executar('SELECT id, nome FROM recepcionistas WHERE ativo = 1 ORDER BY nome', [], callback);
};

// Só enfermeiros(as) da categoria ENFERMEIRO podem fazer a classificação de risco.
// Quem está em pausa ou indisponível também aparece, para poder entrar e voltar
// a ficar disponível; a triagem só é registrada por quem está DISPONIVEL.
exports.enfermeiros = function (callback) {
  let sql = 'SELECT id, nome, coren_numero, coren_uf FROM enfermeiros ' +
            "WHERE ativo = 1 AND categoria = 'ENFERMEIRO' " +
            'ORDER BY nome';
  banco.executar(sql, [], callback);
};

exports.medicos = function (callback) {
  let sql = 'SELECT id, nome, especialidade, crm_numero, crm_uf, status_operacional ' +
            'FROM medicos WHERE ativo = 1 ORDER BY nome';
  banco.executar(sql, [], callback);
};
