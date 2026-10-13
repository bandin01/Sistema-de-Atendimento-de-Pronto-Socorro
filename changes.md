# changes.md — Refatoração do MER/DER: fluxo em etapas, consulta, desfecho e históricos

## Resumo

Ajustes pedidos para o MER e o DER, propagados para o banco, a API, os testes e a documentação.

| Pedido | O que foi feito |
|---|---|
| Trocar "possui" por relacionamentos semânticos | MER/DER usam *dá entrada em*, *é classificado em*, *realiza*, *evolui para*, *conduz*, *resulta em*, *é emitida em*, *prescreve*, *audita*, *efetua*, *percorre*, *rastreia*. Não restou "possui", "tem" nem "contém". |
| `Atendimento` como etapa, não ator | MER separa **Atores** (Paciente, Recepcionista, Enfermeiro, Médico), **Etapas** (Atendimento/Atendimento Inicial, Triagem, Consulta, Desfecho) e **Rastreabilidade**. O atendimento não guarda mais dados do médico. |
| Fluxo Chegada → Atendimento Inicial → Triagem → Consulta → Desfecho | Uma tabela por etapa (`atendimentos` → `triagens` → `consultas` → `desfechos`). Status renomeados para nomear a etapa. Diagramas de fluxo e de ciclo de vida no MER. |
| Desfecho com vários cenários | Tabela `desfechos` com `tipo` ∈ {PRESCRICAO, EXAMES, ENCAMINHAMENTO, ALTA}, `descricao` obrigatória e `destino_encaminhamento` obrigatório só no encaminhamento. A finalização exige desfecho. |
| `NOT NULL` nos obrigatórios | DER mostra `NOT NULL`/`NULL` em todas as colunas. Tabelas novas com `NOT NULL` + CHECKs de coerência (`chk_atendimentos_finalizacao`, `chk_desfechos_destino`, `chk_consultas_periodo`…). |
| RG `VARCHAR(20)` → `VARCHAR(9)` | Nas 4 tabelas (`pacientes`, `recepcionistas`, `medicos`, `enfermeiros`), com CHECK `^[0-9X]{5,9}$`. O validador da API passou a aceitar de 5 a 9 caracteres. |
| Histórico de status | `historico_status` (atendimento) mantido com os novos valores. Nova `historico_status_medico`, alimentada por trigger. |
| Histórico de etapas (VARCHAR) | Nova `historico_etapas`, com `descricao VARCHAR(255) NOT NULL` por etapa. |
| Status do médico fora do Atendimento | Saíram `atendimentos.medico_id`, `confirmado_medico_em` e `medico_em_atendimento_id` (passaram para `consultas`). Status `AGUARDANDO_MEDICO`/`EM_ATENDIMENTO_MEDICO` viraram `AGUARDANDO_CONSULTA`/`EM_CONSULTA`. |
| Status operacional na tabela Médico | `medicos.status_disponibilidade` → `medicos.status_operacional` {EM_PLANTAO, EM_CONSULTA, PAUSA, FOLGA, LICENCA}, default `FOLGA`. |

## Arquivos

### Banco

- **`src/db/013_fluxo_etapas_consulta_desfecho.sql`** *(novo)*. É uma migration nova porque o runner proíbe editar migrations aplicadas:
  - remove os triggers da 011 que dependiam das colunas antigas (`trg_atendimentos_bi_medico`, `trg_atendimentos_bu_medico`, `trg_prescricoes_bi_medico`);
  - RG `VARCHAR(9)` + CHECK nas 4 tabelas;
  - cria `consultas` (com `medico_em_consulta_id` gerada + UNIQUE para RF20) e migra os vínculos existentes;
  - remove do `atendimentos` os dados do médico, renomeia os status (ampliar → converter → restringir) e adiciona `chk_atendimentos_finalizacao`;
  - converte os valores de `historico_status`;
  - cria `desfechos` (com backfill para consultas já finalizadas), `historico_etapas` (com backfill da linha do tempo) e `historico_status_medico` (com o status atual de cada médico);
  - renomeia e converte `medicos.status_operacional` (DISPONIVEL→EM_PLANTAO, EM_ATENDIMENTO→EM_CONSULTA, INDISPONIVEL→FOLGA) e cria o CHECK `chk_medicos_inativo_fora_do_plantao`;
  - cria 9 triggers: `trg_atendimentos_bi_status`, `trg_atendimentos_bu_bloqueio`, `trg_consultas_bi_medico`, `trg_consultas_bu_bloqueio`, `trg_prescricoes_bi_medico` (recriado), `trg_desfechos_bi_validacao`, `trg_desfechos_bu_bloqueio`, `trg_medicos_ai_status` e `trg_medicos_au_status`.

### Back-end

- `src/config/dominio.js`: novos `STATUS_ATENDIMENTO`, `ETAPA_ATENDIMENTO`, `TIPO_DESFECHO` e `STATUS_MEDICO`.
- `src/utils/validador.js`: RG de 5 a 9 caracteres.
- `src/repositories/atendimentoRepository.js`: médico e confirmação vêm de `consultas` (LEFT JOIN); `vincularMedico` → `iniciarConsulta`; fila usa `AGUARDANDO_CONSULTA`; `finalizar(atendimentoId)`.
- `src/repositories/medicoRepository.js`: coluna `status_operacional`, exposta como `statusDisponibilidade` no contrato comum dos profissionais.
- `src/repositories/consultaRepository.js`, `desfechoRepository.js`, `historicoEtapasRepository.js` *(novos)*.
- `src/services/atendimentoService.js`: grava as etapas CHEGADA e ATENDIMENTO_INICIAL; a resposta inclui `etapas` (todos os perfis) e `desfecho` (enfermagem e médico).
- `src/services/triagemService.js`: `AGUARDANDO_CONSULTA` + etapa TRIAGEM.
- `src/services/painelMedicoService.js`: chamar próximo exige `EM_PLANTAO`, abre a consulta e grava a etapa CONSULTA. `finalizar` exige desfecho válido, encerra a consulta, finaliza, devolve o médico a `EM_PLANTAO` e grava a etapa DESFECHO.
- `src/services/medicoService.js`: status selecionáveis `EM_PLANTAO`, `PAUSA`, `FOLGA`, `LICENCA`; ao desativar, o médico vai para `FOLGA`.
- `src/controllers/painelMedicoController.js`: `finalizar` repassa o corpo (desfecho).
- `src/routes/painelMedico.routes.js`: comentário do corpo do `finalizar`.
- `src/container.js`: injeta os novos repositórios.

### Testes

- `testes/smoke_api.mjs`: status do médico (FOLGA, LICENCA, EM_PLANTAO, EM_CONSULTA recusado), desfecho (sem corpo 400, encaminhamento sem destino 400, outro médico 403, PRESCRICAO sem prescrição 422, PRESCRICAO 200), RG com 10 dígitos 400, novos status no histórico, etapas na ordem e visibilidade do desfecho por perfil.
- `testes/stress_concorrencia.mjs`: finaliza com desfecho `ALTA` e põe os médicos `EM_PLANTAO`.
- `testes/migracoes.test.mjs`: versão 013, 19 triggers, 4 tabelas novas, colunas removidas/renomeadas, RG `varchar(9)` e um teste ponta a ponta dos triggers novos.

### Documentação

- `docs/MER.md`: reescrito (classificação de entidades, fluxo, Chen com verbos semânticos, ciclos do atendimento e do médico).
- `docs/DER.md`: reescrito (tabelas novas, `NOT NULL`/`NULL` em todas as colunas, FKs, CHECKs e triggers).
- `docs/DICIONARIO_DADOS.md` *(novo)*.
- `fontes_de_verdade_sistema/requisitos.md`: fluxo, RF13, RF14 e RNF04.
- `fontes_de_verdade_sistema/requisitos_extensao_profissionais.md`: glossário, RF16–RF22 ajustados, **RF24** (desfecho), **RF25** (histórico de etapas), **RF26** (histórico de status do médico), RNF12/RNF14, matriz RBAC, ciclos, pontos a validar (10 e 11) e rastreabilidade.
- `fontes_de_verdade_sistema/guia_desenvolvimento.md`: lista de entidades (seção 1.1).
- `README.md`: fluxo, migration 013, endpoints (corpo do `finalizar` e status do médico), testes e docs.
- `CLAUDE.md`: fluxo e regras inegociáveis.

## Quebra de contrato com o front-end

- Status do atendimento: `AGUARDANDO_MEDICO` → `AGUARDANDO_CONSULTA`, `EM_ATENDIMENTO_MEDICO` → `EM_CONSULTA`.
- Status do médico (`statusDisponibilidade` em `/medicos`, `/auth/sessao` e `/painel-medico`): `EM_PLANTAO`, `EM_CONSULTA`, `PAUSA`, `FOLGA`, `LICENCA`.
- `PATCH /painel-medico/atendimentos/:id/finalizar` passa a exigir `{ tipoDesfecho, descricao, destinoEncaminhamento? }`.
- `GET /atendimentos/:numero` ganhou `etapas` e `desfecho`.
- RG com mais de 9 dígitos agora é recusado (400).

## Pendências

- As imagens `docs/img/*.svg` são de antes da 013. A fonte atualizada são os blocos Mermaid em `docs/MER.md` e `docs/DER.md`. Para regerar, exporte esses blocos em mermaid.live ou use `npx @mermaid-js/mermaid-cli`.
- Testes não executados nesta máquina (sem Node.js nem MySQL). Rodar `npm run test:migracoes`, `npm run test:smoke` e `npm run test:stress`.
