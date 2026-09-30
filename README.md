# Sistema de Atendimento de Pronto-Socorro — Back-end

Projeto Integrador acadêmico (Sistemas de Informação): back-end de um sistema de gestão de atendimento hospitalar, cobrindo o fluxo completo de um pronto-socorro — recepção, triagem, atendimento médico e alta.

> **Status:** em desenvolvimento. A modelagem do banco de dados está definida; as camadas de API (rotas, controllers, services, repositories) ainda estão em construção.

## O problema que resolve

Digitaliza o fluxo de um pronto-socorro, garantindo regras de negócio críticas no back-end (não só na interface), como:

- Bloqueio de alteração/cancelamento de atendimento após confirmação médica.
- Impedimento de qualquer alteração em atendimentos já finalizados.
- Geração segura e sequencial do número de atendimento (`AT000`) sob concorrência.
- Ordenação do painel médico por classificação de Manchester feita na camada de dados.
- Controle de acesso por perfil (recepção, enfermagem, médico) validado em toda rota.
- Mascaramento de CPF/RG nas respostas da API conforme o perfil do usuário.

## Tecnologias utilizadas

- Node.js
- MySQL (driver `mysql2`)

## Arquitetura

Camadas simples, sem DDD tático — o domínio é linear (recepção → triagem → médico → alta):

```
/src
  /routes         endpoints HTTP por módulo (recepção, triagem, médico)
  /controllers    parsing de request/response, sem regra de negócio
  /services       regras de negócio (bloqueios, validações, geração de AT000)
  /repositories   acesso ao MySQL
  /middlewares    autenticação, autorização por perfil, validação
  /db             schema, triggers, migrations
```

Regra de dependência: `routes → controllers → services → repositories`.

## Como executar localmente

Pré-requisitos: [MySQL](https://dev.mysql.com/downloads/) instalado.

```bash
# 1. Crie o banco e a estrutura inicial
mysql -u root -p < src/db/000_create_database.sql
mysql -u root -p pronto_socorro < src/db/schema.sql

# 2. Aplique as migrations, na ordem
mysql -u root -p pronto_socorro < src/db/010_recepcionistas_medicos_enfermeiros.sql
mysql -u root -p pronto_socorro < src/db/011_integracao_atendimento_triagem_prescricao.sql
mysql -u root -p pronto_socorro < src/db/012_historico_status.sql
mysql -u root -p pronto_socorro < src/db/triggers.sql
```

A API Node.js (rotas/controllers/services) ainda será adicionada nas próximas etapas do projeto.

## Documentação

- `fontes_de_verdade_sistema/requisitos.md` — requisitos funcionais (RF01–RF15) e não funcionais (RNF01–RNF09).
- `fontes_de_verdade_sistema/guia_desenvolvimento.md` — passo a passo de implementação, fase a fase.

## Autor

**Davi Bandin** — [GitHub](https://github.com/bandin01)
