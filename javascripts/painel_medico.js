// Tela do PAINEL DO MÉDICO: sequência de atendimento pela classificação de
// Manchester e chamada do próximo paciente.

// O(a) médico(a) responsável é quem entrou no sistema.
if (exigirPerfil('MEDICO')) {
  mostrarSituacao();
  carregarPainel();
  setInterval(carregarPainel, 10000);   // atualiza o painel a cada 10 segundos (RNF01)
}

// Mostra a situação do médico e, se ele já tiver uma consulta aberta, o link para continuar.
function mostrarSituacao() {
  mostrarMensagem('msgPainel', '', '');
  elemento('botaoChamar').disabled = false;
  chamarApi('GET', '/api/consulta', null, function (erro, resposta) {
    if (erro) {
      mostrarMensagem('msgPainel', erro, 'erro');
      return;
    }
    let situacao = resposta.medico.status_operacional;
    let texto = 'Situação: <span class="status">' + nomesStatus[situacao] + '</span>';
    // Em consulta, a situação só muda com o desfecho; fora do plantão, não chama paciente.
    elemento('botaoSituacao').disabled = (situacao == 'EM_CONSULTA');
    elemento('situacao').disabled = (situacao == 'EM_CONSULTA');
    if (situacao != 'EM_CONSULTA') {
      elemento('situacao').value = situacao;
    }
    if (situacao != 'EM_PLANTAO') {
      elemento('botaoChamar').disabled = true;
    }
    if (resposta.consulta) {
      texto += ' &nbsp; Consulta em andamento: <a href="consulta_medica.html">' +
               protegerTexto(resposta.consulta.numero_atendimento) + ' – ' + protegerTexto(resposta.consulta.nome) +
               ' (continuar)</a>';
      elemento('botaoChamar').disabled = true;
    }
    elemento('situacaoMedico').innerHTML = texto;
  });
}

// ALTERAR SITUAÇÃO: em plantão, em pausa, de folga ou de licença.
elemento('botaoSituacao').onclick = function () {
  let dados = { status_operacional: elemento('situacao').value };
  chamarApi('POST', '/api/painel/situacao', dados, function (erro) {
    if (erro) {
      mostrarMensagem('msgPainel', erro, 'erro');
      return;
    }
    mostrarSituacao();
    mostrarMensagem('msgPainel', 'Situação alterada.', 'sucesso');
  });
};

// CHAMAR PRÓXIMO: o sistema entrega ao médico o paciente de maior prioridade.
elemento('botaoChamar').onclick = function () {
  chamarApi('POST', '/api/painel/chamar', {}, function (erro) {
    if (erro) {
      mostrarMensagem('msgPainel', erro, 'erro');
      carregarPainel();
      return;
    }
    location.href = 'consulta_medica.html';
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
