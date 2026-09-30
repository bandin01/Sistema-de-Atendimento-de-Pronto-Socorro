# DER — Diagrama Entidade-Relacionamento (lógico, MySQL)

Tabelas, colunas, chaves e cardinalidades como estão no banco.
Fonte: `src/db/001_schema_base.sql` + migrations `010`, `011` e `012`.
O modelo conceitual está em [MER.md](MER.md). Imagem: [img/DER.svg](img/DER.svg).

Recepcionistas, médicos e enfermeiros ficam em tabelas separadas, cada uma com o próprio `login` e `senha_hash`. Não existe tabela `usuarios`: o perfil de acesso é definido pela tabela onde o profissional está.

Notação pé-de-galinha: `||` exatamente um · `o|` zero ou um · `o{` zero ou muitos.

```mermaid
erDiagram
  pacientes ||--o{ atendimentos : possui
  medicos |o--o{ atendimentos : conduz
  atendimentos ||--o| triagens : "passa por"
  enfermeiros ||--o{ triagens : realiza
  atendimentos ||--o{ prescricoes : gera
  medicos ||--o{ prescricoes : prescreve
  atendimentos ||--o{ historico_status : registra
  recepcionistas |o--o{ historico_status : altera
  enfermeiros |o--o{ historico_status : altera
  medicos |o--o{ historico_status : altera

  recepcionistas {
    int_unsigned id PK
    varchar(150) nome
    char(11) cpf UK "sensível"
    varchar(20) rg "NULL, sensível"
    date data_nascimento
    varchar(11) telefone "NULL"
    varchar(150) email UK
    varchar(60) login UK "único entre as 3 tabelas"
    varchar(255) senha_hash
    tinyint ativo
    datetime ultimo_login_em "NULL"
    datetime criado_em
    datetime atualizado_em
  }

  medicos {
    int_unsigned id PK
    varchar(150) nome
    char(11) cpf UK "sensível"
    varchar(20) rg "NULL, sensível"
    date data_nascimento
    varchar(11) telefone "NULL"
    varchar(150) email UK
    varchar(10) crm_numero UK "UK composta com crm_uf"
    char(2) crm_uf UK
    varchar(100) especialidade
    enum status_disponibilidade "DISPONIVEL | EM_ATENDIMENTO | PAUSA | INDISPONIVEL"
    varchar(60) login UK "único entre as 3 tabelas"
    varchar(255) senha_hash
    tinyint ativo
    datetime ultimo_login_em "NULL"
    datetime criado_em
    datetime atualizado_em
  }

  enfermeiros {
    int_unsigned id PK
    varchar(150) nome
    char(11) cpf UK "sensível"
    varchar(20) rg "NULL, sensível"
    date data_nascimento
    varchar(11) telefone "NULL"
    varchar(150) email UK
    varchar(10) coren_numero UK "UK composta com coren_uf"
    char(2) coren_uf UK
    enum categoria "ENFERMEIRO | TECNICO_ENFERMAGEM"
    varchar(100) especialidade "NULL"
    enum status_disponibilidade "DISPONIVEL | PAUSA | INDISPONIVEL"
    varchar(60) login UK "único entre as 3 tabelas"
    varchar(255) senha_hash
    tinyint ativo
    datetime ultimo_login_em "NULL"
    datetime criado_em
    datetime atualizado_em
  }

  pacientes {
    int_unsigned id PK
    varchar(150) nome
    char(11) cpf UK "NULL, sensível"
    varchar(20) rg "NULL, sensível"
    date data_nascimento
    datetime criado_em
  }

  atendimentos {
    int_unsigned id PK
    varchar(12) numero_atendimento UK "AT000, gerado por trigger"
    int_unsigned paciente_id FK
    int_unsigned medico_id FK "NULL até o médico chamar"
    int_unsigned medico_em_atendimento_id UK "coluna gerada (RF20)"
    enum status "AGUARDANDO_TRIAGEM | AGUARDANDO_MEDICO | EM_ATENDIMENTO_MEDICO | FINALIZADO | CANCELADO"
    datetime confirmado_medico_em "NULL"
    datetime finalizado_em "NULL"
    datetime criado_em
    datetime atualizado_em
  }

  triagens {
    int_unsigned id PK
    int_unsigned atendimento_id FK,UK
    int_unsigned enfermeiro_id FK
    enum classificacao_manchester "VERMELHO | LARANJA | AMARELO | VERDE | AZUL"
    varchar(500) queixa_principal
    smallint pressao_sistolica "NULL"
    smallint pressao_diastolica "NULL"
    smallint frequencia_cardiaca "NULL"
    smallint frequencia_respiratoria "NULL"
    decimal temperatura "DECIMAL(4 1) NULL"
    tinyint saturacao_o2 "NULL"
    smallint glicemia "NULL"
    tinyint escala_dor "NULL"
    text observacoes "NULL"
    datetime realizada_em
  }

  prescricoes {
    int_unsigned id PK
    int_unsigned atendimento_id FK
    int_unsigned medico_id FK
    varchar(150) medicamento
    varchar(60) dosagem
    varchar(40) via_administracao
    varchar(60) frequencia
    varchar(500) observacoes "NULL"
    datetime criado_em
  }

  historico_status {
    int_unsigned id PK
    int_unsigned atendimento_id FK
    enum status_anterior "NULL"
    enum status_novo
    int_unsigned recepcionista_id FK "NULL"
    int_unsigned enfermeiro_id FK "NULL"
    int_unsigned medico_id FK "NULL"
    datetime data_hora
  }

  sequencia_atendimento {
    int_unsigned id PK "AUTO_INCREMENT que gera o AT000 (RNF03)"
  }
```

`sequencia_atendimento` não tem relacionamento: é uma tabela técnica. O trigger `trg_atendimentos_bi_numero` insere nela e usa `LAST_INSERT_ID()` para gerar o `numero_atendimento`.

## Chaves estrangeiras

Todas são `ON UPDATE RESTRICT ON DELETE RESTRICT`: nenhum registro clínico é apagado em cascata. Profissionais são desativados (`ativo = 0`), nunca excluídos.

| Tabela.coluna | → Referência | Nulo? | Único? |
|---|---|---|---|
| atendimentos.paciente_id | pacientes.id | não | não |
| atendimentos.medico_id | medicos.id | sim | não |
| triagens.atendimento_id | atendimentos.id | não | sim (1:1) |
| triagens.enfermeiro_id | enfermeiros.id | não | não |
| prescricoes.atendimento_id | atendimentos.id | não | não |
| prescricoes.medico_id | medicos.id | não | não |
| historico_status.atendimento_id | atendimentos.id | não | não |
| historico_status.recepcionista_id | recepcionistas.id | sim | não |
| historico_status.enfermeiro_id | enfermeiros.id | sim | não |
| historico_status.medico_id | medicos.id | sim | não |

Em `historico_status`, o CHECK `chk_historico_status_um_responsavel` exige que **exatamente uma** das três colunas de responsável esteja preenchida.

## Regras garantidas por trigger

| Trigger | Regra | Requisito |
|---|---|---|
| trg_atendimentos_bi_numero | Gera `AT000` único sob concorrência | RF02, RNF03 |
| trg_{recepcionistas,medicos,enfermeiros}_bi_login / _bu_login | Login não pode se repetir entre as três tabelas (procedure `sp_validar_login_unico`) | RNF08 |
| trg_atendimentos_bu_medico | Finalizado é imutável; não cancela após confirmação; médico responsável imutável e ativo | RF05, RF15, RNF05 |
| trg_triagens_bi_enfermeiro | Triagem só por ENFERMEIRO ativo e com atendimento AGUARDANDO_TRIAGEM | RNF04, RNF08 |
| trg_prescricoes_bi_medico / trg_prescricoes_bu_bloqueio | Prescrição só pelo médico responsável, com atendimento em curso; bloqueada após finalizar | RNF04, RF15 |
