// Testes do javascripts/permissoes.js: cada perfil só vê os menus permitidos.
// Para rodar:  npm test
//
// O script roda num "navegador falso" (módulo vm): os elementos com
// data-perfis são lidos das páginas HTML de verdade e o sessionStorage é
// simulado. No fim, confere quais elementos foram removidos.
let test = require('node:test');
let assert = require('node:assert');
let fs = require('fs');
let path = require('path');
let vm = require('vm');

let raiz = path.join(__dirname, '..');
let codigoPermissoes = fs.readFileSync(path.join(raiz, 'javascripts', 'permissoes.js'), 'utf8');

// Lê da página os elementos marcados: [{ perfis: 'RECEPCAO', texto: 'Recepção' }, ...]
function elementosMarcados(pagina) {
  let html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
  let lista = [];
  let regra = /data-perfis="([^"]*)"[^>]*>\s*(?:<a[^>]*>|<h[23]>)([^<]*)/g;
  let achado;
  while ((achado = regra.exec(html)) != null) {
    lista.push({ perfis: achado[1], texto: achado[2] });
  }
  return lista;
}

// Roda o permissoes.js para um perfil (ou null = ninguém entrou) e devolve os
// textos dos elementos que continuaram na página.
function visiveis(pagina, perfil) {
  let elementos = elementosMarcados(pagina).map(function (item) {
    return { dataset: { perfis: item.perfis }, texto: item.texto, removido: false,
             remove: function () { this.removido = true; } };
  });
  let sessao = perfil ? JSON.stringify({ token: 't', perfil: perfil, id: 1, nome: 'Teste' }) : null;
  let contexto = {
    sessionStorage: { getItem: function () { return sessao; } },
    document: { querySelectorAll: function () { return elementos; } }
  };
  contexto.lerSessao = function () {
    return sessao ? JSON.parse(sessao) : null;
  };
  vm.runInNewContext(codigoPermissoes, contexto);
  return elementos.filter(function (e) { return !e.removido; }).map(function (e) { return e.texto; });
}

let paginas = ['index.html', 'HTMLs/recepcao.html', 'HTMLs/triagem.html',
               'HTMLs/painel_medico.html', 'HTMLs/consulta_medica.html'];

test('toda página inclui o permissoes.js depois do comum.js', function () {
  paginas.forEach(function (pagina) {
    let html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
    let comum = html.indexOf('javascripts/comum.js');
    let permissoes = html.indexOf('javascripts/permissoes.js');
    assert.ok(permissoes > comum && comum != -1, pagina + ' sem permissoes.js depois do comum.js');
  });
});

test('menu: cada perfil vê só o link da sua área', function () {
  paginas.forEach(function (pagina) {
    assert.deepStrictEqual(visiveis(pagina, 'RECEPCAO').slice(0, 1), ['Recepção'], pagina);
    assert.deepStrictEqual(visiveis(pagina, 'ENFERMAGEM').slice(0, 1), ['Triagem'], pagina);
    assert.deepStrictEqual(visiveis(pagina, 'MEDICO').slice(0, 1), ['Painel do Médico'], pagina);
  });
});

test('recepcionista não enxerga Triagem nem Painel do Médico', function () {
  let textos = visiveis('index.html', 'RECEPCAO');
  assert.deepStrictEqual(textos, ['Recepção', 'Acesse a sua área', 'Recepção']);
});

test('quem não entrou não vê nenhum menu restrito', function () {
  paginas.forEach(function (pagina) {
    assert.deepStrictEqual(visiveis(pagina, null), [], pagina);
  });
});
