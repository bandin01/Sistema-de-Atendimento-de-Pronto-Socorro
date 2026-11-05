// Página INICIAL: o profissional escolhe o seu perfil e digita o seu login e a
// sua senha. O servidor confere os dados e devolve o token da sessão.
// A conferência de verdade (login existe, está ativo, senha certa) é sempre
// feita no servidor; aqui só se avisa antes de enviar se faltou algum campo.

mostrarSituacao();

// Quem já entrou vê o próprio nome e o link para a sua área; os outros veem o formulário.
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

// Confere se os campos foram preenchidos. Devolve o texto do erro, ou '' se
// estiver tudo certo, e coloca o cursor no campo que falta.
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
  evento.preventDefault();   // impede o envio normal, que recarregaria a página
  let dados = dadosDoFormulario(elemento('formEntrar'));
  let falta = campoQueFalta(dados);
  if (falta != '') {
    mostrarMensagem('msgEntrar', falta, 'erro');
    return;
  }
  mostrarMensagem('msgEntrar', '', '');
  let botao = elemento('botaoEntrar');
  botao.disabled = true;               // evita clicar duas vezes enquanto espera
  botao.textContent = 'Entrando...';
  chamarApi('POST', '/api/entrar', dados, function (erro, sessao) {
    if (erro) {
      botao.disabled = false;
      botao.textContent = 'Entrar';
      elemento('senha').value = '';    // senha errada: apaga para digitar de novo
      elemento('senha').focus();
      mostrarMensagem('msgEntrar', erro, 'erro');
      return;
    }
    guardarSessao(sessao);
    location.href = paginasPerfil[sessao.perfil];
  });
};
