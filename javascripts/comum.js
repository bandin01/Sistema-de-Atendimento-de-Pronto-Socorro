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

// ---------------------------------------------------------------------------
// SESSÃO (controle de acesso por perfil): quem entrou pela página inicial fica
// guardado no sessionStorage desta aba: { token, perfil, id, nome }.
// Cada aba tem a sua sessão, então dá para abrir a recepção numa aba e o
// médico em outra.
// ---------------------------------------------------------------------------
let nomesPerfil = [];
nomesPerfil['RECEPCAO'] = 'Recepção';
nomesPerfil['ENFERMAGEM'] = 'Enfermagem';
nomesPerfil['MEDICO'] = 'Médico';

// Página de cada perfil.
let paginasPerfil = [];
paginasPerfil['RECEPCAO'] = '/HTMLs/recepcao.html';
paginasPerfil['ENFERMAGEM'] = '/HTMLs/triagem.html';
paginasPerfil['MEDICO'] = '/HTMLs/painel_medico.html';

function lerSessao() {
  try {
    let texto = sessionStorage.getItem('sessao');
    if (texto) {
      return JSON.parse(texto);
    }
  } catch (e) {
    // sessionStorage bloqueado pelo navegador: segue sem sessão
  }
  return null;
}

function guardarSessao(sessao) {
  try {
    sessionStorage.setItem('sessao', JSON.stringify(sessao));
  } catch (e) {
    alert('O navegador bloqueou o armazenamento da sessão. Libere os dados do site para entrar.');
  }
}

function apagarSessao() {
  try {
    sessionStorage.removeItem('sessao');
  } catch (e) {
    // nada a apagar
  }
}

// Encerra a sessão no servidor e volta para a página inicial.
function sair() {
  chamarApi('POST', '/api/sair', null, function () {
    apagarSessao();
    location.href = '/index.html';
  });
}

// Confere se quem está nesta aba tem o perfil da página. Se tiver, mostra o
// nome dele no elemento "usuarioLogado" e devolve a sessão. Se não tiver,
// esconde o conteúdo da página, mostra um aviso e devolve null.
function exigirPerfil(perfil) {
  let sessao = lerSessao();
  if (sessao != null && sessao.perfil == perfil) {
    elemento('usuarioLogado').innerHTML = '<strong>' + protegerTexto(sessao.nome) + '</strong> (' +
      nomesPerfil[sessao.perfil] + ') <button type="button" class="pequeno" onclick="sair()">Sair</button>';
    return sessao;
  }
  let texto = 'Esta área é exclusiva do perfil ' + nomesPerfil[perfil] + '. ';
  if (sessao == null) {
    texto += 'Entre no sistema pela página inicial.';
  } else {
    texto += 'Você entrou como ' + sessao.nome + ' (' + nomesPerfil[sessao.perfil] + ').';
  }
  let principal = document.getElementsByTagName('main')[0];
  principal.hidden = true;
  let aviso = document.createElement('main');
  aviso.innerHTML = '<section><h2>Acesso restrito</h2><p class="mensagem erro"></p>' +
                    '<p><a href="/index.html">Ir para a página inicial</a></p></section>';
  aviso.getElementsByTagName('p')[0].textContent = texto;
  principal.parentNode.insertBefore(aviso, principal);
  return null;
}

// Envia uma requisição para a API do servidor, com o token da sessão no
// cabeçalho X-Sessao. A resposta chega como texto JSON e é convertida em
// objeto com JSON.parse. Depois chama callback(erro, resposta): "erro" é a
// mensagem de erro, ou null se deu certo.
// Se a sessão tiver expirado (erro 401), volta para a página inicial.
function chamarApi(metodo, endereco, dados, callback) {
  let requisicao = new XMLHttpRequest();
  requisicao.open(metodo, endereco);
  requisicao.setRequestHeader('Content-Type', 'application/json');
  let sessao = lerSessao();
  if (sessao != null) {
    requisicao.setRequestHeader('X-Sessao', sessao.token);
  }
  requisicao.onload = function () {
    let resposta = JSON.parse(requisicao.responseText);
    if (requisicao.status == 200) {
      callback(null, resposta);
    } else if (requisicao.status == 401 && endereco != '/api/sair') {
      apagarSessao();
      alert(resposta.erro);
      location.href = '/index.html';
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

// Carrega a lista de profissionais de um <select> (usada na página inicial). "texto" é uma função que
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
