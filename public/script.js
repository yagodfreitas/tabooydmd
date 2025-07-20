// script.js

let jogadores = [];
let jogadorAtual = 0;
let cartas = [
  { palavra: "Praia", tabus: ["Areia", "Mar", "Sol", "Férias", "Onda"] },
  { palavra: "Avião", tabus: ["Voo", "Piloto", "Asa", "Aeroporto", "Viagem"] }
];
let cartaAtual = 0;

// Função para extrair o nome da URL
function obterNomeDaURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("name") || "";
}

// Entrar na sala após ler nome da URL
document.addEventListener("DOMContentLoaded", () => {
  const botaoEntrar = document.querySelector("#botaoEntrar");
  const inputNome = document.querySelector("#nomeJogador");

  // Caso esteja na tela inicial
  if (botaoEntrar && inputNome) {
    botaoEntrar.addEventListener("click", () => {
      const nome = inputNome.value.trim();
      if (nome) {
        window.location.href = `/game?name=${encodeURIComponent(nome)}`;
      } else {
        alert("Por favor, digite seu nome.");
      }
    });
  }

  // Caso esteja na tela do jogo
  const nome = obterNomeDaURL();
  if (nome && window.location.pathname.includes("/game")) {
    jogadores.push({ nome, pontos: 0 });
    atualizarListaJogadores();
    const login = document.getElementById("loginArea");
    const espera = document.getElementById("salaEspera");
    if (login && espera) {
      login.style.display = "none";
      espera.style.display = "block";
    }
  }
});

// Atualiza lista de jogadores
function atualizarListaJogadores() {
  const lista = document.getElementById("listaJogadores");
  lista.innerHTML = "";
  jogadores.forEach(j => {
    const li = document.createElement("li");
    li.textContent = j.nome;
    lista.appendChild(li);
  });
}

// Inicia o jogo
function iniciarJogo() {
  document.getElementById("salaEspera").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  mostrarCarta();
}

// Exibe a carta atual
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

// Vai para a próxima carta
function nextCard() {
  cartaAtual = (cartaAtual + 1) % cartas.length;
  mostrarCarta();
}
