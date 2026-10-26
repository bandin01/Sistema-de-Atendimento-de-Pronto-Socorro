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
