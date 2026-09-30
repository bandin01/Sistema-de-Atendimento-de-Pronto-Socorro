# Legado — não executar

Primeira versão do modelo, com tabelas no singular (`atendimento`, `paciente`, `usuario`) e status em minúsculas (`aberto`, `em_triagem`...).

Foi substituída por `001_schema_base.sql` + migrations `010`, `011` e `012`, que usam tabelas no plural e profissionais em tabelas separadas. Os dois modelos são incompatíveis: rodar estes arquivos junto com os atuais quebra a criação do banco.

Mantidos só como histórico.
