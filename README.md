# Sistema de Atendimento de Pronto-Socorro — Back-end

Projeto Integrador acadêmico (Sistemas de Informação): back-end de um sistema de gestão de atendimento hospitalar, cobrindo o fluxo completo de um pronto-socorro — recepção, triagem, atendimento médico e alta.

> **Status:** em desenvolvimento. Banco modelado; API com autenticação, recepção (abertura, consulta, alteração e cancelamento de atendimento), cadastro de médicos e enfermagem, triagem e painel médico. O front-end fica em repositório separado.

## O problema que resolve

Digitaliza o fluxo de um pronto-socorro, garantindo regras de negócio críticas no back-end (não só na interface), como:

- Bloqueio de alteração/cancelamento de atendimento após confirmação médica.
- Impedimento de qualquer alteração em atendimentos já finalizados.
- Geração segura e sequencial do número de atendimento (`AT000`) sob concorrência.
- Ordenação do painel médico por classificação de Manchester feita na camada de dados.
- Controle de acesso por perfil (recepção, enfermagem, médico) validado em toda rota.
- Mascaramento de CPF/RG nas respostas da API conforme o perfil do usuário.

## Tecnologias utilizadas

- Node.js
- MySQL (driver `mysql2`)

## Arquitetura

Camadas simples, sem DDD tático — o domínio é linear (recepção → triagem → médico → alta):

```
/src
  /routes         endpoints HTTP por módulo (recepção, triagem, médico)
  /controllers    parsing de request/response, sem regra de negócio
  /services       regras de negócio (bloqueios, validações, geração de AT000)
  /repositories   acesso ao MySQL
  /middlewares    autenticação, autorização por perfil, validação
  /db             schema, triggers, migrations
```

Regra de dependência: `routes → controllers → services → repositories`.

## Como executar localmente

Pré-requisitos: [MySQL](https://dev.mysql.com/downloads/) 8.0.16+ instalado.

### Migrations (recomendado)

Configure `DB_HOST`, `DB_PORT`, `DB_USER` e `DB_PASSWORD` no `.env` (use `127.0.0.1`, não `localhost`, no macOS) e rode:

```bash
npm run migrate            # cria o banco se faltar e aplica só as migrations pendentes
npm run migrate:status     # lista aplicadas e pendentes
```

O runner (`src/db/migrar.js`) aplica `src/db/NNN_*.sql` em ordem e registra cada uma na tabela `schema_migrations`. **Não apaga dados.** Para mudar o schema, crie um novo arquivo (ex.: `013_descricao.sql`) — nunca edite uma migration já aplicada (o runner detecta pelo checksum e recusa).

Banco criado antes do runner (pelo `recriar_banco.sh` antigo ou à mão)? Rode uma vez `npm run migrate:baseline` para marcar 001–012 como aplicadas sem reexecutá-las.

### Recriar o banco do zero

O script abaixo **apaga** o banco `pronto_socorro` e o recria do zero com a versão atual do modelo (apaga com o cliente `mysql`, pedindo a senha, e depois roda `npm run migrate`). Pede confirmação.

```bash
./src/db/recriar_banco.sh
```

Ele encontra o cliente `mysql` no PATH ou em `/usr/local/mysql/bin` (instalador oficial no macOS). Outro usuário: `MYSQL_USER=usuario ./src/db/recriar_banco.sh`.

### Manualmente (terminal ou MySQL Workbench)

Execute, nesta ordem:

```bash
mysql -u root -p < src/db/000_create_database.sql
mysql -u root -p pronto_socorro < src/db/001_schema_base.sql
mysql -u root -p pronto_socorro < src/db/010_recepcionistas_medicos_enfermeiros.sql
mysql -u root -p pronto_socorro < src/db/011_integracao_atendimento_triagem_prescricao.sql
mysql -u root -p pronto_socorro < src/db/012_historico_status.sql
```

Os arquivos em `src/db/legado/` são do modelo antigo e **não devem ser executados**.

### Subir a API

Pré-requisito extra: Node.js 18+.

```bash
npm install
cp .env.example .env        # preencha DB_USER, DB_PASSWORD e JWT_SECRET (mínimo 32 caracteres)
npm run seed:demo           # profissionais de desenvolvimento + 5 pacientes na fila de triagem
npm start                   # http://localhost:3000/api
```

O seed é **só para desenvolvimento**. Senha de todos: `Plantao2026`.

| Login | Perfil | Observação |
|---|---|---|
| `recepcao` | Recepção | Cadastra profissionais |
| `dra.helena` | Médico | Clínica Médica |
| `dr.rafael` | Médico | Ortopedia |
| `enf.marina` | Enfermagem | Categoria ENFERMEIRO, pode triar |
| `tec.joao` | Enfermagem | Categoria TECNICO_ENFERMAGEM, **não** pode triar |

### Endpoints

Prefixo `/api`. Todas exigem `Authorization: Bearer <token>`, exceto o login.

| Método | Rota | Permissão | Perfis |
|---|---|---|---|
| POST | `/auth/login` | pública | todos |
| GET | `/auth/sessao` | autenticado | todos |
| POST | `/atendimentos` | `ATENDIMENTO_ABRIR` | recepção |
| GET | `/atendimentos/:numero` | `ATENDIMENTO_CONSULTAR` | recepção, enfermagem, médico (documentos mascarados por perfil) |
| PATCH | `/atendimentos/:numero/paciente` | `PACIENTE_ALTERAR` | recepção, só antes da confirmação médica |
| PATCH | `/atendimentos/:numero/cancelar` | `ATENDIMENTO_CANCELAR` | recepção, só antes da confirmação médica |
| GET | `/medicos` | `MEDICO_LISTAR` | recepção, enfermagem, médico |
| POST | `/medicos` | `PROFISSIONAL_CADASTRAR` | recepção |
| GET | `/medicos/me` | `MEDICO_PROPRIO_PERFIL` | médico |
| PATCH | `/medicos/me/disponibilidade` | `MEDICO_PROPRIO_PERFIL` | médico |
| GET | `/medicos/:id` | `MEDICO_DETALHAR` | recepção, médico |
| PATCH | `/medicos/:id/situacao` | `PROFISSIONAL_GERENCIAR` | recepção |
| GET, POST, PATCH | `/enfermeiros/...` | equivalentes `ENFERMEIRO_*` | mesma estrutura de `/medicos` |
| GET | `/triagens/fila` | `TRIAGEM_VER_FILA` | enfermagem |
| POST | `/triagens` | `TRIAGEM_REGISTRAR` | enfermagem (categoria ENFERMEIRO, disponível) |
| GET | `/painel-medico` | `PAINEL_MEDICO_VER` | médico |
| POST | `/painel-medico/chamar-proximo` | `ATENDIMENTO_CHAMAR_PROXIMO` | médico |
| POST | `/painel-medico/atendimentos/:id/prescricoes` | `PRESCRICAO_REGISTRAR` | médico responsável |
| PATCH | `/painel-medico/atendimentos/:id/finalizar` | `ATENDIMENTO_FINALIZAR` | médico responsável |

Toda falha responde `{ "erro": { "codigo", "mensagem", "detalhes"? } }`: 400 `VALIDACAO` (com todos os campos inválidos em `detalhes`), 401 `NAO_AUTENTICADO`, 403 `ACESSO_NEGADO`, 404 `NAO_ENCONTRADO`/`ROTA_NAO_ENCONTRADA`, 409 `CONFLITO`, 422 `REGRA_DE_NEGOCIO` (inclui as mensagens dos triggers). A API nunca devolve SQL nem stack trace.

### Testes

Com a API no ar e o banco recém-recriado + `npm run seed:demo`:

```bash
npm run test:smoke     # recepção, RBAC, máscaras, validação, ordem Manchester, regras, histórico, concorrência
npm run test:stress    # dois médicos esvaziando a fila ao mesmo tempo
```

## Documentação

- `fontes_de_verdade_sistema/requisitos.md` — requisitos funcionais (RF01–RF15) e não funcionais (RNF01–RNF09).
- `fontes_de_verdade_sistema/guia_desenvolvimento.md` — passo a passo de implementação, fase a fase.
- `fontes_de_verdade_sistema/requisitos_extensao_profissionais.md` — **proposta** de RF16–RF23 e RNF10–RNF14 (profissionais, RBAC, mascaramento), pendente de revisão do grupo.
- `docs/MER.md` e `docs/DER.md` — modelo de dados conceitual e lógico, com diagramas.

## Autor

**Davi Bandin** — [GitHub](https://github.com/bandin01)
