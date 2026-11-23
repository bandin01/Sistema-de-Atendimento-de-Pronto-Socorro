# changes.md — Limpeza dos comentários do código

## Resumo

| Pedido | O que foi feito |
|---|---|
| Remover os comentários desnecessários e encurtar os muito compridos | Saíram os comentários que só repetiam o código e as faixas de seção. Os que explicam **por quê** (concorrência, segurança, regra de negócio, requisito) ficaram, em versão curta. **Nenhuma linha de código mudou.** |

## O que saiu

- Comentários que repetem o nome da função ou o que a linha faz (ex.: "Atalho para document.getElementById", "Envia a resposta da API em JSON", `// página inicial do site`).
- Faixas de seção: `// ----- CONSULTA -----` no JS, `<!-- MEDICAÇÕES -->` no HTML e os títulos de tabela no SQL (o nome da função, o `<h2>` ou o `CREATE TABLE` logo abaixo já dizem o mesmo).

## O que ficou, mais curto

- **Concorrência:** `FOR UPDATE` na alteração e na chamada do médico, `AND status = ...` contra dois médicos pegarem o mesmo paciente, tabela de sequência do número AT0001 (de 19 para 8 linhas, mantendo a armadilha do `LPAD` e os números pulados após ROLLBACK), `UNIQUE` em coluna gerada (RF20).
- **Segurança:** `timingSafeEqual`, mensagem única de falha na entrada, "hash de mentira" para login inexistente, token validado por regex (`__proto__`), limite de 72 caracteres da senha, pastas que o servidor entrega.
- **Migrations:** cabeçalhos resumidos, mantendo os avisos "⚠️ BANCO COM DADOS" (o `013` foi de 48 para 17 linhas e continua com a consulta para conferir o RG antes da migração).
- Referências aos requisitos (RFxx / RNFxx) foram mantidas.

## Correções nos comentários

| Arquivo | Antes | Agora |
|---|---|---|
| `banco/010_...sql` | A regra "técnico não registra triagem" seria aplicada "no service e no trigger" | Só no trigger (o service não confere a categoria) |
| `banco/010_...sql` | Login único entre as tabelas: "o service também valida" | Removido: não existe módulo de cadastro de profissionais |
| `modulos/triagem.js` | — | Deixa claro que a categoria ENFERMEIRO é conferida **só** pelo trigger `trg_triagens_bi_enfermeiro` |
| `banco/001_schema_base.sql` | Ordem dos scripts parava no 014; exemplo de número pulado com 3 dígitos | Inclui o 015; exemplo `AT0007 → AT0009` |
| `modulos/historico.js` | — | Avisa que `responsavel` vai direto no SQL e por isso só aceita os três valores listados |

## Arquivos

- Back-end: `servidor.js` e todos os `modulos/*.js`.
- Front-end: todos os `javascripts/*.js`, `index.html`, `HTMLs/recepcao.html`, `HTMLs/consulta_medica.html` e `CSSs/estilo.css`.
- Testes: `testes/acesso.test.js` e `testes/permissoes.test.js`.
- Banco: `001`, `010` a `015`, `dados_iniciais.sql` e `script_completo.sql`, que recebeu os mesmos comentários das migrations.

Total: 799 linhas removidas e 232 adicionadas, todas de comentário.

## Pendência encontrada (não corrigida aqui)

A regra "só enfermeiro da categoria ENFERMEIRO registra triagem" (Cofen 661/2021) é garantida só pelo trigger. O `CLAUDE.md` pede que as regras sejam validadas também no back-end, então falta essa conferência em `modulos/triagem.js`.

## Validação

- Comparação do diff: tirando os comentários, as linhas de código de antes e de depois são idênticas.
- `node --check` em todos os arquivos JS: sem erro.
- `script_completo.sql` continua contendo cada migration exatamente como no arquivo numerado (o `015` já era diferente antes desta mudança).
- `npm test`: 22/22 passando.
- O SQL não foi executado num MySQL real (só mudaram linhas `--`).
