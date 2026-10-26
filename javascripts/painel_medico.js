// Tela do PAINEL DO MÉDICO: sequência de atendimento pela classificação de
// Manchester e chamada do próximo paciente.

carregarProfissionais('/api/medicos', 'medico', function (medico) {
  return medico.nome + ' – ' + medico.especialidade;
}, function () {
  // Volta da tela de consulta com o médico já escolhido: painel_medico.html?medico=1
  let escolhido = lerParametro('medico');
  if (escolhido != '') {
    elemento('medico').value = escolhido;
  }
  mostrarSituacao();
});
carregarPainel();
setInterval(carregarPainel, 10000);   // atualiza o painel a cada 10 segundos (RNF01)

elemento('medico').onchange = mostrarSituacao;

// Mostra a situação do médico e, se ele já tiver uma consulta aberta, o link para continuar.
function mostrarSituacao() {
  let medicoId = elemento('medico').value;
  mostrarMensagem('msgPainel', '', '');
  elemento('botaoChamar').disabled = false;
  if (medicoId == '') {
    elemento('situacaoMedico').innerHTML = '';
    return;
  }
  chamarApi('GET', '/api/consulta?medico=' + medicoId, null, function (erro, resposta) {
    if (erro) {
      mostrarMensagem('msgPainel', erro, 'erro');
      return;
    }
    let texto = 'Situação: <span class="status">' + nomesStatus[resposta.medico.status_operacional] + '</span>';
    if (resposta.consulta) {
      texto += ' &nbsp; Consulta em andamento: <a href="consulta_medica.html?medico=' + medicoId + '">' +
               protegerTexto(resposta.consulta.numero_atendimento) + ' – ' + protegerTexto(resposta.consulta.nome) +
               ' (continuar)</a>';
      elemento('botaoChamar').disabled = true;
    }
    elemento('situacaoMedico').innerHTML = texto;
  });
}

// CHAMAR PRÓXIMO: o sistema entrega ao médico o paciente de maior prioridade.
elemento('botaoChamar').onclick = function () {
  let medicoId = elemento('medico').value;
  if (medicoId == '') {
    mostrarMensagem('msgPainel', 'Selecione o(a) médico(a).', 'erro');
    return;
  }
  chamarApi('POST', '/api/painel/chamar', { medico_id: medicoId }, function (erro) {
    if (erro) {
      mostrarMensagem('msgPainel', erro, 'erro');
      carregarPainel();
      return;
    }
    location.href = 'consulta_medica.html?medico=' + medicoId;
  });
};

function carregarPainel() {
  chamarApi('GET', '/api/painel', null, function (erro, fila) {
    if (erro) {
      elemento('tabelaPainel').innerHTML = '<tr><td colspan="7">' + protegerTexto(erro) + '</td></tr>';
      return;
    }
    let linhas = '';
    for (let i = 0; i < fila.length; i++) {
      let p = fila[i];
      let ordem = (i + 1) + 'º';
      if (i == 0) {
        ordem = '<strong>1º – próximo</strong>';
      }
      // Espera acima do tempo-alvo da cor fica destacada.
      let espera = p.espera_minutos + ' min';
      if (p.espera_minutos > manchester[p.classificacao_manchester].tempoAlvo) {
        espera = '<span class="atrasado">' + espera + '</span>';
      }
      linhas += '<tr class="' + p.classificacao_manchester.toLowerCase() + '">' +
                '<td>' + ordem + '</td>' +
                '<td>' + etiquetaManchester(p.classificacao_manchester) + '</td>' +
                '<td>' + protegerTexto(p.numero_atendimento) + '</td>' +
                '<td>' + protegerTexto(p.nome) + '</td>' +
                '<td>' + formatarData(p.data_nascimento) + ' (' + p.idade + ' anos)</td>' +
                '<td>' + protegerTexto(p.queixa_principal) + '</td>' +
                '<td>' + espera + '</td>' +
                '</tr>';
    }
    if (fila.length == 0) {
      linhas = '<tr><td colspan="7">Nenhum paciente aguardando atendimento médico.</td></tr>';
    }
    elemento('tabelaPainel').innerHTML = linhas;
    elemento('horaAtualizacao').textContent = new Date().toLocaleTimeString('pt-BR');
  });
}
