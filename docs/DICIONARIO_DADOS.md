# Dicionário de Dados

Banco `pronto_socorro` (MySQL 8.0.16+, InnoDB, `utf8mb4_0900_ai_ci`).
Estado após os scripts `001`, `010`, `011`, `012`, `013` e `014` (pasta `banco/`). Diagramas: [MER.md](MER.md) (conceitual) e [DER.md](DER.md) (lógico).

Legenda: **Nulo** `NÃO` = `NOT NULL` · **Chave** PK primária, FK estrangeira, UK única · *(s)* dado sensível com máscara por perfil na API (RNF09/RNF11).
Todas as FKs são `ON UPDATE RESTRICT ON DELETE RESTRICT`.

> **Observação:** nesta versão do sistema, "API" é o back-end em Node.js da pasta `modulos/`. Regras citadas aqui que dependiam do back-end original do repositório (login, cadastro de profissionais pela API, máscara de CPF/RG por perfil) não fazem parte desta versão simplificada; veja o `README.md`.

## Visão geral

| Tabela | Categoria | Etapa do fluxo | Descrição |
|---|---|---|---|
| `pacientes` | Ator | — | Cadastro do paciente, reaproveitado entre atendimentos (reconhecido pelo CPF). |
| `recepcionistas` | Ator | Atendimento Inicial | Profissionais da recepção (perfil `RECEPCAO`). |
| `enfermeiros` | Ator | Triagem | Equipe de enfermagem (perfil `ENFERMAGEM`). |
| `medicos` | Ator | Consulta, Desfecho | Médicos (perfil `MEDICO`), com status operacional próprio. |
| `atendimentos` | Etapa | Chegada + Atendimento Inicial | Abertura do atendimento na recepção, número `AT0001` e status do fluxo. |
| `triagens` | Etapa | Triagem | Classificação de Manchester e sinais vitais. |
| `consultas` | Etapa | Consulta | Vínculo do atendimento com o médico responsável. |
| `desfechos` | Etapa | Desfecho/Finalização | Resultado da consulta: prescrição, exames, encaminhamento ou alta. |
| `prescricoes` | Item de etapa | Consulta/Desfecho | Medicamentos prescritos, um por linha. |
| `historico_status` | Rastreabilidade | todas | Mudanças de status do atendimento e quem as fez. |
| `historico_etapas` | Rastreabilidade | todas | Descrição textual de cada etapa percorrida pelo paciente. |
| `historico_status_medico` | Rastreabilidade | — | Mudanças de status operacional do médico. |
| `sequencia_atendimento` | Técnica | — | Gera o número sequencial do `AT0001`. |

## Domínios (ENUM)

| Domínio | Valores | Usado em |
|---|---|---|
| Status do atendimento | `AGUARDANDO_TRIAGEM`, `AGUARDANDO_CONSULTA`, `EM_CONSULTA`, `FINALIZADO`, `CANCELADO` | `atendimentos.status`, `historico_status.status_anterior/status_novo` |
| Etapa do atendimento | `CHEGADA`, `ATENDIMENTO_INICIAL`, `TRIAGEM`, `CONSULTA`, `DESFECHO` | `historico_etapas.etapa` |
| Tipo de desfecho | `PRESCRICAO` (alta com receita), `EXAMES` (alta com pedido de exames), `ENCAMINHAMENTO` (exige destino), `ALTA` (alta simples) | `desfechos.tipo` |
| Status operacional do médico | `EM_PLANTAO` (pode chamar paciente), `EM_CONSULTA` (só o sistema define), `PAUSA`, `FOLGA`, `LICENCA` | `medicos.status_operacional`, `historico_status_medico` |
| Disponibilidade da enfermagem | `DISPONIVEL`, `PAUSA`, `INDISPONIVEL` | `enfermeiros.status_disponibilidade` |
| Categoria de enfermagem | `ENFERMEIRO`, `TECNICO_ENFERMAGEM` | `enfermeiros.categoria` |
| Classificação de Manchester | `VERMELHO`, `LARANJA`, `AMARELO`, `VERDE`, `AZUL` (ordem de prioridade) | `triagens.classificacao_manchester` |

Esses valores são espelhados em `src/config/dominio.js` e `src/config/manchester.js`.

## Atores

### `pacientes`

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | Identificador. |
| nome | VARCHAR(150) | NÃO | | | Nome completo (RF01). |
| endereco | VARCHAR(255) | NÃO | | | Endereço (RF01). |
| cpf | CHAR(11) | SIM | UK | | *(s)* Só dígitos. Opcional: o PS atende quem chega sem documento. |
| rg | VARCHAR(9) | SIM | | | *(s)* 5 a 9 caracteres `[0-9X]` (`chk_pacientes_rg`). |
| nome_pai | VARCHAR(150) | SIM | | | Pode ser desconhecido. |
| nome_mae | VARCHAR(150) | SIM | | | Pode ser desconhecido (ex.: paciente em situação de rua). |
| data_nascimento | DATE | NÃO | | | |
| criado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | |

### `recepcionistas`

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| nome | VARCHAR(150) | NÃO | | | |
| cpf | CHAR(11) | NÃO | UK | | *(s)* 11 dígitos (`chk_recepcionistas_cpf`). |
| rg | VARCHAR(9) | SIM | | | *(s)* 5 a 9 caracteres `[0-9X]` (`chk_recepcionistas_rg`). |
| data_nascimento | DATE | NÃO | | | |
| telefone | VARCHAR(11) | SIM | | | DDD + número, 10 ou 11 dígitos. |
| email | VARCHAR(150) | NÃO | UK | | |
| login | VARCHAR(60) | NÃO | UK | | `^[a-z0-9._-]{3,60}$`, único entre as três tabelas de profissionais. |
| senha_hash | VARCHAR(255) | NÃO | | | bcrypt (RNF13). |
| ativo | TINYINT(1) | NÃO | | 1 | 0 = desativado (nunca é excluído). |
| ultimo_login_em | DATETIME | SIM | | | |
| criado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | |
| atualizado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP ON UPDATE | |

### `medicos`

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| nome | VARCHAR(150) | NÃO | | | |
| cpf | CHAR(11) | NÃO | UK | | *(s)* |
| rg | VARCHAR(9) | SIM | | | *(s)* 5 a 9 caracteres `[0-9X]` (`chk_medicos_rg`). |
| data_nascimento | DATE | NÃO | | | Idade mínima de 18 anos (validada na API). |
| telefone | VARCHAR(11) | SIM | | | |
| email | VARCHAR(150) | NÃO | UK | | |
| crm_numero | VARCHAR(10) | NÃO | UK (com crm_uf) | | Só dígitos. |
| crm_uf | CHAR(2) | NÃO | UK (com crm_numero) | | UF válida. |
| especialidade | VARCHAR(100) | NÃO | | | |
| status_operacional | ENUM status operacional | NÃO | | `FOLGA` | Situação do médico no plantão. `EM_CONSULTA` só é definido pelo sistema. Inativo só em `FOLGA`/`LICENCA` (`chk_medicos_inativo_fora_do_plantao`). Toda mudança vai para `historico_status_medico`. O médico altera no Painel (`POST /api/painel/situacao`), exceto `EM_CONSULTA`. Na API: campo `status_operacional` (`GET /api/medicos`, `GET /api/painel`). |
| login | VARCHAR(60) | NÃO | UK | | Único entre as três tabelas. |
| senha_hash | VARCHAR(255) | NÃO | | | |
| ativo | TINYINT(1) | NÃO | | 1 | |
| ultimo_login_em | DATETIME | SIM | | | |
| criado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | |
| atualizado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP ON UPDATE | |

Índice `idx_medicos_status_operacional (ativo, status_operacional)`.

### `enfermeiros`

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| nome | VARCHAR(150) | NÃO | | | |
| cpf | CHAR(11) | NÃO | UK | | *(s)* |
| rg | VARCHAR(9) | SIM | | | *(s)* 5 a 9 caracteres `[0-9X]` (`chk_enfermeiros_rg`). |
| data_nascimento | DATE | NÃO | | | |
| telefone | VARCHAR(11) | SIM | | | |
| email | VARCHAR(150) | NÃO | UK | | |
| coren_numero | VARCHAR(10) | NÃO | UK (com coren_uf) | | |
| coren_uf | CHAR(2) | NÃO | UK (com coren_numero) | | |
| categoria | ENUM categoria | NÃO | | `ENFERMEIRO` | Só `ENFERMEIRO` registra triagem (RF18). |
| especialidade | VARCHAR(100) | SIM | | | |
| status_disponibilidade | ENUM disponibilidade | NÃO | | `INDISPONIVEL` | Inativo só `INDISPONIVEL`. O próprio enfermeiro altera na tela de Triagem; só registra triagem quando `DISPONIVEL` (regra da aplicação). |
| login | VARCHAR(60) | NÃO | UK | | Único entre as três tabelas. |
| senha_hash | VARCHAR(255) | NÃO | | | |
| ativo | TINYINT(1) | NÃO | | 1 | |
| ultimo_login_em | DATETIME | SIM | | | |
| criado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | |
| atualizado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP ON UPDATE | |

## Etapas do processo

### `atendimentos` — Chegada e Atendimento Inicial

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| numero_atendimento | VARCHAR(12) | NÃO | UK | | `AT0001`, gerado pelo trigger `trg_atendimentos_bi_numero` (RF02, RNF03). |
| paciente_id | INT UNSIGNED | NÃO | FK → pacientes.id | | |
| status | ENUM status do atendimento | NÃO | | `AGUARDANDO_TRIAGEM` | Etapa em que o paciente está. Nunca indica o médico. |
| finalizado_em | DATETIME | SIM | | | Preenchido se e só se `status = 'FINALIZADO'` (`chk_atendimentos_finalizacao`). |
| criado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | Data/hora da **chegada** e do atendimento inicial. |
| atualizado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP ON UPDATE | |

Índice `idx_atendimentos_status (status, criado_em)`. Migration 013: saíram `medico_id`, `confirmado_medico_em` e `medico_em_atendimento_id`, que passaram para `consultas`.

### `triagens` — Triagem

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| atendimento_id | INT UNSIGNED | NÃO | FK → atendimentos.id, UK | | Uma triagem por atendimento (RNF04). |
| enfermeiro_id | INT UNSIGNED | NÃO | FK → enfermeiros.id | | Imutável (RN18.5). |
| classificacao_manchester | ENUM Manchester | NÃO | | | RF08. |
| queixa_principal | VARCHAR(500) | NÃO | | | RF07. |
| pressao_sistolica | SMALLINT UNSIGNED | SIM | | | Obrigatória na API, exceto em `VERMELHO` (RN18.4). |
| pressao_diastolica | SMALLINT UNSIGNED | SIM | | | Idem; menor que a sistólica. |
| frequencia_cardiaca | SMALLINT UNSIGNED | SIM | | | Idem. |
| frequencia_respiratoria | SMALLINT UNSIGNED | SIM | | | Idem. |
| temperatura | DECIMAL(4,1) | SIM | | | Idem. |
| saturacao_o2 | TINYINT UNSIGNED | SIM | | | Idem. |
| glicemia | SMALLINT UNSIGNED | SIM | | | Opcional. |
| escala_dor | TINYINT UNSIGNED | SIM | | | 0 a 10, opcional. |
| observacoes | TEXT | SIM | | | |
| realizada_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | Início da espera pela consulta. |

### `consultas` — Consulta

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| atendimento_id | INT UNSIGNED | NÃO | FK → atendimentos.id, UK | | Uma consulta por atendimento. Exige atendimento `EM_CONSULTA`. |
| medico_id | INT UNSIGNED | NÃO | FK → medicos.id | | Médico responsável, ativo, imutável (RF19). |
| iniciada_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | **Confirmação médica**: a partir daqui o atendimento não é alterado nem cancelado (RF04, RF05). Na API: `confirmado_em` (lista de atendimentos) e `iniciada_em` (consulta do médico). |
| finalizada_em | DATETIME | SIM | | | Preenchida no desfecho; exige desfecho registrado. ≥ `iniciada_em`. |
| medico_em_consulta_id | INT UNSIGNED (gerada, STORED) | SIM | UK | | `medico_id` enquanto a consulta está aberta. O índice único garante uma consulta aberta por médico (RF20). |

### `desfechos` — Desfecho/Finalização

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| consulta_id | INT UNSIGNED | NÃO | FK → consultas.id, UK | | Um desfecho por consulta. O médico responsável é o da consulta. |
| tipo | ENUM tipo de desfecho | NÃO | | | `PRESCRICAO` exige ao menos uma linha em `prescricoes`. |
| descricao | VARCHAR(500) | NÃO | | | Orientações, conduta, exames pedidos ou motivo do encaminhamento (mínimo de 3 caracteres). |
| destino_encaminhamento | VARCHAR(150) | SIM | | | Obrigatório se e só se `tipo = 'ENCAMINHAMENTO'` (`chk_desfechos_destino`). |
| registrado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | Imutável depois de gravado. |

### `prescricoes`

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| atendimento_id | INT UNSIGNED | NÃO | FK → atendimentos.id | | Só com atendimento `EM_CONSULTA` (RNF04). |
| medico_id | INT UNSIGNED | NÃO | FK → medicos.id | | Deve ser o médico da consulta aberta (RF21). |
| medicamento | VARCHAR(150) | NÃO | | | |
| dosagem | VARCHAR(60) | NÃO | | | |
| via_administracao | VARCHAR(40) | NÃO | | | Lista fechada na API (RN21.3). |
| frequencia | VARCHAR(60) | NÃO | | | |
| observacoes | VARCHAR(500) | SIM | | | |
| criado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | |

## Rastreabilidade

### `historico_status` — histórico de status do atendimento

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| atendimento_id | INT UNSIGNED | NÃO | FK → atendimentos.id | | |
| status_anterior | ENUM status do atendimento | SIM | | | Nulo na abertura. |
| status_novo | ENUM status do atendimento | NÃO | | | |
| recepcionista_id | INT UNSIGNED | SIM | FK → recepcionistas.id | | Exatamente uma das três colunas de responsável é preenchida (`chk_historico_status_um_responsavel`). |
| enfermeiro_id | INT UNSIGNED | SIM | FK → enfermeiros.id | | |
| medico_id | INT UNSIGNED | SIM | FK → medicos.id | | |
| data_hora | DATETIME | NÃO | | CURRENT_TIMESTAMP | |

### `historico_etapas` — histórico de etapas do paciente

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| atendimento_id | INT UNSIGNED | NÃO | FK → atendimentos.id, UK (com etapa) | | |
| etapa | ENUM etapa do atendimento | NÃO | UK (com atendimento_id) | | Cada etapa no máximo uma vez por atendimento. |
| descricao | VARCHAR(255) | NÃO | | | Texto da etapa, ex.: *"Triagem realizada por Marina Costa Albuquerque: classificação AMARELO (Urgente)."* |
| registrado_em | DATETIME | NÃO | | CURRENT_TIMESTAMP | |

### `historico_status_medico` — histórico de status do médico

| Coluna | Tipo | Nulo | Chave | Default | Descrição / regra |
|---|---|---|---|---|---|
| id | INT UNSIGNED | NÃO | PK | AUTO_INCREMENT | |
| medico_id | INT UNSIGNED | NÃO | FK → medicos.id | | |
| status_anterior | ENUM status operacional | SIM | | | Nulo no cadastro do médico. |
| status_novo | ENUM status operacional | NÃO | | | Diferente de `status_anterior`. |
| data_hora | DATETIME | NÃO | | CURRENT_TIMESTAMP | |

Preenchida só pelos triggers `trg_medicos_ai_status` e `trg_medicos_au_status`, tanto em mudanças feitas pela API quanto direto no banco.

## Tabelas técnicas

| Tabela | Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|---|
| `sequencia_atendimento` | id | INT UNSIGNED, PK, AUTO_INCREMENT | NÃO | Um insert por atendimento; `LAST_INSERT_ID()` vira o número do `AT0001`. |
