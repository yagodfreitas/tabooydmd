// public/script.js
const socket = io();
let jogadores = [];
let cartas = [
  { palavra: "Praia", tabus: ["Areia", "Mar", "Sol", "Férias", "Onda"] },
  { palavra: "Avião", tabus: ["Voo", "Piloto", "Asa", "Aeroporto", "Viagem"] },
];
let cartaAtual = 0;

// Envia o nome do jogador ao entrar na sala
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const nome = urlParams.get("name");
  if (nome) {
    socket.emit("entrar", nome);
  }
});

// Atualiza a lista de jogadores ao receber do servidor
socket.on("atualizar-jogadores", (lista) => {
  jogadores = lista;
  const listaEl = document.getElementById("listaJogadores");
  if (listaEl) {
    listaEl.innerHTML = "";
    jogadores.forEach(j => {
      const li = document.createElement("li");
      li.textContent = j.nome;
      listaEl.appendChild(li);
    });
  }
});

function iniciarJogo() {
  document.getElementById("salaEspera").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  mostrarCarta();
}

function mostrarCarta() {
  const carta = cartas[cartaAtual];
  document.getElementById("word").textContent = carta.palavra;
  const listaTabu = document.getElementById("taboo-list");
  listaTabu.innerHTML = "";
  carta.tabus.forEach(tabu => {
    const li = document.createElement("li");
    li.textContent = tabu;
    li.className = "taboo";
    listaTabu.appendChild(li);
  });
  document.getElementById("card").style.display = "block";
}

function nextCard() {
  cartaAtual = (cartaAtual + 1) % cartas.length;
  mostrarCarta();
}
