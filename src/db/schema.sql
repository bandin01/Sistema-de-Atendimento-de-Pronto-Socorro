-- Schema do Sistema de Atendimento de Pronto-Socorro
-- Ver fontes_de_verdade_sistema/requisitos.md para os requisitos correspondentes.

CREATE TABLE paciente (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome_completo VARCHAR(150) NOT NULL,
  endereco VARCHAR(255) NOT NULL,
  rg VARCHAR(20) NOT NULL,
  cpf VARCHAR(11) NOT NULL,
  nome_pai VARCHAR(150),
  nome_mae VARCHAR(150),
  data_nascimento DATE NOT NULL,
  UNIQUE KEY uk_paciente_cpf (cpf)
);

CREATE TABLE usuario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  login VARCHAR(50) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  perfil ENUM('recepcao', 'enfermagem', 'medico') NOT NULL,
  UNIQUE KEY uk_usuario_login (login)
);

CREATE TABLE atendimento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(10) NULL, -- preenchido pelo trigger AFTER INSERT (ver triggers.sql)
  paciente_id INT NOT NULL,
  status ENUM('aberto', 'em_triagem', 'em_atendimento_medico', 'finalizado', 'cancelado') NOT NULL DEFAULT 'aberto',
  data_abertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_atendimento_numero (numero),
  CONSTRAINT fk_atendimento_paciente FOREIGN KEY (paciente_id) REFERENCES paciente(id)
);

CREATE TABLE triagem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  atendimento_id INT NOT NULL,
  pressao_arterial VARCHAR(20) NOT NULL,
  temperatura DECIMAL(4,1) NOT NULL,
  batimentos_cardiacos INT NOT NULL,
  queixas_principais TEXT NOT NULL,
  classificacao_manchester ENUM('azul', 'verde', 'amarelo', 'laranja', 'vermelho') NOT NULL,
  UNIQUE KEY uk_triagem_atendimento (atendimento_id),
  CONSTRAINT fk_triagem_atendimento FOREIGN KEY (atendimento_id) REFERENCES atendimento(id)
);

CREATE TABLE prescricao (
  id INT AUTO_INCREMENT PRIMARY KEY,
  atendimento_id INT NOT NULL,
  medicacoes TEXT NOT NULL,
  data_alta DATETIME NULL,
  UNIQUE KEY uk_prescricao_atendimento (atendimento_id),
  CONSTRAINT fk_prescricao_atendimento FOREIGN KEY (atendimento_id) REFERENCES atendimento(id)
);

CREATE TABLE historico_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  atendimento_id INT NOT NULL,
  status_anterior ENUM('aberto', 'em_triagem', 'em_atendimento_medico', 'finalizado', 'cancelado') NULL,
  status_novo ENUM('aberto', 'em_triagem', 'em_atendimento_medico', 'finalizado', 'cancelado') NOT NULL,
  usuario_id INT NOT NULL,
  data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_historico_atendimento FOREIGN KEY (atendimento_id) REFERENCES atendimento(id),
  CONSTRAINT fk_historico_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
);
