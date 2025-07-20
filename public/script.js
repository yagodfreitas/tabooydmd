// script.js
let jogadores = [];
let jogadorAtual = 0;
let cartas = [
  { palavra: "Praia", tabus: ["Areia", "Mar", "Sol", "Férias", "Onda"] },
  { palavra: "Avião", tabus: ["Voo", "Piloto", "Asa", "Aeroporto", "Viagem"] }
];
let cartaAtual = 0;

function entrarNaSala() {
  const nome = document.getElementById("nomeJogador").value.trim();
  if (nome !== "") {
    jogadores.push({ nome, pontos: 0 });
    atualizarListaJogadores();
    document.getElementById("loginArea").style.display = "none";
    document.getElementById("salaEspera").style.display = "block";
  }
}

function atualizarListaJogadores() {
  const lista = document.getElementById("listaJogadores");
  lista.innerHTML = "";
  jogadores.forEach(j => {
    const li = document.createElement("li");
    li.textContent = j.nome;
    lista.appendChild(li);
  });
}

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
