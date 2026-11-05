# changes.md — Remoção das listas públicas de profissionais

## Resumo

| Pedido | O que foi feito |
|---|---|
| Remover as listas de nomes que ficaram sem uso | Foram removidas as rotas `GET /api/recepcionistas`, `GET /api/enfermeiros` e `GET /api/medicos`. Elas existiam só para montar a lista "escolha o seu nome" da página inicial antiga. Com a entrada por login e senha (PR #1), não tinham mais uso e ainda mostravam os nomes, o COREN e o CRM dos profissionais para qualquer pessoa, **sem precisar entrar**. Agora essas rotas respondem 404. |

A única rota pública da API agora é `POST /api/entrar`.

## Arquivos

- `modulos/profissionais.js`: **removido**. Ele só servia a essas três rotas.
- `servidor.js`: saíram o `require` do módulo e as três rotas. O comentário sobre rotas públicas foi atualizado.
- `javascripts/comum.js`: saiu a função `carregarProfissionais`, que nenhuma tela usava mais.
- `testes/acesso.test.js`: o teste "rotas públicas funcionam sem sessão" virou "as listas de profissionais não existem mais". Ele confere que as três rotas dão 404, com e sem sessão.
- `README.md` e `CLAUDE.md`: saíram `profissionais.js` da estrutura e a linha das listas da tabela da API.
- `docs/DICIONARIO_DADOS.md`: saiu a menção a `GET /api/medicos`.

Nenhuma mudança no banco nem nas telas. As telas da recepção, da triagem e do médico já pegavam o profissional da sessão, e não dessas listas.

## Validação

- `npm test`: 18/18 passando.
- Busca no projeto: nenhum arquivo do front-end ou do back-end usa mais as rotas ou o módulo removidos.
