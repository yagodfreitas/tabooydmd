const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Porta dinâmica para o Render
const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos da pasta atual
app.use(express.static(__dirname));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Lógica de socket
io.on('connection', (socket) => {
  console.log('Um jogador conectou: ' + socket.id);

  socket.on('mensagem', (data) => {
    console.log('Mensagem recebida:', data);
    io.emit('mensagem', data); // broadcast
  });

  socket.on('disconnect', () => {
    console.log('Jogador desconectado: ' + socket.id);
  });
});

// Inicialização do servidor
http.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
