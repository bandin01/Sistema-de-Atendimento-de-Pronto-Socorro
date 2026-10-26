# Projeto Integrador 2 — Sistema de Atendimento de Pronto-Socorro

Este repositório contém o **sistema completo**: front-end (HTML/CSS/JS), back-end (Node.js) e banco de dados (MySQL). O mesmo servidor (`servidor.js`) entrega as páginas e responde à API em `/api/...`.

## Fontes de verdade

Antes de implementar qualquer funcionalidade ou tirar dúvida sobre requisito/fluxo, consulte:

- `fontes_de_verdade_sistema/requisitos.md` — requisitos funcionais e não funcionais.
- `fontes_de_verdade_sistema/guia_desenvolvimento.md` — passo a passo de implementação, fase a fase.
- `docs/` — MER, DER, dicionário de dados e requisitos do projeto.

Esses arquivos são a referência oficial. Se um requisito não estiver claro ou parecer conflitar com o que está sendo implementado, releia esses arquivos antes de assumir comportamento.

## Stack

- **Front-end:** HTML5, CSS e JavaScript puro (sem frameworks).
- **Back-end:** Node.js com os módulos nativos `http`, `fs` e `url` + `mysql2` (sem Express). Estilo de código de aula: `let`, `require`/`exports`, callbacks.
- **Banco:** MySQL 8.0.16+ (usa CHECK constraints e triggers).

## Estrutura

```
servidor.js        servidor HTTP: arquivos estáticos + tabela de rotas da API (rotas['MÉTODO /caminho'])
modulos/           back-end — regras de negócio e acesso ao MySQL
  banco.js         pool de conexões, executarEmOrdem, transacao (usuário/senha do MySQL ficam aqui)
  atendimentos.js  recepção: incluir, consultar, alterar, cancelar
  triagem.js       fila e registro da triagem (Manchester)
  medico.js        painel, chamar próximo, prescrições, finalizar com desfecho
  profissionais.js listas de recepcionistas, enfermeiros e médicos
  historico.js     histórico de status e de etapas
  sessoes.js       entrada no sistema (perfil + profissional, sem senha) e sessões em memória
  utilitarios.js   funções pequenas reaproveitadas (erro, texto, numeroAtendimento…)
index.html         página inicial (entrada no sistema)
HTMLs/             telas: recepcao, triagem, painel_medico, consulta_medica
javascripts/       comum.js (chamarApi, sessão, exigirPerfil) + inicio.js + um .js por tela
CSSs/estilo.css    estilos
imagens/           logo
banco/             scripts SQL numerados + dados_iniciais.sql + script_completo.sql (tudo junto)
docs/              MER, DER, dicionário de dados, requisitos, imagens dos diagramas
testes/            testes com node:test e banco falso (npm test, não precisa do MySQL)
```

Regra de negócio vive em `modulos/` (back-end), nunca só no front-end. O `servidor.js` só roteia: cada rota recebe `(consulta, dados, sessao, callback)` e chama uma função de um módulo, que devolve `callback(erro, resultado)`, com erros criados por `util.erro(status, mensagem)`.

Toda rota nova precisa de uma linha `permissoes['MÉTODO /caminho'] = [perfis]` em `servidor.js` (sem ela a rota fica pública) e de uma linha na lista `rotasProtegidas` de `testes/acesso.test.js`. O profissional responsável vem sempre de `sessao.id`, nunca do corpo da requisição. No front-end, cada tela chama `exigirPerfil('PERFIL')` antes de carregar dados.

Ao mudar o banco, crie um novo script numerado em `banco/` **e** atualize `banco/script_completo.sql` e a documentação em `docs/`.

## Como executar

```bash
mysql -u root -p < banco/script_completo.sql   # cria o banco com dados de exemplo
npm install                                     # se não houver node_modules
node servidor.js                                # http://localhost:3000
npm test                                        # testes de controle de acesso
```

## Regras de negócio inegociáveis (validar sempre no back-end)

- Bloquear alteração/cancelamento de atendimento após confirmação médica (RF04, RF05, RNF05).
- Impedir qualquer alteração em atendimentos finalizados (RF15).
- Triagem, Consulta, Desfecho e Prescrição nunca existem sem um Atendimento válido (RNF04).
- Atendimento só é finalizado com desfecho registrado (PRESCRICAO, EXAMES, ENCAMINHAMENTO ou ALTA); o status do atendimento nomeia a etapa, e o status do médico fica em `medicos.status_operacional`.
- Número de atendimento (`AT0001`) único e sequencial, seguro sob concorrência (RNF03) — via `AUTO_INCREMENT` + trigger no MySQL.
- Painel médico ordenado por classificação de Manchester na query SQL (`ORDER BY FIELD(...)`), nunca só no front-end (RF09).
- Operações concorrentes (alterar, cancelar, chamar próximo, finalizar) dentro de transação com `SELECT ... FOR UPDATE`.
- Acesso por perfil (recepção, enfermagem, médico) validado em toda rota da API, não só na UI (RNF08). A entrada é por escolha de perfil + profissional, sem senha (decisão do grupo).
- CPF/RG completos só para a recepção; mascarados para os outros perfis (RNF09).

## Fluxo de trabalho

Claude quando for para desenvolvimento de nova feature ou correcao de bug sempre siga o seguinte passo a passo:
  1. Primeiro se tiver qualquer duvida ou coisa pergunte para o proprio usuario
  2. Explore as opcoes para desenvolver oque foi solicitado
  3. Elabore os testes para implementar e validar a feature
  4. Divida atividade em tasks
  5. Elabore o plano de implementacao completo para a feature
  6. comece a desenvolver e siga o plano elaborado
  7. valide oque foi feito a partir dos testes elaborado
  8. Atualizar documentacao do projeto
  9. Escrever um arquivo chamado changes.md no qual constata todas as alteracoes (diff da branch) do repositorio
  10. Fazer commit push

Seguir a ordem das fases do `guia_desenvolvimento.md`: modelagem do banco → API/regras de negócio → front-end → segurança/controle de acesso → não funcionais → testes. Não pular etapas.
