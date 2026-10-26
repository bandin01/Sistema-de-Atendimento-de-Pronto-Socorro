// Tela da RECEPÇÃO: inclusão, consulta, alteração e cancelamento do atendimento.

let atendimentoAtual = null;   // atendimento que está aparecendo na consulta

carregarProfissionais('/api/recepcionistas', 'recepcionista', function (recepcionista) {
  return recepcionista.nome;
});
carregarRecentes();

function recepcionistaSelecionada() {
  return elemento('recepcionista').value;
}

// "12345678909" → "123.456.789-09"
function formatarCpf(cpf) {
  if (!cpf) {
    return '';
  }
  return cpf.slice(0, 3) + '.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-' + cpf.slice(9);
}

// ---------------------------------------------------------------------------
// INCLUSÃO: cadastra o paciente e gera o número do atendimento
// ---------------------------------------------------------------------------
elemento('formNovo').onsubmit = function (evento) {
  evento.preventDefault();
  if (recepcionistaSelecionada() == '') {
    mostrarMensagem('msgNovo', 'Selecione a recepcionista responsável, no topo da página.', 'erro');
    return;
  }
  let dados = dadosDoFormulario(elemento('formNovo'));
  dados.recepcionista_id = recepcionistaSelecionada();

  chamarApi('POST', '/api/atendimentos', dados, function (erro, resposta) {
    if (erro) {
      mostrarMensagem('msgNovo', erro, 'erro');
      return;
    }
    mostrarMensagem('msgNovo', 'Atendimento ' + resposta.numero_atendimento +
                    ' gerado com sucesso. Encaminhe o paciente para a triagem.', 'sucesso');
    elemento('formNovo').reset();
    carregarRecentes();
  });
};

// ---------------------------------------------------------------------------
// CONSULTA
// ---------------------------------------------------------------------------
elemento('formBusca').onsubmit = function (evento) {
  evento.preventDefault();
  consultar(elemento('numeroBusca').value);
};

function consultar(numero) {
  elemento('numeroBusca').value = numero;
  mostrarMensagem('msgAcao', '', '');
  chamarApi('GET', '/api/atendimentos?numero=' + encodeURIComponent(numero), null, function (erro, atendimento) {
    if (erro) {
      elemento('detalhe').hidden = true;
      mostrarMensagem('msgBusca', erro, 'erro');
      return;
    }
    mostrarMensagem('msgBusca', '', '');
    atendimentoAtual = atendimento;
    mostrarAtendimento(atendimento);
  });
}

function mostrarAtendimento(a) {
  elemento('tituloDetalhe').innerHTML = 'Atendimento ' + protegerTexto(a.numero_atendimento) +
    ' <span class="status">' + nomesStatus[a.status] + '</span>';

  let dados = '';
  dados += '<dt>Paciente</dt><dd>' + protegerTexto(a.nome) + '</dd>';
  dados += '<dt>Endereço</dt><dd>' + protegerTexto(a.endereco) + '</dd>';
  dados += '<dt>CPF</dt><dd>' + (a.cpf ? formatarCpf(a.cpf) : 'não informado') + '</dd>';
  dados += '<dt>RG</dt><dd>' + (a.rg ? protegerTexto(a.rg) : 'não informado') + '</dd>';
  dados += '<dt>Data de nascimento</dt><dd>' + formatarData(a.data_nascimento) + '</dd>';
  dados += '<dt>Nome do pai</dt><dd>' + (a.nome_pai ? protegerTexto(a.nome_pai) : 'não informado') + '</dd>';
  dados += '<dt>Nome da mãe</dt><dd>' + (a.nome_mae ? protegerTexto(a.nome_mae) : 'não informado') + '</dd>';
  dados += '<dt>Chegada</dt><dd>' + formatarData(a.criado_em) + '</dd>';
  if (a.confirmado_em) {
    dados += '<dt>Confirmado pelo médico</dt><dd>' + formatarData(a.confirmado_em) + ' – ' + protegerTexto(a.medico) + '</dd>';
  }
  if (a.finalizado_em) {
    dados += '<dt>Finalizado em</dt><dd>' + formatarData(a.finalizado_em) + '</dd>';
  }
  elemento('dadosAtendimento').innerHTML = dados;

  // Alterar e cancelar só aparecem antes da confirmação do médico (RF04, RF05).
  elemento('botoesAcoes').hidden = !a.pode_alterar;
  elemento('secaoAlterar').hidden = true;
  let aviso = '';
  if (a.status == 'CANCELADO') {
    aviso = 'Este atendimento foi cancelado.';
  } else if (a.status == 'FINALIZADO') {
    aviso = 'Atendimento finalizado: não pode mais ser alterado.';
  } else if (!a.pode_alterar) {
    aviso = 'Atendimento já confirmado pelo médico: não pode mais ser alterado nem cancelado.';
  }
  elemento('avisoBloqueio').textContent = aviso;
  elemento('avisoBloqueio').hidden = (aviso == '');

  let etapas = '';
  for (let i = 0; i < a.etapas.length; i++) {
    etapas += '<li><strong>' + formatarData(a.etapas[i].registrado_em) + '</strong> – ' +
              protegerTexto(a.etapas[i].descricao) + '</li>';
  }
  elemento('listaEtapas').innerHTML = etapas;

  let linhas = '';
  for (let i = 0; i < a.historico_status.length; i++) {
    let h = a.historico_status[i];
    let anterior = '–';
    if (h.status_anterior) {
      anterior = nomesStatus[h.status_anterior];
    }
    linhas += '<tr><td>' + formatarData(h.data_hora) + '</td><td>' + anterior + '</td><td>' +
              nomesStatus[h.status_novo] + '</td><td>' + protegerTexto(h.responsavel) + '</td></tr>';
  }
  elemento('tabelaHistorico').innerHTML = linhas;

  elemento('detalhe').hidden = false;
}

// ---------------------------------------------------------------------------
// ALTERAÇÃO
// ---------------------------------------------------------------------------
elemento('botaoAlterar').onclick = function () {
  let formulario = elemento('formAlterar');
  formulario.elements['nome'].value = atendimentoAtual.nome;
  formulario.elements['endereco'].value = atendimentoAtual.endereco;
  formulario.elements['cpf'].value = formatarCpf(atendimentoAtual.cpf);
  formulario.elements['rg'].value = atendimentoAtual.rg || '';
  formulario.elements['data_nascimento'].value = atendimentoAtual.data_nascimento;
  formulario.elements['nome_pai'].value = atendimentoAtual.nome_pai || '';
  formulario.elements['nome_mae'].value = atendimentoAtual.nome_mae || '';
  mostrarMensagem('msgAcao', '', '');
  elemento('secaoAlterar').hidden = false;
};

elemento('botaoDesistir').onclick = function () {
  elemento('secaoAlterar').hidden = true;
};

elemento('formAlterar').onsubmit = function (evento) {
  evento.preventDefault();
  let dados = dadosDoFormulario(elemento('formAlterar'));
  dados.numero_atendimento = atendimentoAtual.numero_atendimento;

  chamarApi('POST', '/api/atendimentos/alterar', dados, function (erro) {
    if (erro) {
      mostrarMensagem('msgAcao', erro, 'erro');
      return;
    }
    consultar(atendimentoAtual.numero_atendimento);
    mostrarMensagem('msgAcao', 'Dados do paciente alterados com sucesso.', 'sucesso');
    carregarRecentes();
  });
};

// ---------------------------------------------------------------------------
// CANCELAMENTO
// ---------------------------------------------------------------------------
elemento('botaoCancelar').onclick = function () {
  if (recepcionistaSelecionada() == '') {
    mostrarMensagem('msgAcao', 'Selecione a recepcionista responsável, no topo da página.', 'erro');
    return;
  }
  let confirmou = confirm('Deseja realmente cancelar o atendimento ' + atendimentoAtual.numero_atendimento +
                          ' de ' + atendimentoAtual.nome + '?');
  if (confirmou == false) {
    return;
  }
  let dados = {
    numero_atendimento: atendimentoAtual.numero_atendimento,
    recepcionista_id: recepcionistaSelecionada()
  };
  chamarApi('POST', '/api/atendimentos/cancelar', dados, function (erro) {
    if (erro) {
      mostrarMensagem('msgAcao', erro, 'erro');
      return;
    }
    consultar(atendimentoAtual.numero_atendimento);
    mostrarMensagem('msgAcao', 'Atendimento cancelado.', 'sucesso');
    carregarRecentes();
  });
};

// ---------------------------------------------------------------------------
// ATENDIMENTOS RECENTES
// ---------------------------------------------------------------------------
function carregarRecentes() {
  chamarApi('GET', '/api/atendimentos', null, function (erro, lista) {
    if (erro) {
      elemento('tabelaRecentes').innerHTML = '<tr><td colspan="4">' + protegerTexto(erro) + '</td></tr>';
      return;
    }
    let linhas = '';
    for (let i = 0; i < lista.length; i++) {
      let numero = protegerTexto(lista[i].numero_atendimento);
      linhas += '<tr>' +
                '<td><a href="#detalhe" onclick="consultar(\'' + numero + '\')">' + numero + '</a></td>' +
                '<td>' + protegerTexto(lista[i].nome) + '</td>' +
                '<td><span class="status">' + nomesStatus[lista[i].status] + '</span></td>' +
                '<td>' + formatarData(lista[i].criado_em) + '</td>' +
                '</tr>';
    }
    if (lista.length == 0) {
      linhas = '<tr><td colspan="4">Nenhum atendimento cadastrado.</td></tr>';
    }
    elemento('tabelaRecentes').innerHTML = linhas;
  });
}
