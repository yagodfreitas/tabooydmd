const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new socketIo.Server(server);

const PORT = process.env.PORT || 3000;

// Serve os arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

// --- ESTADO DO JOGO (GAME STATE) ---
let gameState = {
    players: {},
    playerOrder: [],
    cards: [],
    usedCards: new Set(),
    gameStarted: false,
    currentTurnIndex: 0,
    currentRound: 1,
    maxRounds: 3,
    turnTimer: null,
    timeLeft: 60,
    currentCard: null,
    currentGiverId: null,
    liveReports: new Set(),
    wordGuessedInTurn: false,
};

// --- FUNÇÕES DE LÓGICA DO JOGO ---

function loadCards() {
    try {
        const cardsData = fs.readFileSync(path.join(__dirname, 'assets/cards.json'));
        gameState.cards = JSON.parse(cardsData);
        console.log(`Sucesso: ${gameState.cards.length} cartas carregadas.`);
    } catch (error) {
        console.error("Erro ao carregar assets/cards.json:", error);
        process.exit(1);
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function resetGame() {
    console.log("Reiniciando o jogo...");
    if (gameState.turnTimer) clearInterval(gameState.turnTimer);
    
    Object.values(gameState.players).forEach(p => p.score = 0);
    
    gameState.gameStarted = false;
    gameState.playerOrder = [];
    gameState.usedCards.clear();
    gameState.currentTurnIndex = 0;
    gameState.currentRound = 1;
    gameState.timeLeft = 60;
    gameState.currentCard = null;
    gameState.currentGiverId = null;
    gameState.liveReports.clear();
    
    io.emit('gameReset');
    io.emit('lobbyUpdate', Object.values(gameState.players));
}

function startGame(socket) {
    if (Object.keys(gameState.players).length < 3) {
        socket.emit('gameError', 'São necessários no mínimo 3 jogadores.');
        return;
    }

    console.log("Iniciando o jogo!");
    gameState.gameStarted = true;
    gameState.playerOrder = Object.keys(gameState.players);
    shuffleArray(gameState.playerOrder);

    startNewTurn();
}

function startNewTurn() {
    if (gameState.turnTimer) clearInterval(gameState.turnTimer);
    
    if (gameState.currentTurnIndex >= gameState.playerOrder.length) {
        gameState.currentTurnIndex = 0;
        gameState.currentRound++;
    }

    if (gameState.currentRound > gameState.maxRounds) {
        endGame();
        return;
    }

    gameState.currentGiverId = gameState.playerOrder[gameState.currentTurnIndex];
    const giver = gameState.players[gameState.currentGiverId];
    
    if (!giver) {
        console.log(`Jogador da vez ${gameState.currentGiverId} desconectou. Pulando turno.`);
        gameState.currentTurnIndex++;
        startNewTurn();
        return;
    }

    console.log(`Novo turno: ${giver.name} (Rodada ${gameState.currentRound})`);
    
    pickNewCard();
    if (!gameState.currentCard) {
        console.log("Todas as cartas foram usadas!");
        endGame();
        return;
    }
    
    gameState.timeLeft = 60;
    gameState.liveReports.clear();
    gameState.wordGuessedInTurn = false;

    io.emit('newTurn', {
        giver: { id: giver.id, name: giver.name },
        round: gameState.currentRound,
        timeLeft: gameState.timeLeft,
    });
    
    io.to(giver.id).emit('cardUpdate', gameState.currentCard);

    gameState.turnTimer = setInterval(updateTimer, 1000);
}

function pickNewCard() {
    if (gameState.usedCards.size === gameState.cards.length) {
        gameState.currentCard = null;
        return;
    }

    let newCardIndex;
    do {
        newCardIndex = Math.floor(Math.random() * gameState.cards.length);
    } while (gameState.usedCards.has(newCardIndex));
    
    gameState.usedCards.add(newCardIndex);
    gameState.currentCard = gameState.cards[newCardIndex];
    gameState.wordGuessedInTurn = false;
    gameState.liveReports.clear();
    
    io.emit('newCardInPlay');
    if(gameState.currentGiverId) {
        io.to(gameState.currentGiverId).emit('cardUpdate', gameState.currentCard);
    }
}

function updateTimer() {
    gameState.timeLeft--;
    io.emit('timerUpdate', gameState.timeLeft);

    if (gameState.timeLeft <= 0) {
        clearInterval(gameState.turnTimer);
        console.log(`Tempo esgotado para ${gameState.players[gameState.currentGiverId]?.name}.`);
        gameState.currentTurnIndex++;
        startNewTurn();
    }
}

function endGame() {
    console.log("Fim de jogo!");
    if (gameState.turnTimer) clearInterval(gameState.turnTimer);
    
    const scores = Object.values(gameState.players)
        .sort((a, b) => b.score - a.score)
        .map(p => ({ name: p.name, score: p.score }));

    io.emit('gameOver', scores);
}

// --- GERENCIAMENTO DE SOCKETS ---

io.on('connection', (socket) => {
    console.log(`Novo jogador conectado: ${socket.id}`);

    socket.on('joinLobby', (playerName) => {
        if (Object.values(gameState.players).some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            socket.emit('nameError', 'Este nome já está em uso.');
            return;
        }
        if (gameState.gameStarted) {
            socket.emit('gameError', 'O jogo já começou. Aguarde a próxima partida.');
            return;
        }

        gameState.players[socket.id] = {
            id: socket.id,
            name: playerName,
            score: 0,
            isHost: Object.keys(gameState.players).length === 0,
        };
        console.log(`Jogador ${playerName} (${socket.id}) entrou.`);

        socket.emit('welcome', { id: socket.id, isHost: gameState.players[socket.id].isHost });
        io.emit('lobbyUpdate', Object.values(gameState.players));
    });
    
    socket.on('startGame', () => {
        const player = gameState.players[socket.id];
        if (player && player.isHost && !gameState.gameStarted) {
            startGame(socket);
        }
    });

    socket.on('guess', (guessText) => {
        const guesser = gameState.players[socket.id];
        const giver = gameState.players[gameState.currentGiverId];

        if (!guesser || !giver || socket.id === giver.id || gameState.wordGuessedInTurn) return;

        io.emit('guessBroadcast', { name: guesser.name, text: guessText });
        
        const normalizedGuess = guessText.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const normalizedTarget = gameState.currentCard.palavraAlvo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

        if (normalizedGuess === normalizedTarget) {
            console.log(`${guesser.name} acertou: ${gameState.currentCard.palavraAlvo}`);
            gameState.wordGuessedInTurn = true;

            guesser.score += 4;
            giver.score += 1;

            io.emit('cardSuccess', { 
                guesserName: guesser.name, 
                giverName: giver.name,
                word: gameState.currentCard.palavraAlvo 
            });
            io.emit('scoreUpdate', Object.values(gameState.players));
            
            setTimeout(() => {
                if(gameState.timeLeft > 0) pickNewCard();
            }, 2000);
        }
    });
    
    socket.on('reportLive', () => {
        if (!gameState.currentGiverId || socket.id === gameState.currentGiverId || gameState.liveReports.has(socket.id)) return;
        
        gameState.liveReports.add(socket.id);
        const totalGuessers = Math.max(1, Object.keys(gameState.players).length - 1);
        const requiredReports = Math.ceil((totalGuessers + 1) / 2);

        io.emit('reportCount', {
            count: gameState.liveReports.size,
            required: requiredReports
        });

        if (gameState.liveReports.size >= requiredReports) {
            console.log(`Carta "${gameState.currentCard.palavraAlvo}" invalidada.`);
            io.emit('cardInvalidated', { word: gameState.currentCard.palavraAlvo });
            
            setTimeout(() => {
                if (gameState.timeLeft > 0) pickNewCard();
            }, 2000);
        }
    });
    
    socket.on('playAgain', () => {
        const player = gameState.players[socket.id];
        if (player && player.isHost) {
            resetGame();
        }
    });

    socket.on('disconnect', () => {
        const player = gameState.players[socket.id];
        if (player) {
            console.log(`Jogador ${player.name} desconectou.`);
            
            if (socket.id === gameState.currentGiverId) {
                if (gameState.turnTimer) clearInterval(gameState.turnTimer);
                gameState.currentTurnIndex++;
                startNewTurn();
            }

            delete gameState.players[socket.id];

            if (player.isHost && Object.keys(gameState.players).length > 0) {
                const newHostId = Object.keys(gameState.players)[0];
                gameState.players[newHostId].isHost = true;
                console.log(`Novo host: ${gameState.players[newHostId].name}`);
            }
            
            if (Object.keys(gameState.players).length < 3 && gameState.gameStarted) {
                console.log("Jogadores insuficientes, voltando para o lobby.");
                resetGame();
            } else {
                io.emit('lobbyUpdate', Object.values(gameState.players));
            }
        }
    });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    loadCards();
});
