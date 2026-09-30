'use strict';

/**
 * Composition root: o ÚNICO lugar que sabe quais implementações concretas
 * são usadas. Todo o resto recebe dependências por parâmetro (DIP), o que
 * permite trocar o banco por dublês nos testes (fase de testes do guia).
 */
const { PERMISSOES } = require('./config/permissoes');
const { criarPool } = require('./db/pool');
const { criarGerenciadorTransacao } = require('./db/transacao');

const { criarCredencialRepository } = require('./repositories/credencialRepository');
const { criarRecepcionistaRepository } = require('./repositories/recepcionistaRepository');
const { criarPacienteRepository } = require('./repositories/pacienteRepository');
const { criarMedicoRepository } = require('./repositories/medicoRepository');
const { criarEnfermeiroRepository } = require('./repositories/enfermeiroRepository');
const { criarAtendimentoRepository } = require('./repositories/atendimentoRepository');
const { criarTriagemRepository } = require('./repositories/triagemRepository');
const { criarPrescricaoRepository } = require('./repositories/prescricaoRepository');
const { criarHistoricoStatusRepository } = require('./repositories/historicoStatusRepository');

const { criarTokenService } = require('./services/tokenService');
const { criarHashSenhaService } = require('./services/hashSenhaService');
const { criarAuthService } = require('./services/authService');
const { criarAtendimentoService } = require('./services/atendimentoService');
const { criarMedicoService } = require('./services/medicoService');
const { criarEnfermeiroService } = require('./services/enfermeiroService');
const { criarTriagemService } = require('./services/triagemService');
const { criarPainelMedicoService } = require('./services/painelMedicoService');

const { criarAuthController } = require('./controllers/authController');
const { criarAtendimentoController } = require('./controllers/atendimentoController');
const { criarMedicoController } = require('./controllers/medicoController');
const { criarEnfermeiroController } = require('./controllers/enfermeiroController');
const { criarTriagemController } = require('./controllers/triagemController');
const { criarPainelMedicoController } = require('./controllers/painelMedicoController');

const { criarMiddlewareAutenticacao } = require('./middlewares/autenticar');
const { criarMiddlewareAutorizacao } = require('./middlewares/autorizar');

function criarContainer({ env = process.env, pool = criarPool(env) } = {}) {
  const transacao = criarGerenciadorTransacao(pool);

  const credencialRepository = criarCredencialRepository(pool);
  const recepcionistaRepository = criarRecepcionistaRepository(pool);
  const pacienteRepository = criarPacienteRepository(pool);
  const medicoRepository = criarMedicoRepository(pool);
  const enfermeiroRepository = criarEnfermeiroRepository(pool);
  const atendimentoRepository = criarAtendimentoRepository(pool);
  const triagemRepository = criarTriagemRepository(pool);
  const prescricaoRepository = criarPrescricaoRepository(pool);
  const historicoStatusRepository = criarHistoricoStatusRepository(pool);

  const tokenService = criarTokenService({ segredo: env.JWT_SECRET, expiraEm: env.JWT_EXPIRES_IN || '8h' });
  const hasher = criarHashSenhaService({ custo: Number(env.BCRYPT_ROUNDS || 10) });

  const authService = criarAuthService({
    credencialRepository, medicoRepository, enfermeiroRepository, hasher, tokenService,
  });
  const atendimentoService = criarAtendimentoService({
    atendimentoRepository, pacienteRepository, triagemRepository, prescricaoRepository,
    historicoStatusRepository, transacao,
  });
  const medicoService = criarMedicoService({ medicoRepository, credencialRepository, transacao, hasher });
  const enfermeiroService = criarEnfermeiroService({ enfermeiroRepository, credencialRepository, transacao, hasher });
  const triagemService = criarTriagemService({
    atendimentoRepository, triagemRepository, enfermeiroRepository, historicoStatusRepository, transacao,
  });
  const painelMedicoService = criarPainelMedicoService({
    atendimentoRepository, medicoRepository, prescricaoRepository, historicoStatusRepository, transacao,
  });

  return {
    pool,
    transacao,
    hasher,
    credencialRepository,
    recepcionistaRepository,
    atendimentoRepository,
    historicoStatusRepository,
    authService,
    atendimentoService,
    medicoService,
    enfermeiroService,
    triagemService,
    painelMedicoService,

    autenticar: criarMiddlewareAutenticacao({ tokenService, credencialRepository }),
    autorizar: criarMiddlewareAutorizacao({ permissoes: PERMISSOES }),

    authController: criarAuthController({ authService }),
    atendimentoController: criarAtendimentoController({ atendimentoService }),
    medicoController: criarMedicoController({ medicoService }),
    enfermeiroController: criarEnfermeiroController({ enfermeiroService }),
    triagemController: criarTriagemController({ triagemService }),
    painelMedicoController: criarPainelMedicoController({ painelMedicoService }),
  };
}

module.exports = { criarContainer };
