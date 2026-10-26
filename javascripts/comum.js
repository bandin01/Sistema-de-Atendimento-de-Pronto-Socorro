// Funções usadas por todas as telas do sistema.

// Nomes amigáveis para os códigos gravados no banco (arrays associativos).
let nomesStatus = [];
nomesStatus['AGUARDANDO_TRIAGEM'] = 'Aguardando triagem';
nomesStatus['AGUARDANDO_CONSULTA'] = 'Aguardando consulta';
nomesStatus['EM_CONSULTA'] = 'Em consulta';
nomesStatus['FINALIZADO'] = 'Finalizado';
nomesStatus['CANCELADO'] = 'Cancelado';

nomesStatus['EM_PLANTAO'] = 'Em plantão';
nomesStatus['PAUSA'] = 'Em pausa';
nomesStatus['FOLGA'] = 'De folga';
nomesStatus['LICENCA'] = 'De licença';

// Protocolo de Manchester: prioridade e tempo-alvo de espera, em minutos.
let manchester = [];
manchester['VERMELHO'] = { prioridade: 'Emergência', tempoAlvo: 0 };
manchester['LARANJA'] = { prioridade: 'Muito urgente', tempoAlvo: 10 };
manchester['AMARELO'] = { prioridade: 'Urgente', tempoAlvo: 60 };
manchester['VERDE'] = { prioridade: 'Pouco urgente', tempoAlvo: 120 };
manchester['AZUL'] = { prioridade: 'Não urgente', tempoAlvo: 240 };

let nomesDesfecho = [];
nomesDesfecho['PRESCRICAO'] = 'Prescrição';
nomesDesfecho['EXAMES'] = 'Pedido de exames';
nomesDesfecho['ENCAMINHAMENTO'] = 'Encaminhamento';
nomesDesfecho['ALTA'] = 'Alta';

// Atalho para document.getElementById.
function elemento(id) {
  return document.getElementById(id);
}

// Envia uma requisição para a API do servidor. A resposta chega como texto
// JSON e é convertida em objeto com JSON.parse. Depois chama
// callback(erro, resposta): "erro" é a mensagem de erro, ou null se deu certo.
function chamarApi(metodo, endereco, dados, callback) {
  let requisicao = new XMLHttpRequest();
  requisicao.open(metodo, endereco);
  requisicao.setRequestHeader('Content-Type', 'application/json');
  requisicao.onload = function () {
    let resposta = JSON.parse(requisicao.responseText);
    if (requisicao.status == 200) {
      callback(null, resposta);
    } else {
      callback(resposta.erro);
    }
  };
  requisicao.onerror = function () {
    callback('Não foi possível falar com o servidor. Verifique se o "node servidor.js" está rodando.');
  };
  if (dados) {
    requisicao.send(JSON.stringify(dados));
  } else {
    requisicao.send();
  }
}

// Mostra uma mensagem na tela. tipo: 'sucesso' ou 'erro'. Texto vazio esconde.
function mostrarMensagem(id, texto, tipo) {
  let paragrafo = elemento(id);
  paragrafo.textContent = texto;
  paragrafo.className = 'mensagem ' + tipo;
  paragrafo.hidden = (texto == '');
}

// Troca os caracteres especiais do HTML (& < > ") pelos seus códigos, para que
// um texto digitado pelo usuário apareça na página exatamente como foi escrito.
function protegerTexto(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// "2026-10-15" → "15/10/2026"   e   "2026-10-15 14:30:00" → "15/10/2026 14:30"
function formatarData(texto) {
  if (!texto) {
    return '';
  }
  let partes = texto.split(' ');
  let data = partes[0].split('-');
  let resultado = data[2] + '/' + data[1] + '/' + data[0];
  if (partes.length > 1) {
    resultado += ' ' + partes[1].slice(0, 5);
  }
  return resultado;
}

// Etiqueta colorida com a classificação de Manchester.
function etiquetaManchester(cor) {
  return '<span class="manchester ' + cor.toLowerCase() + '">' + cor + ' – ' + manchester[cor].prioridade + '</span>';
}

// Lê um parâmetro do endereço da página. Ex.: em "consulta_medica.html?medico=2",
// lerParametro('medico') devolve "2".
function lerParametro(nome) {
  let parametros = location.search.replace('?', '').split('&');
  for (let i = 0; i < parametros.length; i++) {
    let par = parametros[i].split('=');
    if (par[0] == nome) {
      return decodeURIComponent(par[1]);
    }
  }
  return '';
}

// Junta os campos de um formulário (pelo atributo name) em um objeto.
// Botões de rádio só entram se estiverem marcados.
function dadosDoFormulario(formulario) {
  let dados = {};
  for (let i = 0; i < formulario.elements.length; i++) {
    let campo = formulario.elements[i];
    let marcado = (campo.type != 'radio' || campo.checked);
    if (campo.name != '' && marcado) {
      dados[campo.name] = campo.value;
    }
  }
  return dados;
}

// Carrega a lista de profissionais de um <select>. "texto" é uma função que
// monta o que aparece em cada opção.
function carregarProfissionais(endereco, idSelect, texto, callback) {
  chamarApi('GET', endereco, null, function (erro, lista) {
    let select = elemento(idSelect);
    if (erro) {
      select.innerHTML = '<option value="">' + protegerTexto(erro) + '</option>';
      return;
    }
    let opcoes = '<option value="">Selecione...</option>';
    for (let i = 0; i < lista.length; i++) {
      opcoes += '<option value="' + lista[i].id + '">' + protegerTexto(texto(lista[i])) + '</option>';
    }
    select.innerHTML = opcoes;
    if (callback) {
      callback(lista);
    }
  });
}
