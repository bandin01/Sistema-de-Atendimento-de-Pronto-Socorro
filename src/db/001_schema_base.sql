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
  rg               VARCHAR(20)  NULL,
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
