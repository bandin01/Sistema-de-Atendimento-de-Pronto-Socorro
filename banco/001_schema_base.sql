-- 001_schema_base.sql: pacientes, atendimentos (número AT0001), triagens e prescrições.
-- Ordem: 000 → 001 → 010 → 011 → 012 → 013 → 014 → dados_iniciais → 015 (ou tudo em script_completo.sql).
-- Requer MySQL 8.0.16+ (CHECK constraints).

-- CPF, RG e nome dos pais são opcionais: o PS atende quem chega sem documento (RF01).
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
-- Número de atendimento AT0001 (RNF03; 4 dígitos desde a 014)
-- Tabela de sequência porque: no BEFORE INSERT o AUTO_INCREMENT ainda não existe, o
-- AFTER INSERT não pode dar UPDATE na mesma tabela e MAX(id) + 1 duplica sob concorrência.
-- INSERT na sequência + LAST_INSERT_ID() é atômico e isolado por conexão.
-- GREATEST no LPAD: LPAD('1000', 3, '0') devolve '100' (trunca e duplicaria o número).
-- ROLLBACK consome o número: pode haver buracos (AT0007 → AT0009), nunca repetição.
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
