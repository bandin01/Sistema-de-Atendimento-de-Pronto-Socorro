// RBAC na interface: <li data-perfis="RECEPCAO MEDICO"> só fica para esses perfis;
// sem data-perfis, aparece para todos. Carregar depois do comum.js (usa lerSessao).

aplicarPermissoes();

function aplicarPermissoes() {
  let sessao = lerSessao();
  let perfilAtual = '';
  if (sessao != null) {
    perfilAtual = sessao.perfil;
  }

  let elementos = document.querySelectorAll('[data-perfis]');
  for (let i = 0; i < elementos.length; i++) {
    let permitidos = elementos[i].dataset.perfis.split(' ');
    if (permitidos.indexOf(perfilAtual) == -1) {
      elementos[i].remove();
    }
  }
}
