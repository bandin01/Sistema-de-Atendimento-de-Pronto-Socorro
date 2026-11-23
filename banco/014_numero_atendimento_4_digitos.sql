-- 014_numero_atendimento_4_digitos.sql: AT001 → AT0001 (formato do descritivo); só muda o 3 → 4 no GREATEST.

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
