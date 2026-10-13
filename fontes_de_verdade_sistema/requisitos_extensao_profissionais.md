# Extensão de Requisitos — Médicos, Enfermagem, Fluxo em Etapas e Controle de Acesso

> **Status:** proposta para revisão. Só passa a valer como fonte de verdade depois de revisada pelo grupo/orientação e incorporada ao `requisitos.md`.
> **Numeração:** continua a partir de RF15 e RNF09 para não colidir com os requisitos existentes.
> **Modelo de dados:** recepcionistas, médicos e enfermeiros em tabelas próprias, cada uma com login e senha; fluxo em etapas com consulta, desfecho e históricos (migrations `010`, `011`, `012` e `013`; ver `docs/MER.md`, `docs/DER.md` e `docs/DICIONARIO_DADOS.md`).

## 1. Contexto

O fluxo do pronto-socorro é linear e em etapas:

**Chegada → Atendimento Inicial → Triagem → Consulta → Desfecho/Finalização**

O **atendimento** é tratado como processo (etapa), não como ator do sistema. Os atores são o Paciente e os profissionais: **Recepcionista**, **Enfermeiro** e **Médico**. Cada etapa clínica tem a sua entidade e o seu responsável: Triagem (enfermeiro), Consulta (médico) e Desfecho (médico da consulta). O desfecho contempla prescrição, pedido de exames, encaminhamento ou alta.

Os requisitos RF01–RF15 registram *o que* acontece em cada etapa, mas não *quem* fez. Esta extensão vincula cada etapa a um profissional responsável, cria os históricos de etapas e de status do médico e formaliza o controle de acesso por perfil (RBAC) e o mascaramento de documentos.

Requisitos existentes diretamente afetados: RF04, RF05, RF09, RF13, RF14, RF15, RNF03, RNF04, RNF05, RNF08, RNF09.

## 2. Glossário

| Termo | Significado no sistema |
|---|---|
| Perfil de acesso | Papel do profissional para autorização: `RECEPCAO`, `ENFERMAGEM` ou `MEDICO`. É definido pela tabela em que o profissional está cadastrado (`recepcionistas`, `enfermeiros`, `medicos`). Não existe tabela de usuários compartilhada. |
| Profissional | Recepcionista, médico ou membro da equipe de enfermagem, com dados pessoais e credenciais (login + senha) no próprio cadastro. Médicos e enfermeiros têm ainda registro no conselho (CRM/COREN). |
| Categoria de enfermagem | `ENFERMEIRO` ou `TECNICO_ENFERMAGEM`. Ambos usam o perfil `ENFERMAGEM`. |
| Etapa | Passo do fluxo do paciente: `CHEGADA`, `ATENDIMENTO_INICIAL`, `TRIAGEM`, `CONSULTA`, `DESFECHO`. |
| Status do atendimento | Em que etapa o atendimento está: `AGUARDANDO_TRIAGEM`, `AGUARDANDO_CONSULTA`, `EM_CONSULTA`, `FINALIZADO`, `CANCELADO`. Não indica nada sobre o médico. |
| Status operacional do médico | Situação do médico no plantão, guardada na própria tabela `medicos`: `EM_PLANTAO`, `EM_CONSULTA` (só o sistema define), `PAUSA`, `FOLGA`, `LICENCA`. |
| Disponibilidade da enfermagem | `DISPONIVEL`, `PAUSA`, `INDISPONIVEL`. |
| Confirmação médica | Momento em que um médico chama o paciente no painel e a **consulta** é aberta (`consultas.iniciada_em`). A partir daí o atendimento não pode ser alterado nem cancelado (RF04, RF05). |
| Desfecho | Resultado da consulta que finaliza o atendimento: `PRESCRICAO`, `EXAMES`, `ENCAMINHAMENTO` ou `ALTA`. |

## 3. Requisitos funcionais

### RF16 — Cadastro de médicos

O sistema deve permitir cadastrar médicos com nome, CPF, RG (opcional, até 9 dígitos), data de nascimento, telefone (opcional), e-mail, CRM (número + UF), especialidade, login e senha.

- **RN16.1** CPF (com dígitos verificadores válidos), e-mail e o par CRM+UF são únicos entre os médicos. O login é único entre recepcionistas, médicos e enfermeiros.
- **RN16.2** Login e hash da senha ficam no próprio cadastro do médico (tabela `medicos`). O perfil `MEDICO` decorre da tabela e não pode ser trocado.
- **RN16.3** Idade mínima de 18 anos. Senha com 8 a 72 caracteres, contendo letras e números.
- **RN16.4** Todo médico nasce ativo e com status operacional `FOLGA`.
- **Aceite:** dado um CRM já cadastrado na mesma UF, quando a recepção tentar cadastrar outro médico com ele, então a API responde `409` indicando o campo `crmNumero`.

### RF17 — Cadastro da equipe de enfermagem

O sistema deve permitir cadastrar membros da enfermagem com os mesmos dados pessoais do RF16, mais COREN (número + UF), categoria (`ENFERMEIRO` por padrão ou `TECNICO_ENFERMAGEM`) e especialidade (opcional).

- **RN17.1** CPF, e-mail e o par COREN+UF são únicos entre os enfermeiros. O login é único entre as três tabelas de profissionais.
- **RN17.2** Login e hash da senha ficam no próprio cadastro (tabela `enfermeiros`), com perfil `ENFERMAGEM`.

### RF18 — Triagem exclusiva da enfermagem

A triagem (classificação de risco de Manchester) só pode ser registrada por profissional com perfil `ENFERMAGEM`, categoria `ENFERMEIRO`.

- **RN18.1** Técnicos de enfermagem não registram classificação de risco. Fundamento: a Resolução Cofen nº 661/2021 torna a classificação de risco privativa do enfermeiro dentro da equipe de enfermagem.
- **RN18.2** O enfermeiro precisa estar ativo e `DISPONIVEL`.
- **RN18.3** A triagem só é aceita para atendimento existente com status `AGUARDANDO_TRIAGEM`; ao ser registrada, o atendimento passa para `AGUARDANDO_CONSULTA`. Cada atendimento tem no máximo uma triagem.
- **RN18.4** Queixa principal e classificação são obrigatórias. Pressão arterial, frequências cardíaca e respiratória, temperatura e saturação são obrigatórias, **exceto** na classificação `VERMELHO` (atendimento imediato). A pressão diastólica deve ser menor que a sistólica.
- **RN18.5** A triagem grava o enfermeiro responsável, que não pode ser trocado depois.
- **Aceite:** dado que duas enfermeiras abrem o mesmo paciente, quando ambas salvarem a triagem, então apenas a primeira é aceita e a segunda recebe `409`.

### RF19 — Consulta vinculada a um médico

Todo atendimento em `EM_CONSULTA` ou `FINALIZADO` tem uma **consulta** (tabela `consultas`) com o médico responsável. O atendimento em si não guarda dados do médico.

- **RN19.1** A consulta nasce quando o médico chama o paciente (RF20). Esse instante registra a confirmação médica (`consultas.iniciada_em`).
- **RN19.2** Depois de aberta a consulta, o médico responsável não pode ser trocado, e o atendimento não pode ser cancelado (reforça RF04/RF05/RNF05).
- **RN19.3** Somente o médico responsável pela consulta pode prescrever e registrar o desfecho.
- **RN19.4** Ao registrar o desfecho, consulta e atendimento se tornam imutáveis (RF15) e o médico volta a `EM_PLANTAO`.

### RF20 — Chamada do próximo paciente por prioridade

O painel médico lista os atendimentos `AGUARDANDO_CONSULTA` ordenados por classificação de Manchester (VERMELHO → LARANJA → AMARELO → VERDE → AZUL) e, dentro da mesma cor, por ordem de triagem. A ordenação é feita na consulta ao banco (RF09).

- **RN20.1** O médico não escolhe paciente: a ação "Chamar próximo paciente" atribui sempre o de maior prioridade ainda livre.
- **RN20.2** Só chama paciente o médico ativo e `EM_PLANTAO`. Ao chamar, o atendimento passa a `EM_CONSULTA` e o médico passa a `EM_CONSULTA`.
- **RN20.3** Um médico conduz no máximo uma consulta aberta por vez.
- **RN20.4** O painel exibe, por paciente, o tempo de espera desde a triagem e sinaliza quando ele ultrapassa o tempo-alvo da classificação (0, 10, 60, 120 e 240 minutos).
- **Aceite:** dado que dois médicos clicam em "Chamar próximo" no mesmo instante com dois pacientes na fila, então cada um recebe um paciente diferente, e o de maior prioridade vai para quem teve a requisição processada primeiro.

### RF21 — Prescrição vinculada ao médico responsável

Cada prescrição registra medicamento, dosagem, via de administração, frequência, observações e o médico que a emitiu.

- **RN21.1** Só é aceita em atendimento `EM_CONSULTA` e somente pelo médico responsável pela consulta.
- **RN21.2** Prescrições de atendimento finalizado não podem ser alteradas (RF15).
- **RN21.3** Via de administração é uma lista fechada: ORAL, SUBLINGUAL, INTRAVENOSA, INTRAMUSCULAR, SUBCUTANEA, INALATORIA, NASAL, TOPICA, OFTALMICA, RETAL, OUTRA.

### RF22 — Status operacional e situação cadastral dos profissionais

- **RN22.1** O status operacional fica no cadastro do próprio profissional, nunca no atendimento. O médico escolhe entre `EM_PLANTAO`, `PAUSA`, `FOLGA` e `LICENCA`; o status `EM_CONSULTA` é exclusivo do sistema. A enfermagem escolhe entre `DISPONIVEL`, `PAUSA` e `INDISPONIVEL`.
- **RN22.2** Médico `EM_CONSULTA` não pode mudar o próprio status nem ser desativado até registrar o desfecho.
- **RN22.3** Profissionais nunca são excluídos (preservação do histórico clínico); são desativados (`ativo = 0`). Desativar um médico o coloca em `FOLGA` e desativar um enfermeiro o torna `INDISPONIVEL`. O acesso é cortado já na próxima requisição.
- **RN22.4** Apenas a recepção vê profissionais inativos nas listagens.

### RF23 — Responsável em cada mudança de status (detalha RF14)

Toda mudança de status do atendimento gera uma linha em `historico_status` com status anterior, status novo, data/hora e **exatamente um** responsável (recepcionista, enfermeiro ou médico).

- **RN23.1** O registro é feito na mesma transação da mudança de status: se a mudança falhar, o histórico também não é gravado.

### RF24 — Desfecho da consulta (detalha RF13)

Para finalizar o atendimento, o médico responsável registra o **desfecho** da consulta: tipo (`PRESCRICAO`, `EXAMES`, `ENCAMINHAMENTO` ou `ALTA`) e descrição.

- **RN24.1** A descrição é obrigatória (3 a 500 caracteres): orientações, conduta, exames pedidos ou motivo do encaminhamento.
- **RN24.2** `ENCAMINHAMENTO` exige o destino (serviço/especialidade); nos demais tipos o destino não é gravado.
- **RN24.3** `PRESCRICAO` exige ao menos uma prescrição registrada na consulta.
- **RN24.4** Há um único desfecho por consulta e ele é imutável. Desfecho, fim da consulta e finalização do atendimento acontecem na mesma transação.
- **Aceite:** dado um atendimento em consulta sem prescrições, quando o médico tentar finalizar com desfecho `PRESCRICAO`, então a API responde `422` e o atendimento continua `EM_CONSULTA`.

### RF25 — Histórico de etapas do paciente (detalha RF14)

Cada etapa percorrida gera uma linha em `historico_etapas` com a etapa, a **descrição textual** (até 255 caracteres) e a data/hora.

- **RN25.1** Abertura na recepção grava `CHEGADA` e `ATENDIMENTO_INICIAL`; a triagem grava `TRIAGEM` (com a classificação); a chamada do médico grava `CONSULTA` (com o médico); o desfecho grava `DESFECHO` (com o tipo e o destino, se houver).
- **RN25.2** Cada etapa aparece no máximo uma vez por atendimento e é gravada na mesma transação da mudança de etapa.
- **RN25.3** A consulta do atendimento (`GET /atendimentos/:numero`) devolve a lista `etapas` para todos os perfis. O desfecho clínico (`desfecho`) só vai para enfermagem e médico.

### RF26 — Histórico de status do médico

Toda mudança do status operacional do médico (pelo próprio médico, pelo sistema ao chamar/finalizar ou pela recepção ao desativar) gera uma linha em `historico_status_medico` com status anterior, status novo e data/hora.

- **RN26.1** O registro é feito pelo banco (triggers `trg_medicos_ai_status`/`trg_medicos_au_status`) e vale também para alterações feitas fora da API.

## 4. Requisitos não funcionais

### RNF10 — RBAC por permissão em todas as rotas (detalha RNF08)

Toda rota, exceto `POST /api/auth/login`, exige autenticação e declara uma permissão. A relação permissão × perfil fica centralizada em `src/config/permissoes.js` e espelha a matriz da seção 5. Permissão não cadastrada impede a aplicação de iniciar. A cada requisição o profissional é recarregado da tabela do seu perfil: se estiver inativo ou não existir mais, o acesso é negado. Os services repetem as verificações de posse (ex.: "esta consulta é sua?").

### RNF11 — Mascaramento e minimização de dados (detalha RNF09)

A API aplica a máscara de CPF/RG **no service**, conforme o perfil de quem pede (seção 6). Dados pessoais de profissionais (CPF, RG, nascimento, telefone, e-mail, login) só aparecem para o próprio profissional (completos) e para a recepção (documentos parciais). Perfil desconhecido não recebe documento algum.

### RNF12 — Concorrência na atribuição

A atribuição de paciente a médico usa `UPDATE` condicional atômico no atendimento (`AGUARDANDO_CONSULTA` → `EM_CONSULTA`) e bloqueio da linha do médico (`SELECT ... FOR UPDATE`), sempre na ordem médico → atendimento. O banco garante adicionalmente, por índice único na coluna gerada `consultas.medico_em_consulta_id`, que um médico não tenha duas consultas abertas. Deadlocks são repetidos automaticamente até 3 vezes.

### RNF13 — Credenciais e sessão

Senhas armazenadas com bcrypt. Sessão por JWT HS256 com expiração de 8 horas (um plantão) e segredo de no mínimo 32 caracteres vindo de variável de ambiente. O token identifica o profissional pelo par (perfil, id). A resposta de login falho é a mesma para login inexistente, profissional inativo ou senha errada.

### RNF14 — Integridade em duas camadas

Regras críticas são validadas no service (mensagem amigável) e garantidas no banco por FK, `NOT NULL`, `CHECK` e triggers (`SIGNAL SQLSTATE '45000'`), de forma que nenhuma escrita fora da API viole: triagem sem enfermeiro apto, consulta sem médico ativo ou fora de `EM_CONSULTA`, prescrição sem médico responsável, troca de médico após a confirmação, finalização sem desfecho, desfecho `PRESCRICAO` sem prescrição, alteração de atendimento finalizado ou cancelado, login repetido entre as tabelas de profissionais, histórico sem exatamente um responsável, RG fora do formato (5 a 9 dígitos).

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
| MEDICO_PROPRIO_PERFIL | `GET /medicos/me`, `PATCH /medicos/me/disponibilidade` (status operacional) | | | ✔ |
| ENFERMEIRO_PROPRIO_PERFIL | `GET /enfermeiros/me`, `PATCH /enfermeiros/me/disponibilidade` | | ✔ | |
| TRIAGEM_VER_FILA | `GET /triagens/fila` | | ✔ | |
| TRIAGEM_REGISTRAR | `POST /triagens` | | ✔ ¹ | |
| PAINEL_MEDICO_VER | `GET /painel-medico` | | | ✔ |
| ATENDIMENTO_CHAMAR_PROXIMO | `POST /painel-medico/chamar-proximo` (abre a consulta) | | | ✔ |
| PRESCRICAO_REGISTRAR | `POST /painel-medico/atendimentos/:id/prescricoes` | | | ✔ ² |
| ATENDIMENTO_FINALIZAR | `PATCH /painel-medico/atendimentos/:id/finalizar` (registra o desfecho, RF24) | | | ✔ ² |

¹ Apenas categoria ENFERMEIRO (RN18.1). ² Apenas o médico responsável pela consulta (RN19.3). ³ Com CPF parcial e RG oculto; só estes perfis recebem triagem, prescrições e desfecho. ⁴ Só antes da confirmação médica e nunca em atendimento finalizado ou cancelado (RF04, RF05, RF15).

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
Atendimento (status = etapa)
AGUARDANDO_TRIAGEM ──(Triagem por ENFERMEIRO)──▶ AGUARDANDO_CONSULTA ──(médico chama: Consulta)──▶ EM_CONSULTA ──(Desfecho)──▶ FINALIZADO
        │                                                  │                       [confirmação médica:
        └──────────────── CANCELADO ◀──────────────────────┘                        não cancela, não troca médico]

Desfecho: PRESCRICAO | EXAMES | ENCAMINHAMENTO | ALTA  (todos finalizam)

Médico (status operacional, na tabela medicos)
LICENCA ◀──▶ FOLGA ◀──▶ EM_PLANTAO ◀──▶ PAUSA
                          │   ▲
              (chama)     ▼   │  (registra desfecho)
                       EM_CONSULTA      ← controlado pelo sistema
```

## 8. Pontos a validar com a orientação

1. **Quem cadastra profissionais.** A proposta usa a Recepção porque só existem três perfis. A alternativa é um perfil `ADMINISTRADOR`, que no modelo atual exigiria uma quarta tabela de profissionais (e incluí-la em `sp_validar_login_unico`); no código, bastaria trocar duas linhas em `config/permissoes.js`.
2. **Cadastro de recepcionistas.** Não há rota para isso: hoje recepcionistas entram só pelo seed ou direto no banco. Definir quem cadastra.
3. **Uma consulta aberta por médico (RN20.3).** Simplifica o painel. Se o PS precisar de médico com vários pacientes em observação, remover o índice `uk_consultas_medico_em_consulta` e a checagem do status `EM_CONSULTA`.
4. **Médico não escolhe paciente (RN20.1).** Garante a prioridade de Manchester no back-end. Se for necessário atender por especialidade, definir a regra antes de liberar escolha manual.
5. **Sinais vitais opcionais em VERMELHO (RN18.4).** Confirmar com o protocolo usado pelo grupo.
6. **Médico com CPF parcial do paciente.** Avaliar se a prescrição impressa precisa do CPF completo.
7. **Técnico de enfermagem na triagem (RN18.1).** Manter a restrição ou tratar a categoria como fora de escopo.
8. **Dados do paciente compartilhados entre atendimentos.** O cadastro do paciente é um só (reconhecido pelo CPF). Uma correção feita pela recepção (RF04) num atendimento novo também aparece ao consultar atendimentos antigos dele. Se o grupo quiser congelar os dados de cada atendimento, é preciso guardar uma cópia por atendimento.
9. **CPF e RG opcionais.** O RF01 lista os dois, mas o PS atende quem chega sem documento, então o banco aceita NULL. Confirmar com a orientação.
10. **Um desfecho por consulta (RF24).** O desfecho guarda o tipo principal; condutas combinadas (ex.: receita + exames) vão na descrição. Se o grupo quiser várias condutas estruturadas por consulta, trocar o `UNIQUE` de `desfechos.consulta_id` por uma tabela de condutas.
11. **Chegada e Atendimento Inicial no mesmo instante.** Hoje a recepção registra os dois ao abrir o atendimento. Se houver totem/senha de chegada antes do cadastro, criar um status `AGUARDANDO_ATENDIMENTO_INICIAL` e uma rota de "registrar chegada".

## 9. Rastreabilidade

| Requisito | Banco | Back-end |
|---|---|---|
| RF01–RF05 (recepção) | `001_schema_base.sql` (pacientes, AT000), `013_...sql` (`trg_atendimentos_bi_status`, `trg_atendimentos_bu_bloqueio`, RG VARCHAR(9)) | `atendimentoService.js`, `pacienteRepository.js` |
| RF16, RF17, RF22 | `010_recepcionistas_medicos_enfermeiros.sql`, `013_...sql` (`medicos.status_operacional`) | `profissionalServiceBase.js`, `medicoService.js`, `enfermeiroService.js` |
| RF18 | `011_...sql` (`trg_triagens_bi_enfermeiro`) | `triagemService.js` |
| RF19, RF20 | `013_...sql` (`consultas`, `uk_consultas_medico_em_consulta`, `trg_consultas_*`) | `painelMedicoService.js`, `atendimentoRepository.js`, `consultaRepository.js` |
| RF21 | `013_...sql` (`trg_prescricoes_bi_medico`), `011_...sql` (`trg_prescricoes_bu_bloqueio`) | `painelMedicoService.js` |
| RF23 | `012_historico_status.sql` (`chk_historico_status_um_responsavel`), `013_...sql` (novos status) | `historicoStatusRepository.js`, `atendimentoService.js`, `triagemService.js`, `painelMedicoService.js` |
| RF24 | `013_...sql` (`desfechos`, `trg_desfechos_*`, `chk_desfechos_destino`) | `painelMedicoService.finalizar`, `desfechoRepository.js` |
| RF25 | `013_...sql` (`historico_etapas`) | `historicoEtapasRepository.js`, `atendimentoService.js`, `triagemService.js`, `painelMedicoService.js` |
| RF26 | `013_...sql` (`historico_status_medico`, `trg_medicos_ai_status`, `trg_medicos_au_status`) | — (garantido pelo banco) |
| RNF10 | — | `config/permissoes.js`, `middlewares/autorizar.js`, `middlewares/autenticar.js` |
| RNF11 | — | `config/politicaMascaramento.js`, `utils/mascaramento.js`, `services/apresentacaoClinica.js` |
| RNF12 | índice único em coluna gerada (`consultas`) | `db/transacao.js`, `painelMedicoService.chamarProximo` |
| RNF13 | `senha_hash` em cada tabela de profissional | `hashSenhaService.js`, `tokenService.js`, `authService.js` |
| RNF14 | triggers, `NOT NULL`, CHECKs e `sp_validar_login_unico` das migrations 010/011/012/013 | `middlewares/tratarErros.js` (SQLSTATE 45000 → 422), `utils/validador.js` |
