-- =============================================================================
-- 012_historico_status.sql
-- =============================================================================
-- Consolida a tabela de histórico existente no schema legado (db/schema.sql)
-- com o modelo atual usado pela API.
--
-- O banco da aplicação usa nomes plurais e os status definidos em
-- config/dominio.js. A tabela é criada depois de 010 e 011 porque depende de
-- recepcionistas, medicos, enfermeiros e atendimentos.
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
