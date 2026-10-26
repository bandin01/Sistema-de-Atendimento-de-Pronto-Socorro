// Tela da CONSULTA MÉDICA: o médico vê os dados do paciente e da triagem,
// registra as medicações e confirma (finaliza) o atendimento.
// O médico vem no endereço da página: consulta_medica.html?medico=1

let medicoId = lerParametro('medico');
let consultaAtual = null;

elemento('linkPainel').href = 'painel_medico.html?medico=' + medicoId;
elemento('voltarPainel').href = 'painel_medico.html?medico=' + medicoId;

carregarConsulta();

function semConsulta(texto) {
  elemento('textoSemConsulta').textContent = texto;
  elemento('semConsulta').hidden = false;
  elemento('consulta').hidden = true;
}

function carregarConsulta() {
  if (medicoId == '') {
    semConsulta('Escolha o(a) médico(a) no Painel de Atendimento e clique em "Chamar próximo paciente".');
    return;
  }
  chamarApi('GET', '/api/consulta?medico=' + encodeURIComponent(medicoId), null, function (erro, resposta) {
    if (erro) {
      semConsulta(erro);
      return;
    }
    let m = resposta.medico;
    elemento('identificacaoMedico').textContent = m.nome + ' – ' + m.especialidade +
                                                  ' (CRM-' + m.crm_uf + ' ' + m.crm_numero + ')';
    if (resposta.consulta == null) {
      semConsulta('Este(a) médico(a) não tem consulta aberta no momento.');
      return;
    }
    consultaAtual = resposta.consulta;
    mostrarConsulta(resposta.consulta, resposta.prescricoes);
  });
}

function mostrarConsulta(c, prescricoes) {
  elemento('tituloConsulta').innerHTML = 'Atendimento ' + protegerTexto(c.numero_atendimento) + ' – ' +
                                         protegerTexto(c.nome) + ' ' + etiquetaManchester(c.classificacao_manchester);

  let dados = '';
  dados += '<dt>Paciente</dt><dd>' + protegerTexto(c.nome) + '</dd>';
  dados += '<dt>Data de nascimento</dt><dd>' + formatarData(c.data_nascimento) + ' (' + c.idade + ' anos)</dd>';
  dados += '<dt>Nome da mãe</dt><dd>' + (c.nome_mae ? protegerTexto(c.nome_mae) : 'não informado') + '</dd>';
  dados += '<dt>Classificação</dt><dd>' + etiquetaManchester(c.classificacao_manchester) + '</dd>';
  dados += '<dt>Principais queixas</dt><dd>' + protegerTexto(c.queixa_principal) + '</dd>';
  dados += '<dt>Pressão arterial</dt><dd>' + c.pressao_sistolica + ' x ' + c.pressao_diastolica + ' mmHg</dd>';
  dados += '<dt>Temperatura</dt><dd>' + String(c.temperatura).replace('.', ',') + ' °C</dd>';
  dados += '<dt>Batimentos cardíacos</dt><dd>' + c.frequencia_cardiaca + ' bpm</dd>';
  dados += '<dt>Triagem</dt><dd>' + formatarData(c.realizada_em) + ' – ' + protegerTexto(c.enfermeiro) + '</dd>';
  dados += '<dt>Consulta iniciada em</dt><dd>' + formatarData(c.iniciada_em) + '</dd>';
  elemento('dadosConsulta').innerHTML = dados;

  let linhas = '';
  for (let i = 0; i < prescricoes.length; i++) {
    let p = prescricoes[i];
    linhas += '<tr>' +
              '<td>' + protegerTexto(p.medicamento) + '</td>' +
              '<td>' + protegerTexto(p.dosagem) + '</td>' +
              '<td>' + protegerTexto(p.via_administracao) + '</td>' +
              '<td>' + protegerTexto(p.frequencia) + '</td>' +
              '<td>' + protegerTexto(p.observacoes) + '</td>' +
              '<td>' + formatarData(p.criado_em) + '</td>' +
              '</tr>';
  }
  if (prescricoes.length == 0) {
    linhas = '<tr><td colspan="6">Nenhuma medicação registrada ainda.</td></tr>';
  }
  elemento('tabelaPrescricoes').innerHTML = linhas;

  elemento('semConsulta').hidden = true;
  elemento('consulta').hidden = false;
}

// ---------------------------------------------------------------------------
// MEDICAÇÕES
// ---------------------------------------------------------------------------
elemento('formPrescricao').onsubmit = function (evento) {
  evento.preventDefault();
  let dados = dadosDoFormulario(elemento('formPrescricao'));
  dados.medico_id = medicoId;
  dados.numero_atendimento = consultaAtual.numero_atendimento;

  chamarApi('POST', '/api/consulta/prescricao', dados, function (erro) {
    if (erro) {
      mostrarMensagem('msgPrescricao', erro, 'erro');
      return;
    }
    mostrarMensagem('msgPrescricao', 'Medicação "' + dados.medicamento + '" registrada.', 'sucesso');
    elemento('formPrescricao').reset();
    carregarConsulta();
  });
};

// ---------------------------------------------------------------------------
// CONFIRMAÇÃO / FINALIZAÇÃO
// ---------------------------------------------------------------------------
// O destino só é pedido quando o desfecho é um encaminhamento.
elemento('tipoDesfecho').onchange = function () {
  let encaminhamento = (elemento('tipoDesfecho').value == 'ENCAMINHAMENTO');
  elemento('campoDestino').hidden = !encaminhamento;
  elemento('formFinalizar').elements['destino_encaminhamento'].required = encaminhamento;
};

elemento('formFinalizar').onsubmit = function (evento) {
  evento.preventDefault();
  let confirmou = confirm('Confirmar e finalizar o atendimento ' + consultaAtual.numero_atendimento +
                          '? Depois disso ele não poderá mais ser alterado.');
  if (confirmou == false) {
    return;
  }
  let dados = dadosDoFormulario(elemento('formFinalizar'));
  dados.medico_id = medicoId;
  dados.numero_atendimento = consultaAtual.numero_atendimento;

  chamarApi('POST', '/api/consulta/finalizar', dados, function (erro) {
    if (erro) {
      mostrarMensagem('msgFinalizar', erro, 'erro');
      return;
    }
    alert('Atendimento ' + consultaAtual.numero_atendimento + ' finalizado com sucesso.');
    location.href = 'painel_medico.html?medico=' + medicoId;
  });
};
