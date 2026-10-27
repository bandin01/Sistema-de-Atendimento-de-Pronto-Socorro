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
--   6. RG fica VARCHAR(9) em todas as tabelas (profissionais saem de VARCHAR(20)),
--      com CHECK de formato (mesma regra do validador da API: 5 a 9 dígitos ou X).
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
-- Requer MySQL 8.0.16+. Execute pelo MySQL CLI ou Workbench (ou use script_completo.sql).
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
