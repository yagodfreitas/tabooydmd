document.addEventListener("DOMContentLoaded", () => {
    const socket = io();

    // --- ELEMENTOS DO DOM ---
    const screens = {
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen'),
        podium: document.getElementById('podium-screen'),
    };
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');

    // Lobby
    const playerList = document.getElementById('player-list');
    const startGameBtn = document.getElementById('start-game-btn');

    // Jogo
    const roundNumber = document.getElementById('round-number');
    const timerDisplay = document.getElementById('timer');
    const currentGiverName = document.getElementById('current-giver-name');
    const scoreboard = document.getElementById('scoreboard');
    const giverView = document.getElementById('giver-view');
    const guesserView = document.getElementById('guesser-view');
    const giverNameForGuesser = document.getElementById('giver-name-for-guesser');
    const targetWord = document.getElementById('target-word');
    const tabooWords = document.getElementById('taboo-list');
    const guessForm = document.getElementById('guess-form');
    const guessInput = document.getElementById('guess-input');
    const guessLog = document.getElementById('guess-log');
    const reportBtn = document.getElementById('report-btn');
    const reportCount = document.getElementById('report-count');

    // Pódio
    const podiumList = document.getElementById('podium-list');
    const playAgainBtn = document.getElementById('play-again-btn');

    // --- NOVOS ELEMENTOS PARA AVALIAÇÃO ---
    const reviewOverlay = document.getElementById('review-overlay');
    const reviewTitle = document.getElementById('review-title');
    const reviewCardArea = document.getElementById('review-card-area');
    const reviewTimerProgress = document.getElementById('review-timer-progress');
    const reviewGuesserName = document.getElementById('review-guesser-name');
    const reviewTargetWord = document.getElementById('review-target-word');
    const reviewTabooList = document.getElementById('review-taboo-list');
    const reviewReportBtn = document.getElementById('review-report-btn');
    const reviewResultArea = document.getElementById('review-result-area');
    const reviewResultText = document.getElementById('review-result-text');


    let myPlayerId = null;
    let myPlayerIsHost = false;
    let currentGiverId = null;

    // --- LÓGICA DE INICIALIZAÇÃO ---
    const urlParams = new URLSearchParams(window.location.search);
    const playerName = urlParams.get("name");
    if (playerName) {
        socket.emit("joinLobby", playerName);
    } else {
        window.location.href = '/';
    }

    // --- FUNÇÕES DE UI ---
    function showScreen(screenId) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        if (screens[screenId]) screens[screenId].classList.add('active');
    }

    function showNotification(message, type = 'error') {
        notificationText.textContent = message;
        notification.className = `notification show ${type}`;
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    function updateLobby(players) {
        // Encontra o jogador atual na lista para verificar se é o host
        const me = players.find(p => p.id === myPlayerId);
        if (me) {
            myPlayerIsHost = me.isHost;
        }

        playerList.innerHTML = players.map(p => `
            <li>
                <span>${p.name}</span>
                ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
            </li>
        `).join('');
        
        startGameBtn.disabled = players.length < 3;

        // Mostra ou esconde o botão "Iniciar Jogo" baseado no status de host atualizado
        if (myPlayerIsHost) {
            startGameBtn.classList.remove('hidden');
        } else {
            startGameBtn.classList.add('hidden');
        }
    }

    function updateScoreboard(players) {
        scoreboard.innerHTML = players
            .sort((a, b) => b.score - a.score)
            .map(p => `<li><span>${p.name}</span> <span class="score">${p.score}</span></li>`)
            .join('');
    }

    function addGuessToLog(data) {
        const logEntry = document.createElement('p');
        let content = '';
        switch(data.type) {
            case 'success':
                content = `<strong class="guess-log-success">🎯 ${data.guesserName} acertou! (+4 pts)</strong><br><small>Dica de: ${data.giverName} (+1 pt)</small>`;
                break;
            case 'invalid':
                content = `<strong class="guess-log-invalid">🚨 Palavra "${data.word}" foi invalidada por denúncias!</strong>`;
                break;
            default:
                content = `<strong>${data.name}:</strong> ${data.text}`;
        }
        logEntry.innerHTML = content;
        guessLog.appendChild(logEntry);
        guessLog.scrollTop = guessLog.scrollHeight;
    }

    // --- EVENT HANDLERS ---
    startGameBtn.addEventListener('click', () => socket.emit('startGame'));
    playAgainBtn.addEventListener('click', () => socket.emit('playAgain'));
    reviewReportBtn.addEventListener('click', () => {
        socket.emit('reportReview');
        reviewReportBtn.disabled = true; // Desabilita após votar
    });
    
    guessForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const guess = guessInput.value.trim();
        if (guess) {
            socket.emit('guess', guess);
            guessInput.value = '';
        }
    });

    reportBtn.addEventListener('click', () => {
        socket.emit('reportLive');
        reportBtn.disabled = true;
    });

    // --- SOCKET.IO LISTENERS ---
    socket.on('welcome', (data) => {
        myPlayerId = data.id;
        // O status de host e a visibilidade do botão serão definidos no primeiro 'lobbyUpdate'
    });

    socket.on('lobbyUpdate', updateLobby);

    socket.on('nameError', (message) => {
        alert(message);
        window.location.href = '/';
    });

    socket.on('gameError', (message) => showNotification(message, 'error'));

    socket.on('newTurn', (data) => {
        showScreen('game');
        currentGiverId = data.giver.id;
        roundNumber.textContent = data.round;
        timerDisplay.textContent = data.timeLeft;
        currentGiverName.textContent = data.giver.name;
        guessLog.innerHTML = '';
        
        const isGiver = data.giver.id === myPlayerId;
        giverView.classList.toggle('hidden', !isGiver);
        guesserView.classList.toggle('hidden', isGiver);
        reportBtn.classList.toggle('hidden', isGiver);
        
        if (!isGiver) {
            giverNameForGuesser.textContent = data.giver.name;
        }
    });

    socket.on('cardUpdate', (card) => {
        targetWord.textContent = card.palavraAlvo;
        tabooWords.innerHTML = card.tabus.map(t => `<li>${t}</li>`).join('');
    });
    
    socket.on('newCardInPlay', () => {
        reportBtn.disabled = false;
        reportCount.textContent = '0';
    });

    socket.on('timerUpdate', (time) => timerDisplay.textContent = time);
    socket.on('scoreUpdate', updateScoreboard);

    socket.on('guessBroadcast', (data) => addGuessToLog(data));
    socket.on('cardSuccess', (data) => addGuessToLog({ ...data, type: 'success' }));
    socket.on('cardInvalidated', (data) => addGuessToLog({ ...data, type: 'invalid' }));

    socket.on('reportCount', (data) => {
        reportCount.textContent = `${data.count}/${data.required}`;
    });

    // --- NOVOS LISTENERS PARA AVALIAÇÃO ---
    socket.on('startReview', (data) => {
        reviewOverlay.classList.remove('hidden');
        reviewTitle.textContent = `Fase de Avaliação (${data.totalCards} cartas)`;
        reviewCardArea.classList.add('hidden');
        reviewResultArea.classList.remove('hidden');
        reviewResultText.textContent = "Iniciando avaliação...";
        reviewResultText.className = '';
    });

    socket.on('showReviewCard', (data) => {
        reviewCardArea.classList.remove('hidden');
        reviewResultArea.classList.add('hidden');
        
        reviewGuesserName.textContent = data.guesserName;
        reviewTargetWord.textContent = data.card.palavraAlvo;
        reviewTabooList.innerHTML = data.card.tabus.map(t => `<li>${t}</li>`).join('');

        // Jogador da vez não pode denunciar
        reviewReportBtn.disabled = (myPlayerId === currentGiverId);

        // Animação da barra de tempo
        reviewTimerProgress.style.transition = 'none';
        reviewTimerProgress.style.width = '100%';
        setTimeout(() => {
            reviewTimerProgress.style.transition = 'width 5s linear';
            reviewTimerProgress.style.width = '0%';
        }, 100);
    });

    socket.on('reviewResult', (data) => {
        reviewCardArea.classList.add('hidden');
        reviewResultArea.classList.remove('hidden');
        if (data.invalidated) {
            reviewResultText.textContent = `Carta "${data.word}" invalidada! (${data.reports}/${data.required} votos). -1 pt para o giver.`;
            reviewResultText.className = 'invalidated';
        } else {
            reviewResultText.textContent = `Carta "${data.word}" validada. (${data.reports}/${data.required} votos)`;
            reviewResultText.className = 'validated';
        }
    });

    socket.on('endReview', () => {
        reviewOverlay.classList.add('hidden');
    });

    socket.on('gameOver', (scores) => {
        showScreen('podium');
        const medals = ['🥇', '🥈', '🥉'];
        podiumList.innerHTML = scores.map((p, i) => `
            <li class="podium-${i + 1}">
                <span>${medals[i] || '🔹'} ${p.name}</span>
                <span class="score">${p.score} pts</span>
            </li>
        `).join('');

        // Usa a variável 'myPlayerIsHost' que está sempre atualizada
        if (myPlayerIsHost) {
            playAgainBtn.classList.remove('hidden');
        } else {
            playAgainBtn.classList.add('hidden');
        }
    });

    socket.on('gameReset', () => {
        showScreen('lobby');
        reviewOverlay.classList.add('hidden');
        // Não é necessário código aqui, pois o evento 'lobbyUpdate' cuidará de mostrar o botão de iniciar, se aplicável.
    });
});
