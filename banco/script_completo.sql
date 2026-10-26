-- =============================================================================
-- script_completo.sql
-- -----------------------------------------------------------------------------
-- Cria o banco pronto_socorro inteiro de uma vez: é a junção, na ordem certa,
-- dos arquivos desta pasta (000, 001, 010, 011, 012, 013, 014 e dados_iniciais).
-- Os arquivos numerados continuam aqui como referência.
--
-- MySQL Workbench: File > Open SQL Script > este arquivo > executar (raio).
-- Terminal:        mysql -u root -p < script_completo.sql
--
-- Para recriar o banco do zero, tire o comentário da linha abaixo
-- (ATENÇÃO: apaga todos os dados do banco pronto_socorro).
-- DROP DATABASE IF EXISTS pronto_socorro;
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>> 000_create_database.sql <<<<<<<<<<<<<<<<<<<<

CREATE DATABASE IF NOT EXISTS pronto_socorro DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE pronto_socorro;

-- >>>>>>>>>>>>>>>>>>>> 001_schema_base.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 001_schema_base.sql
-- -----------------------------------------------------------------------------
-- Schema base do fluxo de atendimento: pacientes, atendimentos (com o número
-- AT000), triagens e prescrições. As migrations 010, 011 e 012 completam o
-- modelo (profissionais, vínculos e histórico). Ordem: 001 → 010 → 011 → 012.
--
-- Para recriar o banco inteiro de uma vez: src/db/recriar_banco.sh
-- Requer MySQL 8.0.16+ (CHECK constraints são aplicadas a partir dessa versão).
-- =============================================================================

-- RF01: nome completo, endereço, RG, CPF, nome do pai, nome da mãe e nascimento.
-- CPF/RG ficam NULL porque o PS atende quem chega sem documento; nome do pai
-- pode ser desconhecido, e a mãe também (ex.: paciente em situação de rua).
CREATE TABLE IF NOT EXISTS pacientes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome             VARCHAR(150) NOT NULL,
  endereco         VARCHAR(255) NOT NULL,
  cpf              CHAR(11)     NULL,
  rg               VARCHAR(9)  NULL,
  nome_pai         VARCHAR(150) NULL,
  nome_mae         VARCHAR(150) NULL,
  data_nascimento  DATE         NOT NULL,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pacientes_cpf (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Número de atendimento AT000 (RNF03)
-- -----------------------------------------------------------------------------
-- Por que uma tabela de sequência?
--   * Em um BEFORE INSERT o valor de AUTO_INCREMENT da própria linha ainda não
--     existe (NEW.id = 0), e um AFTER INSERT não pode fazer UPDATE na mesma
--     tabela. Coluna gerada também não pode referenciar AUTO_INCREMENT.
--   * `SELECT MAX(id) + 1` dentro do trigger NÃO é seguro sob concorrência:
--     duas conexões leem o mesmo MAX e geram o mesmo número.
--   * Inserir numa tabela de sequência com AUTO_INCREMENT é atômico no InnoDB e
--     LAST_INSERT_ID() é isolado por conexão → número único mesmo com várias
--     recepções cadastrando ao mesmo tempo.
--
-- Cuidado com LPAD: LPAD('1000', 3, '0') devolve '100' (TRUNCA!). Isso geraria
-- AT100 duplicado a partir do atendimento 1000. Por isso usamos GREATEST(...).
--
-- Observação: se uma transação sofrer ROLLBACK, o número consumido não volta.
-- O número continua único e crescente, mas pode haver "buracos" (AT007 → AT009).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequencia_atendimento (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS atendimentos (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero_atendimento    VARCHAR(12)  NOT NULL,
  paciente_id           INT UNSIGNED NOT NULL,
  status                ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_MEDICO','EM_ATENDIMENTO_MEDICO','FINALIZADO','CANCELADO')
                        NOT NULL DEFAULT 'AGUARDANDO_TRIAGEM',
  confirmado_medico_em  DATETIME     NULL,
  finalizado_em         DATETIME     NULL,
  criado_em             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_atendimentos_numero (numero_atendimento),
  KEY idx_atendimentos_status (status, criado_em),
  CONSTRAINT fk_atendimentos_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER IF EXISTS trg_atendimentos_bi_numero;
DELIMITER $$
CREATE TRIGGER trg_atendimentos_bi_numero
BEFORE INSERT ON atendimentos
FOR EACH ROW
BEGIN
  DECLARE v_seq INT UNSIGNED;
  INSERT INTO sequencia_atendimento () VALUES ();
  SET v_seq = LAST_INSERT_ID();
  SET NEW.numero_atendimento = CONCAT('AT', LPAD(v_seq, GREATEST(3, CHAR_LENGTH(v_seq)), '0'));
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS triagens (
  id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  atendimento_id           INT UNSIGNED NOT NULL,
  classificacao_manchester ENUM('VERMELHO','LARANJA','AMARELO','VERDE','AZUL') NOT NULL,
  queixa_principal         VARCHAR(500) NOT NULL,
  pressao_sistolica        SMALLINT UNSIGNED NULL,
  pressao_diastolica       SMALLINT UNSIGNED NULL,
  frequencia_cardiaca      SMALLINT UNSIGNED NULL,
  frequencia_respiratoria  SMALLINT UNSIGNED NULL,
  temperatura              DECIMAL(4,1)      NULL,
  saturacao_o2             TINYINT UNSIGNED  NULL,
  glicemia                 SMALLINT UNSIGNED NULL,
  escala_dor               TINYINT UNSIGNED  NULL,
  observacoes              TEXT              NULL,
  realizada_em             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_triagens_atendimento (atendimento_id),
  CONSTRAINT fk_triagens_atendimento FOREIGN KEY (atendimento_id) REFERENCES atendimentos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prescricoes (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  atendimento_id     INT UNSIGNED NOT NULL,
  medicamento        VARCHAR(150) NOT NULL,
  dosagem            VARCHAR(60)  NOT NULL,
  via_administracao  VARCHAR(40)  NOT NULL,
  frequencia         VARCHAR(60)  NOT NULL,
  observacoes        VARCHAR(500) NULL,
  criado_em          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prescricoes_atendimento (atendimento_id),
  CONSTRAINT fk_prescricoes_atendimento FOREIGN KEY (atendimento_id) REFERENCES atendimentos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- >>>>>>>>>>>>>>>>>>>> 010_recepcionistas_medicos_enfermeiros.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 010_recepcionistas_medicos_enfermeiros.sql
-- -----------------------------------------------------------------------------
-- Cria as entidades de profissionais: recepcionistas, medicos e enfermeiros.
-- Requisitos: RF16, RF17, RF18, RNF08
--
-- Decisões:
--   * Cada perfil tem a sua própria tabela, com as suas próprias credenciais
--     (login + senha_hash). Não existe tabela "usuarios" compartilhada: o perfil
--     de acesso é definido pela tabela em que o profissional está
--     (recepcionistas → RECEPCAO, enfermeiros → ENFERMAGEM, medicos → MEDICO).
--   * O login é único dentro de cada tabela (UNIQUE) e também entre as três
--     (procedure sp_validar_login_unico, chamada pelos triggers). Assim a
--     autenticação encontra no máximo um profissional por login.
--   * FKs que apontam para estas tabelas usam ON UPDATE/DELETE RESTRICT:
--     profissionais nunca são apagados (histórico clínico), apenas desativados
--     (ativo = 0).
--   * CPF é armazenado só com dígitos; a máscara é aplicada na API (RNF09).
--
-- Requer MySQL 8.0.16+. Execute pelo MySQL CLI ou Workbench (usa DELIMITER).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RECEPCIONISTAS
-- -----------------------------------------------------------------------------
CREATE TABLE recepcionistas (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome              VARCHAR(150) NOT NULL,
  cpf               CHAR(11)     NOT NULL,
  rg                VARCHAR(20)  NULL,
  data_nascimento   DATE         NOT NULL,
  telefone          VARCHAR(11)  NULL,
  email             VARCHAR(150) NOT NULL,
  login             VARCHAR(60)  NOT NULL,
  senha_hash        VARCHAR(255) NOT NULL,
  ativo             TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_login_em   DATETIME     NULL,
  criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_recepcionistas_login (login),
  UNIQUE KEY uk_recepcionistas_cpf (cpf),
  UNIQUE KEY uk_recepcionistas_email (email),
  CONSTRAINT chk_recepcionistas_login    CHECK (login REGEXP '^[a-z0-9._-]{3,60}$'),
  CONSTRAINT chk_recepcionistas_cpf      CHECK (cpf REGEXP '^[0-9]{11}$'),
  CONSTRAINT chk_recepcionistas_telefone CHECK (telefone IS NULL OR telefone REGEXP '^[0-9]{10,11}$'),
  CONSTRAINT chk_recepcionistas_ativo    CHECK (ativo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- MÉDICOS
-- -----------------------------------------------------------------------------
CREATE TABLE medicos (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome                    VARCHAR(150) NOT NULL,
  cpf                     CHAR(11)     NOT NULL,
  rg                      VARCHAR(20)  NULL,
  data_nascimento         DATE         NOT NULL,
  telefone                VARCHAR(11)  NULL,
  email                   VARCHAR(150) NOT NULL,
  crm_numero              VARCHAR(10)  NOT NULL,
  crm_uf                  CHAR(2)      NOT NULL,
  especialidade           VARCHAR(100) NOT NULL,
  status_disponibilidade  ENUM('DISPONIVEL','EM_ATENDIMENTO','PAUSA','INDISPONIVEL')
                          NOT NULL DEFAULT 'INDISPONIVEL',
  login                   VARCHAR(60)  NOT NULL,
  senha_hash              VARCHAR(255) NOT NULL,
  ativo                   TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_login_em         DATETIME     NULL,
  criado_em               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_medicos_login (login),
  UNIQUE KEY uk_medicos_cpf (cpf),
  UNIQUE KEY uk_medicos_email (email),
  UNIQUE KEY uk_medicos_crm (crm_numero, crm_uf),
  KEY idx_medicos_disponibilidade (ativo, status_disponibilidade),
  CONSTRAINT chk_medicos_login      CHECK (login REGEXP '^[a-z0-9._-]{3,60}$'),
  CONSTRAINT chk_medicos_cpf        CHECK (cpf REGEXP '^[0-9]{11}$'),
  CONSTRAINT chk_medicos_telefone   CHECK (telefone IS NULL OR telefone REGEXP '^[0-9]{10,11}$'),
  CONSTRAINT chk_medicos_crm_numero CHECK (crm_numero REGEXP '^[0-9]{1,10}$'),
  CONSTRAINT chk_medicos_crm_uf     CHECK (crm_uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                                                     'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                                                     'SP','SE','TO')),
  CONSTRAINT chk_medicos_ativo      CHECK (ativo IN (0, 1)),
  -- Profissional desativado não pode ficar "disponível" na escala.
  CONSTRAINT chk_medicos_inativo_indisponivel CHECK (ativo = 1 OR status_disponibilidade = 'INDISPONIVEL')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- ENFERMEIROS
-- categoria: pela Resolução Cofen nº 661/2021, a classificação de risco é
-- privativa do ENFERMEIRO dentro da equipe de enfermagem. Técnicos têm login
-- de enfermagem, mas não registram triagem (regra aplicada no service e no
-- trigger da migration 011).
-- -----------------------------------------------------------------------------
CREATE TABLE enfermeiros (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome                    VARCHAR(150) NOT NULL,
  cpf                     CHAR(11)     NOT NULL,
  rg                      VARCHAR(20)  NULL,
  data_nascimento         DATE         NOT NULL,
  telefone                VARCHAR(11)  NULL,
  email                   VARCHAR(150) NOT NULL,
  coren_numero            VARCHAR(10)  NOT NULL,
  coren_uf                CHAR(2)      NOT NULL,
  categoria               ENUM('ENFERMEIRO','TECNICO_ENFERMAGEM') NOT NULL DEFAULT 'ENFERMEIRO',
  especialidade           VARCHAR(100) NULL,
  status_disponibilidade  ENUM('DISPONIVEL','PAUSA','INDISPONIVEL') NOT NULL DEFAULT 'INDISPONIVEL',
  login                   VARCHAR(60)  NOT NULL,
  senha_hash              VARCHAR(255) NOT NULL,
  ativo                   TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_login_em         DATETIME     NULL,
  criado_em               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_enfermeiros_login (login),
  UNIQUE KEY uk_enfermeiros_cpf (cpf),
  UNIQUE KEY uk_enfermeiros_email (email),
  UNIQUE KEY uk_enfermeiros_coren (coren_numero, coren_uf),
  KEY idx_enfermeiros_disponibilidade (ativo, status_disponibilidade),
  CONSTRAINT chk_enfermeiros_login        CHECK (login REGEXP '^[a-z0-9._-]{3,60}$'),
  CONSTRAINT chk_enfermeiros_cpf          CHECK (cpf REGEXP '^[0-9]{11}$'),
  CONSTRAINT chk_enfermeiros_telefone     CHECK (telefone IS NULL OR telefone REGEXP '^[0-9]{10,11}$'),
  CONSTRAINT chk_enfermeiros_coren_numero CHECK (coren_numero REGEXP '^[0-9]{1,10}$'),
  CONSTRAINT chk_enfermeiros_coren_uf     CHECK (coren_uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                                                           'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                                                           'SP','SE','TO')),
  CONSTRAINT chk_enfermeiros_ativo        CHECK (ativo IN (0, 1)),
  CONSTRAINT chk_enfermeiros_inativo_indisponivel CHECK (ativo = 1 OR status_disponibilidade = 'INDISPONIVEL')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- LOGIN ÚNICO ENTRE AS TRÊS TABELAS (RNF08)
-- Cada tabela já garante o próprio UNIQUE; a procedure impede que o mesmo login
-- exista em duas tabelas diferentes. p_tabela = tabela de origem (ignorada na
-- busca, porque ali o UNIQUE já cobre).
-- Limite conhecido: dois INSERTs simultâneos do mesmo login em tabelas
-- diferentes podem passar juntos. Cadastro de profissional é raro e feito por
-- administrador, então o risco é aceitável; o service também valida.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_recepcionistas_bi_login;
DROP TRIGGER IF EXISTS trg_recepcionistas_bu_login;
DROP TRIGGER IF EXISTS trg_medicos_bi_login;
DROP TRIGGER IF EXISTS trg_medicos_bu_login;
DROP TRIGGER IF EXISTS trg_enfermeiros_bi_login;
DROP TRIGGER IF EXISTS trg_enfermeiros_bu_login;
DROP PROCEDURE IF EXISTS sp_validar_login_unico;

DELIMITER $$

CREATE PROCEDURE sp_validar_login_unico(IN p_login VARCHAR(60), IN p_tabela VARCHAR(20))
BEGIN
  IF (p_tabela <> 'recepcionistas' AND EXISTS (SELECT 1 FROM recepcionistas WHERE login = p_login))
     OR (p_tabela <> 'medicos'     AND EXISTS (SELECT 1 FROM medicos     WHERE login = p_login))
     OR (p_tabela <> 'enfermeiros' AND EXISTS (SELECT 1 FROM enfermeiros WHERE login = p_login)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Login já está em uso por outro profissional.';
  END IF;
END$$

CREATE TRIGGER trg_recepcionistas_bi_login
BEFORE INSERT ON recepcionistas
FOR EACH ROW
BEGIN
  CALL sp_validar_login_unico(NEW.login, 'recepcionistas');
END$$

CREATE TRIGGER trg_recepcionistas_bu_login
BEFORE UPDATE ON recepcionistas
FOR EACH ROW
BEGIN
  IF NOT (NEW.login <=> OLD.login) THEN
    CALL sp_validar_login_unico(NEW.login, 'recepcionistas');
  END IF;
END$$

CREATE TRIGGER trg_medicos_bi_login
BEFORE INSERT ON medicos
FOR EACH ROW
BEGIN
  CALL sp_validar_login_unico(NEW.login, 'medicos');
END$$

CREATE TRIGGER trg_medicos_bu_login
BEFORE UPDATE ON medicos
FOR EACH ROW
BEGIN
  IF NOT (NEW.login <=> OLD.login) THEN
    CALL sp_validar_login_unico(NEW.login, 'medicos');
  END IF;
END$$

CREATE TRIGGER trg_enfermeiros_bi_login
BEFORE INSERT ON enfermeiros
FOR EACH ROW
BEGIN
  CALL sp_validar_login_unico(NEW.login, 'enfermeiros');
END$$

CREATE TRIGGER trg_enfermeiros_bu_login
BEFORE UPDATE ON enfermeiros
FOR EACH ROW
BEGIN
  IF NOT (NEW.login <=> OLD.login) THEN
    CALL sp_validar_login_unico(NEW.login, 'enfermeiros');
  END IF;
END$$

DELIMITER ;

-- >>>>>>>>>>>>>>>>>>>> 011_integracao_atendimento_triagem_prescricao.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 011_integracao_atendimento_triagem_prescricao.sql
-- -----------------------------------------------------------------------------
-- Vincula profissionais ao fluxo recepção → triagem → médico → alta.
-- Requisitos: RF04, RF05, RF15, RF19, RF20, RF21, RNF04, RNF05, RNF10
--
--   atendimentos.medico_id   NULL até o médico chamar o paciente; obrigatório a
--                            partir de EM_ATENDIMENTO_MEDICO e imutável depois.
--   triagens.enfermeiro_id   NOT NULL (triagem sempre tem enfermeiro responsável)
--   prescricoes.medico_id    NOT NULL (prescrição sempre tem médico responsável)
--
-- ⚠️ BANCO COM DADOS: se já existirem triagens/prescrições, o MODIFY ... NOT NULL
--    abaixo falha com "Invalid use of NULL value". Nesse caso, faça o backfill
--    (UPDATE triagens SET enfermeiro_id = <id> WHERE enfermeiro_id IS NULL) antes.
--
-- A regra do número AT000 (RNF03) NÃO é alterada por esta migration.
-- Execute pelo MySQL CLI ou Workbench (usa DELIMITER). Requer MySQL 8.0.16+.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ATENDIMENTOS ← MÉDICO
-- medico_em_atendimento_id: coluna gerada que só tem valor enquanto o
-- atendimento está EM_ATENDIMENTO_MEDICO. O índice UNIQUE garante, no próprio
-- banco e sob concorrência, que um médico conduz no máximo 1 atendimento ativo
-- por vez (RF20). Valores NULL não conflitam em índice UNIQUE.
-- -----------------------------------------------------------------------------
ALTER TABLE atendimentos
  ADD COLUMN medico_id INT UNSIGNED NULL AFTER paciente_id,
  ADD COLUMN medico_em_atendimento_id INT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN status = 'EM_ATENDIMENTO_MEDICO' THEN medico_id ELSE NULL END) STORED
    AFTER medico_id,
  ADD KEY idx_atendimentos_medico_status (medico_id, status),
  ADD UNIQUE KEY uk_atendimentos_medico_em_atendimento (medico_em_atendimento_id),
  ADD CONSTRAINT fk_atendimentos_medico FOREIGN KEY (medico_id) REFERENCES medicos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- TRIAGENS ← ENFERMEIRO
-- -----------------------------------------------------------------------------
ALTER TABLE triagens
  ADD COLUMN enfermeiro_id INT UNSIGNED NULL AFTER atendimento_id;

-- (backfill aqui, se houver dados legados)

ALTER TABLE triagens
  MODIFY COLUMN enfermeiro_id INT UNSIGNED NOT NULL,
  ADD KEY idx_triagens_enfermeiro (enfermeiro_id),
  ADD KEY idx_triagens_fila (classificacao_manchester, realizada_em),
  ADD CONSTRAINT fk_triagens_enfermeiro FOREIGN KEY (enfermeiro_id) REFERENCES enfermeiros (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- PRESCRIÇÕES ← MÉDICO
-- -----------------------------------------------------------------------------
ALTER TABLE prescricoes
  ADD COLUMN medico_id INT UNSIGNED NULL AFTER atendimento_id;

-- (backfill aqui, se houver dados legados)

ALTER TABLE prescricoes
  MODIFY COLUMN medico_id INT UNSIGNED NOT NULL,
  ADD KEY idx_prescricoes_medico (medico_id),
  ADD CONSTRAINT fk_prescricoes_medico FOREIGN KEY (medico_id) REFERENCES medicos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- TRIGGERS (defesa em profundidade: o service valida primeiro, o banco garante)
-- Se já existirem triggers com as mesmas regras (ex.: RF15), não há conflito:
-- o MySQL 8 permite vários triggers no mesmo evento, desde que com nomes distintos.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_atendimentos_bi_medico;
DROP TRIGGER IF EXISTS trg_atendimentos_bu_medico;
DROP TRIGGER IF EXISTS trg_triagens_bi_enfermeiro;
DROP TRIGGER IF EXISTS trg_triagens_bu_enfermeiro;
DROP TRIGGER IF EXISTS trg_prescricoes_bi_medico;
DROP TRIGGER IF EXISTS trg_prescricoes_bu_bloqueio;

DELIMITER $$

CREATE TRIGGER trg_atendimentos_bi_medico
BEFORE INSERT ON atendimentos
FOR EACH ROW
BEGIN
  IF NEW.status IN ('EM_ATENDIMENTO_MEDICO', 'FINALIZADO') AND NEW.medico_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento médico exige médico responsável.';
  END IF;
END$$

CREATE TRIGGER trg_atendimentos_bu_medico
BEFORE UPDATE ON atendimentos
FOR EACH ROW
BEGIN
  -- RF15: atendimento finalizado é imutável
  IF OLD.status = 'FINALIZADO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento finalizado não pode ser alterado.';
  END IF;

  -- RF05/RNF05: sem cancelamento após confirmação médica
  IF OLD.confirmado_medico_em IS NOT NULL AND NEW.status = 'CANCELADO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento confirmado pelo médico não pode ser cancelado.';
  END IF;

  -- RF19: médico responsável é imutável depois de vinculado
  IF OLD.medico_id IS NOT NULL AND NOT (NEW.medico_id <=> OLD.medico_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Médico responsável não pode ser trocado após a confirmação.';
  END IF;

  -- RF19: atendimento médico e alta exigem médico
  IF NEW.status IN ('EM_ATENDIMENTO_MEDICO', 'FINALIZADO') AND NEW.medico_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento médico exige médico responsável.';
  END IF;

  -- Só médico ativo pode assumir
  IF OLD.medico_id IS NULL AND NEW.medico_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM medicos m WHERE m.id = NEW.medico_id AND m.ativo = 1) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Médico inexistente ou inativo.';
    END IF;
  END IF;
END$$

-- RF18 + RNF04: triagem só por ENFERMEIRO ativo, em atendimento aguardando triagem
CREATE TRIGGER trg_triagens_bi_enfermeiro
BEFORE INSERT ON triagens
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(30) DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_status = NULL;

  IF NOT EXISTS (
    SELECT 1
      FROM enfermeiros e
     WHERE e.id = NEW.enfermeiro_id
       AND e.ativo = 1
       AND e.categoria = 'ENFERMEIRO'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Triagem deve ser registrada por enfermeiro(a) ativo(a) da categoria ENFERMEIRO.';
  END IF;

  SELECT a.status INTO v_status FROM atendimentos a WHERE a.id = NEW.atendimento_id;
  IF v_status IS NULL OR v_status <> 'AGUARDANDO_TRIAGEM' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Triagem exige atendimento válido aguardando triagem.';
  END IF;
END$$

CREATE TRIGGER trg_triagens_bu_enfermeiro
BEFORE UPDATE ON triagens
FOR EACH ROW
BEGIN
  IF NOT (NEW.enfermeiro_id <=> OLD.enfermeiro_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Enfermeiro responsável pela triagem não pode ser trocado.';
  END IF;
END$$

-- RF21 + RNF04: prescrição só pelo médico responsável, com atendimento em curso
CREATE TRIGGER trg_prescricoes_bi_medico
BEFORE INSERT ON prescricoes
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(30) DEFAULT NULL;
  DECLARE v_medico INT UNSIGNED DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_status = NULL;

  SELECT a.status, a.medico_id INTO v_status, v_medico
    FROM atendimentos a
   WHERE a.id = NEW.atendimento_id;

  IF v_status IS NULL OR v_status <> 'EM_ATENDIMENTO_MEDICO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prescrição exige atendimento válido em atendimento médico.';
  END IF;

  IF NOT (NEW.medico_id <=> v_medico) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prescrição deve ser registrada pelo médico responsável pelo atendimento.';
  END IF;
END$$

CREATE TRIGGER trg_prescricoes_bu_bloqueio
BEFORE UPDATE ON prescricoes
FOR EACH ROW
BEGIN
  IF NOT (NEW.medico_id <=> OLD.medico_id) OR NOT (NEW.atendimento_id <=> OLD.atendimento_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Médico e atendimento de uma prescrição não podem ser alterados.';
  END IF;

  IF EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = OLD.atendimento_id AND a.status = 'FINALIZADO') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prescrição de atendimento finalizado não pode ser alterada.';
  END IF;
END$$

DELIMITER ;

-- >>>>>>>>>>>>>>>>>>>> 012_historico_status.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 012_historico_status.sql
-- =============================================================================
-- Histórico de mudanças de status do atendimento (RF14). Os valores de status
-- são os mesmos de atendimentos.status (001). A tabela é criada depois de 010
-- e 011 porque depende de recepcionistas, medicos, enfermeiros e atendimentos.
--
-- Quem alterou o status (RF14): como cada perfil tem a sua própria tabela, há
-- uma FK por tabela de profissional. O CHECK exige exatamente uma preenchida.
-- =============================================================================

CREATE TABLE IF NOT EXISTS historico_status (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  atendimento_id    INT UNSIGNED NOT NULL,
  status_anterior   ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_MEDICO','EM_ATENDIMENTO_MEDICO','FINALIZADO','CANCELADO') NULL,
  status_novo       ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_MEDICO','EM_ATENDIMENTO_MEDICO','FINALIZADO','CANCELADO') NOT NULL,
  recepcionista_id  INT UNSIGNED NULL,
  enfermeiro_id     INT UNSIGNED NULL,
  medico_id         INT UNSIGNED NULL,
  data_hora         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_historico_status_atendimento (atendimento_id, data_hora),
  KEY idx_historico_status_recepcionista (recepcionista_id),
  KEY idx_historico_status_enfermeiro (enfermeiro_id),
  KEY idx_historico_status_medico (medico_id),
  CONSTRAINT fk_historico_status_atendimento
    FOREIGN KEY (atendimento_id) REFERENCES atendimentos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_historico_status_recepcionista
    FOREIGN KEY (recepcionista_id) REFERENCES recepcionistas (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_historico_status_enfermeiro
    FOREIGN KEY (enfermeiro_id) REFERENCES enfermeiros (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_historico_status_medico
    FOREIGN KEY (medico_id) REFERENCES medicos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_historico_status_um_responsavel CHECK (
    (recepcionista_id IS NOT NULL) + (enfermeiro_id IS NOT NULL) + (medico_id IS NOT NULL) = 1
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- >>>>>>>>>>>>>>>>>>>> 013_fluxo_etapas_consulta_desfecho.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 013_fluxo_etapas_consulta_desfecho.sql
-- -----------------------------------------------------------------------------
-- Refatoração do MER/DER: o atendimento passa a ser modelado como um PROCESSO
-- em etapas, não como ator do sistema.
--
--   Chegada → Atendimento Inicial → Triagem → Consulta → Desfecho
--
-- Cada etapa clínica tem a sua entidade e o seu profissional responsável:
--   atendimentos  (Atendimento Inicial)  ← recepcionista (historico_status)
--   triagens      (Triagem)              ← enfermeiro
--   consultas     (Consulta)             ← médico            [NOVA]
--   desfechos     (Desfecho)             ← médico, via consulta [NOVA]
--
-- O que muda:
--   1. Atendimento perde os dados do médico (medico_id, confirmado_medico_em e
--      a coluna gerada medico_em_atendimento_id). O vínculo com o médico passa
--      para a nova tabela consultas, que também garante RF20 (um médico, no
--      máximo uma consulta aberta) com índice único em coluna gerada.
--   2. Status do atendimento descrevem a etapa, não o médico:
--        AGUARDANDO_MEDICO      → AGUARDANDO_CONSULTA
--        EM_ATENDIMENTO_MEDICO  → EM_CONSULTA
--   3. Médico ganha status operacional próprio (medicos.status_operacional):
--        EM_PLANTAO | EM_CONSULTA (só o sistema) | PAUSA | FOLGA | LICENCA
--        DISPONIVEL → EM_PLANTAO, EM_ATENDIMENTO → EM_CONSULTA,
--        INDISPONIVEL → FOLGA
--      com histórico automático em historico_status_medico.
--   4. Desfecho da consulta (desfechos): PRESCRICAO, EXAMES, ENCAMINHAMENTO
--      ou ALTA, com descrição obrigatória. Sem desfecho não há finalização.
--   5. Histórico de etapas do paciente (historico_etapas): uma linha por etapa,
--      com a descrição textual (VARCHAR) do que aconteceu.
--   6. RG passa de VARCHAR(20) para VARCHAR(9) em todas as tabelas, com CHECK
--      de formato (mesma regra do validador da API: 5 a 9 dígitos ou X).
--   7. NOT NULL / CHECK de coerência: atendimento FINALIZADO ⇔ finalizado_em.
--
-- ⚠️ BANCO COM DADOS:
--   * RG com mais de 9 caracteres faz o MODIFY falhar. Confira antes:
--       SELECT 'pacientes' t, id, rg FROM pacientes WHERE CHAR_LENGTH(rg) > 9
--       UNION ALL SELECT 'recepcionistas', id, rg FROM recepcionistas WHERE CHAR_LENGTH(rg) > 9
--       UNION ALL SELECT 'medicos', id, rg FROM medicos WHERE CHAR_LENGTH(rg) > 9
--       UNION ALL SELECT 'enfermeiros', id, rg FROM enfermeiros WHERE CHAR_LENGTH(rg) > 9;
--   * Atendimentos e históricos existentes são convertidos (status renomeados,
--     consultas, desfechos e etapas preenchidos a partir dos dados atuais).
--
-- Ordem das seções importa: os triggers novos são criados só no FINAL, depois
-- da conversão dos dados (eles bloqueariam o backfill de registros finalizados).
-- Requer MySQL 8.0.16+. Execute pelo runner (npm run migrate) ou pelo MySQL CLI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Triggers da 011 que dependem das colunas/valores que vão mudar.
--    trg_triagens_* e trg_prescricoes_bu_bloqueio continuam válidos.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_atendimentos_bi_medico;
DROP TRIGGER IF EXISTS trg_atendimentos_bu_medico;
DROP TRIGGER IF EXISTS trg_prescricoes_bi_medico;

-- -----------------------------------------------------------------------------
-- 2. RG: VARCHAR(20) → VARCHAR(9) + CHECK de formato
-- -----------------------------------------------------------------------------
ALTER TABLE pacientes
  MODIFY COLUMN rg VARCHAR(9) NULL,
  ADD CONSTRAINT chk_pacientes_rg CHECK (rg IS NULL OR rg REGEXP '^[0-9X]{5,9}$');

ALTER TABLE recepcionistas
  MODIFY COLUMN rg VARCHAR(9) NULL,
  ADD CONSTRAINT chk_recepcionistas_rg CHECK (rg IS NULL OR rg REGEXP '^[0-9X]{5,9}$');

ALTER TABLE medicos
  MODIFY COLUMN rg VARCHAR(9) NULL,
  ADD CONSTRAINT chk_medicos_rg CHECK (rg IS NULL OR rg REGEXP '^[0-9X]{5,9}$');

ALTER TABLE enfermeiros
  MODIFY COLUMN rg VARCHAR(9) NULL,
  ADD CONSTRAINT chk_enfermeiros_rg CHECK (rg IS NULL OR rg REGEXP '^[0-9X]{5,9}$');

-- -----------------------------------------------------------------------------
-- 3. CONSULTAS (etapa Consulta) — recebe o vínculo com o médico
-- medico_em_consulta_id: só tem valor enquanto a consulta está aberta. O índice
-- UNIQUE garante, no banco e sob concorrência, que um médico conduz no máximo
-- uma consulta por vez (RF20). NULL não conflita em índice UNIQUE.
-- -----------------------------------------------------------------------------
CREATE TABLE consultas (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  atendimento_id         INT UNSIGNED NOT NULL,
  medico_id              INT UNSIGNED NOT NULL,
  iniciada_em            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizada_em          DATETIME     NULL,
  medico_em_consulta_id  INT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN finalizada_em IS NULL THEN medico_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_consultas_atendimento (atendimento_id),
  UNIQUE KEY uk_consultas_medico_em_consulta (medico_em_consulta_id),
  KEY idx_consultas_medico (medico_id, iniciada_em),
  CONSTRAINT fk_consultas_atendimento FOREIGN KEY (atendimento_id) REFERENCES atendimentos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_consultas_medico FOREIGN KEY (medico_id) REFERENCES medicos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_consultas_periodo CHECK (finalizada_em IS NULL OR finalizada_em >= iniciada_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Backfill: todo atendimento que já tinha médico vira uma consulta.
INSERT INTO consultas (atendimento_id, medico_id, iniciada_em, finalizada_em)
SELECT a.id,
       a.medico_id,
       COALESCE(a.confirmado_medico_em, a.criado_em),
       CASE WHEN a.status = 'FINALIZADO'
            THEN GREATEST(COALESCE(a.finalizado_em, a.atualizado_em), COALESCE(a.confirmado_medico_em, a.criado_em))
       END
  FROM atendimentos a
 WHERE a.medico_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. ATENDIMENTOS: sai a indicação do médico; status passam a nomear a etapa
-- -----------------------------------------------------------------------------
ALTER TABLE atendimentos
  DROP INDEX uk_atendimentos_medico_em_atendimento,
  DROP COLUMN medico_em_atendimento_id;

ALTER TABLE atendimentos DROP FOREIGN KEY fk_atendimentos_medico;

ALTER TABLE atendimentos
  DROP INDEX idx_atendimentos_medico_status,
  DROP COLUMN medico_id,
  DROP COLUMN confirmado_medico_em;

-- Renomear valores de ENUM com dados: ampliar → converter → restringir.
ALTER TABLE atendimentos
  MODIFY COLUMN status ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_MEDICO','EM_ATENDIMENTO_MEDICO',
                            'AGUARDANDO_CONSULTA','EM_CONSULTA','FINALIZADO','CANCELADO')
                       NOT NULL DEFAULT 'AGUARDANDO_TRIAGEM';

UPDATE atendimentos
   SET status = CASE status
                  WHEN 'AGUARDANDO_MEDICO'     THEN 'AGUARDANDO_CONSULTA'
                  WHEN 'EM_ATENDIMENTO_MEDICO' THEN 'EM_CONSULTA'
                END,
       atualizado_em = atualizado_em
 WHERE status IN ('AGUARDANDO_MEDICO', 'EM_ATENDIMENTO_MEDICO');

-- Coerência para o CHECK abaixo (registros antigos finalizados sem data).
UPDATE atendimentos
   SET finalizado_em = atualizado_em, atualizado_em = atualizado_em
 WHERE status = 'FINALIZADO' AND finalizado_em IS NULL;

UPDATE atendimentos
   SET finalizado_em = NULL, atualizado_em = atualizado_em
 WHERE status <> 'FINALIZADO' AND finalizado_em IS NOT NULL;

ALTER TABLE atendimentos
  MODIFY COLUMN status ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_CONSULTA','EM_CONSULTA','FINALIZADO','CANCELADO')
                       NOT NULL DEFAULT 'AGUARDANDO_TRIAGEM',
  ADD CONSTRAINT chk_atendimentos_finalizacao CHECK ((status = 'FINALIZADO') = (finalizado_em IS NOT NULL));

-- -----------------------------------------------------------------------------
-- 5. HISTÓRICO DE STATUS DO ATENDIMENTO: mesmos valores novos
-- -----------------------------------------------------------------------------
ALTER TABLE historico_status
  MODIFY COLUMN status_anterior ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_MEDICO','EM_ATENDIMENTO_MEDICO',
                                     'AGUARDANDO_CONSULTA','EM_CONSULTA','FINALIZADO','CANCELADO') NULL,
  MODIFY COLUMN status_novo     ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_MEDICO','EM_ATENDIMENTO_MEDICO',
                                     'AGUARDANDO_CONSULTA','EM_CONSULTA','FINALIZADO','CANCELADO') NOT NULL;

UPDATE historico_status
   SET status_anterior = CASE status_anterior
                           WHEN 'AGUARDANDO_MEDICO'     THEN 'AGUARDANDO_CONSULTA'
                           WHEN 'EM_ATENDIMENTO_MEDICO' THEN 'EM_CONSULTA'
                           ELSE status_anterior
                         END,
       status_novo     = CASE status_novo
                           WHEN 'AGUARDANDO_MEDICO'     THEN 'AGUARDANDO_CONSULTA'
                           WHEN 'EM_ATENDIMENTO_MEDICO' THEN 'EM_CONSULTA'
                           ELSE status_novo
                         END
 WHERE status_anterior IN ('AGUARDANDO_MEDICO', 'EM_ATENDIMENTO_MEDICO')
    OR status_novo     IN ('AGUARDANDO_MEDICO', 'EM_ATENDIMENTO_MEDICO');

ALTER TABLE historico_status
  MODIFY COLUMN status_anterior ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_CONSULTA','EM_CONSULTA','FINALIZADO','CANCELADO') NULL,
  MODIFY COLUMN status_novo     ENUM('AGUARDANDO_TRIAGEM','AGUARDANDO_CONSULTA','EM_CONSULTA','FINALIZADO','CANCELADO') NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. DESFECHOS (etapa Desfecho/Finalização) — um por consulta
-- O médico responsável é o da consulta (sem coluna duplicada).
-- tipo: PRESCRICAO (alta com receita; itens em prescricoes), EXAMES (alta com
-- pedido de exames), ENCAMINHAMENTO (exige destino) ou ALTA (alta simples).
-- -----------------------------------------------------------------------------
CREATE TABLE desfechos (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  consulta_id             INT UNSIGNED NOT NULL,
  tipo                    ENUM('PRESCRICAO','EXAMES','ENCAMINHAMENTO','ALTA') NOT NULL,
  descricao               VARCHAR(500) NOT NULL,
  destino_encaminhamento  VARCHAR(150) NULL,
  registrado_em           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_desfechos_consulta (consulta_id),
  KEY idx_desfechos_tipo (tipo, registrado_em),
  CONSTRAINT fk_desfechos_consulta FOREIGN KEY (consulta_id) REFERENCES consultas (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_desfechos_descricao CHECK (CHAR_LENGTH(TRIM(descricao)) >= 3),
  -- destino é obrigatório no encaminhamento e proibido nos demais tipos
  CONSTRAINT chk_desfechos_destino CHECK ((tipo = 'ENCAMINHAMENTO') = (destino_encaminhamento IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Backfill: consultas já finalizadas recebem um desfecho migrado.
INSERT INTO desfechos (consulta_id, tipo, descricao, registrado_em)
SELECT c.id,
       CASE WHEN EXISTS (SELECT 1 FROM prescricoes p WHERE p.atendimento_id = c.atendimento_id)
            THEN 'PRESCRICAO' ELSE 'ALTA' END,
       'Desfecho anterior à migration 013 (registro convertido automaticamente).',
       c.finalizada_em
  FROM consultas c
 WHERE c.finalizada_em IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 7. HISTÓRICO DE ETAPAS DO PACIENTE
-- Uma linha por etapa percorrida, com a descrição textual do que aconteceu.
-- Cada etapa acontece no máximo uma vez por atendimento.
-- -----------------------------------------------------------------------------
CREATE TABLE historico_etapas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  atendimento_id  INT UNSIGNED NOT NULL,
  etapa           ENUM('CHEGADA','ATENDIMENTO_INICIAL','TRIAGEM','CONSULTA','DESFECHO') NOT NULL,
  descricao       VARCHAR(255) NOT NULL,
  registrado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_historico_etapas_etapa (atendimento_id, etapa),
  KEY idx_historico_etapas_linha_tempo (atendimento_id, registrado_em),
  CONSTRAINT fk_historico_etapas_atendimento FOREIGN KEY (atendimento_id) REFERENCES atendimentos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_historico_etapas_descricao CHECK (CHAR_LENGTH(TRIM(descricao)) >= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Backfill da linha do tempo dos atendimentos existentes.
INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT a.id, 'CHEGADA', 'Chegada do paciente ao pronto-socorro.', a.criado_em
  FROM atendimentos a;

INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT a.id, 'ATENDIMENTO_INICIAL',
       CONCAT('Atendimento inicial na recepção: cadastro do paciente e número ', a.numero_atendimento, ' gerado.'),
       a.criado_em
  FROM atendimentos a;

INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT t.atendimento_id, 'TRIAGEM',
       LEFT(CONCAT('Triagem realizada por ', e.nome, ': classificação ', t.classificacao_manchester, '.'), 255),
       t.realizada_em
  FROM triagens t
  JOIN enfermeiros e ON e.id = t.enfermeiro_id;

INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT c.atendimento_id, 'CONSULTA',
       LEFT(CONCAT('Consulta iniciada por ', m.nome, ' (CRM-', m.crm_uf, ' ', m.crm_numero, ').'), 255),
       c.iniciada_em
  FROM consultas c
  JOIN medicos m ON m.id = c.medico_id;

INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT c.atendimento_id, 'DESFECHO',
       CONCAT('Desfecho registrado: ', d.tipo, '.'),
       d.registrado_em
  FROM desfechos d
  JOIN consultas c ON c.id = d.consulta_id;

-- -----------------------------------------------------------------------------
-- 8. MÉDICOS: status operacional próprio
-- O CHECK e o índice antigos citam status_disponibilidade: saem antes do rename.
-- -----------------------------------------------------------------------------
ALTER TABLE medicos
  DROP CHECK chk_medicos_inativo_indisponivel,
  DROP INDEX idx_medicos_disponibilidade;

ALTER TABLE medicos
  CHANGE COLUMN status_disponibilidade status_operacional
    ENUM('DISPONIVEL','EM_ATENDIMENTO','PAUSA','INDISPONIVEL',
         'EM_PLANTAO','EM_CONSULTA','FOLGA','LICENCA') NOT NULL DEFAULT 'FOLGA';

UPDATE medicos
   SET status_operacional = CASE status_operacional
                              WHEN 'DISPONIVEL'     THEN 'EM_PLANTAO'
                              WHEN 'EM_ATENDIMENTO' THEN 'EM_CONSULTA'
                              WHEN 'INDISPONIVEL'   THEN 'FOLGA'
                              ELSE status_operacional
                            END,
       atualizado_em = atualizado_em
 WHERE status_operacional IN ('DISPONIVEL', 'EM_ATENDIMENTO', 'INDISPONIVEL');

ALTER TABLE medicos
  MODIFY COLUMN status_operacional ENUM('EM_PLANTAO','EM_CONSULTA','PAUSA','FOLGA','LICENCA')
                                   NOT NULL DEFAULT 'FOLGA',
  ADD KEY idx_medicos_status_operacional (ativo, status_operacional),
  -- Profissional desativado não pode ficar na escala do plantão.
  ADD CONSTRAINT chk_medicos_inativo_fora_do_plantao CHECK (ativo = 1 OR status_operacional IN ('FOLGA', 'LICENCA'));

-- -----------------------------------------------------------------------------
-- 9. HISTÓRICO DE STATUS DO MÉDICO (alimentado por trigger, seção 10)
-- -----------------------------------------------------------------------------
CREATE TABLE historico_status_medico (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  medico_id        INT UNSIGNED NOT NULL,
  status_anterior  ENUM('EM_PLANTAO','EM_CONSULTA','PAUSA','FOLGA','LICENCA') NULL,
  status_novo      ENUM('EM_PLANTAO','EM_CONSULTA','PAUSA','FOLGA','LICENCA') NOT NULL,
  data_hora        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_historico_status_medico (medico_id, data_hora),
  CONSTRAINT fk_historico_status_medico_medico FOREIGN KEY (medico_id) REFERENCES medicos (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_historico_status_medico_mudanca CHECK (NOT (status_anterior <=> status_novo))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Ponto de partida: o status atual de cada médico já cadastrado.
INSERT INTO historico_status_medico (medico_id, status_anterior, status_novo, data_hora)
SELECT m.id, NULL, m.status_operacional, m.atualizado_em
  FROM medicos m;

-- -----------------------------------------------------------------------------
-- 10. TRIGGERS (defesa em profundidade: o service valida primeiro, o banco garante)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_atendimentos_bi_status;
DROP TRIGGER IF EXISTS trg_atendimentos_bu_bloqueio;
DROP TRIGGER IF EXISTS trg_consultas_bi_medico;
DROP TRIGGER IF EXISTS trg_consultas_bu_bloqueio;
DROP TRIGGER IF EXISTS trg_desfechos_bi_validacao;
DROP TRIGGER IF EXISTS trg_desfechos_bu_bloqueio;
DROP TRIGGER IF EXISTS trg_medicos_ai_status;
DROP TRIGGER IF EXISTS trg_medicos_au_status;

DELIMITER $$

-- Fluxo: todo atendimento começa no Atendimento Inicial, aguardando triagem.
CREATE TRIGGER trg_atendimentos_bi_status
BEFORE INSERT ON atendimentos
FOR EACH ROW
BEGIN
  IF NEW.status <> 'AGUARDANDO_TRIAGEM' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todo atendimento começa aguardando triagem.';
  END IF;
END$$

CREATE TRIGGER trg_atendimentos_bu_bloqueio
BEFORE UPDATE ON atendimentos
FOR EACH ROW
BEGIN
  -- RF15: atendimento finalizado é imutável
  IF OLD.status = 'FINALIZADO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento finalizado não pode ser alterado.';
  END IF;

  IF OLD.status = 'CANCELADO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento cancelado não pode ser alterado.';
  END IF;

  -- RF05/RNF05: só cancela antes da consulta (confirmação médica)
  IF NEW.status = 'CANCELADO' AND OLD.status NOT IN ('AGUARDANDO_TRIAGEM', 'AGUARDANDO_CONSULTA') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento confirmado pelo médico não pode ser cancelado.';
  END IF;

  -- Finalização exige desfecho registrado na consulta
  IF NEW.status = 'FINALIZADO' AND NOT EXISTS (
    SELECT 1
      FROM consultas c
      JOIN desfechos d ON d.consulta_id = c.id
     WHERE c.atendimento_id = OLD.id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Atendimento só pode ser finalizado com desfecho registrado.';
  END IF;
END$$

-- RF19/RF20: consulta só por médico ativo, em atendimento chamado (EM_CONSULTA)
CREATE TRIGGER trg_consultas_bi_medico
BEFORE INSERT ON consultas
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM medicos m WHERE m.id = NEW.medico_id AND m.ativo = 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Médico inexistente ou inativo.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = NEW.atendimento_id AND a.status = 'EM_CONSULTA') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Consulta exige atendimento chamado pelo médico (EM_CONSULTA).';
  END IF;

  IF NEW.finalizada_em IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Consulta nasce aberta; a finalização exige desfecho.';
  END IF;
END$$

CREATE TRIGGER trg_consultas_bu_bloqueio
BEFORE UPDATE ON consultas
FOR EACH ROW
BEGIN
  IF OLD.finalizada_em IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Consulta finalizada não pode ser alterada.';
  END IF;

  -- RF19: médico responsável e atendimento são imutáveis
  IF NOT (NEW.medico_id <=> OLD.medico_id) OR NOT (NEW.atendimento_id <=> OLD.atendimento_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Médico responsável e atendimento da consulta não podem ser trocados.';
  END IF;

  IF NEW.finalizada_em IS NOT NULL AND NOT EXISTS (SELECT 1 FROM desfechos d WHERE d.consulta_id = OLD.id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Consulta só pode ser finalizada com desfecho registrado.';
  END IF;
END$$

-- RF21 + RNF04: prescrição só pelo médico da consulta aberta
CREATE TRIGGER trg_prescricoes_bi_medico
BEFORE INSERT ON prescricoes
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(30) DEFAULT NULL;
  DECLARE v_medico INT UNSIGNED DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_status = NULL;

  SELECT a.status, c.medico_id INTO v_status, v_medico
    FROM atendimentos a
    LEFT JOIN consultas c ON c.atendimento_id = a.id AND c.finalizada_em IS NULL
   WHERE a.id = NEW.atendimento_id;

  IF v_status IS NULL OR v_status <> 'EM_CONSULTA' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prescrição exige atendimento válido em consulta.';
  END IF;

  IF NOT (NEW.medico_id <=> v_medico) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prescrição deve ser registrada pelo médico responsável pela consulta.';
  END IF;
END$$

-- Desfecho só em consulta aberta; PRESCRICAO exige ao menos uma prescrição
CREATE TRIGGER trg_desfechos_bi_validacao
BEFORE INSERT ON desfechos
FOR EACH ROW
BEGIN
  DECLARE v_atendimento INT UNSIGNED DEFAULT NULL;
  DECLARE v_finalizada DATETIME DEFAULT NULL;
  DECLARE v_status VARCHAR(30) DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_atendimento = NULL;

  SELECT c.atendimento_id, c.finalizada_em, a.status INTO v_atendimento, v_finalizada, v_status
    FROM consultas c
    JOIN atendimentos a ON a.id = c.atendimento_id
   WHERE c.id = NEW.consulta_id;

  IF v_atendimento IS NULL OR v_finalizada IS NOT NULL OR v_status <> 'EM_CONSULTA' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Desfecho exige consulta em andamento.';
  END IF;

  IF NEW.tipo = 'PRESCRICAO'
     AND NOT EXISTS (SELECT 1 FROM prescricoes p WHERE p.atendimento_id = v_atendimento) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Desfecho PRESCRICAO exige ao menos uma prescrição registrada.';
  END IF;
END$$

CREATE TRIGGER trg_desfechos_bu_bloqueio
BEFORE UPDATE ON desfechos
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Desfecho registrado não pode ser alterado.';
END$$

-- Histórico de status do médico: toda mudança, feita pela API ou direto no banco
CREATE TRIGGER trg_medicos_ai_status
AFTER INSERT ON medicos
FOR EACH ROW
BEGIN
  INSERT INTO historico_status_medico (medico_id, status_anterior, status_novo)
  VALUES (NEW.id, NULL, NEW.status_operacional);
END$$

CREATE TRIGGER trg_medicos_au_status
AFTER UPDATE ON medicos
FOR EACH ROW
BEGIN
  IF NOT (NEW.status_operacional <=> OLD.status_operacional) THEN
    INSERT INTO historico_status_medico (medico_id, status_anterior, status_novo)
    VALUES (NEW.id, OLD.status_operacional, NEW.status_operacional);
  END IF;
END$$

DELIMITER ;

-- >>>>>>>>>>>>>>>>>>>> 014_numero_atendimento_4_digitos.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 014_numero_atendimento_4_digitos.sql
-- -----------------------------------------------------------------------------
-- Ajuste do número de atendimento para o formato do descritivo do projeto,
-- que usa como exemplo "AT0001" (4 dígitos). O trigger original (001) gerava
-- "AT001" (3 dígitos). A única mudança é o 3 → 4 dentro do GREATEST.
-- Continua único e sequencial mesmo com cadastros simultâneos (RNF03).
-- =============================================================================

DROP TRIGGER IF EXISTS trg_atendimentos_bi_numero;

DELIMITER $$
CREATE TRIGGER trg_atendimentos_bi_numero
BEFORE INSERT ON atendimentos
FOR EACH ROW
BEGIN
  DECLARE v_seq INT UNSIGNED;
  INSERT INTO sequencia_atendimento () VALUES ();
  SET v_seq = LAST_INSERT_ID();
  SET NEW.numero_atendimento = CONCAT('AT', LPAD(v_seq, GREATEST(4, CHAR_LENGTH(v_seq)), '0'));
END$$
DELIMITER ;

-- >>>>>>>>>>>>>>>>>>>> dados_iniciais.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- dados_iniciais.sql
-- -----------------------------------------------------------------------------
-- Profissionais do plantão e alguns pacientes de exemplo para demonstração.
-- Executar DEPOIS dos scripts 000 a 014.
--
-- Observação: o profissional entra no sistema escolhendo o perfil e o nome na
-- página inicial (sem senha). As colunas login e senha_hash fazem parte da
-- modelagem original do banco e são obrigatórias, por isso são preenchidas
-- com valores fixos.
-- =============================================================================

USE pronto_socorro;

-- -----------------------------------------------------------------------------
-- PROFISSIONAIS
-- -----------------------------------------------------------------------------
INSERT INTO recepcionistas (nome, cpf, rg, data_nascimento, telefone, email, login, senha_hash) VALUES
  ('Ana Paula Souza',     '52998224725', '284731905', '1992-04-10', '19991234567', 'ana.souza@exemplo.com',  'ana.souza',  'login-nao-utilizado'),
  ('Bruno Henrique Dias', '11144477735', '193847562', '1988-09-22', '19992345678', 'bruno.dias@exemplo.com', 'bruno.dias', 'login-nao-utilizado');

INSERT INTO enfermeiros (nome, cpf, rg, data_nascimento, telefone, email, coren_numero, coren_uf, categoria,
                         especialidade, status_disponibilidade, login, senha_hash) VALUES
  ('Marina Lopes',           '39053344705', '374829105', '1990-02-14', '19993456789', 'marina.lopes@exemplo.com',
   '123456', 'SP', 'ENFERMEIRO', 'Urgência e Emergência', 'DISPONIVEL', 'marina.lopes', 'login-nao-utilizado'),
  ('Carlos Eduardo Pereira', '12345678909', '465738291', '1985-07-03', '19994567890', 'carlos.pereira@exemplo.com',
   '234567', 'SP', 'ENFERMEIRO', NULL, 'DISPONIVEL', 'carlos.pereira', 'login-nao-utilizado');

INSERT INTO medicos (nome, cpf, rg, data_nascimento, telefone, email, crm_numero, crm_uf, especialidade,
                     status_operacional, login, senha_hash) VALUES
  ('Helena Martins', '98765432100', '556473829', '1980-11-30', '19995678901', 'helena.martins@exemplo.com',
   '112233', 'SP', 'Clínica Médica', 'EM_PLANTAO', 'helena.martins', 'login-nao-utilizado'),
  ('Rafael Costa',   '24681357928', '647382910', '1978-05-18', '19996789012', 'rafael.costa@exemplo.com',
   '445566', 'SP', 'Ortopedia',      'EM_PLANTAO', 'rafael.costa',   'login-nao-utilizado');

SET @recepcionista = (SELECT id FROM recepcionistas WHERE login = 'ana.souza');
SET @enfermeiro    = (SELECT id FROM enfermeiros    WHERE login = 'marina.lopes');
SET @agora         = NOW();

-- -----------------------------------------------------------------------------
-- PACIENTES DE EXEMPLO
-- Os 3 primeiros já passaram pela triagem (aparecem no Painel do Médico, fora
-- de ordem de chegada para mostrar a ordenação por Manchester). Os 3 últimos
-- estão aguardando triagem.
-- -----------------------------------------------------------------------------
INSERT INTO pacientes (nome, endereco, cpf, rg, nome_pai, nome_mae, data_nascimento) VALUES
  ('João Pedro Oliveira',    'Rua Barão de Jaguara, 450 - Centro, Campinas/SP',      '13579246828', '738291045', 'Pedro Oliveira',   'Sandra Oliveira',  '1990-07-25'),
  ('Antônio Carlos Ribeiro', 'Av. Francisco Glicério, 1200 - Centro, Campinas/SP',   '31415926590', '829104536', 'Carlos Ribeiro',   'Lúcia Ribeiro',    '1947-09-14'),
  ('Beatriz Almeida Rocha',  'Rua José Paulino, 88 - Centro, Campinas/SP',           '27182818205', '910453627', 'Marcos Rocha',     'Helena Almeida',   '1985-05-30'),
  ('Maria Aparecida Santos', 'Rua das Flores, 120 - Jardim Guanabara, Campinas/SP',  '16180339805', '104536278', 'José Santos',      'Joana Santos',     '1958-03-12'),
  ('Lucas Ferreira Lima',    'Av. John Boyd Dunlop, 3900 - Jd. Ipaussurama, Campinas/SP', NULL,     NULL,        'Roberto Lima',     'Cláudia Ferreira', '2001-11-02'),
  ('Fernanda Gomes Costa',   'Rua Sacramento, 300 - Cambuí, Campinas/SP',            NULL,          '536278190', NULL,               'Patrícia Gomes',   '1996-01-08');

-- Abre um atendimento por paciente, com o histórico de status e de etapas.
-- O número AT0001, AT0002... é gerado pelo trigger trg_atendimentos_bi_numero.
INSERT INTO atendimentos (paciente_id, criado_em)
SELECT p.id,
       CASE p.nome
         WHEN 'João Pedro Oliveira'    THEN @agora - INTERVAL 95 MINUTE
         WHEN 'Antônio Carlos Ribeiro' THEN @agora - INTERVAL 40 MINUTE
         WHEN 'Beatriz Almeida Rocha'  THEN @agora - INTERVAL 30 MINUTE
         WHEN 'Maria Aparecida Santos' THEN @agora - INTERVAL 15 MINUTE
         WHEN 'Lucas Ferreira Lima'    THEN @agora - INTERVAL 10 MINUTE
         ELSE @agora - INTERVAL 5 MINUTE
       END
  FROM pacientes p
 ORDER BY p.id;

INSERT INTO historico_status (atendimento_id, status_anterior, status_novo, recepcionista_id, data_hora)
SELECT a.id, NULL, 'AGUARDANDO_TRIAGEM', @recepcionista, a.criado_em
  FROM atendimentos a;

INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT a.id, 'CHEGADA', 'Chegada do paciente ao pronto-socorro.', a.criado_em
  FROM atendimentos a;

INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT a.id, 'ATENDIMENTO_INICIAL',
       CONCAT('Atendimento inicial na recepção (Ana Paula Souza): cadastro do paciente e número ',
              a.numero_atendimento, ' gerado.'),
       a.criado_em
  FROM atendimentos a;

-- Triagem dos 3 primeiros (o trigger exige atendimento AGUARDANDO_TRIAGEM).
INSERT INTO triagens (atendimento_id, enfermeiro_id, classificacao_manchester, queixa_principal,
                      pressao_sistolica, pressao_diastolica, frequencia_cardiaca, temperatura, realizada_em)
SELECT a.id, @enfermeiro,
       CASE p.nome
         WHEN 'João Pedro Oliveira'    THEN 'VERDE'
         WHEN 'Antônio Carlos Ribeiro' THEN 'LARANJA'
         ELSE 'AMARELO'
       END,
       CASE p.nome
         WHEN 'João Pedro Oliveira'    THEN 'Dor muscular. Torceu o tornozelo jogando futebol.'
         WHEN 'Antônio Carlos Ribeiro' THEN 'Suor excessivo, Náusea. Dor no peito há 1 hora.'
         ELSE 'Dor de cabeça, Enjoo. Febre desde ontem.'
       END,
       CASE p.nome WHEN 'João Pedro Oliveira' THEN 120 WHEN 'Antônio Carlos Ribeiro' THEN 160 ELSE 130 END,
       CASE p.nome WHEN 'João Pedro Oliveira' THEN 80  WHEN 'Antônio Carlos Ribeiro' THEN 100 ELSE 85 END,
       CASE p.nome WHEN 'João Pedro Oliveira' THEN 78  WHEN 'Antônio Carlos Ribeiro' THEN 112 ELSE 96 END,
       CASE p.nome WHEN 'João Pedro Oliveira' THEN 36.5 WHEN 'Antônio Carlos Ribeiro' THEN 36.8 ELSE 38.4 END,
       a.criado_em + INTERVAL 10 MINUTE
  FROM atendimentos a
  JOIN pacientes p ON p.id = a.paciente_id
 WHERE p.nome IN ('João Pedro Oliveira', 'Antônio Carlos Ribeiro', 'Beatriz Almeida Rocha');

UPDATE atendimentos a
  JOIN triagens t ON t.atendimento_id = a.id
   SET a.status = 'AGUARDANDO_CONSULTA';

INSERT INTO historico_status (atendimento_id, status_anterior, status_novo, enfermeiro_id, data_hora)
SELECT t.atendimento_id, 'AGUARDANDO_TRIAGEM', 'AGUARDANDO_CONSULTA', t.enfermeiro_id, t.realizada_em
  FROM triagens t;

INSERT INTO historico_etapas (atendimento_id, etapa, descricao, registrado_em)
SELECT t.atendimento_id, 'TRIAGEM',
       CONCAT('Triagem realizada por Marina Lopes: classificação ', t.classificacao_manchester, '.'),
       t.realizada_em
  FROM triagens t;
