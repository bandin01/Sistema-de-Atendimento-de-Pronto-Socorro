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
