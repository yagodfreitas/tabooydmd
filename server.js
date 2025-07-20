const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let jogadores = [];
let rodadaAtual = 1;
let indexJogadorDaVez = 0;

io.on('connection', (socket) => {
  console.log('Novo jogador conectado:', socket.id);

  socket.on('registrarJogador', (nome) => {
    jogadores.push({ id: socket.id, nome, pontos: 0 });
    io.emit('atualizarJogadores', jogadores);
  });

  socket.on('iniciarJogo', () => {
    if (jogadores.length > 1) {
      io.emit('jogoIniciado');
      enviarProximaRodada();
    }
  });

  function enviarProximaRodada() {
    const jogadorDaVez = jogadores[indexJogadorDaVez];
    io.emit('novaRodada', {
      jogadorId: jogadorDaVez.id,
      nome: jogadorDaVez.nome,
      rodada: rodadaAtual
    });
  }

  socket.on('palpiteCorreto', (jogadorId) => {
    const jogador = jogadores.find(j => j.id === jogadorId);
    if (jogador) jogador.pontos += 1;
    io.emit('atualizarPontuacao', jogadores);
  });

  socket.on('proximaCarta', () => {
    indexJogadorDaVez++;
    if (indexJogadorDaVez >= jogadores.length) {
      indexJogadorDaVez = 0;
      rodadaAtual++;
    }
    enviarProximaRodada();
  });

  socket.on('disconnect', () => {
    jogadores = jogadores.filter(j => j.id !== socket.id);
    io.emit('atualizarJogadores', jogadores);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});