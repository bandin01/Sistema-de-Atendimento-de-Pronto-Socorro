// Página inicial: entrada por perfil + login + senha. Aqui só se avisa se faltou campo;
// a conferência de verdade é no servidor.

mostrarSituacao();

function mostrarSituacao() {
  let sessao = lerSessao();
  elemento('formEntrar').hidden = (sessao != null);
  elemento('jaEntrou').hidden = (sessao == null);
  if (sessao != null) {
    elemento('usuarioLogado').innerHTML = 'Você entrou como <strong>' + protegerTexto(sessao.nome) + '</strong> (' +
      nomesPerfil[sessao.perfil] + '). <button type="button" class="pequeno" onclick="sair()">Sair</button>';
    elemento('linkMinhaArea').href = paginasPerfil[sessao.perfil];
  }
}

function campoQueFalta(dados) {
  if (dados.perfil == '') {
    elemento('perfil').focus();
    return 'Selecione o seu perfil de acesso.';
  }
  if (dados.login.trim() == '') {
    elemento('login').focus();
    return 'Digite o seu login.';
  }
  if (dados.senha == '') {
    elemento('senha').focus();
    return 'Digite a sua senha.';
  }
  return '';
}

elemento('formEntrar').onsubmit = function (evento) {
  evento.preventDefault();
  let dados = dadosDoFormulario(elemento('formEntrar'));
  let falta = campoQueFalta(dados);
  if (falta != '') {
    mostrarMensagem('msgEntrar', falta, 'erro');
    return;
  }
  mostrarMensagem('msgEntrar', '', '');
  let botao = elemento('botaoEntrar');
  botao.disabled = true;               // evita clique duplo
  botao.textContent = 'Entrando...';
  chamarApi('POST', '/api/entrar', dados, function (erro, sessao) {
    if (erro) {
      botao.disabled = false;
      botao.textContent = 'Entrar';
      elemento('senha').value = '';
      elemento('senha').focus();
      mostrarMensagem('msgEntrar', erro, 'erro');
      return;
    }
    guardarSessao(sessao);
    location.href = paginasPerfil[sessao.perfil];
  });
};
