const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new socketIo.Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- CONSTANTES DO JOGO ---
const TURN_DURATION = 90; // <<-- Tempo do turno aumentado para 90 segundos
const REVIEW_DURATION = 10000; // <<-- Tempo de avaliação aumentado para 10 segundos

// --- ESTADO INICIAL DO JOGO ---
const getInitialGameState = () => ({
    players: {},
    playerOrder: [],
    cards: gameState ? gameState.cards : [],
    usedCards: new Set(),
    gameStarted: false,
    currentTurnIndex: 0,
    currentRound: 1,
    maxRounds: 3,
    turnTimer: null,
    reviewTimer: null,
    timeLeft: TURN_DURATION,
    currentCard: null,
    currentGiverId: null,
    turnSuccesses: [],
    currentReviewCard: null,
    reviewReports: new Set(),
    liveReports: new Set(),
    wordGuessedInTurn: false,
});

let gameState = getInitialGameState();

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
    if (gameState.reviewTimer) clearTimeout(gameState.reviewTimer);
    
    const players = Object.values(gameState.players);
    players.forEach(p => p.score = 0);
    
    gameState = {
        ...getInitialGameState(),
        players: gameState.players, // Mantém os jogadores conectados
    };
    
    io.emit('gameReset');
    io.emit('lobbyUpdate', players);
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

function moveToNextTurn() {
    gameState.currentTurnIndex++;
    startNewTurn();
}

function startNewTurn() {
    if (gameState.turnTimer) clearInterval(gameState.turnTimer);
    
    gameState.turnSuccesses = []; 

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
        console.log(`Jogador da vez ${gameState.currentGiverId} desconectou. Pulando.`);
        moveToNextTurn();
        return;
    }

    console.log(`Novo turno: ${giver.name} (Rodada ${gameState.currentRound})`);
    
    pickNewCard();
    if (!gameState.currentCard) {
        console.log("Todas as cartas foram usadas!");
        endGame();
        return;
    }
    
    gameState.timeLeft = TURN_DURATION;
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
    if (gameState.usedCards.size >= gameState.cards.length) {
        gameState.currentCard = null;
        io.emit('gameError', 'Todas as cartas do baralho foram usadas!');
        endGame();
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
        startReviewPhase();
    }
}

function startReviewPhase() {
    console.log("Iniciando fase de avaliação...");
    if (gameState.turnSuccesses.length === 0) {
        console.log("Nenhuma carta para avaliar. Pulando para o próximo turno.");
        moveToNextTurn();
        return;
    }
    
    io.emit('startReview', { totalCards: gameState.turnSuccesses.length });
    setTimeout(reviewNextCard, 2000);
}

function reviewNextCard() {
    if (gameState.reviewTimer) clearTimeout(gameState.reviewTimer);

    if (gameState.turnSuccesses.length === 0) {
        endReviewPhase();
        return;
    }

    gameState.currentReviewCard = gameState.turnSuccesses.shift();
    gameState.reviewReports.clear();

    console.log(`Avaliando a carta: ${gameState.currentReviewCard.card.palavraAlvo}`);

    io.emit('showReviewCard', {
        card: gameState.currentReviewCard.card,
        guesserName: gameState.players[gameState.currentReviewCard.guesserId]?.name || '?'
    });

    gameState.reviewTimer = setTimeout(() => {
        processReviewVotes();
    }, REVIEW_DURATION);
}

function processReviewVotes() {
    const giverId = gameState.currentReviewCard.giverId;
    const giver = gameState.players[giverId];
    
    const totalVoters = Math.max(1, Object.keys(gameState.players).length - 1);
    const requiredReports = Math.ceil((totalVoters + 1) / 2);

    let invalidated = false;
    if (giver && gameState.reviewReports.size >= requiredReports) {
        console.log(`Carta "${gameState.currentReviewCard.card.palavraAlvo}" invalidada na avaliação.`);
        giver.score = Math.max(0, giver.score - 1); // Garante que a pontuação não fique negativa
        invalidated = true;
    } else {
        console.log(`Carta "${gameState.currentReviewCard.card.palavraAlvo}" validada.`);
    }

    io.emit('reviewResult', {
        word: gameState.currentReviewCard.card.palavraAlvo,
        invalidated: invalidated,
        reports: gameState.reviewReports.size,
        required: requiredReports
    });
    
    if (invalidated) {
        io.emit('scoreUpdate', Object.values(gameState.players));
    }

    setTimeout(reviewNextCard, 2500);
}

function endReviewPhase() {
    console.log("Fase de avaliação finalizada.");
    io.emit('endReview');
    gameState.currentReviewCard = null;
    setTimeout(moveToNextTurn, 2000);
}


function endGame() {
    console.log("Fim de jogo!");
    if (gameState.turnTimer) clearInterval(gameState.turnTimer);
    if (gameState.reviewTimer) clearTimeout(gameState.reviewTimer);
    
    const scores = Object.values(gameState.players)
        .sort((a, b) => b.score - a.score)
        .map(p => ({ name: p.name, score: p.score }));

    io.emit('gameOver', scores);
}


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

        socket.emit('welcome', { id: socket.id });
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

            gameState.turnSuccesses.push({
                card: gameState.currentCard,
                guesserId: guesser.id,
                giverId: giver.id
            });

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
    
    // <<-- NOVO EVENTO PARA PULAR A CARTA -->>
    socket.on('skipCard', () => {
        if (socket.id === gameState.currentGiverId && gameState.timeLeft > 0) {
            console.log(`Jogador ${gameState.players[socket.id].name} pulou a carta.`);
            io.emit('cardSkipped', { word: gameState.currentCard.palavraAlvo });
            pickNewCard();
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

    socket.on('reportReview', () => {
        const player = gameState.players[socket.id];
        if (player && gameState.currentReviewCard && player.id !== gameState.currentReviewCard.giverId) {
            gameState.reviewReports.add(player.id);
            console.log(`${player.name} denunciou a carta ${gameState.currentReviewCard.card.palavraAlvo}`);
        }
    });
    
    socket.on('playAgain', () => {
        const player = gameState.players[socket.id];
        if (player && player.isHost) {
            resetGame();
        }
    });

    socket.on('disconnect', () => {
        const disconnectedPlayer = gameState.players[socket.id];
        if (!disconnectedPlayer) return;

        console.log(`Jogador ${disconnectedPlayer.name} desconectou.`);

        const wasHost = disconnectedPlayer.isHost;
        const wasGiver = socket.id === gameState.currentGiverId;

        delete gameState.players[socket.id];

        const remainingPlayers = Object.values(gameState.players);
        if (remainingPlayers.length === 0) {
            console.log("Todos os jogadores saíram. Resetando o servidor.");
            if (gameState.turnTimer) clearInterval(gameState.turnTimer);
            if (gameState.reviewTimer) clearTimeout(gameState.reviewTimer);
            gameState = getInitialGameState();
            return; 
        }

        if (wasHost && remainingPlayers.length > 0) {
            const newHost = remainingPlayers[0];
            if (newHost) {
                newHost.isHost = true;
                console.log(`Novo host: ${newHost.name}`);
            }
        }

        if (gameState.gameStarted) {
            if (wasGiver) {
                if (gameState.turnTimer) clearInterval(gameState.turnTimer);
                console.log("O jogador da vez desconectou. Indo para a avaliação.");
                startReviewPhase();
            }
            else if (remainingPlayers.length < 3) {
                console.log("Jogadores insuficientes para continuar. Voltando para o lobby.");
                resetGame();
            }
            else {
                 io.emit('lobbyUpdate', remainingPlayers);
            }
        } else {
            io.emit('lobbyUpdate', remainingPlayers);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    loadCards();
});
