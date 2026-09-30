// Concorrência: dois médicos esvaziam a fila ao mesmo tempo. Nenhum paciente pode ser atendido duas vezes.
// Uso: node testes/stress_concorrencia.mjs   (rodar depois do smoke_api.mjs, com pacientes na fila de triagem)
const API = process.env.API_URL || 'http://localhost:3000/api';
const req = async (m, c, t, b) => { const r = await fetch(API + c, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, corpo: await r.json() }; };
const login = async (l) => (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, senha: 'Plantao2026' }) })).json()).token;
const [enf, hel, raf] = await Promise.all(['enf.marina', 'dra.helena', 'dr.rafael'].map(login));
// finaliza qualquer atendimento pendente do smoke test
for (const t of [hel, raf]) { const em = (await req('GET', '/painel-medico', t)).corpo.emAndamento; if (em) await req('PATCH', `/painel-medico/atendimentos/${em.id}/finalizar`, t); }
const cores = ['AZUL', 'VERDE', 'AMARELO', 'LARANJA', 'VERMELHO'];
const fila = (await req('GET', '/triagens/fila', enf)).corpo;
await Promise.all(fila.map((a, i) => req('POST', '/triagens', enf, { atendimentoId: a.id, classificacao: cores[i % 5], queixaPrincipal: 'Carga', pressaoSistolica: 120, pressaoDiastolica: 80, frequenciaCardiaca: 80, frequenciaRespiratoria: 16, temperatura: 36.5, saturacaoO2: 98 })));
const total = (await req('GET', '/painel-medico', hel)).corpo.fila.length;
console.log('na fila:', total);
const atendidos = { hel: [], raf: [] }; let conflitos = 0;
async function plantao(nome, token) {
  for (;;) {
    const r = await req('POST', '/painel-medico/chamar-proximo', token);
    if (r.status === 409) { conflitos++; if (conflitos > 50) throw new Error(JSON.stringify(r)); continue; }
    if (r.status !== 200) throw new Error(JSON.stringify(r));
    if (!r.corpo.atendimento) return;
    atendidos[nome].push(r.corpo.atendimento.triagem.classificacao.codigo + '#' + r.corpo.atendimento.id);
    const f = await req('PATCH', `/painel-medico/atendimentos/${r.corpo.atendimento.id}/finalizar`, token);
    if (f.status !== 200) throw new Error(JSON.stringify(f));
  }
}
await Promise.all([plantao('hel', hel), plantao('raf', raf)]);
const todos = [...atendidos.hel, ...atendidos.raf];
console.log('helena:', atendidos.hel.join(' '));
console.log('rafael:', atendidos.raf.join(' '));
console.log('conflitos tratados:', conflitos, '| atendidos:', todos.length, '| únicos:', new Set(todos).size, '| esperado:', total);
if (todos.length !== new Set(todos).size || todos.length !== total) {
  console.log('FALHOU: paciente duplicado ou esquecido.');
  process.exitCode = 1;
} else {
  console.log('OK: cada paciente foi atendido exatamente uma vez.');
}
