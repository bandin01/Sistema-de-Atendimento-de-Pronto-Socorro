-- Geração do número de atendimento (RF02, RNF03)
--
-- Usa AFTER INSERT (não BEFORE INSERT) porque o valor do AUTO_INCREMENT só
-- fica disponível em NEW.id depois que o INSERT é efetivado. O AUTO_INCREMENT
-- do MySQL já garante unicidade/sequência sob concorrência; o trigger só
-- formata o valor no padrão "AT000".
DELIMITER $$

CREATE TRIGGER trg_atendimento_numero
AFTER INSERT ON atendimento
FOR EACH ROW
BEGIN
  UPDATE atendimento
  SET numero = CONCAT('AT', LPAD(NEW.id, 3, '0'))
  WHERE id = NEW.id;
END$$

DELIMITER ;
