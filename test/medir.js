// Imprime as métricas de todas as cenas no terminal: node test/medir.js [param=valor ...]
const E = require('../src/motor.js');
require('../src/metodos.js');
require('../src/projetos.js');
require('../projetos/le-notre.js');

const p = E.normalizarProjeto(E.projetos[0]), f = (x) => (x / 60).toFixed(1).padStart(6);
const params = {};
for (const a of process.argv.slice(2)) { const [k, v] = a.split('='); params[k] = Number(v); }

console.log('cena      duração travado  maior pess trabalho ocioso | morad  média    máx >2min | fim de cada pessoa (min)');
for (const c of E.cenasDoProjeto(p)) {
  const r = E.simular(p, c, params);
  if (r.erro) { console.log(c.id.padEnd(8), 'ERRO', r.erro); continue; }
  const m = r.metricas;
  console.log(c.id.padEnd(8), f(m.duracao), f(m.travado), f(m.maiorBloqueio), String(m.pessoas).padStart(4), f(m.trabalho), f(m.porTipo.aguardar || 0),
    '|', String(m.moradores).padStart(5), f(m.esperaMedia), f(m.esperaMaxima), String(m.moradoresMais2min).padStart(5),
    '|', r.atores.map((a) => a.nome + ' ' + f(a.segs[a.segs.length - 1].t1).trim()).join(', '));
}
