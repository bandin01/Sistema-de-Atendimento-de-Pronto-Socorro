# changes.md — Controle de acesso por perfil (RNF08) e proteção de CPF/RG (RNF09)

## Resumo

| Pedido | O que foi feito |
|---|---|
| Acesso restrito por perfil (RNF08) | Entrada na página inicial escolhendo **perfil + profissional** (sem senha, decisão do grupo). O servidor cria uma sessão em memória (token aleatório de 48 caracteres, validade de 12 h) e confere o perfil em **toda rota** da API: 401 sem sessão, 403 para perfil sem permissão. |
| Responsável não pode ser falsificado | O id da recepcionista, do(a) enfermeiro(a) e do médico vem sempre da sessão; o enviado no formulário é ignorado. `GET /api/consulta` deixou de receber `?medico=`. |
| CPF/RG com acesso controlado (RNF09) | A consulta de um atendimento é liberada para os três perfis, mas CPF e RG só vão completos para a recepção. Enfermagem e médico recebem `***.***.*47-25` e `*****1905`, e `pode_alterar` sempre `false`. |
| Telas por perfil | Os campos "Profissional responsável" viraram a identificação de quem entrou, com botão *Sair*. Uma tela aberta pelo perfil errado (ou sem sessão) mostra *Acesso restrito*. Sessão expirada (401) volta para a página inicial. |
| Testes | `testes/acesso.test.js` (`npm test`): 12 testes com banco falso, sem precisar do MySQL. |

## Permissões das rotas

| Rota | Perfis |
|---|---|
| `POST /api/entrar`, `GET /api/recepcionistas`, `/api/enfermeiros`, `/api/medicos` | pública |
| `GET /api/sessao`, `POST /api/sair`, `GET /api/atendimentos?numero=` | todos (CPF/RG mascarados fora da recepção) |
| `GET /api/atendimentos` (lista), `POST /api/atendimentos`, `/alterar`, `/cancelar` | Recepção |
| `GET /api/triagem/fila`, `POST /api/triagem` | Enfermagem |
| `GET /api/painel`, `POST /api/painel/chamar`, `GET /api/consulta`, `POST /api/consulta/prescricao`, `/finalizar` | Médico |

## Arquivos

**Back-end**
- `modulos/sessoes.js` (novo): `entrar`, `identificar`, `sair` e `nomePerfil`. Os tokens são validados pelo formato (`^[0-9a-f]{48}$`) antes da busca, o que recusa chaves como `__proto__`.
- `servidor.js`: tabela `permissoes[...]` ao lado de `rotas[...]`. As rotas recebem `(consulta, dados, sessao, callback)`. A sessão é conferida antes de ler o corpo. O responsável é sobrescrito com `sessao.id`. O corpo JSON precisa ser um objeto: `null` ou número dão 400 em vez de derrubar o servidor. A porta pode ser trocada por `PORTA`, o que é usado nos testes.
- `modulos/atendimentos.js`: `consultar(numero, perfil, callback)` mascara CPF/RG fora da recepção.
- `modulos/utilitarios.js`: `mascararCpf` e `mascararRg`.

**Front-end**
- `index.html` + `javascripts/inicio.js` (novo): formulário *Entrar* (perfil e profissional) e, para quem já entrou, o nome, o link *Abrir a minha área* e *Sair*.
- `javascripts/comum.js`: sessão no `sessionStorage` (uma por aba), `exigirPerfil`, `sair`, cabeçalho `X-Sessao` em `chamarApi`, tratamento do 401. Saiu `lerParametro`, que não era mais usado.
- `HTMLs/*.html` e `javascripts/recepcao.js`, `triagem.js`, `painel_medico.js`, `consulta_medica.js`: tiram os `<select>` de profissional e o `?medico=` dos links, e passam a chamar `exigirPerfil`.

**Documentação e outros**
- `README.md`: seção "Entrar no sistema", roteiro de demonstração com uma aba por perfil, tabela da API com perfis e códigos 401/403, seção "Testes", RNF08 e RNF09 como atendidos.
- `CLAUDE.md`: regras novas (toda rota precisa de `permissoes[...]` e de entrada no teste, e o responsável vem da sessão). RNF08/RNF09 saem de "pendentes".
- `banco/dados_iniciais.sql` e `banco/script_completo.sql`: só o comentário sobre login. **Nenhuma mudança de estrutura ou de dados no banco.**
- `package.json`: script `test`.

## Validação

- `npm test`: 12/12 passando.
- Teste de mutação: removi a permissão da triagem, o mascaramento e o uso do enfermeiro da sessão, e liberei o painel para a recepção, um de cada vez. Em todos os casos algum teste falhou.
- O servidor real sobe, entrega as páginas e responde 401 nas rotas protegidas.
- **Não validado contra um MySQL real** (sem acesso ao banco nesta máquina). Vale rodar o roteiro de demonstração do README.

## Limitação conhecida

Sem senha, os perfis ficam separados, mas qualquer pessoa pode entrar com o nome de outra. As colunas `login` e `senha_hash` continuam no banco caso o grupo decida usar senha.
