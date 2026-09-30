'use strict';

/**
 * Seed de DESENVOLVIMENTO. Nunca rode em produção.
 *
 *   node src/db/seeds/seedDesenvolvimento.js          → profissionais
 *   node src/db/seeds/seedDesenvolvimento.js --demo   → + pacientes na fila de triagem
 *
 * Médicos, enfermeiros e atendimentos passam pelos próprios services (mesmas
 * validações da API). CPFs são fictícios, mas com dígitos verificadores válidos.
 */
require('dotenv').config();

const { criarContainer } = require('../../container');
const { PERFIS } = require('../../config/perfis');

const SENHA_DEV = 'Plantao2026';
const SISTEMA = Object.freeze({ id: 0, perfil: PERFIS.RECEPCAO });

const RECEPCIONISTA = {
  nome: 'Paula Recepção Silva', cpf: '11144477735', dataNascimento: '1993-08-09',
  email: 'recepcao@ps.local', login: 'recepcao',
};

const MEDICOS = [
  {
    nome: 'Helena Duarte Vasconcelos', cpf: '12345678062', dataNascimento: '1982-04-17',
    email: 'helena.duarte@ps.local', telefone: '19991110001', login: 'dra.helena',
    crmNumero: '123456', crmUf: 'SP', especialidade: 'Clínica Médica',
  },
  {
    nome: 'Rafael Moreira Lins', cpf: '23456789173', dataNascimento: '1979-11-02',
    email: 'rafael.lins@ps.local', login: 'dr.rafael',
    crmNumero: '234567', crmUf: 'SP', especialidade: 'Ortopedia e Traumatologia',
  },
];

const ENFERMAGEM = [
  {
    nome: 'Marina Costa Albuquerque', cpf: '34567891228', dataNascimento: '1990-06-23',
    email: 'marina.costa@ps.local', login: 'enf.marina',
    corenNumero: '345678', corenUf: 'SP', categoria: 'ENFERMEIRO', especialidade: 'Urgência e Emergência',
  },
  {
    nome: 'João Pedro Ramos', cpf: '45678912364', dataNascimento: '1996-01-30',
    email: 'joao.ramos@ps.local', login: 'tec.joao',
    corenNumero: '456789', corenUf: 'SP', categoria: 'TECNICO_ENFERMAGEM',
  },
];

const PACIENTES_DEMO = [
  {
    nome: 'Antônio Ferreira Gomes', cpf: '56789123482', rg: '284719365', dataNascimento: '1951-09-12',
    endereco: 'Rua das Palmeiras, 120, Centro', nomePai: 'José Ferreira Gomes', nomeMae: 'Maria Aparecida Gomes',
  },
  {
    nome: 'Beatriz Nogueira Prado', cpf: '67891234582', rg: '337190284', dataNascimento: '1988-03-05',
    endereco: 'Av. Brasil, 845, ap. 32, Jardim América', nomePai: null, nomeMae: 'Lúcia Nogueira Prado',
  },
  {
    nome: 'Carlos Eduardo Tavares', cpf: '78912345664', rg: '419283746', dataNascimento: '2001-12-19',
    endereco: 'Rua Sete de Setembro, 56, Vila Nova', nomePai: 'Eduardo Tavares', nomeMae: 'Cláudia Tavares',
  },
  {
    nome: 'Denise Almeida Rocha', cpf: '89123456728', rg: '502938471', dataNascimento: '1967-07-28',
    endereco: 'Travessa São João, 9, Bela Vista', nomePai: 'Sebastião Almeida', nomeMae: 'Rosa Almeida',
  },
  {
    nome: 'Eduarda Lima Santana', cpf: '91234567873', rg: '618273945', dataNascimento: '2012-02-14',
    endereco: 'Rua Ipiranga, 1500, Parque Industrial', nomePai: 'Marcos Santana', nomeMae: 'Fernanda Lima Santana',
  },
];

async function cadastrarSeNaoExistir(service, dados, rotulo) {
  try {
    await service.cadastrar({ ...dados, senha: SENHA_DEV }, SISTEMA);
    console.log(`  + ${rotulo}: ${dados.login}`);
  } catch (erro) {
    if (erro.codigo !== 'CONFLITO') throw erro;
    console.log(`  = ${rotulo}: ${dados.login} (já existia)`);
  }
}

async function garantirRecepcionista({ recepcionistaRepository, hasher }) {
  const existente = await recepcionistaRepository.buscarPorLogin(RECEPCIONISTA.login);
  if (existente) {
    console.log(`  = recepção: ${RECEPCIONISTA.login} (já existia)`);
    return existente.id;
  }
  const id = await recepcionistaRepository.criar({ ...RECEPCIONISTA, senhaHash: await hasher.gerarHash(SENHA_DEV) });
  console.log(`  + recepção: ${RECEPCIONISTA.login}`);
  return id;
}

/** Abre os atendimentos pela recepção, com as mesmas validações da API (RF01). */
async function criarFilaDemo({ atendimentoService }, recepcionistaId) {
  const recepcao = { perfil: PERFIS.RECEPCAO, id: recepcionistaId };
  console.log('Fila de triagem (demo):');
  for (const p of PACIENTES_DEMO) {
    // eslint-disable-next-line no-await-in-loop -- ordem de chegada importa
    const { atendimento } = await atendimentoService.abrir(p, recepcao);
    console.log(`  + ${atendimento.numeroAtendimento} ${p.nome}`);
  }
}

async function main() {
  const container = criarContainer();
  const { pool, medicoService, enfermeiroService } = container;

  try {
    console.log('Profissionais de desenvolvimento:');
    const recepcionistaId = await garantirRecepcionista(container);
    for (const m of MEDICOS) await cadastrarSeNaoExistir(medicoService, m, 'médico');
    for (const e of ENFERMAGEM) await cadastrarSeNaoExistir(enfermeiroService, e, 'enfermagem');

    if (process.argv.includes('--demo')) await criarFilaDemo(container, recepcionistaId);

    console.log(`\nSenha de todos os profissionais de desenvolvimento: ${SENHA_DEV}`);
  } finally {
    await pool.end();
  }
}

main().catch((erro) => {
  console.error('Falha no seed:', erro.detalhes || erro);
  process.exitCode = 1;
});
