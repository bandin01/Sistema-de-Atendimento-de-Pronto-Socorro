// Funções pequenas usadas por vários módulos do back-end.

// Cria um objeto de erro com o código HTTP e a mensagem para o usuário.
exports.erro = function (status, mensagem) {
  return { status: status, mensagem: mensagem };
};

// Converte qualquer valor recebido do formulário em texto sem espaços nas pontas.
exports.texto = function (valor) {
  if (valor === undefined || valor === null) {
    return '';
  }
  return String(valor).trim();
};

// Campo opcional deixado em branco é gravado como NULL no banco.
exports.nuloSeVazio = function (valor) {
  if (valor == '') {
    return null;
  }
  return valor;
};

// Mantém só os números de um texto. Ex.: "123.456.789-09" → "12345678909".
exports.somenteDigitos = function (valor) {
  return exports.texto(valor).replace(/[^0-9]/g, '');
};

// Padroniza o número digitado: " at0001 " → "AT0001".
exports.numeroAtendimento = function (valor) {
  return exports.texto(valor).toUpperCase();
};

// Data no formato "AAAA-MM-DD" (o formato do <input type="date">),
// que exista no calendário e não seja futura.
exports.dataValida = function (valor) {
  let partes = exports.texto(valor).split('-');
  if (partes.length != 3) {
    return false;
  }
  let ano = parseInt(partes[0], 10);
  let mes = parseInt(partes[1], 10);
  let dia = parseInt(partes[2], 10);
  let data = new Date(ano, mes - 1, dia);
  if (isNaN(data.getTime()) || data.getFullYear() != ano || data.getMonth() != mes - 1 || data.getDate() != dia) {
    return false;
  }
  return ano >= 1890 && data <= new Date();
};

// MASCARAMENTO (RNF09): esconde a maior parte do CPF e do RG para quem não
// precisa deles por completo. Valor vazio continua vazio.
// "52998224725" → "***.***.*47-25"
exports.mascararCpf = function (cpf) {
  if (!cpf) {
    return cpf;
  }
  return '***.***.*' + cpf.slice(7, 9) + '-' + cpf.slice(9);
};

// "284731905" → "*****1905" (ficam só os 4 últimos caracteres)
exports.mascararRg = function (rg) {
  if (!rg) {
    return rg;
  }
  let fim = rg.slice(-4);
  return '*'.repeat(rg.length - fim.length) + fim;
};
