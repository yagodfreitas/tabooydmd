const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos da pasta atual
app.use(express.static(path.join(__dirname)));

// Rota principal serve o index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Evento básico do socket (exemplo)
io.on("connection", (socket) => {
  console.log("Novo usuário conectado");

  socket.on("mensagem", (msg) => {
    io.emit("mensagem", msg); // retransmite a mensagem para todos
  });

  socket.on("disconnect", () => {
    console.log("Usuário desconectado");
  });
});

// Porta dinâmica para o Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
