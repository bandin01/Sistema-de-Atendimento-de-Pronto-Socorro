-- =============================================================================
-- 015_senhas_profissionais.sql
-- -----------------------------------------------------------------------------
-- A entrada no sistema passa a exigir login + senha (RNF08). A estrutura não
-- muda: as colunas login, senha_hash e ultimo_login_em já existiam (010).
-- Este script só serve para bancos criados ANTES desta mudança, cujos
-- profissionais de exemplo têm senha_hash = 'login-nao-utilizado': ele grava
-- o hash scrypt da senha de demonstração  senha123  para cada um deles.
-- Em banco novo (script_completo.sql) não altera nada, pois os dados
-- iniciais já vêm com os hashes.
-- =============================================================================

USE pronto_socorro;

UPDATE recepcionistas SET senha_hash = 'scrypt$f59e5e76677a5f5229491a76e7ea8f10$98f431f6e18e6ac29e550f6b293e2b0b8b6f84701b094dd15cd00f9cd7f6561d41589c32d9bbe81ca25b36e19bac5ddbd2739bf317d52191e6206d3d909cbcbb'
 WHERE login = 'ana.souza' AND senha_hash = 'login-nao-utilizado';
UPDATE recepcionistas SET senha_hash = 'scrypt$7d60525d07c690785a61dde70fd7970e$c5dbb1f15ea61d045e9f39e15758e7a1b4817b8b87d92554dddf1f68cf6151a53d18bc94e3d910c82b4bfde7daeb16ec3994de256c0b6152ee45f592260360fe'
 WHERE login = 'bruno.dias' AND senha_hash = 'login-nao-utilizado';
UPDATE enfermeiros SET senha_hash = 'scrypt$e179fc261167dbf4a58f7f9b910cc949$5291d6c248a429ea7872eb3720c8b2eb6235843533d7c1dcd90adbe84e0200c6e10fb19064288cd5475afe9c8ef139d40adf6e50331d42c974de3c116547e3ff'
 WHERE login = 'marina.lopes' AND senha_hash = 'login-nao-utilizado';
UPDATE enfermeiros SET senha_hash = 'scrypt$6c830a9570b6232af7e0fa5b356c7a77$b6c2bd1b8191b76617b37d43c40bd909958ab3c7ac97ce55b3cab5b536514d114cfd87c0e3f9a5804faf725f70575f954b6191ab2d8906c870a01d359459b8f5'
 WHERE login = 'carlos.pereira' AND senha_hash = 'login-nao-utilizado';
UPDATE medicos SET senha_hash = 'scrypt$3d22630c65424a8926da7a6fee0aab0f$cb5707ac020c21c858aa4b5a38af51ee47e06e415fd2914ef5956d192e06f99d4b75c1f705baa7ef4b6345214b257fc140a48d5ddb01f4825a59ca29ea5505b1'
 WHERE login = 'helena.martins' AND senha_hash = 'login-nao-utilizado';
UPDATE medicos SET senha_hash = 'scrypt$7f946a8856d91df5e89edf3c0eee3064$1f529ad7e936088ccd4a1090948d60653e6b16a4715edff12d9422c735379c2fd5397d4dbcc25bc546925d538ec7f347f612f78e8fc433677ba93a2c382d7679'
 WHERE login = 'rafael.costa' AND senha_hash = 'login-nao-utilizado';
