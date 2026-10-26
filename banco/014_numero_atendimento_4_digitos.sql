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
