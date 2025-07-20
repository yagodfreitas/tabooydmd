const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  console.log('Um jogador conectou: ' + socket.id);

  socket.on('mensagem', (data) => {
    console.log('Mensagem recebida:', data);
    io.emit('mensagem', data);
  });

  socket.on('disconnect', () => {
    console.log('Jogador desconectado: ' + socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
