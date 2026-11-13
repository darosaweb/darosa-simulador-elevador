// Projetos: criar, validar, exportar e importar. Sem DOM (testável no Node).
// Um projeto é só dados (JSON): nome, edifício, parâmetros e quais cenas ficam de fora.
(function (root) {
  'use strict';
  const E = (root.ELEVADOR = root.ELEVADOR || {});
  const TIPO = 'darosa-elevador';

  const inteiro = (v, min, max, padrao) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };

  E.novoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  E.novoProjeto = function (nome) {
    return E.normalizarProjeto({ nome: nome || 'Novo projeto' });
  };

  /** Devolve uma cópia válida do projeto: preenche o que falta e corrige o que está fora dos limites. */
  E.normalizarProjeto = function (p) {
    if (!p || typeof p !== 'object') throw new Error('Projeto inválido');
    const e = p.edificio || {};
    const ed = {
      andares: inteiro(e.andares, 1, 60, 10),
      aptosPorAndar: inteiro(e.aptosPorAndar, 1, 12, 4),
      lixeirasPorAndar: inteiro(e.lixeirasPorAndar, 1, 6, 2),
      litrosPorLixeira: inteiro(e.litrosPorLixeira, 1, 2000, 100),
      subsolos: inteiro(e.subsolos, 0, 3, 1),
      terreo: e.terreo !== false,
      central: String(e.central || ''),
    };
    if (!ed.subsolos) ed.terreo = true; // a casa de lixo precisa de um nível fora dos andares
    const possiveis = E.niveisDaCasaDeLixo(ed);
    if (!possiveis.some((n) => n.id === ed.central)) ed.central = possiveis[0].id;

    const parametros = {};
    for (const d of E.PARAMETROS) {
      const v = Number((p.parametros || {})[d.id]);
      if (Number.isFinite(v) && (v > 0 || (d.zero && v === 0))) parametros[d.id] = v;
    }
    const ids = E.cenasPadrao.map((c) => c.id);
    let ocultas = (Array.isArray(p.cenasOcultas) ? p.cenasOcultas : []).filter((id) => ids.includes(id));
    if (ocultas.length >= ids.length) ocultas = [];
    return {
      id: typeof p.id === 'string' && p.id ? p.id : E.novoId(),
      nome: String(p.nome || 'Projeto sem nome').trim().slice(0, 80) || 'Projeto sem nome',
      horaInicio: /^\d{1,2}:\d{2}$/.test(p.horaInicio || '') ? p.horaInicio : '08:00',
      edificio: ed,
      parametros,
      cenasOcultas: ocultas,
      atualizado: Number(p.atualizado) || Date.now(),
    };
  };

  /** Níveis onde a casa de lixo pode ficar (subsolos e térreo). */
  E.niveisDaCasaDeLixo = (ed) => E.criarNiveis(ed).filter((n) => n.tipo !== 'andar');

  /** Cenas que o projeto compara. A primeira é a base das porcentagens. */
  E.cenasDoProjeto = (p) => E.cenasPadrao.filter((c) => !(p.cenasOcultas || []).includes(c.id));

  E.resumoEdificio = function (p) {
    const ed = p.edificio, s = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
    const casa = E.criarNiveis(ed).find((n) => n.id === ed.central);
    return s(ed.andares, 'andar', 'andares') + ', ' + s(ed.aptosPorAndar, 'apartamento', 'apartamentos') + ' por andar, um elevador de serviço. ' +
      'Cada andar tem um quarto de lixo com ' + s(ed.lixeirasPorAndar, 'lixeira', 'lixeiras') + ' de ' + ed.litrosPorLixeira + ' L. ' +
      'A casa de lixo fica no ' + casa.nome.toLowerCase() + '.';
  };

  /** Conteúdo do arquivo .json de exportação (um projeto) ou de backup (vários). */
  E.exportarProjetos = (lista) => JSON.stringify({ tipo: TIPO, versao: 1, projetos: lista }, null, 2);

  /** Lê um arquivo exportado e devolve os projetos válidos, com ids novos. */
  E.importarProjetos = function (texto) {
    let dados;
    try { dados = JSON.parse(texto); } catch (_) { throw new Error('O arquivo não é um JSON válido.'); }
    const lista = dados && Array.isArray(dados.projetos) ? dados.projetos : dados && dados.edificio ? [dados] : [];
    const bons = lista.filter((p) => p && typeof p === 'object' && p.edificio && typeof p.edificio === 'object')
      .map((p) => E.normalizarProjeto(Object.assign({}, p, { id: null, atualizado: Date.now() })));
    if (!bons.length) throw new Error('Não encontrei nenhum projeto do Simulador de Elevador nesse arquivo.');
    return bons;
  };

  /** Nome que ainda não existe na lista: "Nome", "Nome (2)", "Nome (3)"... */
  E.nomeUnico = function (nome, existentes) {
    const usados = new Set(existentes);
    if (!usados.has(nome)) return nome;
    let i = 2;
    while (usados.has(nome + ' (' + i + ')')) i++;
    return nome + ' (' + i + ')';
  };

  if (typeof module !== 'undefined') module.exports = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
