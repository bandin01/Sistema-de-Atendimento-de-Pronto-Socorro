// Teste de fumaça da API. Requer: API no ar + banco recém-criado com `npm run seed:demo`.
// Uso: node testes/smoke_api.mjs   (ou API_URL=http://host:porta/api node testes/smoke_api.mjs)
const API = process.env.API_URL || 'http://localhost:3000/api';
let falhas = 0;
async function req(metodo, caminho, { token, corpo } = {}) {
  const r = await fetch(API + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}
function ok(desc, cond, extra) { console.log(`${cond ? 'OK  ' : 'FAIL'} ${desc}`); if (!cond) { falhas++; console.log('     ', JSON.stringify(extra)); } }
const login = async (l) => (await req('POST', '/auth/login', { corpo: { login: l, senha: 'Plantao2026' } })).corpo.token;

const r0 = await req('POST', '/auth/login', { corpo: { login: 'dra.helena', senha: 'errada123' } });
ok('login senha errada 401', r0.status === 401, r0);
const [rec, enf, tec, hel, raf] = await Promise.all(['recepcao', 'enf.marina', 'tec.joao', 'dra.helena', 'dr.rafael'].map(login));
ok('logins', rec && enf && tec && hel && raf);

let r = await req('GET', '/triagens/fila'); ok('sem token 401', r.status === 401, r);
r = await req('GET', '/triagens/fila', { token: rec }); ok('recepção na fila de triagem 403', r.status === 403, r);
r = await req('GET', '/painel-medico', { token: enf }); ok('enfermagem no painel médico 403', r.status === 403, r);
r = await req('POST', '/medicos', { token: hel, corpo: {} }); ok('médico cadastrando médico 403', r.status === 403, r);
r = await req('GET', '/auth/sessao', { token: hel }); ok('sessão médico', r.status === 200 && r.corpo.profissional.registro === 'CRM-SP 123456', r);
r = await req('GET', '/auth/sessao', { token: rec }); ok('sessão recepção com nome da recepcionista', r.status === 200 && r.corpo.perfil === 'RECEPCAO' && r.corpo.nome.startsWith('Paula'), r);

r = await req('GET', '/triagens/fila', { token: enf });
ok('fila triagem 5 pacientes', r.status === 200 && r.corpo.length === 5, r);
ok('enfermagem vê CPF parcial e RG oculto', /^\*\*\*\.\d{3}\.\d{3}-\*\*$/.test(r.corpo[0].paciente.cpf) && r.corpo[0].paciente.rg === null, r.corpo[0]);
const fila = r.corpo;

r = await req('GET', '/medicos', { token: rec }); ok('recepção lista médicos com CPF parcial', r.status === 200 && r.corpo[0].cpf.startsWith('***') && r.corpo[0].email, r.corpo[0]);
r = await req('GET', '/medicos', { token: enf }); ok('enfermagem lista médicos sem dados pessoais', r.corpo[0].cpf === undefined && r.corpo[0].email === undefined, r.corpo[0]);
r = await req('GET', '/medicos/me', { token: hel }); ok('médico vê próprio CPF completo', r.corpo.cpf === '123.456.780-62', r.corpo);

const vitais = { pressaoSistolica: 130, pressaoDiastolica: 85, frequenciaCardiaca: 92, frequenciaRespiratoria: 18, temperatura: '37,8', saturacaoO2: 97, escalaDor: 6 };
r = await req('POST', '/triagens', { token: enf, corpo: { atendimentoId: fila[0].id, classificacao: 'VERDE', queixaPrincipal: 'Dor lombar há 3 dias', ...vitais } });
ok('triagem com enfermeira INDISPONIVEL 422', r.status === 422, r);
r = await req('PATCH', '/enfermeiros/me/disponibilidade', { token: enf, corpo: { statusDisponibilidade: 'DISPONIVEL' } }); ok('enfermeira DISPONIVEL', r.status === 200, r);
r = await req('PATCH', '/enfermeiros/me/disponibilidade', { token: tec, corpo: { statusDisponibilidade: 'DISPONIVEL' } });
r = await req('POST', '/triagens', { token: tec, corpo: { atendimentoId: fila[0].id, classificacao: 'VERDE', queixaPrincipal: 'Dor lombar', ...vitais } });
ok('técnico de enfermagem não tria 403', r.status === 403, r);
r = await req('POST', '/triagens', { token: enf, corpo: { atendimentoId: fila[0].id, classificacao: 'AMARELO', queixaPrincipal: 'x', pressaoSistolica: 80, pressaoDiastolica: 90 } });
ok('validação lista vários erros 400', r.status === 400 && r.corpo.erro.detalhes.length >= 5, r);

const classes = ['VERDE', 'VERMELHO', 'AMARELO', 'LARANJA'];
for (let i = 0; i < 4; i++) {
  const corpo = { atendimentoId: fila[i].id, classificacao: classes[i], queixaPrincipal: `Queixa ${classes[i]}`, ...(classes[i] === 'VERMELHO' ? {} : vitais) };
  r = await req('POST', '/triagens', { token: enf, corpo });
  ok(`triagem ${classes[i]} 201`, r.status === 201 && r.corpo.triagem.enfermeiroNome.startsWith('Marina'), r);
}
r = await req('POST', '/triagens', { token: enf, corpo: { atendimentoId: fila[0].id, classificacao: 'VERDE', queixaPrincipal: 'de novo', ...vitais } });
ok('triagem duplicada 409', r.status === 409, r);

r = await req('GET', '/painel-medico', { token: hel });
ok('painel ordenado por Manchester', JSON.stringify(r.corpo.fila.map((f) => f.triagem.classificacao.codigo)) === '["VERMELHO","LARANJA","AMARELO","VERDE"]', r.corpo.fila?.map((f) => f.triagem.classificacao.codigo));
ok('painel: médico vê CPF parcial', r.corpo.fila[0].paciente.cpf.startsWith('***'), r.corpo.fila[0].paciente);

r = await req('POST', '/painel-medico/chamar-proximo', { token: hel }); ok('chamar com médico INDISPONIVEL 422', r.status === 422, r);
await req('PATCH', '/medicos/me/disponibilidade', { token: hel, corpo: { statusDisponibilidade: 'DISPONIVEL' } });
await req('PATCH', '/medicos/me/disponibilidade', { token: raf, corpo: { statusDisponibilidade: 'DISPONIVEL' } });

// Concorrência: dois médicos + duplo clique da Dra. Helena, tudo ao mesmo tempo
const simultaneos = await Promise.all([
  req('POST', '/painel-medico/chamar-proximo', { token: hel }),
  req('POST', '/painel-medico/chamar-proximo', { token: raf }),
  req('POST', '/painel-medico/chamar-proximo', { token: hel }),
]);
const sucessos = simultaneos.filter((s) => s.status === 200);
const numeros = sucessos.map((s) => s.corpo.atendimento.triagem.classificacao.codigo).sort();
console.log('     simultâneos:', simultaneos.map((s) => s.status), numeros);
ok('concorrência: 2 sucessos, 1 conflito, pacientes diferentes (VERMELHO e LARANJA)', sucessos.length === 2 && JSON.stringify(numeros) === '["LARANJA","VERMELHO"]', simultaneos);

r = await req('GET', '/painel-medico', { token: hel });
const atendHel = r.corpo.emAndamento;
ok('painel mostra atendimento em andamento', atendHel && r.corpo.fila.length === 2, r.corpo);
r = await req('PATCH', '/medicos/me/disponibilidade', { token: hel, corpo: { statusDisponibilidade: 'PAUSA' } }); ok('pausa durante atendimento 422', r.status === 422, r);
r = await req('POST', `/painel-medico/atendimentos/${atendHel.id}/prescricoes`, { token: raf, corpo: { medicamento: 'Dipirona', dosagem: '1 g', viaAdministracao: 'intravenosa', frequencia: '6/6 h' } });
ok('outro médico prescrevendo 403', r.status === 403, r);
r = await req('POST', `/painel-medico/atendimentos/${atendHel.id}/prescricoes`, { token: hel, corpo: { medicamento: 'Dipirona sódica 500 mg/mL', dosagem: '1 g', viaAdministracao: 'intravenosa', frequencia: '6/6 h' } });
ok('prescrição pelo responsável 201', r.status === 201 && r.corpo.medicoCrm === 'CRM-SP 123456', r);
const idHelena = (await req('GET', '/medicos/me', { token: hel })).corpo.id;
r = await req('PATCH', `/medicos/${idHelena}/situacao`, { token: rec, corpo: { ativo: false } }); ok('desativar médico em atendimento 422', r.status === 422, r);
r = await req('PATCH', `/painel-medico/atendimentos/${atendHel.id}/finalizar`, { token: hel }); ok('finalizar 200', r.status === 200, r);
r = await req('POST', `/painel-medico/atendimentos/${atendHel.id}/prescricoes`, { token: hel, corpo: { medicamento: 'Dipirona', dosagem: '1 g', viaAdministracao: 'ORAL', frequencia: '6/6 h' } });
ok('prescrever após finalizado 422', r.status === 422, r);
r = await req('GET', '/medicos/me', { token: hel }); ok('médica volta a DISPONIVEL', r.corpo.statusDisponibilidade === 'DISPONIVEL', r.corpo);

r = await req('POST', '/medicos', { token: rec, corpo: { nome: 'Teste', cpf: '111.111.111-11', dataNascimento: '2015-01-01', email: 'x', login: 'A B', senha: '123', crmNumero: 'abc', crmUf: 'XX', especialidade: '' } });
ok('cadastro inválido 400 com detalhes', r.status === 400 && r.corpo.erro.detalhes.length >= 8, r);
r = await req('POST', '/medicos', { token: rec, corpo: { nome: 'Outra Pessoa', cpf: '123.456.780-62', dataNascimento: '1980-01-01', email: 'helena.duarte@ps.local', login: 'dra.helena', senha: 'Senha1234', crmNumero: '123456', crmUf: 'sp', especialidade: 'Pediatria' } });
ok('cadastro duplicado 409 com campos', r.status === 409 && r.corpo.erro.detalhes.length === 4, r);
r = await req('POST', '/medicos', { token: rec, corpo: { nome: 'Login Repetido', cpf: '135.792.468-28', dataNascimento: '1980-01-01', email: 'repetido@ps.local', login: 'enf.marina', senha: 'Senha1234', crmNumero: '999111', crmUf: 'SP', especialidade: 'Pediatria' } });
ok('login de enfermeira em cadastro de médico 409', r.status === 409 && r.corpo.erro.detalhes.some((d) => d.campo === 'login'), r);
r = await req('POST', '/enfermeiros', { token: rec, corpo: { nome: 'Paula Reis', cpf: '135.792.468-28', dataNascimento: '1992-05-10', email: 'paula@ps.local', login: 'enf.paula', senha: 'Senha1234', corenNumero: '998877', corenUf: 'SP' } });
ok('recepção cadastra enfermeira 201', r.status === 201 && r.corpo.categoria === 'ENFERMEIRO', r);
const idPaula = r.corpo.id;
const tokPaula = await login('enf.paula');
r = await req('PATCH', `/enfermeiros/${idPaula}/situacao`, { token: rec, corpo: { ativo: false } }); ok('desativa enfermeira', r.status === 200 && r.corpo.statusDisponibilidade === 'INDISPONIVEL', r);
r = await req('GET', '/triagens/fila', { token: tokPaula }); ok('token de enfermeira desativada 401', r.status === 401, r);
// ---------------------------------------------------------------- Recepção (RF01–RF05, RF14)
const novoPaciente = { nome: 'Fábio Souza Cardoso', endereco: 'Rua do Comércio, 77, Centro', cpf: '246.813.579-28', rg: '44.555.666-7', nomePai: 'Paulo Cardoso', nomeMae: 'Sônia Souza Cardoso', dataNascimento: '1975-10-03' };
r = await req('POST', '/atendimentos', { token: enf, corpo: novoPaciente }); ok('enfermagem abrindo atendimento 403', r.status === 403, r);
r = await req('POST', '/atendimentos', { token: rec, corpo: { cpf: '123' } });
ok('abertura inválida 400 lista nome, endereço, CPF e nascimento', r.status === 400 && ['nome', 'endereco', 'cpf', 'dataNascimento'].every((c) => r.corpo.erro.detalhes.some((d) => d.campo === c)), r);
r = await req('POST', '/atendimentos', { token: rec, corpo: novoPaciente });
const aberto = r.corpo?.atendimento;
ok('recepção abre atendimento 201 com número AT000', r.status === 201 && /^AT\d{3,}$/.test(aberto.numeroAtendimento) && aberto.status === 'AGUARDANDO_TRIAGEM' && r.corpo.pacienteJaCadastrado === false, r);
ok('recepção vê CPF e RG completos e sem dados clínicos', aberto.paciente.cpf === '246.813.579-28' && aberto.paciente.rg === '445556667' && aberto.triagem === undefined, aberto);
ok('abertura registrada no histórico pela recepção', aberto.historico.length === 1 && aberto.historico[0].statusAnterior === null && aberto.historico[0].responsavelPerfil === 'RECEPCAO', aberto.historico);
r = await req('POST', '/atendimentos', { token: rec, corpo: novoPaciente }); ok('segundo atendimento ativo do mesmo CPF 409', r.status === 409, r);

r = await req('GET', `/atendimentos/${aberto.numeroAtendimento.toLowerCase()}`, { token: hel });
ok('médico consulta atendimento com CPF parcial, RG oculto e triagem', r.status === 200 && r.corpo.paciente.cpf === '***.813.579-**' && r.corpo.paciente.rg === null && 'triagem' in r.corpo && r.corpo.podeAlterar === true, r);
r = await req('GET', '/atendimentos/XYZ1', { token: rec }); ok('número inválido 400', r.status === 400, r);
r = await req('GET', '/atendimentos/AT99999', { token: rec }); ok('atendimento inexistente 404', r.status === 404, r);

r = await req('PATCH', `/atendimentos/${aberto.numeroAtendimento}/paciente`, { token: rec, corpo: { ...novoPaciente, endereco: 'Av. Nova, 10, Jardim' } });
ok('recepção altera dados antes da confirmação médica', r.status === 200 && r.corpo.paciente.endereco === 'Av. Nova, 10, Jardim', r);
r = await req('PATCH', `/atendimentos/${aberto.numeroAtendimento}/paciente`, { token: rec, corpo: { ...novoPaciente, cpf: '567.891.234-82' } });
ok('alterar para CPF de outro paciente 409', r.status === 409, r);
r = await req('PATCH', `/atendimentos/${aberto.numeroAtendimento}/paciente`, { token: hel, corpo: novoPaciente }); ok('médico alterando paciente 403', r.status === 403, r);

r = await req('PATCH', `/atendimentos/${aberto.numeroAtendimento}/cancelar`, { token: rec });
ok('recepção cancela antes da confirmação', r.status === 200 && r.corpo.status === 'CANCELADO' && r.corpo.podeAlterar === false && r.corpo.historico.length === 2, r);
r = await req('PATCH', `/atendimentos/${aberto.numeroAtendimento}/cancelar`, { token: rec }); ok('cancelar de novo 422', r.status === 422, r);
r = await req('POST', '/atendimentos', { token: rec, corpo: novoPaciente });
ok('paciente que volta ao PS reaproveita o cadastro', r.status === 201 && r.corpo.pacienteJaCadastrado === true && r.corpo.atendimento.paciente.endereco === 'Av. Nova, 10, Jardim', r);

r = await req('PATCH', `/atendimentos/${atendHel.numeroAtendimento}/paciente`, { token: rec, corpo: novoPaciente }); ok('alterar atendimento finalizado 422', r.status === 422, r);
r = await req('PATCH', `/atendimentos/${atendHel.numeroAtendimento}/cancelar`, { token: rec }); ok('cancelar atendimento finalizado 422', r.status === 422, r);
const atendRaf = sucessos.map((s) => s.corpo.atendimento).find((a) => a.id !== atendHel.id);
r = await req('PATCH', `/atendimentos/${atendRaf.numeroAtendimento}/cancelar`, { token: rec }); ok('cancelar após confirmação médica 422', r.status === 422, r);
r = await req('PATCH', `/atendimentos/${atendRaf.numeroAtendimento}/paciente`, { token: rec, corpo: novoPaciente }); ok('alterar após confirmação médica 422', r.status === 422, r);
r = await req('GET', `/atendimentos/${atendHel.numeroAtendimento}`, { token: hel });
ok('histórico completo do atendimento finalizado', r.status === 200 && JSON.stringify(r.corpo.historico.map((h) => h.statusNovo)) === '["AGUARDANDO_TRIAGEM","AGUARDANDO_MEDICO","EM_ATENDIMENTO_MEDICO","FINALIZADO"]' && r.corpo.prescricoes.length === 1, r.corpo);

r = await req('GET', '/rota/inexistente'); ok('404 rota', r.status === 404, r);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
process.exitCode = falhas ? 1 : 0;
