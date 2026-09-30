# Requisitos Funcionais e Não Funcionais do Sistema

## Requisitos Funcionais

### Recepção

- [ ] **RF01** - O sistema deve permitir o cadastro de um novo atendimento com os dados pessoais do paciente (nome completo, endereço, RG, CPF, nome do pai, nome da mãe e data de nascimento).
- [ ] **RF02** - O sistema deve gerar automaticamente um número único de atendimento seguindo o modelo "AT000" a cada novo cadastro.
- [ ] **RF03** - O sistema deve permitir consultar um atendimento já cadastrado.
- [ ] **RF04** - O sistema deve permitir alterar os dados do paciente, desde que a consulta não foi autorizada pelo médico.
- [ ] **RF05** - O sistema deve permitir cancelar o atendimento, desde que a consulta não foi autorizada pelo médico.

### Triagem

- [ ] **RF06** - O sistema deve permitir registrar, para um atendimento existente, os dados vitais do paciente (pressão arterial, temperatura corporal e batimentos cardíacos).
- [ ] **RF07** - O sistema deve permitir registrar as principais queixas do paciente.
- [ ] **RF08** - O sistema deve permitir classificar o atendimento de acordo com as categorias do protocolo de Manchester.

### Atendimento Médico

- [ ] **RF09** - O sistema deve exibir um painel de atendimento ao médico, listando os pacientes em espera ordenados pela classificação de Manchester.
- [ ] **RF10** - O painel deve exibir, para cada atendimento, número de atendimento, nome do paciente, data de nascimento e algum outro dado que achar importante.
- [ ] **RF11** - O sistema deve permitir que o médico acesse o atendimento selecionado.
- [ ] **RF12** - O sistema deve permitir que o médico registre as medicações prescritas.
- [ ] **RF13** - O sistema deve permitir que o médico confirme a finalização do atendimento (alta do paciente).

### Geral do Sistema

- [ ] **RF14** - O sistema deve manter o histórico de status do atendimento (aberto, em triagem, em atendimento médico, finalizado, cancelado).
- [ ] **RF15** - O sistema deve impedir alteração/cancelamento de atendimentos já confirmados pelo médico.

## Requisitos Não Funcionais

- [ ] **RNF01** - O painel de atendimentos deve atualizar a fila de pacientes em tempo próximo ao real, pois ele é que orienta o médico sobre qual paciente chamar em seguida.
- [ ] **RNF02** - As operações de cadastro, consulta e alteração de atendimento na recepção devem responder em poucos segundos, já que impactam diretamente o tempo de espera do paciente.
- [ ] **RNF03** - O número de atendimento gerado "AT000" deve ser único e sequencial, sem duplicidade, mesmo com múltiplos cadastros simultâneos.
- [ ] **RNF04** - O sistema deve garantir integridade referencial entre paciente, atendimento, triagem e prescrição médica; nenhum registro de triagem ou medicação pode existir sem um atendimento válido associado.
- [ ] **RNF05** - O sistema deve impedir a alteração ou cancelamento de um atendimento após a confirmação do médico.
- [ ] **RNF06** - Cada perfil (recepção, enfermagem e médico) deve ter interface própria, exibindo apenas os campos e ações relevantes para sua etapa do processo.
- [ ] **RNF07** - O painel de atendimentos deve apresentar a informação de forma clara e rápida de ler.
- [ ] **RNF08** - O acesso às funcionalidades deve ser restrito por perfil de usuário: só a enfermagem registra dados de triagem, e só o médico confirma o atendimento e lança a medicação.
- [ ] **RNF09** - Dados pessoais sensíveis do paciente (CPF, RG) devem ter acesso controlado.