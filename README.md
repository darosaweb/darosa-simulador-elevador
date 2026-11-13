<p align="center"><img src="assets/brand/rosa-original-transparente.png" width="96" alt="Logo daRosa"></p>

# daRosa - Simulador de Elevador

Simula o recolhimento de lixo com o elevador de serviço de um edifício e compara métodos (cenas).
Cada projeto é um caso real (um edifício): a cena atual e as cenas propostas.

## Projetos

- **📁 Meus projetos → + Novo projeto**: dê um nome, configure o edifício (andares, apartamentos, lixeiras, subsolos, onde fica a casa de lixo) e teste.
- Tudo é **salvo automaticamente** no navegador (`localStorage`).
- **Exportar** baixa o projeto aberto em `.json`; em Meus projetos dá para importar um `.json`, duplicar, excluir e baixar um backup de todos.
- Para levar os projetos a outro navegador ou computador, use o backup e depois Importar.

## Usar

**Online:** <https://darosaweb.github.io/darosa-simulador-elevador/>

Ou baixe a pasta e abra `index.html` no navegador (não precisa de servidor nem de instalação).

## Estrutura

- `projetos/le-notre.js` — projeto de exemplo, criado na primeira vez que o simulador abre.
- `src/projetos.js` — criar, validar, exportar e importar projetos (sem DOM).
- `src/metodos.js` — os métodos de recolhimento, escritos como a sequência de ordens do funcionário.
- `src/motor.js` — motor: transforma as ordens em tempo e calcula as métricas (sem DOM).
- `src/app.js` — tela: corte do edifício, player e comparação.
- `test/` — `node --test test/`

## Criar uma cena nova

1. Em `src/metodos.js`, crie as pessoas com `s.ator(nome, roteiro)` e use as ordens `chamar`, `travar`, `liberar`, `viajar`,
   `carregar`, `descarregar`, `levar`, `limpar`, `esvaziar`, `escada`, `aguardar`. Várias pessoas trabalham em paralelo.
2. No fim de `src/metodos.js`, acrescente a cena à lista `E.cenasPadrao`, apontando para o método. Ela passa a valer para todos os projetos.

O motor recusa métodos impossíveis (elevador lotado, lixeira que não existe) e métodos que
terminam com andar sem lixeira ou sem limpeza.

## Simplificações

- Os tempos são suposições editáveis na tela, até serem medidos no prédio.
- Moradores: chegam ao acaso (parâmetro "viagens por hora"), metade descendo ao térreo e metade subindo.
  O elevador atende um pedido de cada vez, por ordem de chegada, e não atende ninguém enquanto está travado.
  O funcionário que chama o elevador entra na mesma fila. O sorteio é o mesmo em todas as cenas.
- `node test/medir.js usoMoradores=30` imprime as métricas de todas as cenas no terminal.
