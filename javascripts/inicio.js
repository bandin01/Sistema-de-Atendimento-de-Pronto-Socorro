// Página INICIAL: o profissional escolhe o seu perfil e o seu nome para entrar
// no sistema. O servidor confere os dados e devolve o token da sessão.

// Lista de profissionais de cada perfil e como cada um aparece na lista.
let listasPerfil = [];
listasPerfil['RECEPCAO'] = {
  endereco: '/api/recepcionistas',
  texto: function (p) {
    return p.nome;
  }
};
listasPerfil['ENFERMAGEM'] = {
  endereco: '/api/enfermeiros',
  texto: function (p) {
    return p.nome + ' (COREN-' + p.coren_uf + ' ' + p.coren_numero + ')';
  }
};
listasPerfil['MEDICO'] = {
  endereco: '/api/medicos',
  texto: function (p) {
    return p.nome + ' – ' + p.especialidade;
  }
};

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

elemento('perfil').onchange = function () {
  let lista = listasPerfil[elemento('perfil').value];
  if (lista === undefined) {
    elemento('profissional').innerHTML = '<option value="">Escolha antes o perfil</option>';
    return;
  }
  carregarProfissionais(lista.endereco, 'profissional', lista.texto);
};

elemento('formEntrar').onsubmit = function (evento) {
  evento.preventDefault();
  let dados = dadosDoFormulario(elemento('formEntrar'));
  chamarApi('POST', '/api/entrar', dados, function (erro, sessao) {
    if (erro) {
      mostrarMensagem('msgEntrar', erro, 'erro');
      return;
    }
    guardarSessao(sessao);
    location.href = paginasPerfil[sessao.perfil];
  });
};
