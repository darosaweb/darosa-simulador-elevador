// Métodos de recolhimento. Cada método cria as pessoas (s.ator) e dá a cada uma
// o seu roteiro, na sequência em que ela executa. Ordens: ver a classe Ator em src/motor.js
// (chamar, viajar, carregar, descarregar, limpar, esvaziar, escada, aguardar levam "yield*";
//  travar, liberar e fase são instantâneas).
(function (root) {
  'use strict';
  const E = (root.ELEVADOR = root.ELEVADOR || {});
  const M = (E.metodos = E.metodos || {});

  // Coleta do método atual: elevador travado, de cima para baixo, enchendo o elevador.
  function* coletar(s, f) {
    f.fase('Coleta');
    yield* f.chamar();
    f.travar();
    for (const g of s.grupos()) {
      for (const a of g) { yield* f.viajar(a); yield* f.carregar(s.L, 'cheias'); }
      yield* f.viajar(s.central);
      yield* f.descarregar(g.length * s.L, 'cheias');
    }
    f.liberar();
  }

  function* esvaziarTudo(s, f) {
    f.fase('Casa de lixo');
    yield* f.esvaziar(s.e.niveis[s.central].cheias);
  }

  // MÉTODO ATUAL
  // 1. Trava o elevador e recolhe tudo, três andares por viagem, até o subsolo.
  // 2. Libera o elevador; esvazia e lava as lixeiras.
  // 3. Volta com o elevador travado: em cada andar limpa o quarto e deixa as lixeiras.
  M.atual = function (s) {
    s.ator('Funcionário', function* (f) {
      yield* coletar(s, f);
      yield* esvaziarTudo(s, f);
      f.fase('Devolução e limpeza');
      yield* f.chamar();
      f.travar();
      for (const g of s.grupos()) {
        yield* f.carregar(g.length * s.L, 'limpas');
        for (const a of g) { yield* f.viajar(a); yield* f.limpar(); yield* f.descarregar(s.L, 'limpas'); }
        yield* f.viajar(s.central);
      }
      f.liberar();
    });
  };

  // TROCA DIRETA
  // Um jogo reserva de lixeiras limpas (um elevador cheio) sobe; em cada andar troca
  // as cheias pelas limpas e já limpa o quarto. Uma passada só. O elevador fica livre
  // enquanto as lixeiras são esvaziadas no subsolo entre uma rodada e outra.
  M.trocaDireta = function (s) {
    const gs = s.grupos();
    s.reserva(gs[0].length * s.L);
    s.ator('Funcionário', function* (f) {
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i], n = g.length * s.L;
        f.fase('Rodada ' + (i + 1) + ' de ' + gs.length);
        yield* f.chamar();
        f.travar();
        yield* f.carregar(n, 'limpas');
        for (const a of g) {
          yield* f.viajar(a);
          yield* f.descarregar(s.L, 'limpas');
          yield* f.carregar(s.L, 'cheias');
          yield* f.limpar();
        }
        yield* f.viajar(s.central);
        yield* f.descarregar(n, 'cheias');
        f.liberar();
        yield* f.esvaziar(n);
      }
    });
  };

  // TROCA DIRETA EM EQUIPE (3 pessoas)
  // Limpeza: sobe de carona na primeira viagem e limpa os quartos descendo pela escada.
  // Transporte: a cada rodada sobe com lixeiras limpas, troca pelas cheias e desce.
  // Casa de lixo: esvazia e lava as cheias que chegam, preparando a rodada seguinte.
  // A reserva padrão são dois elevadores cheios: assim as limpas da rodada seguinte já
  // estão prontas quando o elevador chega com as cheias. Com menos que isso o transporte
  // precisa esperar a lavagem (e libera o elevador enquanto espera).
  // opcoes.reserva = lixeiras limpas extras no início.
  M.trocaDiretaEquipe = function (s, op) {
    const gs = s.grupos(), topo = gs[0][0], casa = s.e.niveis[s.central];
    s.reserva(op.reserva || 2 * gs[0].length * s.L);

    const limpeza = s.ator('Limpeza', function* (f) {
      f.fase('Limpeza dos quartos');
      yield* f.aguardar(() => f.nivel === topo, 'Subindo de carona até o ' + s.niveis[topo].nome);
      for (const a of s.andares.slice().reverse()) { yield* f.escada(a); yield* f.limpar(); }
    });

    s.ator('Transporte', function* (f) {
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i], n = g.length * s.L;
        f.fase('Rodada ' + (i + 1) + ' de ' + gs.length);
        if (casa.limpas < n) {
          if (s.e.elev.travado) f.liberar();
          yield* f.aguardar(() => casa.limpas >= n, 'Aguardando lixeiras limpas');
        }
        yield* f.chamar();
        f.travar();
        yield* f.carregar(n, 'limpas');
        for (const a of g) {
          yield* f.viajar(a, i === 0 && a === topo ? [limpeza] : []);
          yield* f.descarregar(s.L, 'limpas');
          yield* f.carregar(s.L, 'cheias');
        }
        yield* f.viajar(s.central);
        yield* f.descarregar(n, 'cheias');
      }
      f.liberar();
    });

    s.ator('Casa de lixo', function* (f) {
      f.fase('Triagem e lavagem');
      for (let k = s.andares.length * s.L; k > 0; k--) {
        yield* f.aguardar(() => casa.cheias > 0, 'Aguardando lixeiras cheias');
        yield* f.esvaziar(1);
      }
    });
  };

  // DUPLA: TROCA DIRETA + LIMPEZA PELA ESCADA (2 pessoas, 6 lixeiras reserva)
  // O elevador só fica travado enquanto há lixeira dentro dele.
  // Transporte: sobe com limpas, troca pelas cheias em 3 andares, desce, libera o elevador
  //   e ele mesmo esvazia e lava as 6 lixeiras, que viram as limpas da rodada seguinte.
  // Limpeza: sobe de carona na primeira viagem e limpa os quartos descendo pela escada.
  // As duas tarefas levam quase o mesmo tempo, então ninguém fica parado.
  // opcoes.sozinho = true: uma pessoa só faz o transporte e depois a limpeza.
  M.trocaDiretaDupla = function (s, op) {
    const gs = s.grupos(), topo = gs[0][0];
    s.reserva(gs[0].length * s.L);

    function* limparDescendo(f) {
      f.fase('Limpeza dos quartos');
      for (const a of s.andares.slice().reverse()) { yield* f.escada(a); yield* f.limpar(); }
    }

    const limpeza = op.sozinho ? null : s.ator('Limpeza', function* (f) {
      f.fase('Limpeza dos quartos');
      yield* f.aguardar(() => f.nivel === topo, 'Subindo de carona até o ' + s.niveis[topo].nome);
      yield* limparDescendo(f);
    });

    s.ator(op.sozinho ? 'Funcionário' : 'Transporte', function* (f) {
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i], n = g.length * s.L;
        f.fase('Rodada ' + (i + 1) + ' de ' + gs.length);
        yield* f.chamar();
        f.travar();
        yield* f.carregar(n, 'limpas');
        for (const a of g) {
          yield* f.viajar(a, limpeza && i === 0 && a === topo ? [limpeza] : []);
          yield* f.descarregar(s.L, 'limpas');
          yield* f.carregar(s.L, 'cheias');
        }
        yield* f.viajar(s.central);
        yield* f.descarregar(n, 'cheias');
        f.liberar();
        yield* f.esvaziar(n);
      }
      if (op.sozinho) {
        yield* f.chamar();
        yield* f.viajar(topo);
        yield* limparDescendo(f);
      }
    });
  };

  // DUPLA COM LIXEIRAS NA PORTA DO ELEVADOR (2 pessoas, 6 lixeiras reserva)
  // Tudo o que dá para fazer sem o elevador é feito antes de travá-lo.
  // Limpeza: 1ª passada, desce pela escada deixando as lixeiras cheias na porta do elevador;
  //   2ª passada, desce de novo limpando cada quarto e guardando as limpas que ficaram na porta.
  // Transporte: só troca porta a porta (deixa as limpas na porta, pega as cheias da porta).
  //   No subsolo deixa as cheias na porta, libera o elevador, lava e já deixa as limpas na porta.
  //   Quando acaba as rodadas, ajuda na limpeza começando pelos andares de baixo.
  M.trocaNaPorta = function (s) {
    const gs = s.grupos(), topo = gs[0][0], L = s.L;
    const nv = (a) => s.e.niveis[a];
    const aLimpar = s.andares.slice().reverse();
    s.reserva(gs[0].length * L, true);

    function* limparQuarto(f, a) {
      yield* f.escada(a);
      yield* f.aguardar(() => nv(a).pLimpas >= L, 'Aguardando a troca das lixeiras do ' + s.niveis[a].nome);
      yield* f.limpar();
      yield* f.levar(L, 'limpas', 'quarto');
    }

    s.ator('Limpeza', function* (f) {
      f.fase('Preparação');
      yield* f.chamar();
      yield* f.viajar(topo);
      for (const a of s.andares.slice().reverse()) { yield* f.escada(a); yield* f.levar(L, 'cheias', 'porta'); }
      f.fase('Limpeza dos quartos');
      yield* f.chamar();
      yield* f.viajar(topo);
      while (aLimpar.length) yield* limparQuarto(f, aLimpar.shift());
    });

    s.ator('Transporte', function* (f) {
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i], n = g.length * L;
        f.fase('Rodada ' + (i + 1) + ' de ' + gs.length);
        yield* f.aguardar(() => g.every((a) => nv(a).pCheias >= L), 'Aguardando as lixeiras cheias chegarem à porta');
        yield* f.chamar();
        f.travar();
        yield* f.carregar(n, 'limpas', true);
        for (const a of g) {
          yield* f.viajar(a);
          yield* f.descarregar(L, 'limpas', true);
          yield* f.carregar(L, 'cheias', true);
        }
        yield* f.viajar(s.central);
        yield* f.descarregar(n, 'cheias', true);
        f.liberar();
        for (let k = 0; k < n; k++) {
          yield* f.levar(1, 'cheias', 'quarto');
          yield* f.esvaziar(1);
          yield* f.levar(1, 'limpas', 'porta');
        }
      }
      f.fase('Ajuda na limpeza');
      while (aLimpar.length) yield* limparQuarto(f, aLimpar.pop());
    });
  };

  // LIMPEZA SEM PRENDER O ELEVADOR
  // Coleta igual à atual. Na devolução o elevador só fica travado para entregar as
  // lixeiras de três andares; é liberado no andar mais alto do grupo e o funcionário
  // limpa os três quartos descendo pela escada. Depois chama o elevador como um morador.
  M.limpezaSemElevador = function (s) {
    s.ator('Funcionário', function* (f) {
      yield* coletar(s, f);
      yield* esvaziarTudo(s, f);
      const gs = s.grupos();
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i];
        f.fase('Devolução ' + (i + 1) + ' de ' + gs.length);
        yield* f.chamar();
        f.travar();
        yield* f.carregar(g.length * s.L, 'limpas');
        for (const a of g.slice().reverse()) { yield* f.viajar(a); yield* f.descarregar(s.L, 'limpas'); }
        f.liberar();
        for (const a of g) { yield* f.escada(a); yield* f.limpar(); }
        yield* f.chamar();
        yield* f.viajar(s.central);
      }
    });
  };

  // Cenas oferecidas a todos os projetos. A primeira é a base das comparações.
  E.cenasPadrao = [
    { id: 'atual', nome: 'Cena atual', metodo: 'atual',
      descricao: 'Uma pessoa. Elevador travado na coleta, de cima para baixo, enchendo o elevador a cada viagem. Depois de esvaziar as lixeiras, elevador travado de novo para devolver e limpar andar por andar.' },
    { id: 'troca', nome: 'Troca direta com jogo reserva', metodo: 'trocaDireta',
      descricao: 'Uma pessoa e um elevador cheio de lixeiras reserva. Sobe com limpas, troca pelas cheias e limpa o quarto na mesma parada. Uma passada só; elevador livre enquanto esvazia na casa de lixo.' },
    { id: 'equipe', nome: 'Troca direta com jogo reserva em equipe', metodo: 'trocaDiretaEquipe',
      descricao: '3 pessoas: uma limpa os quartos descendo pela escada, outra leva as lixeiras pelo elevador (sobe com limpas, desce com cheias) e a terceira esvazia e prepara as lixeiras na casa de lixo. Com dois elevadores cheios de lixeiras reserva, as limpas já estão prontas quando o elevador chega.' },
    { id: 'dupla', nome: 'Dupla: troca direta + limpeza pela escada', metodo: 'trocaDiretaDupla',
      descricao: '2 pessoas e um elevador cheio de lixeiras reserva: uma troca as lixeiras pelo elevador e esvazia na casa de lixo com o elevador liberado; a outra limpa os quartos descendo pela escada. O elevador só trava enquanto há lixeira dentro.' },
    { id: 'porta', nome: 'Dupla com lixeiras na porta do elevador', metodo: 'trocaNaPorta',
      descricao: 'Como a dupla, mas a limpeza deixa antes as lixeiras cheias na porta do elevador. O transporte só troca porta a porta, o que encurta cada parada, e no fim ajuda a limpar os andares de baixo.' },
    { id: 'escada', nome: 'Limpeza sem prender o elevador', metodo: 'limpezaSemElevador',
      descricao: 'Uma pessoa. Coleta igual à atual. Na devolução, entrega as lixeiras de um elevador cheio, libera o elevador e limpa os quartos descendo pela escada.' },
  ];

  if (typeof module !== 'undefined') module.exports = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
