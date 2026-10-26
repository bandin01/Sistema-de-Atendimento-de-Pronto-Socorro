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
│   ├── sessoes.js         entrada no sistema e sessões por perfil (controle de acesso)
│   └── utilitarios.js     funções pequenas reaproveitadas
├── index.html             página inicial
├── HTMLs/                 recepcao, triagem, painel_medico e consulta_medica
├── CSSs/                  estilo.css
├── javascripts/           comum.js + inicio.js (entrada) + um arquivo .js para cada tela
├── imagens/               logo.svg
├── banco/                 scripts SQL (ver "Banco de dados")
├── docs/                  MER, DER, dicionário de dados e requisitos
├── testes/                testes automáticos do controle de acesso (npm test)
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

## Entrar no sistema (controle de acesso)

Na **página inicial**, escolha o **perfil** (Recepção, Enfermagem ou Médico) e o **seu nome** e
clique em *Entrar*. Não há senha. O servidor confere se o profissional existe e está ativo e
devolve uma sessão. Cada perfil só abre a sua tela e só usa as funções da sua etapa (RNF08):

| Perfil | Tela | Pode |
|---|---|---|
| Recepção | Recepção | incluir, listar, consultar, alterar e cancelar atendimentos |
| Enfermagem | Triagem | ver a fila e registrar a triagem |
| Médico | Painel do Médico e Consulta | chamar o próximo paciente, prescrever e finalizar |

- O **profissional responsável** de cada ação é sempre quem entrou: ele vem da sessão, e o
  servidor ignora qualquer id enviado no formulário.
- **CPF e RG** (RNF09): a consulta de um atendimento (`GET /api/atendimentos?numero=`) pode ser
  feita pelos três perfis, mas CPF e RG só vão completos para a recepção. Para a enfermagem e o
  médico eles vão mascarados: `***.***.*47-25` e `*****1905`.
- **Cada aba do navegador tem a sua sessão.** Para a demonstração, abra uma aba para cada perfil.
- As sessões ficam na memória do servidor e duram 12 horas. Ao reiniciar o `node servidor.js`,
  é preciso entrar de novo (o sistema volta sozinho para a página inicial).
- Como não há senha, qualquer um pode escolher qualquer nome. O controle separa os **perfis**
  (a recepção não tria, a enfermagem não prescreve), mas não impede alguém de entrar com o
  nome de outra pessoa. Para isso seria preciso uma senha.

## Roteiro de demonstração

O banco já vem com 6 atendimentos: `AT0001` a `AT0003` triados (VERDE, LARANJA e AMARELO) e
`AT0004` a `AT0006` aguardando triagem. Abra três abas e, em cada uma, entre com um perfil
diferente pela página inicial: Recepção (Ana Paula Souza), Enfermagem (Marina Lopes) e
Médico (Helena Martins).

1. **Painel do Médico:** a fila aparece na ordem LARANJA → AMARELO → VERDE (e não na ordem de
   chegada). A espera do LARANJA aparece em vermelho, porque passou do tempo-alvo de 10 minutos.
2. **Recepção:** cadastre um paciente: o sistema gera o `AT0007`.
   Consulte o número, altere algum dado e veja as etapas e o histórico de status.
3. **Triagem:** clique em *Triar* no `AT0007`, preencha os sinais vitais, as queixas e
   classifique como VERMELHO.
4. **Painel do Médico:** o `AT0007` passa para o 1º lugar. Clique em *Chamar próximo paciente*
   (esta é a **confirmação médica**).
5. **Recepção:** consulte o `AT0007`: alterar e cancelar não estão mais disponíveis.
6. **Consulta médica:** registre uma medicação e finalize com um desfecho (prescrição, pedido de
   exames, encaminhamento ou alta).
7. **Recepção:** consulte o `AT0007` finalizado, com as 5 etapas percorridas.
8. **Controle de acesso:** na aba da enfermagem, abra o endereço `/HTMLs/recepcao.html`: a tela
   mostra *Acesso restrito*.

### Profissionais cadastrados (`banco/dados_iniciais.sql`)

| Perfil | Nome | Observação |
|---|---|---|
| Recepção | Ana Paula Souza, Bruno Henrique Dias | |
| Enfermagem | Marina Lopes, Carlos Eduardo Pereira | categoria ENFERMEIRO (podem triar) |
| Médico | Helena Martins (Clínica Médica), Rafael Costa (Ortopedia) | começam *Em plantão* |

Para entrar, escolha o perfil e o nome na página inicial (veja "Entrar no sistema").

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

Todas as respostas são JSON. Em caso de erro: `{ "erro": "mensagem" }` com status 400, 401
(sem sessão ou sessão expirada), 403 (perfil sem permissão), 404 ou 500.

Depois de entrar, o navegador envia o token da sessão no cabeçalho `X-Sessao` em toda chamada.
A coluna *Perfis* mostra quem pode usar cada rota (*pública* = não precisa de sessão).

| Método | Endereço | Perfis | O que faz |
|---|---|---|---|
| POST | `/api/entrar` | pública | entra no sistema: `{ perfil, profissional_id }` → `{ token, perfil, id, nome }` |
| GET | `/api/sessao` | todos | quem está logado |
| POST | `/api/sair` | todos | encerra a sessão |
| GET | `/api/recepcionistas`, `/api/enfermeiros`, `/api/medicos` | pública | listas de profissionais (para a página inicial) |
| GET | `/api/atendimentos` | Recepção | últimos 50 atendimentos |
| GET | `/api/atendimentos?numero=AT0001` | todos | consulta um atendimento (CPF/RG mascarados fora da recepção) |
| POST | `/api/atendimentos` | Recepção | inclui um atendimento (gera o número) |
| POST | `/api/atendimentos/alterar` | Recepção | altera os dados do paciente |
| POST | `/api/atendimentos/cancelar` | Recepção | cancela o atendimento |
| GET | `/api/triagem/fila` | Enfermagem | pacientes aguardando triagem |
| POST | `/api/triagem` | Enfermagem | registra a triagem |
| GET | `/api/painel` | Médico | fila do médico, na ordem de Manchester |
| POST | `/api/painel/chamar` | Médico | o médico chama o próximo paciente (confirmação médica) |
| GET | `/api/consulta` | Médico | consulta em andamento do médico logado |
| POST | `/api/consulta/prescricao` | Médico | registra uma medicação |
| POST | `/api/consulta/finalizar` | Médico | finaliza o atendimento com o desfecho |

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
| Cada rota só aceita os perfis autorizados; o responsável vem da sessão | `permissoes[...]` em `servidor.js` + `modulos/sessoes.js` |
| CPF/RG completos só para a recepção | `atendimentos.consultar` + `mascararCpf`/`mascararRg` em `modulos/utilitarios.js` |

## Testes

```bash
npm test
```

Os testes (`testes/acesso.test.js`) sobem o servidor numa porta separada (3999) com um banco
falso em memória, então **não precisam do MySQL**. Eles conferem o controle de acesso de todas
as rotas (401 sem sessão, 403 para o perfil errado), que o profissional gravado é sempre o da
sessão e o mascaramento de CPF/RG.

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
| RNF08 (acesso restrito por perfil) | atendido: sessão por perfil, conferida em toda rota da API (sem senha) |
| RNF09 (acesso controlado a CPF/RG) | atendido: CPF e RG completos só para a recepção; mascarados para os outros perfis |

Lista completa dos requisitos: [docs/requisitos.md](docs/requisitos.md).

## Origem

Modelagem do banco de dados e documentação baseadas no repositório do grupo:
<https://github.com/bandin01/Sistema-de-Atendimento-de-Pronto-Socorro>.
