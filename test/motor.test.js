const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/motor.js');
require('../src/metodos.js');
require('../src/projetos.js');
require('../projetos/le-notre.js');

const projeto = E.normalizarProjeto(E.projetos[0]);
const cena = (id) => E.cenasPadrao.find((c) => c.id === id);
const rodar = (id, params) => E.simular(projeto, cena(id), params);

test('todas as cenas terminam com os andares limpos e com lixeiras', () => {
  for (const c of E.cenasDoProjeto(projeto)) {
    const r = E.simular(projeto, c);
    assert.ok(!r.erro, c.id + ': ' + r.erro);
    assert.ok(r.duracao > 0);
    assert.equal(r.final.elev.travado, false);
    assert.equal(r.final.elev.cheias + r.final.elev.limpas, 0);
  }
});

test('cena atual: viagens e andares percorridos conferidos à mão', () => {
  const r = rodar('atual');
  // coleta: por grupo 3 paradas + volta; devolução: idem => 4 viagens x 6 grupos x 2 fases
  assert.equal(r.metricas.viagens, 48);
  // cada grupo percorre topo*2 níveis (subsolo é o nível 0, 18º é o 19): topos 19,16,13,10,7,4
  assert.equal(r.metricas.andaresPercorridos, 2 * 2 * (19 + 16 + 13 + 10 + 7 + 4));
  assert.equal(r.metricas.bloqueios.length, 2);
  assert.equal(r.metricas.pessoas, 1);
  assert.ok(Math.abs(r.metricas.trabalho - r.duracao) < 1e-6);
  assert.equal(r.metricas.chamadas, 2);
});

test('troca direta nunca deixa andar sem lixeira', () => {
  assert.equal(rodar('troca').metricas.semLixeira, 0);
  assert.equal(rodar('equipe').metricas.semLixeira, 0);
  assert.ok(rodar('atual').metricas.semLixeira > 0);
});

test('capacidade do elevador é respeitada e muda o número de grupos', () => {
  const r = rodar('atual', { capacidadeElevador: 4 });
  assert.ok(!r.erro, r.erro);
  for (const m of r.marcos) assert.ok(m.e.elev.cheias + m.e.elev.limpas <= 4);
  assert.equal(r.metricas.viagens, 2 * 9 * 3);
});

test('equipe: três pessoas em paralelo, sem sobreposição no roteiro de cada uma', () => {
  const r = rodar('equipe');
  assert.equal(r.metricas.pessoas, 3);
  for (const a of r.atores) for (let i = 1; i < a.segs.length; i++) assert.ok(a.segs[i].t0 >= a.segs[i - 1].t1 - 1e-9);
  // a limpeza é o caminho mais longo: carona + 18 quartos + 17 lances de escada
  const p = r.p;
  assert.ok(r.duracao >= 18 * p.tLimpar + 17 * p.tEscada);
  assert.ok(r.duracao < rodar('troca').duracao);
  // nunca há mais lixeiras no prédio do que as originais + reserva
  for (const m of r.marcos) {
    const tot = m.e.niveis.reduce((s, n) => s + n.cheias + n.limpas, 0) + m.e.elev.cheias + m.e.elev.limpas;
    assert.ok(tot <= 36 + 12);
  }
  // as limpas já estão prontas: o transporte nunca fica parado e só chama o elevador uma vez
  assert.ok(!r.atores[1].segs.some((s) => s.tipo === 'aguardar'));
  assert.equal(r.metricas.chamadas, 1);
});

test('dupla: mesma duração da equipe de três, com duas pessoas e bloqueios curtos', () => {
  const d = rodar('dupla').metricas, e = rodar('equipe').metricas, a = rodar('atual').metricas;
  assert.equal(d.pessoas, 2);
  assert.equal(d.lixeirasReserva, 6);
  assert.equal(d.semLixeira, 0);
  assert.ok(d.duracao < e.duracao * 1.1);
  assert.ok(d.travado <= e.travado + 1e-6);
  assert.ok(d.maiorBloqueio < 10 * 60);
  assert.ok(d.trabalho < a.trabalho * 1.05);
});

test('lixeiras na porta: menos tempo de elevador travado do que a dupla', () => {
  const p = rodar('porta').metricas, d = rodar('dupla').metricas;
  assert.equal(p.pessoas, 2);
  assert.equal(p.semLixeira, 0);
  assert.ok(p.travado < d.travado * 0.7);
  assert.ok(p.maiorBloqueio < d.maiorBloqueio);
});

test('moradores: mesmos em todas as cenas, somem com uso zero, e sofrem mais na cena atual', () => {
  const a = rodar('atual'), d = rodar('dupla');
  assert.deepEqual(rodar('atual').metricas, a.metricas); // mesma semente, mesmo resultado
  assert.ok(a.metricas.moradores > 0);
  assert.ok(a.metricas.esperaMaxima > d.metricas.esperaMaxima);
  assert.ok(a.metricas.esperaMedia > d.metricas.esperaMedia);
  const z = rodar('atual', { usoMoradores: 0 });
  assert.equal(z.metricas.moradores, 0);
  assert.equal(z.elevSegs.filter((s) => /orador/.test(s.texto)).length, 0);
  // o elevador nunca atende morador enquanto está travado
  for (const s of a.elevSegs) for (const b of a.metricas.bloqueios) assert.ok(s.t1 <= b.t0 + 1e-6 || s.t0 >= b.t1 - 1e-6);
  assert.notDeepEqual(rodar('atual', { semente: 2 }).metricas.esperaMedia, a.metricas.esperaMedia);
});

test('impasse é detectado', () => {
  E.metodos.preso = (s) => { s.ator('X', function* (f) { yield* f.aguardar(() => false, 'nunca'); }); };
  const r = E.simular(projeto, { metodo: 'preso' });
  assert.match(r.erro, /Impasse/);
});

test('estadoEm acha o segmento certo', () => {
  const r = rodar('atual');
  const s = r.atores[0].segs[10];
  const x = E.estadoEm(r, (s.t0 + s.t1) / 2);
  assert.equal(x.ativos[0].seg, s);
  assert.ok(Math.abs(x.ativos[0].f - 0.5) < 1e-9);
  assert.equal(E.estadoEm(r, r.duracao + 1).ativos[0], null);
});

test('projetos: novo, normalizar, exportar e importar', () => {
  const n = E.novoProjeto('Prédio A');
  assert.equal(n.nome, 'Prédio A');
  assert.ok(E.cenasDoProjeto(n).length === E.cenasPadrao.length);
  // valores fora dos limites são corrigidos; sem subsolo a casa de lixo vai para o térreo
  const x = E.normalizarProjeto({ nome: '  ', edificio: { andares: 999, lixeirasPorAndar: 0, subsolos: 0, terreo: false, central: 'SS' }, parametros: { tLimpar: 300, lixo: 1, usoMoradores: 0, tPorta: -2 }, cenasOcultas: ['troca', 'nao-existe'] });
  assert.equal(x.edificio.andares, 60);
  assert.equal(x.edificio.lixeirasPorAndar, 1);
  assert.equal(x.edificio.terreo, true);
  assert.equal(x.edificio.central, 'T');
  assert.deepEqual(x.parametros, { tLimpar: 300, usoMoradores: 0 });
  assert.deepEqual(x.cenasOcultas, ['troca']);
  assert.ok(!E.cenasDoProjeto(x).some((c) => c.id === 'troca'));
  // ida e volta pelo arquivo
  const volta = E.importarProjetos(E.exportarProjetos([x, n]));
  assert.equal(volta.length, 2);
  assert.notEqual(volta[0].id, x.id);
  assert.deepEqual(volta[0].edificio, x.edificio);
  assert.deepEqual(volta[0].parametros, x.parametros);
  assert.throws(() => E.importarProjetos('{"a":1}'), /nenhum projeto/);
  assert.throws(() => E.importarProjetos('isto não é json'), /JSON/);
  assert.equal(E.nomeUnico('A', ['A', 'A (2)']), 'A (3)');
});

test('todas as cenas rodam em edifícios bem diferentes do exemplo', () => {
  const casos = [
    { andares: 1, lixeirasPorAndar: 1, subsolos: 0, terreo: true },
    { andares: 7, lixeirasPorAndar: 3, subsolos: 2, terreo: true, central: 'SS2' },
    { andares: 25, lixeirasPorAndar: 2, subsolos: 1, terreo: false },
    { andares: 10, lixeirasPorAndar: 4, subsolos: 0, terreo: true },
  ];
  for (const ed of casos) {
    const p = E.normalizarProjeto({ edificio: ed });
    for (const c of E.cenasDoProjeto(p)) {
      const r = E.simular(p, c);
      assert.ok(!r.erro, JSON.stringify(ed) + ' / ' + c.id + ': ' + r.erro);
    }
  }
});

test('zelador: dois funcionários, elevador travado do começo ao fim, só os sacos descem', () => {
  const r = rodar('zelador'), m = r.metricas, p = r.p;
  assert.ok(!r.erro, r.erro);
  assert.equal(m.pessoas, 2);
  assert.equal(m.lixeirasReserva, 0);
  assert.equal(m.semLixeira, 0);
  assert.equal(m.bloqueios.length, 1);
  assert.ok(Math.abs(m.travado - m.duracao) < 120); // só a espera inicial pelo elevador fica de fora
  // 36 sacos, 20 por viagem (10 andares, segundo o zelador): uma viagem de 10 andares e outra de 8, mais as voltas
  assert.equal(m.viagens, 11 + 9);
  assert.equal(r.final.niveis[r.central].sacos, 36);
  for (const k of r.marcos) assert.ok(k.e.elev.sacos <= 20 && k.e.elev.cheias + k.e.elev.limpas === 0);
  // cada lixeira: tirar o saco, carregar, limpar; descarregar no subsolo. Não há limpeza de quarto.
  assert.ok(Math.abs(m.porTipo.ensacar - 36 * p.tEnsacar) < 1e-6);
  assert.ok(Math.abs(m.porTipo.limparLixeira - 36 * p.tLimparLixeira) < 1e-6);
  assert.ok(Math.abs(m.porTipo.carga - 36 * p.tCarregarSaco) < 1e-6);
  assert.ok(Math.abs(m.porTipo.descarga - 36 * p.tDescarregarSaco) < 1e-6);
  assert.ok(!m.porTipo.limpeza);
  // os dois trabalham ao mesmo tempo e ninguém viaja enquanto o colega ainda trabalha no andar
  const [f1, f2] = r.atores.map((a) => a.segs);
  const trabalho = (x) => ['ensacar', 'carga', 'descarga', 'limparLixeira'].includes(x.tipo);
  for (const v of f1.filter((x) => x.tipo === 'viagem')) assert.ok(!f2.some((x) => trabalho(x) && x.t0 < v.t1 - 1e-6 && x.t1 > v.t0 + 1e-6));
  assert.ok(f2.filter(trabalho).length === f1.filter(trabalho).length);
  // lixeiras ímpares e prédio pequeno também fecham
  for (const ed of [{ andares: 5, lixeirasPorAndar: 3 }, { andares: 2, lixeirasPorAndar: 1 }]) {
    const x = E.simular(E.normalizarProjeto({ edificio: ed }), cena('zelador'));
    assert.ok(!x.erro, JSON.stringify(ed) + ': ' + x.erro);
  }
});

test('linha base: padrão é a primeira cena visível, aceita outra e volta ao padrão se ela for ocultada', () => {
  assert.equal(E.novoProjeto('X').cenaBase, 'atual');
  assert.equal(E.normalizarProjeto({ cenaBase: 'zelador' }).cenaBase, 'zelador');
  assert.equal(E.normalizarProjeto({ cenaBase: 'nao-existe' }).cenaBase, 'atual');
  assert.equal(E.normalizarProjeto({ cenaBase: 'zelador', cenasOcultas: ['zelador', 'atual'] }).cenaBase, 'troca');
  assert.equal(E.importarProjetos(E.exportarProjetos([E.normalizarProjeto({ cenaBase: 'dupla' })]))[0].cenaBase, 'dupla');
});
