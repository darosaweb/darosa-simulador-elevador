// Projeto de exemplo: Edifício Le Notre. É criado na primeira vez que o simulador abre
// num navegador; depois disso os projetos ficam guardados no próprio navegador.
(function (root) {
  'use strict';
  const E = (root.ELEVADOR = root.ELEVADOR || {});
  (E.projetos = E.projetos || []).push({
    id: 'le-notre',
    nome: 'Edifício Le Notre',
    horaInicio: '08:00',
    edificio: {
      andares: 18,
      aptosPorAndar: 3,
      lixeirasPorAndar: 2,
      litrosPorLixeira: 100,
      subsolos: 1,
      terreo: true,      // suposição: existe um térreo entre o subsolo e o 1º andar
      central: 'SS',     // nível onde fica a casa de lixo
    },
    // Valores medidos no prédio substituem os padrões de src/motor.js. Ex.: { tLimpar: 300 }
    parametros: {},
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
