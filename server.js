const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos (como index.html, script.js e style.css)
app.use(express.static(path.join(__dirname)));

// Rota principal para carregar o HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Socket.IO
io.on("connection", (socket) => {
  console.log("Novo jogador conectado");

  socket.on("mensagem", (msg) => {
    io.emit("mensagem", msg);
  });

  socket.on("disconnect", () => {
    console.log("Jogador desconectado");
  });
});

// Usar a porta fornecida pelo Render (ou 3000 localmente)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
