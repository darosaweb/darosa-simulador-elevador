// Motor da simulação. Sem DOM: roda no navegador e no Node (testes).
// Um método (src/metodos.js) cria uma ou mais pessoas (atores) e dá a cada uma
// a sua sequência de ordens. O motor executa todas ao mesmo tempo, em ordem de
// relógio, e mede o resultado.
(function (root) {
  'use strict';
  const E = (root.ELEVADOR = root.ELEVADOR || {});

  E.PARAMETROS = [
    { id: 'capacidadeElevador', rotulo: 'Lixeiras que cabem no elevador', un: 'un', padrao: 6, passo: 1 },
    { id: 'alturaAndar', rotulo: 'Altura entre andares', un: 'm', padrao: 3, passo: 0.1 },
    { id: 'velocidade', rotulo: 'Velocidade do elevador', un: 'm/s', padrao: 1, passo: 0.1 },
    { id: 'tAceleracao', rotulo: 'Perda por arrancar e parar', un: 's', padrao: 4, passo: 1 },
    { id: 'tPorta', rotulo: 'Abrir ou fechar a porta', un: 's', padrao: 3, passo: 1 },
    { id: 'tCarregar', rotulo: 'Pôr uma lixeira no elevador', un: 's', padrao: 15, passo: 1 },
    { id: 'tDescarregar', rotulo: 'Tirar uma lixeira do elevador', un: 's', padrao: 12, passo: 1 },
    { id: 'tEsvaziar', rotulo: 'Esvaziar e lavar uma lixeira', un: 's', padrao: 60, passo: 5 },
    { id: 'tLimpar', rotulo: 'Limpar um quarto de lixo', un: 's', padrao: 240, passo: 10 },
    { id: 'tEscada', rotulo: 'Um andar pela escada', un: 's', padrao: 20, passo: 1 },
    { id: 'tLevarPorta', rotulo: 'Levar uma lixeira entre o quarto e a porta do elevador', un: 's', padrao: 10, passo: 1 },
    { id: 'tCarregarPorta', rotulo: 'Pôr no elevador uma lixeira que já está na porta', un: 's', padrao: 6, passo: 1 },
    { id: 'tDescarregarPorta', rotulo: 'Tirar uma lixeira e deixar na porta', un: 's', padrao: 5, passo: 1 },
    { id: 'usoMoradores', rotulo: 'Uso pelos moradores (viagens por hora)', un: '/h', padrao: 12, passo: 1, zero: true },
    { id: 'tMorador', rotulo: 'Embarque e desembarque de um morador', un: 's', padrao: 10, passo: 1 },
    { id: 'semente', rotulo: 'Sorteio dos moradores (semente)', un: 'nº', padrao: 1, passo: 1 },
  ];

  E.parametrosPadrao = function () {
    const p = {};
    for (const d of E.PARAMETROS) p[d.id] = d.padrao;
    return p;
  };

  E.criarNiveis = function (ed) {
    const n = [];
    for (let i = ed.subsolos; i >= 1; i--) {
      n.push({ id: ed.subsolos > 1 ? 'SS' + i : 'SS', nome: ed.subsolos > 1 ? i + 'º subsolo' : 'Subsolo', tipo: 'subsolo' });
    }
    if (ed.terreo) n.push({ id: 'T', nome: 'Térreo', tipo: 'terreo' });
    for (let i = 1; i <= ed.andares; i++) n.push({ id: String(i), nome: i + 'º andar', tipo: 'andar' });
    return n;
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const NOME_TIPO = { cheias: 'cheia', limpas: 'limpa' };
  const NA_PORTA = { cheias: 'pCheias', limpas: 'pLimpas' };
  function sorteador(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Uma pessoa da equipe. As ordens são geradores: use "yield* f.ordem(...)" no método.
  // travar(), liberar() e fase() são instantâneas e não levam yield.
  class Ator {
    constructor(sim, nome, i) { this.s = sim; this.nome = nome; this.i = i; this.segs = []; this._fase = ''; this.tLivre = 0; }
    get est() { return this.s.e.atores[this.i]; }
    get nivel() { return this.est.nivel; }

    /** Nome da etapa em curso (aparece na tela). */
    fase(nome) { this._fase = nome; }

    travar() {
      const el = this.s.e.elev;
      if (el.nivel !== this.nivel || el.ocupado) throw new Error('Para travar, o elevador precisa estar com ' + this.nome + ' (use chamar)');
      el.travado = true;
    }

    liberar() {
      const el = this.s.e.elev;
      if (el.cheias + el.limpas > 0) throw new Error('Não dá para liberar o elevador com lixeiras dentro');
      el.travado = false; el.reservado = false;
      this.s._marco();
    }

    /** Fica parado até a condição ser verdadeira (ex.: haver lixeiras limpas prontas). */
    *aguardar(cond, texto) { yield { cond, texto: texto || 'Aguardando' }; }

    /** Chama o elevador para o seu andar. Entra na fila junto com os moradores. */
    *chamar() {
      const s = this.s, el = s.e.elev;
      if (el.travado && el.nivel === this.nivel) return;
      const pedido = { ator: this, nivel: this.nivel, pronto: false };
      s.fila.push(pedido); s.chamadas++;
      this.est.onde = 'andar';
      s._marco();
      yield { cond: () => pedido.pronto, tipo: 'espera', texto: 'Aguardando o elevador no ' + s._nome(this.nivel) };
    }

    /** Vai de elevador até o nível dest. "com" = colegas que vão junto de carona. */
    *viajar(dest, com) {
      const s = this.s, e = s.e, caronas = com || [];
      this._juntoAoElevador('viajar');
      if (e.elev.nivel === dest) {
        // já está no destino: devolve o elevador que tinha chamado
        if (!e.elev.travado && e.elev.reservado) { e.elev.reservado = false; s._marco(); }
        return;
      }
      const de = e.elev.nivel, n = Math.abs(dest - de);
      for (const c of caronas) if (c.nivel !== de) throw new Error(c.nome + ' não está no andar do elevador');
      yield {
        tipo: 'viagem', dur: s._tViagem(n),
        texto: 'Elevador: ' + s._nome(de) + ' → ' + s._nome(dest), de, para: dest,
        inicio: () => { this.est.onde = 'elevador'; for (const c of caronas) c.est.onde = 'elevador'; },
        fim: () => {
          e.elev.nivel = dest; this.est.nivel = dest;
          if (!e.elev.travado) e.elev.reservado = false;
          for (const c of caronas) { c.est.nivel = dest; c.est.onde = 'andar'; }
        },
      };
    }

    /** Põe n lixeiras ('cheias' ou 'limpas') do andar dentro do elevador. daPorta = já estão na porta do elevador. */
    *carregar(n, tipo, daPorta) {
      const onde = daPorta ? NA_PORTA[tipo] : tipo;
      const s = this.s, e = s.e;
      for (let i = 0; i < n; i++) {
        this._juntoAoElevador('carregar');
        const nv = this.nivel;
        if (!e.elev.travado) throw new Error('Trave o elevador antes de carregar');
        if (e.elev.cheias + e.elev.limpas >= s.p.capacidadeElevador) throw new Error('Elevador lotado no ' + s._nome(nv));
        if (e.niveis[nv][onde] < 1) throw new Error('Não há lixeira ' + NOME_TIPO[tipo] + (daPorta ? ' na porta do elevador do ' : ' no ') + s._nome(nv));
        yield {
          tipo: 'carga', porta: !!daPorta, dur: daPorta ? s.p.tCarregarPorta : s.p.tCarregar, texto: 'Pondo lixeira ' + NOME_TIPO[tipo] + ' no elevador (' + s._nome(nv) + ')', binTipo: tipo,
          inicio: () => { this.est.onde = 'andar'; e.niveis[nv][onde]--; }, fim: () => { e.elev[tipo]++; },
        };
      }
    }

    /** Tira n lixeiras do elevador e deixa no andar. naPorta = deixa na porta do elevador. */
    *descarregar(n, tipo, naPorta) {
      const onde = naPorta ? NA_PORTA[tipo] : tipo;
      const s = this.s, e = s.e;
      for (let i = 0; i < n; i++) {
        this._juntoAoElevador('descarregar');
        const nv = this.nivel;
        if (e.elev[tipo] < 1) throw new Error('Não há lixeira ' + NOME_TIPO[tipo] + ' no elevador');
        yield {
          tipo: 'descarga', porta: !!naPorta, dur: naPorta ? s.p.tDescarregarPorta : s.p.tDescarregar, texto: 'Tirando lixeira ' + NOME_TIPO[tipo] + ' do elevador (' + s._nome(nv) + ')', binTipo: tipo,
          inicio: () => { this.est.onde = 'andar'; e.elev[tipo]--; }, fim: () => { e.niveis[nv][onde]++; },
        };
      }
    }

    /** Leva n lixeiras do quarto para a porta do elevador (destino 'porta') ou da porta para o quarto ('quarto'). */
    *levar(n, tipo, destino) {
      const s = this.s, de = destino === 'porta' ? tipo : NA_PORTA[tipo], para = destino === 'porta' ? NA_PORTA[tipo] : tipo;
      for (let i = 0; i < n; i++) {
        const nv = this.nivel, x = s.e.niveis[nv];
        if (x[de] < 1) throw new Error('Não há lixeira ' + NOME_TIPO[tipo] + ' para levar no ' + s._nome(nv));
        yield {
          tipo: 'levar', dur: s.p.tLevarPorta, binTipo: tipo, destino,
          texto: 'Levando lixeira ' + NOME_TIPO[tipo] + (destino === 'porta' ? ' até a porta do elevador (' : ' para o quarto (') + s._nome(nv) + ')',
          inicio: () => { this.est.onde = 'andar'; }, fim: () => { x[de]--; x[para]++; },
        };
      }
    }

    /** Limpa o quarto de lixo do andar onde está. */
    *limpar() {
      const s = this.s, nv = this.nivel;
      yield {
        tipo: 'limpeza', dur: s.p.tLimpar, texto: 'Limpando o quarto de lixo do ' + s._nome(nv),
        inicio: () => { this.est.onde = 'andar'; }, fim: () => { s.e.niveis[nv].limpo = true; },
      };
    }

    /** Na casa de lixo: esvazia e lava n lixeiras cheias. */
    *esvaziar(n) {
      const s = this.s, c = s.e.niveis[s.central];
      for (let i = 0; i < n; i++) {
        if (this.nivel !== s.central) throw new Error('Só dá para esvaziar na casa de lixo');
        if (c.cheias < 1) throw new Error('Não há lixeira cheia na casa de lixo');
        yield {
          tipo: 'esvaziar', dur: s.p.tEsvaziar, texto: 'Esvaziando e lavando lixeira na casa de lixo',
          inicio: () => { this.est.onde = 'andar'; c.cheias--; }, fim: () => { c.limpas++; },
        };
      }
    }

    /** Vai a pé pela escada. */
    *escada(dest) {
      const s = this.s, de = this.nivel;
      if (de === dest) return;
      yield {
        tipo: 'escada', dur: Math.abs(dest - de) * s.p.tEscada, texto: 'Escada: ' + s._nome(de) + ' → ' + s._nome(dest), de, para: dest,
        inicio: () => { this.est.onde = 'escada'; }, fim: () => { this.est.nivel = dest; this.est.onde = 'andar'; },
      };
    }

    _juntoAoElevador(acao) {
      if (this.nivel !== this.s.e.elev.nivel) throw new Error('Para ' + acao + ', o elevador precisa estar no andar de ' + this.nome + ' (use chamar)');
    }
  }

  class Sim {
    constructor(projeto, cena, parametros) {
      this.ed = projeto.edificio;
      this.p = Object.assign(E.parametrosPadrao(), projeto.parametros, parametros, cena.parametros);
      this.niveis = E.criarNiveis(this.ed);
      this.central = this.niveis.findIndex((n) => n.id === this.ed.central);
      if (this.central < 0) throw new Error('Nível da lixeira central não existe: ' + this.ed.central);
      this.andares = this.niveis.map((n, i) => (n.tipo === 'andar' ? i : -1)).filter((i) => i >= 0);
      this.L = this.ed.lixeirasPorAndar;
      this.e = {
        elev: { nivel: this.central, cheias: 0, limpas: 0, travado: false, reservado: false, ocupado: false, morador: false },
        atores: [],
        espera: [],   // andares onde há morador esperando o elevador
        niveis: this.niveis.map((n) => ({ cheias: n.tipo === 'andar' ? this.L : 0, limpas: 0, pCheias: 0, pLimpas: 0, limpo: false })),
      };
      this.atores = [];
      this.fila = [];        // pedidos de elevador: moradores e funcionários, por ordem de chegada
      this.moradores = [];   // moradores já embarcados, com a espera de cada um
      this.chamadas = 0;
      this.marcos = [];
      this.t = 0;
    }

    /** Cria uma pessoa. roteiro = function* (f) { yield* f.ordem(...) ... }. Todos começam na casa de lixo. */
    ator(nome, roteiro) {
      const a = new Ator(this, nome, this.atores.length);
      a.roteiro = roteiro;
      this.atores.push(a);
      this.e.atores.push({ nivel: this.central, onde: 'andar' });
      return a;
    }

    /** Andares em grupos que enchem o elevador, do mais alto para o mais baixo. */
    grupos() {
      const porViagem = Math.max(1, Math.floor(this.p.capacidadeElevador / this.L));
      const desc = this.andares.slice().reverse();
      const g = [];
      for (let i = 0; i < desc.length; i += porViagem) g.push(desc.slice(i, i + porViagem));
      return g;
    }

    /** Lixeiras limpas extras guardadas na casa de lixo desde o início. */
    reserva(n, naPorta) {
      this.e.niveis[this.central][naPorta ? 'pLimpas' : 'limpas'] += n;
      this.lixeirasReserva = (this.lixeirasReserva || 0) + n;
    }

    _nome(i) { return this.niveis[i].nome; }

    _tViagem(n) { return 2 * this.p.tPorta + this.p.tAceleracao + (n * this.p.alturaAndar) / this.p.velocidade; }

    // Registra o estado depois de uma mudança e solta quem estava aguardando por ela.
    _marco() {
      if (!this.encerrado) {
        const u = this.marcos[this.marcos.length - 1];
        if (u && u.t === this.t) u.e = clone(this.e); else this.marcos.push({ t: this.t, e: clone(this.e) });
      }
      for (const a of this.todos || []) {
        if (a.bloq && a.bloq.cond()) {
          if (this.t > a.tBloq && !a.oculto) a.segs.push({ tipo: a.bloq.tipo || 'aguardar', t0: a.tBloq, t1: this.t, texto: a.bloq.texto, fase: a._fase });
          a.bloq = null; a.tLivre = this.t;
        }
      }
    }

    // O elevador atende os pedidos por ordem de chegada, um de cada vez, sempre que não está travado.
    *_roteiroElevador() {
      const s = this, el = s.e.elev;
      const mover = (de, para, texto, extra, fim) => ({
        tipo: 'morador', mov: true, dur: s._tViagem(Math.abs(para - de)) + extra, texto, de, para,
        fim: () => { el.nivel = para; if (fim) fim(); },
      });
      for (;;) {
        yield { cond: () => s.fila.length > 0 && !el.travado && !el.reservado };
        const r = s.fila.shift();
        el.ocupado = true;
        if (r.ator) {
          if (el.nivel !== r.nivel) yield mover(el.nivel, r.nivel, 'Elevador indo buscar ' + r.ator.nome + ' no ' + s._nome(r.nivel), 0);
          el.ocupado = false; el.reservado = true; r.pronto = true;
        } else {
          if (el.nivel !== r.de) yield mover(el.nivel, r.de, 'Elevador indo buscar morador no ' + s._nome(r.de), 0);
          r.espera = s.t - r.t; s.moradores.push(r);
          s.e.espera.splice(s.e.espera.indexOf(r.de), 1);
          el.morador = true;
          s._marco();
          yield mover(r.de, r.para, 'Morador: ' + s._nome(r.de) + ' → ' + s._nome(r.para), s.p.tMorador, () => { el.morador = false; });
          el.ocupado = false;
        }
        s._marco();
      }
    }

    // Moradores chegam ao acaso (Poisson), metade descendo ao térreo, metade subindo dele.
    // O sorteio não depende da cena: todas enfrentam exatamente os mesmos moradores.
    *_roteiroChegadas() {
      const s = this, taxa = s.p.usoMoradores / 3600;
      if (!(taxa > 0)) return;
      const rnd = sorteador(Math.round(s.p.semente) || 1);
      let base = s.niveis.findIndex((n) => n.tipo === 'terreo');
      if (base < 0) base = 0;
      for (;;) {
        yield { tipo: 'chegada', dur: -Math.log(1 - rnd()) / taxa };
        const andar = s.andares[Math.floor(rnd() * s.andares.length)], desce = rnd() < 0.5;
        if (s.encerrado) return;
        s.fila.push({ t: s.t, de: desce ? andar : base, para: desce ? base : andar });
        s.e.espera.push(desce ? andar : base);
        s._marco();
      }
    }

    rodar() {
      const elevador = new Ator(this, 'Elevador', -1), chegadas = new Ator(this, 'Chegadas', -1);
      elevador.roteiro = () => this._roteiroElevador(); chegadas.roteiro = () => this._roteiroChegadas();
      elevador.oculto = chegadas.oculto = true;
      this.elevSegs = elevador.segs;
      this.todos = this.atores.concat([elevador, chegadas]);
      for (const a of this.todos) a.gen = a.roteiro(a);
      this._marco();
      for (let guarda = 0; guarda < 2e6; guarda++) {
        let a = null;
        for (const x of this.todos) if (!x.fim && !x.bloq && (!a || x.tLivre < a.tLivre)) a = x;
        const presos = this.atores.filter((x) => x.bloq);
        if (!a || (!this.encerrado && a.tLivre > 86400)) {
          if (presos.length) throw new Error('Impasse: ' + presos.map((x) => x.nome + ' (' + x.bloq.texto + ')').join('; '));
          if (!a) break;
        }
        this.t = a.tLivre;
        if (a.pend) { const f = a.pend.fim; a.pend = null; if (f) f(); this._marco(); }
        const r = a.gen.next();
        if (r.done) {
          a.fim = true;
          if (!this.encerrado && this.atores.every((x) => x.fim)) { this.encerrado = true; this.tFim = this.t; this.final = clone(this.e); }
          continue;
        }
        const o = r.value;
        if (o.cond) {
          if (!o.cond()) { a.bloq = o; a.tBloq = this.t; }
          continue;
        }
        if (o.inicio) o.inicio();
        a.segs.push({ tipo: o.tipo, t0: this.t, t1: this.t + o.dur, texto: o.texto, fase: a._fase, de: o.de, para: o.para, binTipo: o.binTipo, porta: o.porta, destino: o.destino, mov: o.mov });
        a.pend = o; a.tLivre = this.t + o.dur;
        this._marco();
      }
      if (!this.encerrado) throw new Error('Simulação longa demais');
      this.marcos.push({ t: this.tFim, e: this.final });
    }
  }
  E.Sim = Sim;

  function medir(sim) {
    const andares = sim.andares, L = sim.L, mk = sim.marcos;
    const m = { duracao: sim.tFim, travado: 0, maiorBloqueio: 0, viagens: 0, andaresPercorridos: 0, chamadas: sim.chamadas, semLixeira: 0, fimColeta: 0, trabalho: 0, pessoas: sim.atores.length, porTipo: {} };
    const bloqueios = [];
    for (let k = 0; k < mk.length - 1; k++) {
      const t0 = mk[k].t, t1 = mk[k + 1].t, d = t1 - t0, e = mk[k].e;
      if (e.elev.travado) {
        m.travado += d;
        const u = bloqueios[bloqueios.length - 1];
        if (u && Math.abs(u.t1 - t0) < 1e-6) u.t1 = t1; else bloqueios.push({ t0, t1 });
      }
      for (const i of andares) {
        const n = e.niveis[i];
        if (n.cheias + n.limpas + n.pCheias + n.pLimpas < L) m.semLixeira += d;
        if (n.cheias + n.pCheias > 0) m.fimColeta = t1;
      }
    }
    for (const a of sim.atores) {
      for (const s of a.segs) {
        const d = s.t1 - s.t0;
        m.porTipo[s.tipo] = (m.porTipo[s.tipo] || 0) + d;
        m.trabalho += d;
        if (s.tipo === 'viagem') { m.viagens++; m.andaresPercorridos += Math.abs(s.para - s.de); }
      }
    }
    m.semLixeira /= andares.length || 1;
    // moradores que pediram o elevador durante a operação
    const mor = sim.moradores.filter((r) => r.t <= sim.tFim);
    m.moradores = mor.length;
    m.esperaMedia = mor.length ? mor.reduce((x, r) => x + r.espera, 0) / mor.length : 0;
    m.esperaMaxima = mor.reduce((x, r) => Math.max(x, r.espera), 0);
    m.moradoresMais2min = mor.filter((r) => r.espera > 120).length;
    for (const b of bloqueios) m.maiorBloqueio = Math.max(m.maiorBloqueio, b.t1 - b.t0);
    m.bloqueios = bloqueios;
    m.lixeirasReserva = sim.lixeirasReserva || 0;
    return m;
  }

  /** Roda uma cena inteira. Devolve atores, marcos de estado e métricas (ou { erro }). */
  E.simular = function (projeto, cena, parametros) {
    try {
      const metodo = E.metodos[cena.metodo];
      if (!metodo) throw new Error('Método desconhecido: ' + cena.metodo);
      const sim = new Sim(projeto, cena, parametros);
      metodo(sim, cena.opcoes || {});
      sim.rodar();
      const pend = sim.andares.filter((i) => {
        const n = sim.final.niveis[i];
        return n.cheias + n.pCheias + n.pLimpas > 0 || n.limpas !== sim.L || !n.limpo;
      });
      if (pend.length) throw new Error('O método terminou sem concluir: ' + pend.map((i) => sim.niveis[i].nome).join(', '));
      return {
        niveis: sim.niveis, central: sim.central, p: sim.p, duracao: sim.tFim, marcos: sim.marcos, final: sim.final, elevSegs: sim.elevSegs,
        atores: sim.atores.map((a) => ({ nome: a.nome, segs: a.segs })), metricas: medir(sim),
      };
    } catch (err) {
      return { erro: err.message };
    }
  };

  function ultimoAte(lista, t, chave) {
    let a = 0, b = lista.length - 1, r = -1;
    while (a <= b) {
      const m = (a + b) >> 1;
      if (lista[m][chave] <= t) { r = m; a = m + 1; } else b = m - 1;
    }
    return r;
  }

  /** Estado em um instante t e, por pessoa, o que ela está fazendo ({ seg, f de 0 a 1 } ou null). */
  E.estadoEm = function (res, t) {
    if (t >= res.duracao) return { e: res.final, ativos: res.atores.map(() => null), elev: null };
    const e = res.marcos[Math.max(0, ultimoAte(res.marcos, t, 't'))].e;
    const ativo = (segs) => {
      const k = ultimoAte(segs, t, 't0');
      if (k < 0 || segs[k].t1 <= t) return null;
      const s = segs[k];
      return { seg: s, f: (t - s.t0) / (s.t1 - s.t0) };
    };
    return { e, ativos: res.atores.map((a) => ativo(a.segs)), elev: ativo(res.elevSegs) };
  };

  if (typeof module !== 'undefined') module.exports = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
