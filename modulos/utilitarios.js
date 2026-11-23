exports.erro = function (status, mensagem) {
  return { status: status, mensagem: mensagem };
};

// null/undefined → ''; tira os espaços das pontas.
exports.texto = function (valor) {
  if (valor === undefined || valor === null) {
    return '';
  }
  return String(valor).trim();
};

// Campo opcional em branco vira NULL no banco.
exports.nuloSeVazio = function (valor) {
  if (valor == '') {
    return null;
  }
  return valor;
};

// "123.456.789-09" → "12345678909"
exports.somenteDigitos = function (valor) {
  return exports.texto(valor).replace(/[^0-9]/g, '');
};

// " at0001 " → "AT0001"
exports.numeroAtendimento = function (valor) {
  return exports.texto(valor).toUpperCase();
};

// "AAAA-MM-DD" que exista no calendário e não seja futura.
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

// MASCARAMENTO (RNF09): "52998224725" → "***.***.*47-25"
exports.mascararCpf = function (cpf) {
  if (!cpf) {
    return cpf;
  }
  return '***.***.*' + cpf.slice(7, 9) + '-' + cpf.slice(9);
};

// "284731905" → "*****1905"
exports.mascararRg = function (rg) {
  if (!rg) {
    return rg;
  }
  let fim = rg.slice(-4);
  return '*'.repeat(rg.length - fim.length) + fim;
};
