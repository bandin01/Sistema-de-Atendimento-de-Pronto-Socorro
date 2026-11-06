// CONTROLE DE ACESSO NA INTERFACE (RBAC): esconde os menus e links que o
// perfil de quem entrou não pode usar.
//
// Todo elemento com o atributo data-perfis só aparece para os perfis da lista
// (separados por espaço). Exemplo:
//   <li data-perfis="RECEPCAO MEDICO">  → aparece só para Recepção e Médico.
// Elementos sem data-perfis aparecem para todos.
//
// Precisa ser carregado depois do comum.js (usa a função lerSessao).

aplicarPermissoes();

function aplicarPermissoes() {
  let sessao = lerSessao();
  let perfilAtual = '';
  if (sessao != null) {
    perfilAtual = sessao.perfil;   // 'RECEPCAO', 'ENFERMAGEM' ou 'MEDICO'
  }

  let elementos = document.querySelectorAll('[data-perfis]');
  for (let i = 0; i < elementos.length; i++) {
    let permitidos = elementos[i].dataset.perfis.split(' ');
    if (permitidos.indexOf(perfilAtual) == -1) {
      elementos[i].remove();       // perfil sem permissão: o elemento sai da página
    }
  }
}
