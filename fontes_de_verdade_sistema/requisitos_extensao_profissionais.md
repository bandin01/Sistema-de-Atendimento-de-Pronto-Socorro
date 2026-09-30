# Extensão de Requisitos — Médicos, Enfermagem e Controle de Acesso

> **Status:** proposta para revisão. Só passa a valer como fonte de verdade depois de revisada pelo grupo/orientação e incorporada ao `requisitos.md`.
> **Numeração:** continua a partir de RF15 e RNF09 para não colidir com os requisitos existentes.
> **Modelo de dados:** recepcionistas, médicos e enfermeiros em tabelas próprias, cada uma com login e senha (migrations `010`, `011` e `012`; ver `docs/MER.md` e `docs/DER.md`).

## 1. Contexto

O fluxo do pronto-socorro é linear: **recepção → triagem → médico → alta**. Os requisitos RF01–RF15 registram *o que* acontece em cada etapa, mas não *quem* fez. Esta extensão introduz as entidades **Recepcionista**, **Médico** e **Enfermeiro**, vincula cada etapa clínica a um profissional responsável e formaliza o controle de acesso por perfil (RBAC) e o mascaramento de documentos.

Requisitos existentes diretamente afetados: RF04, RF05, RF09, RF14, RF15, RNF03, RNF04, RNF05, RNF08, RNF09.

## 2. Glossário

| Termo | Significado no sistema |
|---|---|
| Perfil de acesso | Papel do profissional para autorização: `RECEPCAO`, `ENFERMAGEM` ou `MEDICO`. É definido pela tabela em que o profissional está cadastrado (`recepcionistas`, `enfermeiros`, `medicos`). Não existe tabela de usuários compartilhada. |
| Profissional | Recepcionista, médico ou membro da equipe de enfermagem, com dados pessoais e credenciais (login + senha) no próprio cadastro. Médicos e enfermeiros têm ainda registro no conselho (CRM/COREN). |
| Categoria de enfermagem | `ENFERMEIRO` ou `TECNICO_ENFERMAGEM`. Ambos usam o perfil `ENFERMAGEM`. |
| Disponibilidade | Situação do profissional no plantão. Médico: `DISPONIVEL`, `EM_ATENDIMENTO`, `PAUSA`, `INDISPONIVEL`. Enfermagem: `DISPONIVEL`, `PAUSA`, `INDISPONIVEL`. |
| Confirmação médica | Momento em que um médico chama o paciente no painel. A partir daí o atendimento não pode ser alterado nem cancelado (RF04, RF05). |

## 3. Requisitos funcionais

### RF16 — Cadastro de médicos

O sistema deve permitir cadastrar médicos com nome, CPF, RG (opcional), data de nascimento, telefone (opcional), e-mail, CRM (número + UF), especialidade, login e senha.

- **RN16.1** CPF (com dígitos verificadores válidos), e-mail e o par CRM+UF são únicos entre os médicos. O login é único entre recepcionistas, médicos e enfermeiros.
- **RN16.2** Login e hash da senha ficam no próprio cadastro do médico (tabela `medicos`). O perfil `MEDICO` decorre da tabela e não pode ser trocado.
- **RN16.3** Idade mínima de 18 anos. Senha com 8 a 72 caracteres, contendo letras e números.
- **RN16.4** Todo médico nasce `INDISPONIVEL` e ativo.
- **Aceite:** dado um CRM já cadastrado na mesma UF, quando a recepção tentar cadastrar outro médico com ele, então a API responde `409` indicando o campo `crmNumero`.

### RF17 — Cadastro da equipe de enfermagem

O sistema deve permitir cadastrar membros da enfermagem com os mesmos dados pessoais do RF16, mais COREN (número + UF), categoria (`ENFERMEIRO` por padrão ou `TECNICO_ENFERMAGEM`) e especialidade (opcional).

- **RN17.1** CPF, e-mail e o par COREN+UF são únicos entre os enfermeiros. O login é único entre as três tabelas de profissionais.
- **RN17.2** Login e hash da senha ficam no próprio cadastro (tabela `enfermeiros`), com perfil `ENFERMAGEM`.

### RF18 — Triagem exclusiva da enfermagem

A triagem (classificação de risco de Manchester) só pode ser registrada por profissional com perfil `ENFERMAGEM`, categoria `ENFERMEIRO`.

- **RN18.1** Técnicos de enfermagem não registram classificação de risco. Fundamento: a Resolução Cofen nº 661/2021 torna a classificação de risco privativa do enfermeiro dentro da equipe de enfermagem.
- **RN18.2** O enfermeiro precisa estar ativo e `DISPONIVEL`.
- **RN18.3** A triagem só é aceita para atendimento existente com status `AGUARDANDO_TRIAGEM`; ao ser registrada, o atendimento passa para `AGUARDANDO_MEDICO`. Cada atendimento tem no máximo uma triagem.
- **RN18.4** Queixa principal e classificação são obrigatórias. Pressão arterial, frequências cardíaca e respiratória, temperatura e saturação são obrigatórias, **exceto** na classificação `VERMELHO` (atendimento imediato). A pressão diastólica deve ser menor que a sistólica.
- **RN18.5** A triagem grava o enfermeiro responsável, que não pode ser trocado depois.
- **Aceite:** dado que duas enfermeiras abrem o mesmo paciente, quando ambas salvarem a triagem, então apenas a primeira é aceita e a segunda recebe `409`.

### RF19 — Atendimento vinculado a um médico

Todo atendimento em `EM_ATENDIMENTO_MEDICO` ou `FINALIZADO` deve ter um médico responsável.

- **RN19.1** O vínculo acontece quando o médico chama o paciente (RF20). Esse instante registra a confirmação médica (`confirmado_medico_em`).
- **RN19.2** Depois de vinculado, o médico responsável não pode ser trocado, e o atendimento não pode ser cancelado (reforça RF04/RF05/RNF05).
- **RN19.3** Somente o médico responsável pode prescrever e finalizar o atendimento.
- **RN19.4** Ao finalizar, o atendimento se torna imutável (RF15) e o médico volta a `DISPONIVEL`.

### RF20 — Chamada do próximo paciente por prioridade

O painel médico lista os atendimentos `AGUARDANDO_MEDICO` ordenados por classificação de Manchester (VERMELHO → LARANJA → AMARELO → VERDE → AZUL) e, dentro da mesma cor, por ordem de triagem. A ordenação é feita na consulta ao banco (RF09).

- **RN20.1** O médico não escolhe paciente: a ação "Chamar próximo paciente" atribui sempre o de maior prioridade ainda livre.
- **RN20.2** Só chama paciente o médico ativo e `DISPONIVEL`. Ao chamar, ele passa a `EM_ATENDIMENTO`.
- **RN20.3** Um médico conduz no máximo um atendimento ativo por vez.
- **RN20.4** O painel exibe, por paciente, o tempo de espera desde a triagem e sinaliza quando ele ultrapassa o tempo-alvo da classificação (0, 10, 60, 120 e 240 minutos).
- **Aceite:** dado que dois médicos clicam em "Chamar próximo" no mesmo instante com dois pacientes na fila, então cada um recebe um paciente diferente, e o de maior prioridade vai para quem teve a requisição processada primeiro.

### RF21 — Prescrição vinculada ao médico responsável

Cada prescrição registra medicamento, dosagem, via de administração, frequência, observações e o médico que a emitiu.

- **RN21.1** Só é aceita em atendimento `EM_ATENDIMENTO_MEDICO` e somente pelo médico responsável por ele.
- **RN21.2** Prescrições de atendimento finalizado não podem ser alteradas (RF15).
- **RN21.3** Via de administração é uma lista fechada: ORAL, SUBLINGUAL, INTRAVENOSA, INTRAMUSCULAR, SUBCUTANEA, INALATORIA, NASAL, TOPICA, OFTALMICA, RETAL, OUTRA.

### RF22 — Disponibilidade e situação cadastral dos profissionais

- **RN22.1** O próprio profissional altera sua disponibilidade (`DISPONIVEL`, `PAUSA`, `INDISPONIVEL`). O status `EM_ATENDIMENTO` é exclusivo do sistema.
- **RN22.2** Médico `EM_ATENDIMENTO` não pode mudar a própria disponibilidade nem ser desativado até finalizar o atendimento.
- **RN22.3** Profissionais nunca são excluídos (preservação do histórico clínico); são desativados (`ativo = 0`). Desativar um profissional o torna `INDISPONIVEL`, e o acesso é cortado já na próxima requisição.
- **RN22.4** Apenas a recepção vê profissionais inativos nas listagens.

### RF23 — Responsável em cada mudança de status (detalha RF14)

Toda mudança de status do atendimento gera uma linha em `historico_status` com status anterior, status novo, data/hora e **exatamente um** responsável (recepcionista, enfermeiro ou médico).

- **RN23.1** O registro é feito na mesma transação da mudança de status: se a mudança falhar, o histórico também não é gravado.

## 4. Requisitos não funcionais

### RNF10 — RBAC por permissão em todas as rotas (detalha RNF08)

Toda rota, exceto `POST /api/auth/login`, exige autenticação e declara uma permissão. A relação permissão × perfil fica centralizada em `src/config/permissoes.js` e espelha a matriz da seção 5. Permissão não cadastrada impede a aplicação de iniciar. A cada requisição o profissional é recarregado da tabela do seu perfil: se estiver inativo ou não existir mais, o acesso é negado. Os services repetem as verificações de posse (ex.: "este atendimento é seu?").

### RNF11 — Mascaramento e minimização de dados (detalha RNF09)

A API aplica a máscara de CPF/RG **no service**, conforme o perfil de quem pede (seção 6). Dados pessoais de profissionais (CPF, RG, nascimento, telefone, e-mail, login) só aparecem para o próprio profissional (completos) e para a recepção (documentos parciais). Perfil desconhecido não recebe documento algum.

### RNF12 — Concorrência na atribuição

A atribuição de paciente a médico usa `UPDATE` condicional atômico e bloqueio da linha do médico (`SELECT ... FOR UPDATE`), sempre na ordem médico → atendimento. O banco garante adicionalmente, por índice único em coluna gerada, que um médico não tenha dois atendimentos ativos. Deadlocks são repetidos automaticamente até 3 vezes.

### RNF13 — Credenciais e sessão

Senhas armazenadas com bcrypt. Sessão por JWT HS256 com expiração de 8 horas (um plantão) e segredo de no mínimo 32 caracteres vindo de variável de ambiente. O token identifica o profissional pelo par (perfil, id). A resposta de login falho é a mesma para login inexistente, profissional inativo ou senha errada.

### RNF14 — Integridade em duas camadas

Regras críticas são validadas no service (mensagem amigável) e garantidas no banco por FK, `CHECK` e triggers (`SIGNAL SQLSTATE '45000'`), de forma que nenhuma escrita fora da API viole: triagem sem enfermeiro apto, prescrição sem médico responsável, troca de médico após confirmação, alteração de atendimento finalizado, login repetido entre as tabelas de profissionais, histórico sem exatamente um responsável.

## 5. Matriz RBAC

| Permissão | Rota | Recepção | Enfermagem | Médico |
|---|---|:-:|:-:|:-:|
| ATENDIMENTO_ABRIR | `POST /atendimentos` (RF01, RF02) | ✔ | | |
| ATENDIMENTO_CONSULTAR | `GET /atendimentos/:numero` (RF03, RF11, RF14) | ✔ | ✔ ³ | ✔ ³ |
| PACIENTE_ALTERAR | `PATCH /atendimentos/:numero/paciente` (RF04) | ✔ ⁴ | | |
| ATENDIMENTO_CANCELAR | `PATCH /atendimentos/:numero/cancelar` (RF05) | ✔ ⁴ | | |
| PROFISSIONAL_CADASTRAR | `POST /medicos`, `POST /enfermeiros` | ✔ | | |
| PROFISSIONAL_GERENCIAR | `PATCH /medicos/:id/situacao`, `PATCH /enfermeiros/:id/situacao` | ✔ | | |
| MEDICO_LISTAR | `GET /medicos` | ✔ | ✔ | ✔ |
| MEDICO_DETALHAR | `GET /medicos/:id` | ✔ | | ✔ |
| ENFERMEIRO_LISTAR | `GET /enfermeiros` | ✔ | ✔ | ✔ |
| ENFERMEIRO_DETALHAR | `GET /enfermeiros/:id` | ✔ | ✔ | |
| MEDICO_PROPRIO_PERFIL | `GET /medicos/me`, `PATCH /medicos/me/disponibilidade` | | | ✔ |
| ENFERMEIRO_PROPRIO_PERFIL | `GET /enfermeiros/me`, `PATCH /enfermeiros/me/disponibilidade` | | ✔ | |
| TRIAGEM_VER_FILA | `GET /triagens/fila` | | ✔ | |
| TRIAGEM_REGISTRAR | `POST /triagens` | | ✔ ¹ | |
| PAINEL_MEDICO_VER | `GET /painel-medico` | | | ✔ |
| ATENDIMENTO_CHAMAR_PROXIMO | `POST /painel-medico/chamar-proximo` | | | ✔ |
| PRESCRICAO_REGISTRAR | `POST /painel-medico/atendimentos/:id/prescricoes` | | | ✔ ² |
| ATENDIMENTO_FINALIZAR | `PATCH /painel-medico/atendimentos/:id/finalizar` | | | ✔ ² |

¹ Apenas categoria ENFERMEIRO (RN18.1). ² Apenas o médico responsável (RN19.3). ³ Com CPF parcial e RG oculto; só estes perfis recebem triagem e prescrições. ⁴ Só antes da confirmação médica e nunca em atendimento finalizado ou cancelado (RF04, RF05, RF15).

## 6. Matriz de mascaramento

**Documentos de pacientes**

| Perfil | CPF | RG |
|---|---|---|
| Recepção | Completo `123.456.789-09` | Completo |
| Enfermagem | Parcial `***.456.789-**` | Oculto |
| Médico | Parcial `***.456.789-**` | Oculto |

**Documentos de profissionais**

| Quem consulta | CPF / RG | Nascimento, telefone, e-mail, login |
|---|---|---|
| O próprio profissional | Completo | Visível |
| Recepção | Parcial | Visível |
| Enfermagem / Médico (outro profissional) | Não retornado | Não retornado |

## 7. Ciclos de status

```
Atendimento
AGUARDANDO_TRIAGEM ──(triagem por ENFERMEIRO)──▶ AGUARDANDO_MEDICO ──(médico chama)──▶ EM_ATENDIMENTO_MEDICO ──(médico finaliza)──▶ FINALIZADO
        │                                                  │                          [confirmação médica:
        └──────────────── CANCELADO ◀──────────────────────┘                           não cancela, não troca médico]

Médico
INDISPONIVEL ◀──▶ DISPONIVEL ◀──▶ PAUSA
                     │   ▲
         (chama)     ▼   │  (finaliza)
                 EM_ATENDIMENTO      ← controlado pelo sistema
```

## 8. Pontos a validar com a orientação

1. **Quem cadastra profissionais.** A proposta usa a Recepção porque só existem três perfis. A alternativa é um perfil `ADMINISTRADOR`, que no modelo atual exigiria uma quarta tabela de profissionais (e incluí-la em `sp_validar_login_unico`); no código, bastaria trocar duas linhas em `config/permissoes.js`.
2. **Cadastro de recepcionistas.** Não há rota para isso: hoje recepcionistas entram só pelo seed ou direto no banco. Definir quem cadastra.
3. **Um atendimento ativo por médico (RN20.3).** Simplifica o painel. Se o PS precisar de médico com vários pacientes em observação, remover o índice `uk_atendimentos_medico_em_atendimento` e a checagem do status `EM_ATENDIMENTO`.
4. **Médico não escolhe paciente (RN20.1).** Garante a prioridade de Manchester no back-end. Se for necessário atender por especialidade, definir a regra antes de liberar escolha manual.
5. **Sinais vitais opcionais em VERMELHO (RN18.4).** Confirmar com o protocolo usado pelo grupo.
6. **Médico com CPF parcial do paciente.** Avaliar se a prescrição impressa precisa do CPF completo.
7. **Técnico de enfermagem na triagem (RN18.1).** Manter a restrição ou tratar a categoria como fora de escopo.
8. **Dados do paciente compartilhados entre atendimentos.** O cadastro do paciente é um só (reconhecido pelo CPF). Uma correção feita pela recepção (RF04) num atendimento novo também aparece ao consultar atendimentos antigos dele. Se o grupo quiser congelar os dados de cada atendimento, é preciso guardar uma cópia por atendimento.
9. **CPF e RG opcionais.** O RF01 lista os dois, mas o PS atende quem chega sem documento, então o banco aceita NULL. Confirmar com a orientação.

## 9. Rastreabilidade

| Requisito | Banco | Back-end |
|---|---|---|
| RF01–RF05 (recepção) | `001_schema_base.sql` (pacientes, AT000), `011_...sql` (`trg_atendimentos_bu_medico`) | `atendimentoService.js`, `pacienteRepository.js` |
| RF16, RF17, RF22 | `010_recepcionistas_medicos_enfermeiros.sql` | `profissionalServiceBase.js`, `medicoService.js`, `enfermeiroService.js` |
| RF18 | `011_...sql` (`trg_triagens_bi_enfermeiro`) | `triagemService.js` |
| RF19, RF20 | `011_...sql` (`medico_id`, `uk_atendimentos_medico_em_atendimento`, `trg_atendimentos_bu_medico`) | `painelMedicoService.js`, `atendimentoRepository.js` |
| RF21 | `011_...sql` (`trg_prescricoes_bi_medico`) | `painelMedicoService.js` |
| RF23 | `012_historico_status.sql` (`chk_historico_status_um_responsavel`) | `historicoStatusRepository.js`, `atendimentoService.js`, `triagemService.js`, `painelMedicoService.js` |
| RNF10 | — | `config/permissoes.js`, `middlewares/autorizar.js`, `middlewares/autenticar.js` |
| RNF11 | — | `config/politicaMascaramento.js`, `utils/mascaramento.js`, `services/apresentacaoClinica.js` |
| RNF12 | índice único em coluna gerada | `db/transacao.js`, `painelMedicoService.chamarProximo` |
| RNF13 | `senha_hash` em cada tabela de profissional | `hashSenhaService.js`, `tokenService.js`, `authService.js` |
| RNF14 | triggers, CHECKs e `sp_validar_login_unico` das migrations 010/011/012 | `middlewares/tratarErros.js` (SQLSTATE 45000 → 422) |
