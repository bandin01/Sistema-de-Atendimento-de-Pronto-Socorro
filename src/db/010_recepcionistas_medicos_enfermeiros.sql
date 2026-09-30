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
