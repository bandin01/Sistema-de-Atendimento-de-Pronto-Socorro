// Tela da TRIAGEM: a enfermagem registra os sinais vitais, as queixas e a
// classificação de Manchester do paciente.

let filaAtual = [];          // pacientes que estão na tabela da fila
let numeroEmTriagem = '';    // atendimento aberto no formulário

// O(a) enfermeiro(a) responsável é quem entrou no sistema.
if (exigirPerfil('ENFERMAGEM')) {
  carregarFila();
  setInterval(carregarFila, 15000);   // atualiza a fila a cada 15 segundos
}

function carregarFila() {
  chamarApi('GET', '/api/triagem/fila', null, function (erro, fila) {
    if (erro) {
      elemento('tabelaFila').innerHTML = '<tr><td colspan="5">' + protegerTexto(erro) + '</td></tr>';
      return;
    }
    filaAtual = fila;
    let linhas = '';
    for (let i = 0; i < fila.length; i++) {
      linhas += '<tr>' +
                '<td>' + protegerTexto(fila[i].numero_atendimento) + '</td>' +
                '<td>' + protegerTexto(fila[i].nome) + '</td>' +
                '<td>' + fila[i].idade + ' anos</td>' +
                '<td>' + formatarData(fila[i].criado_em) + '</td>' +
                '<td><button type="button" class="pequeno" onclick="abrirTriagem(' + i + ')">Triar</button></td>' +
                '</tr>';
    }
    if (fila.length == 0) {
      linhas = '<tr><td colspan="5">Nenhum paciente aguardando triagem.</td></tr>';
    }
    elemento('tabelaFila').innerHTML = linhas;
  });
}

function abrirTriagem(indice) {
  let paciente = filaAtual[indice];
  numeroEmTriagem = paciente.numero_atendimento;
  elemento('tituloTriagem').textContent = 'Triagem do atendimento ' + paciente.numero_atendimento +
                                          ' – ' + paciente.nome + ' (' + paciente.idade + ' anos)';
  elemento('formTriagem').reset();
  mostrarMensagem('msgFormulario', '', '');
  mostrarMensagem('msgTriagem', '', '');
  elemento('secaoTriagem').hidden = false;
  elemento('secaoTriagem').scrollIntoView();
}

elemento('botaoFechar').onclick = function () {
  elemento('secaoTriagem').hidden = true;
};

// Junta as queixas marcadas e o texto livre em um texto só.
// Ex.: "Dor de cabeça, Febre. Dor há 2 dias"
function montarQueixas() {
  let caixas = document.getElementsByClassName('queixa');
  let queixas = '';
  for (let i = 0; i < caixas.length; i++) {
    if (caixas[i].checked) {
      if (queixas != '') {
        queixas += ', ';
      }
      queixas += caixas[i].value;
    }
  }
  let outras = elemento('outrasQueixas').value.trim();
  if (outras != '') {
    if (queixas != '') {
      queixas += '. ';
    }
    queixas += outras;
  }
  return queixas;
}

elemento('formTriagem').onsubmit = function (evento) {
  evento.preventDefault();
  let dados = dadosDoFormulario(elemento('formTriagem'));
  dados.queixa_principal = montarQueixas();
  if (dados.queixa_principal == '') {
    mostrarMensagem('msgFormulario', 'Marque ou descreva ao menos uma queixa do paciente.', 'erro');
    return;
  }
  dados.numero_atendimento = numeroEmTriagem;

  chamarApi('POST', '/api/triagem', dados, function (erro) {
    if (erro) {
      mostrarMensagem('msgFormulario', erro, 'erro');
      return;
    }
    elemento('secaoTriagem').hidden = true;
    mostrarMensagem('msgTriagem', 'Triagem do atendimento ' + numeroEmTriagem + ' registrada (' +
                    dados.classificacao_manchester + '). O paciente já aparece no Painel do Médico.', 'sucesso');
    carregarFila();
  });
};
