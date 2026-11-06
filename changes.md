# changes.md — Menus visíveis só para o perfil com permissão (RBAC na interface)

## Resumo

| Pedido | O que foi feito |
|---|---|
| Menus e links só aparecem para os cargos com permissão (ex.: a recepção não enxerga "Triagem") | Novo script `javascripts/permissoes.js`. Ele lê o perfil salvo no `sessionStorage` no login e **remove da página** todo elemento com `data-perfis` que não inclua esse perfil. Não aparece aviso de "acesso negado": o elemento simplesmente some. |

| Quem entrou | O que aparece no menu |
|---|---|
| Ninguém | Só "Início" |
| Recepção | Início + Recepção |
| Enfermagem | Início + Triagem |
| Médico | Início + Painel do Médico |

## Arquivos

- `javascripts/permissoes.js`: **novo**. Função `aplicarPermissoes()`, que roda ao carregar a página.
- `index.html`, `HTMLs/recepcao.html`, `HTMLs/triagem.html`, `HTMLs/painel_medico.html`, `HTMLs/consulta_medica.html`: os itens Recepção, Triagem e Painel do Médico do menu ganharam `data-perfis`, e o `<script>` do `permissoes.js` entrou depois do `comum.js`.
- `index.html`: os cartões de "Acesse a sua área" também ganharam `data-perfis`. A seção inteira fica oculta para quem não entrou.
- `testes/permissoes.test.js`: **novo**. 4 testes que rodam o `permissoes.js` com as páginas reais para cada perfil.
- `README.md` e `CLAUDE.md`: incluem o `permissoes.js` e a regra de marcar elementos restritos com `data-perfis`.

O login (`inicio.js`) não mudou: ele já salvava `{ token, perfil, id, nome }` no `sessionStorage`. O `exigirPerfil()` das telas e a validação de perfil no servidor continuam iguais.

## Como marcar um elemento novo

```html
<li data-perfis="ENFERMAGEM"><a href="triagem.html">Triagem</a></li>
<button data-perfis="RECEPCAO MEDICO">Ver histórico</button>   <!-- dois perfis -->
```

Os perfis vão separados por espaço: `RECEPCAO`, `ENFERMAGEM` ou `MEDICO`. Um elemento sem `data-perfis` aparece para todos.

## Validação

- `npm test`: 22/22 passando (os 18 que já existiam + 4 novos).
