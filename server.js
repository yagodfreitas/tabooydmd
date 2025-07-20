const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve os arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, "public")));

let jogadores = [];

io.on("connection", (socket) => {
  console.log("Novo jogador conectado:", socket.id);

  socket.on("entrar", (nome) => {
    jogadores.push({ id: socket.id, nome });
    io.emit("atualizar-jogadores", jogadores);
  });

  socket.on("disconnect", () => {
    jogadores = jogadores.filter(j => j.id !== socket.id);
    io.emit("atualizar-jogadores", jogadores);
    console.log("Jogador desconectado:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
