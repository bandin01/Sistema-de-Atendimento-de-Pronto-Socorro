# Projeto Integrador 2 — Back-end (Sistema de Atendimento de Pronto-Socorro)

Este repositório contém **apenas o back-end** do sistema. O front-end vive em um repositório separado.

## Fontes de verdade

Antes de implementar qualquer funcionalidade ou tirar dúvida sobre requisito/fluxo, consulte:

- `fontes_de_verdade_sistema/requisitos.md` — requisitos funcionais (RF01-RF15) e não funcionais (RNF01-RNF09).
- `fontes_de_verdade_sistema/guia_desenvolvimento.md` — passo a passo de implementação, fase a fase.

Esses arquivos são a referência oficial. Se um requisito não estiver claro ou parecer conflitar com o que está sendo implementado, releia esses arquivos antes de assumir comportamento.

## Stack

HTML/CSS/JS ficam no front-end (repo separado). Aqui: **Node.js + MySQL** (driver `mysql2`).

## Arquitetura

Camadas simples, sem DDD tático (agregados, value objects, domain events) — o domínio é linear (recepção → triagem → médico → alta) e não justifica essa complexidade:

```
/src
  /routes         endpoints HTTP por módulo (recepção, triagem, médico)
  /controllers    parsing de request/response, sem regra de negócio
  /services       regras de negócio (bloqueios, validações, geração de AT000)
  /repositories   acesso ao MySQL
  /middlewares    autenticação, autorização por perfil, validação
  /db             schema, triggers, migrations
```

Regra de dependência: `routes → controllers → services → repositories`. Regra de negócio vive em `services`, nunca em `controllers` ou só no front-end.

### Princípios de código

Seguir **SOLID**. Use o skill `/solid-review` para revisar código novo contra os princípios SOLID e a arquitetura em camadas antes de considerar uma spec concluída.

## Regras de negócio inegociáveis (validar sempre no back-end)

- Bloquear alteração/cancelamento de atendimento após confirmação médica (RF04, RF05, RNF05).
- Impedir qualquer alteração em atendimentos finalizados (RF15).
- Triagem e Prescrição nunca existem sem um Atendimento válido (RNF04).
- Número de atendimento (`AT000`) único e sequencial, seguro sob concorrência (RNF03) — via `AUTO_INCREMENT` + trigger no MySQL.
- Painel médico ordenado por classificação de Manchester deve ser ordenado na query/service, nunca só no front-end (RF09).
- Acesso por perfil (recepção, enfermagem, médico) validado em toda rota, não só na UI (RNF08).
- CPF/RG mascarados nas respostas da API conforme o perfil (RNF09).

## Fluxo de trabalho

Seguir a ordem das fases do `guia_desenvolvimento.md`: modelagem do banco → API/regras de negócio → (front-end no outro repo) → segurança/controle de acesso → não funcionais → testes. Não pular etapas.
