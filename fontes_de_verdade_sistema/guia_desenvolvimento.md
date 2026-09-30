# Guia de Desenvolvimento — Sistema de Atendimento de Pronto-Socorro

*Passo a passo, da modelagem ao deploy*

**Stack:** HTML, CSS, JavaScript, Node.js, MySQL

## Introdução

Este guia organiza, em ordem prática, tudo que precisa ser feito para sair dos requisitos levantados (RF01-RF15 e RNF01-RNF09) até um sistema funcional de gerenciamento de atendimento de pronto-socorro, usando **HTML, CSS, JavaScript, Node.js e MySQL**.

A lógica da ordem é: primeiro modelar os dados (porque tudo depende deles), depois construir o back-end (regras de negócio e API), depois o front-end (interfaces por perfil), e só então tratar dos requisitos não funcionais transversais (tempo real, segurança, performance). No fim, um roteiro de testes e entrega.

---

## Fase 1 — Modelagem do Banco de Dados (MySQL)

Esta é a base de tudo. Os requisitos não funcionais RNF03 e RNF04 (unicidade do número de atendimento e integridade referencial) só se resolvem com um modelo de dados bem desenhado.

### 1.1 Levantar as entidades

A partir dos requisitos, as entidades principais são:

- **Paciente** — nome completo, endereço, RG, CPF, nome do pai, nome da mãe, data de nascimento
- **Atendimento** — número único (formato "AT000"), status (aberto, em triagem, em atendimento médico, finalizado, cancelado), data/hora de abertura, referência ao paciente
- **Triagem** — pressão arterial, temperatura corporal, batimentos cardíacos, queixas principais, classificação de Manchester, referência ao atendimento
- **Prescrição/Atendimento Médico** — medicações prescritas, data da alta, referência ao atendimento
- **Usuário/Perfil** — para controle de acesso (recepção, enfermagem, médico)
- **Histórico de Status** — para manter o rastro de mudanças de status do atendimento (RF14)

### 1.2 Desenhar o modelo entidade-relacionamento (MER)

- Defina as chaves primárias e estrangeiras entre Paciente → Atendimento → Triagem → Prescrição.
- Garanta que Triagem e Prescrição **nunca existam sem um Atendimento válido** (RNF04) — use `FOREIGN KEY ... NOT NULL`.
- Modele o histórico de status como uma tabela separada (ex: `HISTORICO_STATUS`) em vez de sobrescrever um campo único, para manter rastreabilidade completa (RF14).

### 1.3 Criar as tabelas no MySQL (via MySQL Workbench)

- Escreva os scripts `CREATE TABLE` com tipos adequados (`VARCHAR`, `INT`, `DATE`/`DATETIME`).
- Use `CHECK CONSTRAINT` para restringir o campo de status a valores válidos.
- Use `UNIQUE CONSTRAINT` no número de atendimento.

### 1.4 Resolver a geração do número de atendimento (RF02 + RNF03)

Esse é um ponto crítico porque precisa ser **único, sequencial e resistir a cadastros simultâneos**.

- Use uma coluna `AUTO_INCREMENT` no MySQL para gerar o valor sequencial de base.
- Use essa coluna dentro de um **TRIGGER** de `BEFORE INSERT` na tabela de Atendimento, formatando o valor no padrão "AT000" (ex: `CONCAT('AT', LPAD(NEW.id, 3, '0'))`).
- Isso evita condição de corrida: o `AUTO_INCREMENT` do MySQL é thread-safe e não gera duplicidade mesmo com múltiplos INSERTs simultâneos.

### 1.5 Dados sensíveis (RNF09)

- Já na modelagem, marque quais colunas são sensíveis (CPF, RG).
- Planeje mascarar ou criptografar esses campos, e restringir quais perfis de usuário/roles do banco têm permissão de `SELECT` sobre eles (mais detalhes na Fase 4).

---

## Fase 2 — Planejamento da Arquitetura e das APIs (Node.js)

Com o banco modelado, defina a estrutura do back-end antes de escrever código.

### 2.1 Escolher a estrutura do projeto Node

- Organize em camadas: **rotas → controllers → services** (regras de negócio) **→ repositórios/DAO** (acesso ao MySQL).
- Use um driver MySQL para Node, como `mysql2`, com **connection pooling** configurado desde o início — isso ajuda diretamente no RNF02 (resposta em poucos segundos).

### 2.2 Definir as rotas da API por módulo

Organize os endpoints seguindo os próprios grupos de requisitos:

- **Recepção**: `POST /atendimentos` (RF01), `GET /atendimentos/:numero` (RF03), `PUT /atendimentos/:numero` (RF04), `DELETE /atendimentos/:numero` ou mudança de status para "cancelado" (RF05)
- **Triagem**: `POST /atendimentos/:numero/triagem` (RF06, RF07, RF08)
- **Atendimento Médico**: `GET /painel-medico` (RF09, RF10), `GET /atendimentos/:numero` (RF11), `POST /atendimentos/:numero/prescricao` (RF12), `POST /atendimentos/:numero/alta` (RF13)

### 2.3 Implementar as regras de negócio críticas no back-end

Estas regras **não podem depender só do front-end** — têm que ser validadas no servidor:

- Bloquear alteração/cancelamento de atendimento após confirmação médica (RF04, RF05, RNF05).
- Impedir qualquer alteração em atendimentos já finalizados (RF15).
- Validar que toda Triagem e Prescrição estejam vinculadas a um Atendimento existente (RNF04).
- Ordenar o painel médico pela classificação de Manchester (RF09) — a ordenação deve ser feita na query ou no service, nunca só visualmente no front-end.

### 2.4 Registrar o histórico de status (RF14)

- Toda mudança de status deve gerar automaticamente um registro na tabela de histórico — o mais limpo é fazer isso dentro da própria transação do service, ou via trigger no MySQL.

---

## Fase 3 — Desenvolvimento do Front-end (HTML, CSS, JavaScript)

Só comece esta fase com a API já respondendo (mesmo que com dados de teste).

### 3.1 Definir as três interfaces por perfil (RNF06)

Construa telas separadas, cada uma mostrando só o que aquele perfil precisa:

- **Recepção**: formulário de cadastro de paciente, busca de atendimento, tela de alteração/cancelamento.
- **Enfermagem (Triagem)**: formulário de sinais vitais, queixas e classificação de Manchester.
- **Médico**: painel de fila (RF09, RF10) e tela de atendimento individual (prescrição + alta).

### 3.2 Construir o painel médico (RF09, RF10, RNF01, RNF07)

Esse é o componente mais sensível do front-end:

- Liste os pacientes ordenados por prioridade (cores por classificação de Manchester ajudam a leitura rápida — RNF07).
- Implemente atualização quase em tempo real: **polling** (requisição periódica a cada poucos segundos) é a solução mais simples com essa stack; se quiser algo mais robusto, **WebSockets** (ex: biblioteca `ws` ou `socket.io` no Node) atendem melhor o RNF01.
- Mostre número de atendimento, nome do paciente, data de nascimento e mais um dado relevante (ex: tempo de espera ou queixa principal) — RF10 deixa esse último campo em aberto para você decidir.

### 3.3 Formulários da recepção e triagem

- Valide os campos obrigatórios no front-end (nome, CPF, RG, datas) só como primeira camada de UX — a validação de verdade continua no back-end.
- Desabilite os campos de edição/cancelamento quando o atendimento já estiver com consulta autorizada pelo médico (reforça RF04/RF05 na interface, embora a regra real esteja no back-end).

### 3.4 Consumo da API

- Centralize as chamadas HTTP (`fetch`) em um módulo JS único por tela, para facilitar manutenção.
- Trate os erros de validação retornados pelo back-end e exiba mensagens claras ao usuário.

---

## Fase 4 — Segurança e Controle de Acesso

Trate esta fase assim que o CRUD básico estiver funcionando — não deixe para o final.

### 4.1 Autenticação e perfis de usuário (RNF08)

- Implemente login com perfis (recepção, enfermagem, médico).
- Use tokens (ex: JWT) para identificar o perfil em cada requisição à API.
- No back-end, cada rota deve checar o perfil antes de executar a ação (ex: só "enfermagem" pode gravar triagem; só "médico" pode confirmar atendimento e lançar medicação).

### 4.2 Proteção de dados sensíveis (RNF09)

- Restrinja no back-end quais perfis podem receber CPF/RG nas respostas da API (ex: mascarar esses campos para perfis que não precisam vê-los).
- Considere criptografia em repouso para essas colunas no MySQL, ou ao menos controle de acesso por view/role no banco.

---

## Fase 5 — Requisitos Não Funcionais Transversais

Revise estes pontos depois que as funcionalidades estiverem prontas, testando sob carga leve:

- **RNF01/RNF07** — painel médico atualiza rápido e é fácil de ler.
- **RNF02** — operações de recepção respondem em poucos segundos (teste tempo de resposta da API).
- **RNF03** — gere atendimentos simultâneos (ex: via script de teste) e confirme que não há números duplicados.
- **RNF04** — tente inserir triagem/prescrição sem atendimento válido e confirme que o banco rejeita.
- **RNF05** — tente alterar atendimento já confirmado e confirme bloqueio.

---

## Fase 6 — Testes e Entrega

### 6.1 Testes funcionais

- Teste cada requisito funcional (RF01 a RF15) isoladamente, seguindo o fluxo completo: recepção → triagem → atendimento médico → alta.
- Teste os casos de bloqueio (RF04, RF05, RF15) tentando burlar pelas rotas da API diretamente (não só pela interface).

### 6.2 Testes de integração

- Rode o fluxo ponta a ponta com múltiplos atendimentos simultâneos para validar concorrência (RNF03, RNF04).

### 6.3 Documentação final

- Documente o modelo de dados (diagrama ER), as rotas da API e o passo a passo de instalação/configuração do ambiente (MySQL + Node).

---

## Ordem resumida (checklist)

- [ ] 1. Modelar entidades e relacionamentos (MER)
- [ ] 2. Criar tabelas, constraints e trigger para número de atendimento no MySQL
- [ ] 3. Planejar e implementar as rotas da API no Node (recepção → triagem → atendimento médico)
- [ ] 4. Implementar regras de negócio críticas no back-end (bloqueios, histórico de status)
- [ ] 5. Construir as três interfaces do front-end (recepção, enfermagem, médico)
- [ ] 6. Implementar atualização em tempo próximo ao real no painel médico
- [ ] 7. Implementar autenticação e controle de acesso por perfil
- [ ] 8. Proteger dados sensíveis (CPF, RG)
- [ ] 9. Validar requisitos não funcionais sob teste de carga leve e concorrência
- [ ] 10. Testes funcionais e de integração completos
- [ ] 11. Documentar e entregar