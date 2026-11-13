// Interface: corte do edifício em canvas, player e comparação das cenas.
(function () {
  'use strict';
  const E = window.ELEVADOR;
  const $ = (id) => document.getElementById(id);

  // ---------- biblioteca de projetos (salva no navegador) ----------
  const CHAVE = 'darosa-elevador-biblioteca';
  let lib = { atual: null, projetos: {} };
  let projeto = null;   // o projeto aberto
  let cenas = [];       // as cenas que ele compara

  function carregarLib() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      if (d && d.projetos) for (const id of Object.keys(d.projetos)) {
        try { const p = E.normalizarProjeto(d.projetos[id]); lib.projetos[p.id] = p; } catch (_) { /* ignora projeto estragado */ }
      }
      lib.atual = d && d.atual;
    } catch (_) { /* sem armazenamento ou conteúdo inválido */ }
    if (!Object.keys(lib.projetos).length) {
      const ex = E.normalizarProjeto(E.projetos[0]);
      // parâmetros ajustados na versão anterior, que só tinha o Le Notre
      try { ex.parametros = E.normalizarProjeto({ parametros: JSON.parse(localStorage.getItem('elevador.params.le-notre')) || {} }).parametros; } catch (_) { /* ignora */ }
      lib.projetos[ex.id] = ex;
    }
    if (!lib.projetos[lib.atual]) lib.atual = Object.keys(lib.projetos)[0];
  }

  function gravarLib() {
    let ok = true;
    try { localStorage.setItem(CHAVE, JSON.stringify(lib)); } catch (_) { ok = false; }
    $('salvo').textContent = ok ? 'Salvo ✓' : '⚠ Não foi possível salvar neste navegador';
    $('salvo').className = 'salvo' + (ok ? '' : ' falha');
    return ok;
  }

  /** Salvamento automático: chamado depois de qualquer alteração no projeto aberto. */
  function salvar() { projeto.atualizado = Date.now(); gravarLib(); }

  const nomes = (menosId) => Object.values(lib.projetos).filter((p) => p.id !== menosId).map((p) => p.nome);

  function adicionar(p) {
    p.id = E.novoId();
    p.nome = E.nomeUnico(p.nome, nomes());
    lib.projetos[p.id] = p;
    return p;
  }

  function abrir(id) {
    lib.atual = id;
    projeto = lib.projetos[id];
    cenas = E.cenasDoProjeto(projeto);
    st.cenaId = cenas[0].id; st.t = 0; st.tocando = false; st.res = {};
    gravarLib();
    mostrarProjeto();
  }

  function mostrarProjeto() {
    cenas = E.cenasDoProjeto(projeto);
    if (!cenas.some((c) => c.id === st.cenaId)) st.cenaId = cenas[0].id;
    if (!cenas.some((c) => c.id === projeto.cenaBase)) projeto.cenaBase = cenas[0].id;
    $('projNome').value = projeto.nome;
    $('projDesc').textContent = E.resumoEdificio(projeto);
    document.title = projeto.nome + ' · daRosa - Simulador de Elevador';
    montarCenas(); montarParams(); recalcular();
  }

  function baixar(nomeArquivo, texto) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    a.download = nomeArquivo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const arquivoDe = (nome) => (nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'projeto') + '.elevador.json';
  const exportar = (p) => baixar(arquivoDe(p.nome), E.exportarProjetos([p]));

  const st = { cenaId: null, t: 0, tocando: false, vel: 60, res: {} };

  // ---------- formatação ----------
  const fmtDur = (s) => {
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return h + ' h ' + String(m).padStart(2, '0') + ' min';
    if (m) return m + ' min' + (r ? ' ' + r + ' s' : '');
    return r + ' s';
  };
  const fmtHora = (t) => {
    const [hi, mi] = projeto.horaInicio.split(':').map(Number);
    const s = Math.floor(hi * 3600 + mi * 60 + t);
    return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':');
  };
  const NOME_ATIV = { viagem: 'Dentro do elevador', carga: 'Carregando o elevador', descarga: 'Descarregando o elevador', limpeza: 'Limpando quartos', esvaziar: 'Esvaziando e lavando', escada: 'Na escada', espera: 'Esperando o elevador', aguardar: 'Parado, aguardando', ensacar: 'Tirando sacos das lixeiras', limparLixeira: 'Limpando lixeiras', levar: 'Levando lixeiras quarto/porta' };

  // ---------- simulação ----------
  function recalcular() {
    for (const c of cenas) st.res[c.id] = E.simular(projeto, c);
    st.t = Math.min(st.t, atual().duracao || 0);
    montarComparacao();
    montarCena();
  }
  const atual = () => st.res[st.cenaId];

  // ---------- desenho ----------
  const cv = $('tela'), g = cv.getContext('2d');
  const W = 570, LIN = 32, TOPO = 14;
  const X = { rot: 52, apt: 60, quarto: 342, hall: 404, poco: 446, esc: 512, fim: 556 };
  const COR = { texto: '#1f2933', suave: '#8793a0', parede: '#c9d0d8', apto: '#e9edf2', janela: '#f9e9a8', poco: '#eceff3', cheia: '#7a5230', limpa: '#12a3a3', limpaF: '#d5f3f3', travado: '#d9480f', livre: '#2f9e44', func: '#1c6fd1', sujo: '#f5ecdb', limpo: '#dff3e4', morador: '#98a2ad', saco: '#3d4248' };
  const CORES_ATOR = ['#1c6fd1', '#9c36b5', '#343a40', '#c2255c'];
  let niveisN = 0;

  function ajustarCanvas() {
    niveisN = atual().niveis ? atual().niveis.length : E.criarNiveis(projeto.edificio).length;
    const H = TOPO + niveisN * LIN + 26, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.aspectRatio = W + ' / ' + H;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const yDe = (i) => TOPO + (niveisN - 1 - i) * LIN;
  const suave = (f) => f * f * (3 - 2 * f);

  function lixeira(x, y, tipo, tam) {
    g.lineWidth = 1.5;
    if (tipo === 'saco') { // saco de lixo: bolinha escura com o nó em cima
      g.fillStyle = COR.saco; g.strokeStyle = COR.saco;
      g.beginPath(); g.arc(x + tam / 2, y + tam / 2 + 1, tam / 2 - .5, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x + tam / 2 - 2, y); g.lineTo(x + tam / 2, y + 2.5); g.lineTo(x + tam / 2 + 2, y); g.stroke();
      return;
    }
    if (tipo === 'cheias') { g.fillStyle = COR.cheia; g.strokeStyle = COR.cheia; }
    else if (tipo === 'limpas') { g.fillStyle = COR.limpaF; g.strokeStyle = COR.limpa; }
    else if (tipo === 'sujas') { g.fillStyle = '#fff'; g.strokeStyle = COR.cheia; }
    else { g.fillStyle = 'transparent'; g.strokeStyle = COR.parede; g.setLineDash([2, 2]); }
    g.fillRect(x, y, tam, tam); g.strokeRect(x + .5, y + .5, tam - 1, tam - 1); g.setLineDash([]);
  }

  function boneco(x, yPe, cor) {
    g.strokeStyle = cor; g.fillStyle = cor; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.arc(x, yPe - 19, 4, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x, yPe - 14); g.lineTo(x, yPe - 6); g.moveTo(x, yPe - 6); g.lineTo(x - 3, yPe); g.moveTo(x, yPe - 6); g.lineTo(x + 3, yPe);
    g.moveTo(x - 4, yPe - 10); g.lineTo(x + 4, yPe - 10); g.stroke(); g.lineCap = 'butt';
  }

  function desenhar() {
    const res = atual();
    g.clearRect(0, 0, W, cv.height);
    if (res.erro) { g.fillStyle = COR.travado; g.font = '14px Segoe UI'; g.fillText(res.erro, 10, 30); return; }
    const { e, ativos, elev } = E.estadoEm(res, st.t), ed = projeto.edificio, p = res.p;
    const base = yDe(-1);

    // poço e contorno
    g.fillStyle = COR.poco; g.fillRect(X.poco, TOPO, X.esc - X.poco - 4, base - TOPO);
    g.strokeStyle = COR.parede; g.lineWidth = 1; g.strokeRect(X.apt - 4.5, TOPO - .5, X.fim - X.apt + 9, base - TOPO + 1);

    res.niveis.forEach((nv, i) => {
      const y = yDe(i), est = e.niveis[i];
      g.fillStyle = COR.suave; g.font = '12px Segoe UI'; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(nv.tipo === 'andar' ? nv.id + 'º' : nv.id, X.rot, y + LIN / 2);
      g.strokeStyle = COR.parede; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X.apt - 4, y + LIN + .5); g.lineTo(X.poco, y + LIN + .5); g.moveTo(X.esc - 4, y + LIN + .5); g.lineTo(X.fim + 4, y + LIN + .5); g.stroke();
      // escada
      g.beginPath(); g.moveTo(X.esc + 2, y + LIN - 2); g.lineTo(X.fim - 2, y + LIN / 2); g.lineTo(X.esc + 2, y + 2); g.strokeStyle = '#d5dae0'; g.stroke();

      const larg = X.quarto - 8 - X.apt;
      if (i === res.central) {
        g.fillStyle = '#eef1f4'; g.fillRect(X.apt, y + 3, X.hall - 6 - X.apt, LIN - 6);
        const itens = [].concat(Array(est.cheias).fill('cheias'), Array(est.limpas).fill('limpas'), Array(est.sacos).fill('saco'));
        const porLinha = Math.max(1, Math.ceil(itens.length / 2)), tam = Math.max(5, Math.min(10, Math.floor((X.hall - 20 - X.apt) / porLinha) - 2));
        itens.forEach((tp, k) => lixeira(X.apt + 6 + (k % porLinha) * (tam + 2), y + 4 + Math.floor(k / porLinha) * (tam + 2), tp, tam));
      } else if (nv.tipo === 'andar') {
        const n = ed.aptosPorAndar, la = (larg - (n - 1) * 6) / n;
        for (let a = 0; a < n; a++) {
          const x = X.apt + a * (la + 6);
          g.fillStyle = COR.apto; g.fillRect(x, y + 3, la, LIN - 6);
          g.fillStyle = COR.janela;
          if (la >= 44) { g.fillRect(x + la * .2, y + 9, 12, 11); g.fillRect(x + la * .8 - 12, y + 9, 12, 11); }
          else g.fillRect(x + la / 2 - Math.min(6, la / 4), y + 9, Math.min(12, la / 2), 11);
        }
        // quarto de lixo
        g.fillStyle = est.limpo ? COR.limpo : COR.sujo; g.fillRect(X.quarto, y + 3, X.hall - 6 - X.quarto, LIN - 6);
        const itens = [].concat(Array(est.cheias).fill('cheias'), Array(est.sujas).fill('sujas'), Array(est.limpas).fill('limpas'));
        while (itens.length < ed.lixeirasPorAndar) itens.push('vazio');
        for (let k = 0; k < est.sacos; k++) itens.push('saco');
        const tam = Math.min(12, Math.floor((X.hall - 12 - X.quarto) / itens.length) - 2);
        itens.forEach((tp, k) => lixeira(X.quarto + 4 + k * (tam + 3), y + LIN - 6 - tam, tp, tam));
      } else {
        g.fillStyle = '#f1f3f5'; g.fillRect(X.apt, y + 3, larg, LIN - 6);
        g.fillStyle = COR.suave; g.textAlign = 'left'; g.fillText(nv.tipo === 'terreo' ? 'Hall de entrada' : 'Garagem', X.apt + 8, y + LIN / 2);
      }
      const naPorta = [].concat(Array(est.pCheias).fill('cheias'), Array(est.pLimpas).fill('limpas'));
      const tb = naPorta.length > 4 ? 6 : 8, porLin = naPorta.length > 4 ? 6 : 4;
      naPorta.forEach((t, k) => lixeira(X.poco - 3 - tb - (k % porLin) * (tb + 1), y + LIN - 4 - tb - Math.floor(k / porLin) * (tb + 1), t, tb));
    });
    g.fillStyle = COR.suave; g.font = '12px Segoe UI'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(res.niveis[res.central].nome + ': casa de lixo central', X.apt, base + 8);
    g.textAlign = 'center'; g.fillText('elevador', (X.poco + X.esc - 4) / 2, base + 8); g.fillText('escada', (X.esc + X.fim) / 2, base + 8);

    // posição do elevador
    let pe = e.elev.nivel;
    for (const at of ativos.concat([elev])) {
      if (!at || !(at.seg.tipo === 'viagem' || at.seg.mov)) continue;
      const seg = at.seg, ab = p.tPorta / (seg.t1 - seg.t0);
      pe = seg.de + (seg.para - seg.de) * suave(Math.min(1, Math.max(0, (at.f - ab) / (1 - 2 * ab))));
    }
    const yc = yDe(pe) + 3, xc = X.poco + 3, lc = X.esc - X.poco - 10, ac = LIN - 6;
    g.fillStyle = '#fff'; g.fillRect(xc, yc, lc, ac);
    g.strokeStyle = e.elev.travado ? COR.travado : COR.livre; g.lineWidth = 2.5; g.strokeRect(xc, yc, lc, ac);
    const dentro = [].concat(Array(e.elev.cheias).fill('cheias'), Array(e.elev.limpas).fill('limpas'), Array(e.elev.sacos).fill('saco'));
    const cols = e.elev.sacos ? Math.max(3, Math.ceil(p.capacidadeSacos / 3)) : Math.max(3, Math.ceil(p.capacidadeElevador / 2));
    const tam = e.elev.sacos ? Math.max(4, Math.min(7, Math.floor(38 / cols) - 2)) : Math.min(9, Math.floor(32 / cols) - 1);
    dentro.forEach((tp, k) => lixeira(xc + 4 + (k % cols) * (tam + 2), yc + ac - 4 - tam - Math.floor(k / cols) * (tam + 2), tp, tam));

    // moradores
    if (e.elev.morador) boneco(xc + 12, yc + ac - 1, COR.morador);
    const esperando = {};
    for (const nv of e.espera) {
      const k = (esperando[nv] = (esperando[nv] || 0) + 1);
      if (k <= 4) boneco(X.hall + 1 + k * 7, yDe(nv) + LIN - 4, COR.morador);
    }

    // pessoas
    e.atores.forEach((fu, i) => {
      const at = ativos[i], seg = at && at.seg, f = at ? at.f : 0;
      const xQuarto = fu.nivel === res.central ? X.hall - 22 - i * 9 : X.quarto + 30, xCarro = xc + lc - 9 - i * 9;
      const xPorta = X.poco - 10, xOrigem = (s) => (s.porta ? xPorta : xQuarto);
      let xf = X.hall + 26 - i * 10, nf = fu.nivel, leva = null;
      if (fu.onde === 'elevador') { xf = xCarro; nf = pe; }
      if (seg) {
        if (seg.tipo === 'carga') { xf = xOrigem(seg) + (xCarro - 14 - xOrigem(seg)) * f; leva = seg.binTipo; }
        else if (seg.tipo === 'descarga') { xf = xCarro - 14 + (xOrigem(seg) - xCarro + 14) * f; leva = seg.binTipo; }
        else if (seg.tipo === 'levar') { const k = seg.destino === 'porta' ? f : 1 - f; xf = xQuarto + (xPorta - xQuarto) * k; leva = seg.binTipo; }
        else if (seg.tipo === 'ensacar') { xf = xQuarto - 8 + i * 14 + Math.sin(st.t / 4) * 3; leva = 'saco'; }
        else if (seg.tipo === 'limparLixeira') xf = xQuarto - 8 + i * 14 + Math.sin(st.t / 3) * 3;
        else if (seg.tipo === 'limpeza') xf = X.quarto + 30 + Math.sin(st.t / 4) * 12;
        else if (seg.tipo === 'esvaziar') { xf = xQuarto + Math.sin(st.t / 4) * 5; leva = f < .5 ? 'cheias' : 'limpas'; }
        else if (seg.tipo === 'escada') { xf = (X.esc + X.fim) / 2; nf = seg.de + (seg.para - seg.de) * f; }
      }
      const yPe = yDe(nf) + LIN - 4;
      if (leva) lixeira(xf + 6, yPe - 9, leva, 9);
      boneco(xf, yPe, CORES_ATOR[i % CORES_ATOR.length]);
    });
  }

  // ---------- painéis ----------
  function gantt(el, res, escala) {
    el.innerHTML = '';
    if (res.erro) return;
    el.style.width = (100 * res.duracao / escala) + '%';
    for (const b of res.metricas.bloqueios) {
      const s = document.createElement('span');
      s.style.left = (100 * b.t0 / res.duracao) + '%'; s.style.width = (100 * (b.t1 - b.t0) / res.duracao) + '%';
      el.appendChild(s);
    }
  }

  function montarCenas() {
    $('cenas').innerHTML = '';
    for (const c of cenas) {
      const linha = document.createElement('div'), b = document.createElement('button'), base = document.createElement('button');
      const ehBase = c.id === projeto.cenaBase;
      linha.className = 'cenaLinha';
      b.className = 'cena'; b.setAttribute('aria-pressed', c.id === st.cenaId);
      b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = c.nome; b.lastChild.textContent = c.descricao;
      b.onclick = () => escolher(c.id);
      base.className = 'base'; base.setAttribute('aria-pressed', ehBase);
      base.textContent = ehBase ? '★ Linha base' : '☆ Usar como base';
      base.title = ehBase ? 'As outras cenas são comparadas com esta' : 'Comparar as outras cenas com esta';
      base.onclick = () => { if (ehBase) return; projeto.cenaBase = c.id; salvar(); montarCenas(); montarComparacao(); };
      linha.append(b, base);
      $('cenas').appendChild(linha);
    }
  }

  function escolher(id) {
    st.cenaId = id; st.t = 0; st.tocando = false;
    montarCenas(); montarComparacao(); montarCena();
  }

  function delta(v, base, ehBase) {
    if (ehBase) return '';
    if (!base) return v ? '<small>—</small>' : '<small>igual</small>';
    const d = Math.round(100 * (v - base) / base);
    if (!d) return '<small>igual</small>';
    return '<small class="' + (d < 0 ? 'bom' : 'ruim') + '">' + (d > 0 ? '+' : '−') + Math.abs(d) + '%</small>';
  }

  // balão de ajuda das colunas: fica fora da tabela para não ser cortado pela rolagem
  function mostrarAjuda(botao, titulo, texto) {
    const el = $('balao'), r = botao.getBoundingClientRect();
    el.innerHTML = '<b></b><span></span><em>A porcentagem embaixo de cada valor compara com a linha base: verde é menor, vermelho é maior.</em>';
    el.firstChild.textContent = titulo; el.children[1].textContent = texto;
    el.hidden = false;
    const larg = el.offsetWidth, alt = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(window.innerWidth - larg - 8, r.left + r.width / 2 - larg / 2)) + 'px';
    el.style.top = (r.top - alt - 8 >= 8 ? r.top - alt - 8 : r.bottom + 8) + 'px';
  }
  function esconderAjuda() { $('balao').hidden = true; }
  document.addEventListener('click', esconderAjuda);
  window.addEventListener('scroll', esconderAjuda, true);

  function montarComparacao() {
    const cols = [
      ['Duração total', (m) => m.duracao, fmtDur,
        'Tempo do início do recolhimento até a última pessoa terminar a sua parte.'],
      ['Elevador travado', (m) => m.travado, fmtDur,
        'Soma de todo o tempo em que o elevador fica reservado para o recolhimento e não atende os moradores.'],
      ['Maior bloqueio seguido', (m) => m.maiorBloqueio, fmtDur,
        'O maior período contínuo com o elevador travado. É o pior caso para um morador que chega logo no começo do bloqueio.'],
      ['Pessoas', (m) => m.pessoas, String,
        'Quantos funcionários a cena usa.'],
      ['Trabalho somado', (m) => m.trabalho, fmtDur,
        'Soma do tempo de todas as pessoas, do começo até cada uma terminar, incluindo as esperas. Duas pessoas ocupadas por 1 hora somam 2 horas. Mostra o custo de mão de obra.'],
      ['Lixo fora dos andares em', (m) => m.fimColeta, fmtDur,
        'Tempo, desde o início, até o último andar ficar sem lixo (lixeira cheia ou saco). A partir daí só falta limpar, lavar ou devolver lixeiras.'],
      ['Andar sem lixeira (média)', (m) => m.semLixeira, fmtDur,
        'Tempo médio em que um andar fica com menos lixeiras do que o normal, porque elas desceram. Nesse período o morador não tem onde deixar o lixo.'],
      ['Espera média dos moradores', (m) => m.esperaMedia, fmtDur,
        'Tempo médio entre o morador chamar o elevador e o elevador chegar, contando os moradores sorteados que chamaram durante a operação. Depende do parâmetro “Uso pelos moradores”.'],
      ['Maior espera de um morador', (m) => m.esperaMaxima, fmtDur,
        'A espera do morador que mais esperou pelo elevador durante a operação. Varia bastante de um sorteio para outro (parâmetro “semente”).'],
      ['Moradores que esperaram mais de 2 min', (m) => m.moradoresMais2min, (v, m) => v + ' de ' + m.moradores,
        'Quantos moradores esperaram o elevador por mais de 2 minutos, do total que chamou durante a operação. Cenas mais longas recebem mais moradores.'],
    ];
    const base = (st.res[projeto.cenaBase] || {}).metricas;
    let h = '<thead><tr><th>Cena</th>' + cols.map((c, k) => '<th>' + c[0] + ' <button class="ajuda" data-k="' + k + '" aria-label="O que é ' + c[0] + '?">?</button></th>').join('') + '</tr></thead><tbody>';
    const escala = Math.max(...cenas.map((c) => st.res[c.id].duracao || 0));
    $('linhas').innerHTML = '';
    cenas.forEach((c, i) => {
      const r = st.res[c.id];
      h += '<tr data-id="' + c.id + '" class="' + (c.id === st.cenaId ? 'sel' : '') + '"><td>' + c.nome + (c.id === projeto.cenaBase ? '<small class="selobase">★ linha base</small>' : '') + '</td>';
      if (r.erro) h += '<td colspan="' + cols.length + '" class="erro" style="text-align:left">' + r.erro + '</td>';
      else {
        for (const col of cols) h += '<td>' + col[2](col[1](r.metricas), r.metricas) + (base ? delta(col[1](r.metricas), col[1](base), c.id === projeto.cenaBase) : '') + '</td>';
        const rot = document.createElement('div'); rot.className = 'rot';
        rot.textContent = c.nome + ' · travado ' + Math.round(100 * r.metricas.travado / r.duracao) + '% do tempo' + (r.metricas.lixeirasReserva ? ' · exige ' + r.metricas.lixeirasReserva + ' lixeiras reserva' : '');
        const gt = document.createElement('div'); gt.className = 'gantt';
        $('linhas').append(rot, gt); gantt(gt, r, escala);
      }
      h += '</tr>';
    });
    $('tabela').innerHTML = h + '</tbody>';
    const cb = cenas.find((c) => c.id === projeto.cenaBase);
    $('dicaBase').textContent = 'As porcentagens comparam cada cena com a linha base: ' + (cb ? cb.nome : '—') + '. Para trocar, use “☆ Usar como base” na lista de cenas.';
    $('tabela').querySelectorAll('.ajuda').forEach((b) => {
      const c = cols[b.dataset.k];
      const abrir = () => mostrarAjuda(b, c[0], c[3]);
      b.onmouseenter = abrir; b.onfocus = abrir;
      b.onmouseleave = b.onblur = esconderAjuda;
      b.onclick = (ev) => { ev.stopPropagation(); if ($('balao').hidden) abrir(); else esconderAjuda(); };
    });
    $('tabela').querySelectorAll('tbody tr').forEach((tr) => { tr.onclick = () => escolher(tr.dataset.id); });
  }

  function montarCena() {
    const r = atual();
    ajustarCanvas();
    $('tempo').max = Math.ceil(r.duracao || 0);
    gantt($('ganttCena'), r, r.duracao || 1);
    const cur = document.createElement('em'); cur.id = 'cursor'; $('ganttCena').appendChild(cur);
    $('ativ').innerHTML = r.erro ? '' : Object.keys(NOME_ATIV).filter((k) => r.metricas.porTipo[k])
      .map((k) => '<li><span>' + NOME_ATIV[k] + '</span><b>' + fmtDur(r.metricas.porTipo[k]) + '</b></li>').join('');
    atualizar();
  }

  function atualizar() {
    const r = atual();
    desenhar();
    if (r.erro) { $('acao').textContent = r.erro; return; }
    const { e, ativos, elev } = E.estadoEm(r, st.t);
    $('relogio').textContent = fmtHora(st.t);
    $('tempo').value = st.t;
    $('cursor').style.left = (100 * st.t / r.duracao) + '%';
    $('selo').className = 'selo ' + (e.elev.travado ? 'travado' : 'livre');
    $('selo').textContent = e.elev.travado ? 'Elevador travado' : 'Elevador livre';
    const fim = st.t >= r.duracao;
    $('acao').innerHTML = '';
    r.atores.forEach((a, i) => {
      const li = document.createElement('li'), seg = ativos[i] && ativos[i].seg;
      li.innerHTML = '<i></i><b></b><span></span>';
      li.firstChild.style.background = CORES_ATOR[i % CORES_ATOR.length];
      li.children[1].textContent = a.nome;
      li.lastChild.textContent = seg ? (seg.fase ? seg.fase + ' · ' : '') + seg.texto : fim ? 'Concluído' : 'Terminou a sua parte';
      $('acao').appendChild(li);
    });
    if (r.p.usoMoradores > 0) {
      const li = document.createElement('li');
      li.innerHTML = '<i></i><b>Moradores</b><span></span>';
      li.firstChild.style.background = COR.morador;
      const n = e.espera.length;
      li.lastChild.textContent = (n ? n + ' esperando o elevador' : 'ninguém esperando') + (elev ? ' · ' + elev.seg.texto : '');
      $('acao').appendChild(li);
    }
    $('fase').textContent = (fim ? 'Recolhimento concluído · ' : '') + 'decorrido ' + fmtDur(st.t) + ' de ' + fmtDur(r.duracao);
    $('btTocar').textContent = st.tocando ? '❚❚ Pausar' : st.t > 0 && st.t < r.duracao ? '▶ Continuar' : '▶ Iniciar';
  }

  function montarParams() {
    const pad = E.parametrosPadrao();
    $('params').innerHTML = '';
    for (const d of E.PARAMETROS) {
      const l = document.createElement('label');
      l.innerHTML = '<span></span><span style="display:flex;align-items:center;gap:6px"><input type="number" min="0"><span class="un"></span></span>';
      l.firstChild.textContent = d.rotulo; l.querySelector('.un').textContent = d.un;
      const inp = l.querySelector('input');
      inp.step = d.passo; inp.value = projeto.parametros[d.id] != null ? projeto.parametros[d.id] : pad[d.id];
      inp.onchange = () => {
        const v = parseFloat(inp.value);
        if (!(v > 0 || (d.zero && v === 0))) { inp.value = pad[d.id]; delete projeto.parametros[d.id]; } else projeto.parametros[d.id] = v;
        salvar();
        recalcular();
      };
      $('params').appendChild(l);
    }
  }

  // ---------- controles ----------
  $('btTocar').onclick = () => {
    if (atual().erro) return;
    if (st.t >= atual().duracao) st.t = 0;
    st.tocando = !st.tocando; atualizar();
  };
  $('btReiniciar').onclick = () => { st.t = 0; st.tocando = false; atualizar(); };
  $('selVel').onchange = (ev) => { st.vel = Number(ev.target.value); };
  $('tempo').oninput = (ev) => { st.t = Number(ev.target.value); atualizar(); };
  $('btPadrao').onclick = () => {
    projeto.parametros = {};
    salvar();
    montarParams(); recalcular();
  };

  let ultimo = 0;
  function quadro(agora) {
    const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
    if (st.tocando) {
      st.t += dt * st.vel;
      if (st.t >= atual().duracao) { st.t = atual().duracao; st.tocando = false; }
      atualizar();
    }
    requestAnimationFrame(quadro);
  }

  // ---------- projetos: barra, lista e configuração ----------
  $('projNome').onchange = () => {
    const nome = $('projNome').value.trim();
    if (nome) { projeto.nome = E.nomeUnico(nome.slice(0, 80), nomes(projeto.id)); salvar(); }
    $('projNome').value = projeto.nome;
    document.title = projeto.nome + ' · daRosa - Simulador de Elevador';
  };
  $('btExportar').onclick = () => exportar(projeto);

  function montarLista() {
    const el = $('libLista');
    el.innerHTML = '';
    const lista = Object.values(lib.projetos).sort((a, b) => b.atualizado - a.atualizado);
    for (const p of lista) {
      const d = document.createElement('div');
      if (p.id === projeto.id) d.className = 'atual';
      d.innerHTML = '<div class="info"><b></b><span></span></div>';
      d.querySelector('b').textContent = p.nome;
      d.querySelector('span').textContent = p.edificio.andares + ' andares · ' + p.edificio.aptosPorAndar + ' aptos por andar · alterado em ' +
        new Date(p.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const botao = (texto, fn) => { const b = document.createElement('button'); b.textContent = texto; b.onclick = fn; d.appendChild(b); };
      botao(p.id === projeto.id ? 'Aberto' : 'Abrir', () => { abrir(p.id); $('dlgLib').close(); });
      botao('Duplicar', () => { adicionar(E.normalizarProjeto(Object.assign({}, p, { nome: p.nome + ' (cópia)', atualizado: Date.now() }))); gravarLib(); montarLista(); });
      botao('Exportar', () => exportar(p));
      botao('Excluir', () => {
        if (!confirm('Excluir o projeto “' + p.nome + '”? Isso não pode ser desfeito.')) return;
        delete lib.projetos[p.id];
        if (!Object.keys(lib.projetos).length) adicionar(E.novoProjeto('Novo projeto'));
        if (p.id === projeto.id) abrir(Object.keys(lib.projetos)[0]); else gravarLib();
        montarLista();
      });
      el.appendChild(d);
    }
  }
  $('btLib').onclick = () => { montarLista(); $('dlgLib').showModal(); };
  $('libFechar').onclick = () => $('dlgLib').close();
  $('libNovo').onclick = () => {
    const p = adicionar(E.novoProjeto('Novo projeto'));
    abrir(p.id);
    $('dlgLib').close();
    abrirConfig();
  };
  $('libBackup').onclick = () => baixar('backup-projetos.elevador.json', E.exportarProjetos(Object.values(lib.projetos)));
  $('libImportar').onclick = () => $('libArquivo').click();
  $('libArquivo').onchange = async (ev) => {
    const arq = ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    try {
      const novos = E.importarProjetos(await arq.text()).map(adicionar);
      abrir(novos[0].id);
      montarLista();
      if (novos.length > 1) alert(novos.length + ' projetos importados.');
    } catch (err) { alert(err.message); }
  };

  // lê o formulário de configuração como um edifício (ainda não validado)
  const edDoForm = () => ({
    andares: $('cAndares').value, aptosPorAndar: $('cAptos').value, lixeirasPorAndar: $('cLixeiras').value, litrosPorLixeira: $('cLitros').value,
    subsolos: $('cSubsolos').value, terreo: $('cTerreo').checked, central: $('cCentral').value,
  });
  function opcoesCasaDeLixo(escolhida) {
    const ed = E.normalizarProjeto({ edificio: Object.assign(edDoForm(), { central: escolhida }) }).edificio;
    $('cTerreo').checked = ed.terreo;
    $('cCentral').innerHTML = '';
    for (const n of E.niveisDaCasaDeLixo(ed)) {
      const o = document.createElement('option'); o.value = n.id; o.textContent = n.nome; o.selected = n.id === ed.central;
      $('cCentral').appendChild(o);
    }
  }
  function abrirConfig() {
    const ed = projeto.edificio;
    $('cNome').value = projeto.nome; $('cHora').value = projeto.horaInicio.padStart(5, '0');
    $('cAndares').value = ed.andares; $('cAptos').value = ed.aptosPorAndar; $('cLixeiras').value = ed.lixeirasPorAndar; $('cLitros').value = ed.litrosPorLixeira;
    $('cSubsolos').value = ed.subsolos; $('cTerreo').checked = ed.terreo;
    opcoesCasaDeLixo(ed.central);
    $('cCenas').innerHTML = '';
    for (const c of E.cenasPadrao) {
      const l = document.createElement('label');
      l.innerHTML = '<input type="checkbox"> <span></span>';
      l.firstChild.value = c.id; l.firstChild.checked = !projeto.cenasOcultas.includes(c.id);
      l.lastChild.textContent = c.nome;
      $('cCenas').appendChild(l);
    }
    $('dlgCfg').showModal();
    $('cNome').select();
  }
  $('btCfg').onclick = abrirConfig;
  $('cSubsolos').onchange = $('cTerreo').onchange = () => opcoesCasaDeLixo($('cCentral').value);
  $('cfgFechar').onclick = $('cfgCancelar').onclick = () => $('dlgCfg').close();
  $('cfgForm').onsubmit = () => {
    const novo = E.normalizarProjeto({
      id: projeto.id, parametros: projeto.parametros, cenaBase: projeto.cenaBase,
      nome: E.nomeUnico($('cNome').value.trim() || projeto.nome, nomes(projeto.id)), horaInicio: $('cHora').value,
      edificio: edDoForm(),
      cenasOcultas: [...$('cCenas').querySelectorAll('input')].filter((i) => !i.checked).map((i) => i.value),
    });
    lib.projetos[projeto.id] = projeto = novo;
    st.t = 0; st.tocando = false; st.res = {};
    salvar();
    mostrarProjeto();
  };

  carregarLib();
  abrir(lib.atual);
  requestAnimationFrame(quadro);
})();
