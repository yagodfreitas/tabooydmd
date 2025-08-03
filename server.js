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

const TURN_DURATION = 90;
const REVIEW_DURATION = 10000;

const getInitialGameState = () => ({
    players: {},
    playerOrder: [],
    cards: [],
    usedCards: new Set(),
    gamePhase: 'lobby', // lobby, turn, review, podium
    guessLog: [], // << NOVO: Registo de palpites faz parte do estado
    currentTurnIndex: 0,
    currentRound: 1,
    maxRounds: 3,
    timeLeft: TURN_DURATION,
    currentCard: null,
    currentGiverId: null,
    turnSuccesses: [],
    currentReviewCard: null,
    reviewReports: new Set(),
    liveReports: new Set(),
    wordGuessedInTurn: false,
    reviewResultData: null,
});

let gameState = getInitialGameState();
let turnTimer = null; // Mover o timer para o escopo global do servidor
let reviewTimer = null;

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
    console.log("A reiniciar o jogo...");
    const players = Object.values(gameState.players);
    const loadedCards = gameState.cards;
    players.forEach(p => p.score = 0);
    
    gameState = {
        ...getInitialGameState(),
        players: gameState.players,
        cards: loadedCards,
    };
}

function startGame(socket) {
    if (Object.keys(gameState.players).length < 3) {
        socket.emit('gameError', 'São necessários no mínimo 3 jogadores.');
        return;
    }
    console.log("A iniciar o jogo!");
    gameState.playerOrder = Object.keys(gameState.players);
    shuffleArray(gameState.playerOrder);
    startNewTurn();
}

function moveToNextTurn() {
    gameState.currentTurnIndex++;
    startNewTurn();
}

function startNewTurn() {
    gameState.turnSuccesses = [];
    gameState.guessLog = []; // Limpa o registo de palpites para o novo turno
    if (gameState.currentTurnIndex >= gameState.playerOrder.length) {
        gameState.currentTurnIndex = 0;
        gameState.currentRound++;
    }
    if (gameState.currentRound > gameState.maxRounds || gameState.usedCards.size >= gameState.cards.length) {
        if (gameState.usedCards.size >= gameState.cards.length) {
            io.emit('gameError', 'Todas as cartas do baralho foram usadas!');
        }
        endGame();
        return;
    }
    gameState.currentGiverId = gameState.playerOrder[gameState.currentTurnIndex];
    const giver = gameState.players[gameState.currentGiverId];
    if (!giver) {
        moveToNextTurn();
        return;
    }
    console.log(`Novo turno: ${giver.name} (Rodada ${gameState.currentRound})`);
    pickNewCard();
    gameState.timeLeft = TURN_DURATION;
    gameState.liveReports.clear();
    gameState.wordGuessedInTurn = false;
    gameState.gamePhase = 'turn';
    startTurnTimer(); // << CORREÇÃO: Reinicia o temporizador a cada novo turno
}

function pickNewCard() {
    if (gameState.usedCards.size >= gameState.cards.length) {
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
}

function startTurnTimer() {
    if (turnTimer) clearInterval(turnTimer);
    turnTimer = setInterval(() => {
        if (gameState.gamePhase === 'turn') {
            gameState.timeLeft--;
            if (gameState.timeLeft <= 0) {
                startReviewPhase();
            }
        } else {
            clearInterval(turnTimer);
        }
    }, 1000);
}

function startReviewPhase() {
    if (turnTimer) clearInterval(turnTimer);
    console.log("A iniciar fase de avaliação...");
    gameState.gamePhase = 'review';
    if (gameState.turnSuccesses.length === 0) {
        moveToNextTurn();
        return;
    }
    reviewNextCard();
}

function reviewNextCard() {
    if (reviewTimer) clearTimeout(reviewTimer);
    if (gameState.turnSuccesses.length === 0) {
        endReviewPhase();
        return;
    }
    gameState.currentReviewCard = gameState.turnSuccesses.shift();
    gameState.reviewReports.clear();
    gameState.reviewResultData = null;
    reviewTimer = setTimeout(processReviewVotes, REVIEW_DURATION);
}

function processReviewVotes() {
    const { currentReviewCard, players, reviewReports } = gameState;
    const giver = players[currentReviewCard.giverId];
    const totalVoters = Math.max(1, Object.keys(players).length - 1);
    const requiredReports = Math.ceil((totalVoters + 1) / 2);
    let invalidated = false;
    if (giver && reviewReports.size >= requiredReports) {
        giver.score = Math.max(0, giver.score - 1);
        invalidated = true;
    }
    gameState.reviewResultData = {
        word: currentReviewCard.card.palavraAlvo,
        invalidated,
        reports: reviewReports.size,
        required: requiredReports
    };
    setTimeout(reviewNextCard, 2500);
}

function endReviewPhase() {
    gameState.currentReviewCard = null;
    gameState.reviewResultData = null;
    moveToNextTurn();
}

function endGame() {
    if (turnTimer) clearInterval(turnTimer);
    if (reviewTimer) clearTimeout(reviewTimer);
    console.log("Fim de jogo!");
    gameState.gamePhase = 'podium';
}

io.on('connection', (socket) => {
    console.log(`Novo jogador conectado: ${socket.id}`);
    socket.on('joinLobby', (playerName) => {
        if (Object.values(gameState.players).some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            socket.emit('nameError', 'Este nome já está em uso.');
            return;
        }
        if (gameState.gamePhase !== 'lobby') {
            socket.emit('gameError', 'O jogo já começou. Aguarde a próxima partida.');
            return;
        }
        gameState.players[socket.id] = { id: socket.id, name: playerName, score: 0, isHost: Object.keys(gameState.players).length === 0 };
        socket.emit('welcome', { id: socket.id });
    });
    socket.on('startGame', () => {
        const player = gameState.players[socket.id];
        if (player && player.isHost && gameState.gamePhase === 'lobby') {
            startGame(socket);
        }
    });
    socket.on('guess', (guessText) => {
        const { players, currentGiverId, wordGuessedInTurn, currentCard } = gameState;
        const guesser = players[socket.id];
        const giver = players[currentGiverId];
        if (!guesser || !giver || socket.id === giver.id || wordGuessedInTurn) return;
        
        gameState.guessLog.push({ type: 'guess', name: guesser.name, text: guessText }); // << CORREÇÃO: Adiciona palpite ao registo
        
        const normalizedGuess = guessText.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const normalizedTarget = currentCard.palavraAlvo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (normalizedGuess === normalizedTarget) {
            gameState.wordGuessedInTurn = true;
            gameState.turnSuccesses.push({ card: currentCard, guesserId: guesser.id, giverId: giver.id });
            guesser.score += 4;
            giver.score += 1;
            gameState.guessLog.push({ type: 'success', guesserName: guesser.name, giverName: giver.name, word: currentCard.palavraAlvo });
            if (gameState.usedCards.size >= gameState.cards.length) {
                startReviewPhase();
            } else {
                setTimeout(() => { if (gameState.timeLeft > 0) pickNewCard(); }, 2000);
            }
        }
    });
    socket.on('skipCard', () => {
        if (socket.id === gameState.currentGiverId && gameState.timeLeft > 0) {
            gameState.guessLog.push({ type: 'skipped', word: gameState.currentCard.palavraAlvo });
            pickNewCard();
        }
    });
    socket.on('reportLive', () => {
        if (!gameState.currentGiverId || socket.id === gameState.currentGiverId || gameState.liveReports.has(socket.id)) return;
        gameState.liveReports.add(socket.id);
        if (gameState.liveReports.size >= Math.ceil((Object.keys(gameState.players).length) / 2)) {
            gameState.guessLog.push({ type: 'invalid', word: gameState.currentCard.palavraAlvo });
            setTimeout(() => { if (gameState.timeLeft > 0) pickNewCard(); }, 2000);
        }
    });
    socket.on('reportReview', () => {
        const player = gameState.players[socket.id];
        if (player && gameState.currentReviewCard && player.id !== gameState.currentReviewCard.giverId) {
            gameState.reviewReports.add(player.id);
        }
    });
    socket.on('playAgain', () => {
        const player = gameState.players[socket.id];
        if (player && player.isHost && gameState.gamePhase === 'podium') {
            resetGame();
        }
    });
    socket.on('disconnect', () => {
        const disconnectedPlayer = gameState.players[socket.id];
        if (!disconnectedPlayer) return;
        console.log(`Jogador ${disconnectedPlayer.name} desconectou.`);
        const wasHost = disconnectedPlayer.isHost;
        delete gameState.players[socket.id];
        const remainingPlayers = Object.values(gameState.players);
        if (remainingPlayers.length === 0) {
            console.log("Todos os jogadores saíram.");
            if (turnTimer) clearInterval(turnTimer);
            if (reviewTimer) clearTimeout(reviewTimer);
            gameState = getInitialGameState();
            loadCards();
            return;
        }
        if (wasHost) {
            remainingPlayers[0].isHost = true;
        }
        if (gameState.gamePhase !== 'lobby' && remainingPlayers.length < 3) {
            resetGame();
        }
    });
});

function getPublicGameState(playerId) {
    const { cards, usedCards, ...rest } = gameState;
    const publicState = { ...rest, players: Object.values(gameState.players) };
    if (gameState.gamePhase === 'turn' && playerId !== gameState.currentGiverId) {
        publicState.currentCard = null;
    }
    if (publicState.gamePhase === 'podium') {
        publicState.players.sort((a,b) => b.score - a.score);
    }
    return publicState;
}

setInterval(() => {
    for (const playerId in gameState.players) {
        io.to(playerId).emit('syncState', getPublicGameState(playerId));
    }
}, 1000);

server.listen(PORT, () => {
    console.log(`Servidor a rodar na porta ${PORT}`);
    loadCards();
});
