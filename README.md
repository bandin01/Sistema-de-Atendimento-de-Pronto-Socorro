# Sistema de Atendimento de Pronto Socorro

Projeto Integrador 2 — PUC-Campinas — 2026

Sistema web (front-end, back-end e banco de dados) que controla os atendimentos de um
pronto-socorro, desde a chegada do paciente na recepção até a sua saída após a alta médica:

1. **Recepção** — cadastro do paciente e geração do número de atendimento (ex.: `AT0001`);
   consulta, alteração e cancelamento enquanto o atendimento não foi confirmado pelo médico.
2. **Triagem** — a enfermagem registra pressão arterial, temperatura, batimentos cardíacos,
   principais queixas e a classificação do protocolo de Manchester.
3. **Atendimento médico** — Painel de Atendimento na ordem de Manchester, chamada do próximo
   paciente (confirmação médica), registro das medicações e finalização do atendimento.

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Front-end | HTML5, CSS e JavaScript |
| Back-end | Node.js com os módulos nativos `http`, `fs` e `url` + módulo `mysql2` |
| Banco de dados | MySQL 8.0.16 ou mais novo (testado no MySQL 9.6) |

## Estrutura de pastas

```
teste trabalho/
├── servidor.js            servidor Node.js: entrega o site e responde à API
├── modulos/               módulos do back-end (require / exports)
│   ├── banco.js           conexão com o MySQL  ← coloque aqui a senha do seu MySQL
│   ├── atendimentos.js    recepção: incluir, consultar, alterar, cancelar
│   ├── triagem.js         fila e registro da triagem
│   ├── medico.js          painel, chamar próximo, medicações, finalizar
│   ├── profissionais.js   listas de recepcionistas, enfermeiros e médicos
│   ├── historico.js       histórico de status e de etapas do atendimento
│   └── utilitarios.js     funções pequenas reaproveitadas
├── index.html             página inicial
├── HTMLs/                 recepcao, triagem, painel_medico e consulta_medica
├── CSSs/                  estilo.css
├── javascripts/           comum.js + um arquivo .js para cada tela
├── imagens/               logo.svg
├── banco/                 scripts SQL (ver "Banco de dados")
├── docs/                  MER, DER, dicionário de dados e requisitos
├── package.json           dependência: mysql2
└── node_modules/          mysql2 já instalado
```

## Como executar

**Pré-requisitos:** [Node.js](https://nodejs.org) 18 ou mais novo e [MySQL](https://dev.mysql.com/downloads/) 8.0.16 ou mais novo.

1. **Criar o banco de dados.** No MySQL Workbench: *File > Open SQL Script*, abra
   `banco/script_completo.sql` e execute (botão do raio). Pelo terminal:

   ```bash
   mysql -u root -p < banco/script_completo.sql
   ```

   O script cria o banco `pronto_socorro`, as tabelas, os triggers, os profissionais do plantão e
   alguns pacientes de exemplo.

2. **Configurar a senha do MySQL** em `modulos/banco.js` (campos `user` e `password`).

3. **Instalar as dependências** (só se a pasta `node_modules` não existir):

   ```bash
   npm install
   ```

4. **Iniciar o servidor**, com o terminal aberto nesta pasta:

   ```bash
   node servidor.js
   ```

5. **Abrir no navegador:** <http://localhost:3000>

> Ao iniciar, o Node.js 24 mostra o aviso `DeprecationWarning: url.parse()`. É só um aviso: o
> `url.parse` é o método ensinado em aula e funciona normalmente.

## Roteiro de demonstração

O banco já vem com 6 atendimentos: `AT0001` a `AT0003` triados (VERDE, LARANJA e AMARELO) e
`AT0004` a `AT0006` aguardando triagem.

1. **Painel do Médico:** a fila aparece na ordem LARANJA → AMARELO → VERDE (e não na ordem de
   chegada). A espera do LARANJA aparece em vermelho, porque passou do tempo-alvo de 10 minutos.
2. **Recepção:** escolha a recepcionista e cadastre um paciente: o sistema gera o `AT0007`.
   Consulte o número, altere algum dado e veja as etapas e o histórico de status.
3. **Triagem:** escolha o(a) enfermeiro(a), clique em *Triar* no `AT0007`, preencha os sinais
   vitais, as queixas e classifique como VERMELHO.
4. **Painel do Médico:** o `AT0007` passa para o 1º lugar. Escolha a médica e clique em
   *Chamar próximo paciente* (esta é a **confirmação médica**).
5. **Recepção:** consulte o `AT0007`: alterar e cancelar não estão mais disponíveis.
6. **Consulta médica:** registre uma medicação e finalize com um desfecho (prescrição, pedido de
   exames, encaminhamento ou alta).
7. **Recepção:** consulte o `AT0007` finalizado, com as 5 etapas percorridas.

### Profissionais cadastrados (`banco/dados_iniciais.sql`)

| Perfil | Nome | Observação |
|---|---|---|
| Recepção | Ana Paula Souza, Bruno Henrique Dias | |
| Enfermagem | Marina Lopes, Carlos Eduardo Pereira | categoria ENFERMEIRO (podem triar) |
| Médico | Helena Martins (Clínica Médica), Rafael Costa (Ortopedia) | começam *Em plantão* |

Esta versão não tem tela de login: em cada tela, o profissional responsável é escolhido em uma lista.

## Banco de dados

Os scripts da pasta `banco/` vêm do repositório do grupo e são executados nesta ordem (o
`script_completo.sql` é a junção de todos eles):

| Arquivo | Conteúdo |
|---|---|
| `000_create_database.sql` | cria o banco `pronto_socorro` |
| `001_schema_base.sql` | pacientes, atendimentos (número gerado por trigger), triagens, prescrições |
| `010_recepcionistas_medicos_enfermeiros.sql` | tabelas dos profissionais |
| `011_integracao_atendimento_triagem_prescricao.sql` | vínculos com os profissionais e triggers |
| `012_historico_status.sql` | histórico de status do atendimento |
| `013_fluxo_etapas_consulta_desfecho.sql` | consultas, desfechos, histórico de etapas e do médico |
| `014_numero_atendimento_4_digitos.sql` | número no formato `AT0001` (4 dígitos, como no descritivo) |
| `dados_iniciais.sql` | profissionais e pacientes de exemplo |

Modelo conceitual, modelo lógico e dicionário de dados: [docs/MER.md](docs/MER.md),
[docs/DER.md](docs/DER.md) e [docs/DICIONARIO_DADOS.md](docs/DICIONARIO_DADOS.md).

## API (back-end)

Todas as respostas são JSON. Em caso de erro: `{ "erro": "mensagem" }` com status 400, 404 ou 500.

| Método | Endereço | O que faz |
|---|---|---|
| GET | `/api/recepcionistas`, `/api/enfermeiros`, `/api/medicos` | listas de profissionais |
| GET | `/api/atendimentos` | últimos 50 atendimentos |
| GET | `/api/atendimentos?numero=AT0001` | consulta um atendimento (dados, etapas e histórico) |
| POST | `/api/atendimentos` | inclui um atendimento (gera o número) |
| POST | `/api/atendimentos/alterar` | altera os dados do paciente |
| POST | `/api/atendimentos/cancelar` | cancela o atendimento |
| GET | `/api/triagem/fila` | pacientes aguardando triagem |
| POST | `/api/triagem` | registra a triagem |
| GET | `/api/painel` | fila do médico, na ordem de Manchester |
| POST | `/api/painel/chamar` | o médico chama o próximo paciente (confirmação médica) |
| GET | `/api/consulta?medico=1` | consulta em andamento do médico |
| POST | `/api/consulta/prescricao` | registra uma medicação |
| POST | `/api/consulta/finalizar` | finaliza o atendimento com o desfecho |

## Regras de negócio e onde ficam

| Regra | Onde |
|---|---|
| Número de atendimento único e sequencial, mesmo com cadastros simultâneos | trigger `trg_atendimentos_bi_numero` + tabela `sequencia_atendimento` |
| Alterar/cancelar só antes da confirmação médica | `modulos/atendimentos.js` e trigger `trg_atendimentos_bu_bloqueio` |
| Triagem só por enfermeiro(a) da categoria ENFERMEIRO | trigger `trg_triagens_bi_enfermeiro` |
| Painel ordenado por Manchester no próprio banco | `ORDER BY FIELD(...)` em `modulos/medico.js` |
| Dois médicos nunca chamam o mesmo paciente | `SELECT ... FOR UPDATE` + `UPDATE` condicional em `modulos/medico.js` |
| Medicação só pelo médico da consulta | `modulos/medico.js` e trigger `trg_prescricoes_bi_medico` |
| Finalização só com desfecho registrado | `modulos/medico.js` e triggers de `consultas`, `desfechos` e `atendimentos` |
| Histórico de status (com responsável) e de etapas | `modulos/historico.js` |
| Operações com vários passos gravam tudo ou nada | transações em `modulos/banco.js` |

## Requisitos

| Requisito | Situação |
|---|---|
| RF01–RF05 (recepção) | atendidos |
| RF06–RF08 (triagem) | atendidos |
| RF09–RF13 (médico) | atendidos |
| RF14 (históricos de status e de etapas) | atendido |
| RF15 (bloqueio após a confirmação) | atendido |
| RNF01 (painel quase em tempo real) | atualização automática a cada 10 s |
| RNF03 (número único sob concorrência) | atendido (trigger no banco) |
| RNF04 (integridade referencial) | atendido (chaves estrangeiras e triggers) |
| RNF05 (bloqueio após a confirmação) | atendido |
| RNF06 (interface própria por perfil) | atendido (uma tela por perfil) |
| RNF08 (acesso restrito por perfil) | **não implementado** nesta versão: não há login |
| RNF09 (acesso controlado a CPF/RG) | parcial: CPF e RG só aparecem na tela da recepção |

Lista completa dos requisitos: [docs/requisitos.md](docs/requisitos.md).

## Origem

Modelagem do banco de dados e documentação baseadas no repositório do grupo:
<https://github.com/bandin01/Sistema-de-Atendimento-de-Pronto-Socorro>.
