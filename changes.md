# changes.md — Entrada no sistema com login e senha (RNF08)

## Resumo

| Pedido | O que foi feito |
|---|---|
| O professor exigiu senha para entrar | A página inicial pede **perfil + login + senha**, e não mais perfil + nome escolhido numa lista. O servidor procura o login (com `ativo = 1`) na tabela do perfil e confere a senha com o hash guardado em `senha_hash`. Depois grava `ultimo_login_em`. |
| Senha guardada com segurança | O banco guarda só o hash **scrypt** da senha, com um sal aleatório para cada senha, no formato `scrypt$<sal>$<hash>`. Usa o módulo nativo `crypto`, sem nenhuma dependência nova. A comparação é feita com `timingSafeEqual`. |
| Não revelar quais logins existem | Login inexistente, login de outro perfil, profissional inativo, senha errada e senha com mais de 72 caracteres dão todos a mesma resposta: **400 *Login ou senha incorretos.*** Quando o login não existe, a senha é conferida mesmo assim, contra um hash qualquer, para a resposta demorar o mesmo tempo. |
| Visual da página de entrada | O formulário virou um cartão, com os campos um embaixo do outro, destaque no campo selecionado, mensagem de erro dentro do cartão e o botão mostrando *Entrando...* enquanto espera. As cores são as que o site já usa. |
| Dados de exemplo | Os 6 profissionais de exemplo têm a senha **`senha123`**. Os logins são `ana.souza`, `bruno.dias`, `marina.lopes`, `carlos.pereira`, `helena.martins` e `rafael.costa`. |

**Não houve mudança na estrutura do banco.** As colunas `login`, `senha_hash` e `ultimo_login_em` já existiam (script 010). Só não eram usadas.

## Decisões (combinadas com o usuário)

- **scrypt nativo** em vez de bcrypt: o projeto usa só módulos nativos do Node, além do `mysql2`. O `requisitos_extensao_profissionais.md` cita bcrypt, mas para este uso o scrypt é igualmente seguro.
- O usuário digita **só o login** (não o e-mail). O login não diferencia maiúsculas: ele é padronizado com `trim` + `toLowerCase`, como a regra `^[a-z0-9._-]{3,60}$` do banco. A senha diferencia maiúsculas.
- O **seletor de perfil continua**: o servidor procura só na tabela do perfil escolhido.
- Login errado responde **400, e não 401**: no front-end, `chamarApi` trata o 401 como "sessão expirada" e manda o usuário de volta à página inicial.

## Arquivos

**Back-end**
- `modulos/senhas.js` (novo): `gerarHash(senha, callback)` e `conferir(senha, gravado, callback)`. Um valor fora do formato, como o antigo `'login-nao-utilizado'`, nunca confere. Para gerar um hash pelo terminal: `node modulos/senhas.js "novaSenha1"`.
- `modulos/sessoes.js`: `entrar` recebe `{ perfil, login, senha }` em vez de `{ perfil, profissional_id }`. Mensagens de campo vazio: *Selecione o seu perfil.*, *Digite o seu login.* e *Digite a sua senha.* Senha que não é texto conta como vazia.
- `servidor.js`: sem mudança. A rota `POST /api/entrar` continua pública e repassa os dados para `sessoes.entrar`.

**Banco**
- `banco/dados_iniciais.sql`: `senha_hash` com o hash scrypt de `senha123`, um sal diferente para cada profissional. O comentário do cabeçalho foi atualizado.
- `banco/015_senhas_profissionais.sql` (novo): serve **só para quem já tinha o banco criado**. Grava os hashes nos profissionais de exemplo que ainda têm `senha_hash = 'login-nao-utilizado'`. Em banco novo não altera nada.
- `banco/script_completo.sql`: os mesmos hashes nos dados iniciais e o 015 no final.

**Front-end**
- `index.html`: o campo *Profissional* deu lugar aos campos *Login* e *Senha* (`autocomplete="username"` / `"current-password"`). A mensagem de erro fica dentro do formulário. O formulário tem `novalidate`, porque o `inicio.js` mostra as mensagens.
- `javascripts/inicio.js`: não carrega mais as listas de profissionais. Avisa qual campo falta antes de enviar. Desativa o botão enquanto espera. Em caso de erro, apaga a senha e coloca o cursor nela.
- `CSSs/estilo.css`: classes `section.cartao-entrar` e `form.entrar`. As outras telas não mudam.

**Testes**: `testes/acesso.test.js`
- O banco falso agora tem login, `senha_hash` e `ativo`, além de um profissional inativo e de um cadastro antigo sem hash. Os tokens dos testes são obtidos entrando com login e senha.
- Testes novos: `senhas` (formato, sal diferente, senha certa e errada, valores inválidos), `entrar: campos obrigatórios`, `entrar: falhas dão sempre a mesma resposta`, `entrar: sucesso…` (login com maiúsculas e espaços, resposta sem `senha_hash`, o banco recebe só o login, `UPDATE … ultimo_login_em`) e `entrar: o antigo jeito… não funciona mais`.

**Documentação**
- `README.md`: seção *Entrar no sistema*, roteiro de demonstração com os logins, tabela de profissionais com login e senha, script 015, rota `/api/entrar`, RNF08 e seção *Testes*.
- `CLAUDE.md`: `senhas.js` na estrutura. A regra "sem senha (decisão do grupo)" passou a ser "perfil + login + senha (exigência do professor)".
- `docs/DER.md`, `docs/MER.md` e `docs/DICIONARIO_DADOS.md`: descrevem a entrada com senha e o formato do `senha_hash` (o dicionário dizia bcrypt).

## Validação

- `npm test`: **18/18 passando**.
- Teste de mutação: estraguei de propósito uma coisa de cada vez (não conferir a senha, aceitar inativo, não padronizar o login, não gravar `ultimo_login_em`, mensagem diferente para senha longa). Em todos os casos algum teste falhou.
- Os 6 hashes gravados no SQL foram conferidos com `modulos/senhas.js`: aceitam `senha123` e recusam `senha124`.
- O servidor real sobe, entrega a página e responde 400 quando falta a senha.
- **Não validado contra um MySQL real**: a senha do MySQL desta máquina é diferente da que está em `modulos/banco.js`. Vale rodar o `script_completo.sql` (ou o `015` num banco que já existe) e entrar com `ana.souza` / `senha123`.

## Pendências / próximos passos possíveis

- As rotas públicas `GET /api/recepcionistas`, `/api/enfermeiros` e `/api/medicos`, e a função `carregarProfissionais` do `comum.js`, eram usadas só pela antiga lista de nomes da página inicial e agora ficaram sem uso. Foram mantidas para não ampliar a mudança. Podem ser removidas ou protegidas depois.
- Não há tela para trocar a senha nem limite de tentativas erradas.
