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

    let myPlayerId = null;
    let myPlayerIsHost = false;

    // --- FUNÇÕES DE UI ---
    function showScreen(screenId) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenId].classList.add('active');
    }

    function showNotification(message, type = 'error') {
        notificationText.textContent = message;
        notification.className = `notification show ${type}`;
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    function updateLobby(players) {
        playerList.innerHTML = players.map(p => `
            <li>
                <span>${p.name}</span>
                ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
            </li>
        `).join('');
        startGameBtn.disabled = players.length < 3;
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

    // --- LÓGICA DE INICIALIZAÇÃO ---
    const urlParams = new URLSearchParams(window.location.search);
    const playerName = urlParams.get("name");
    if (playerName) {
        socket.emit("joinLobby", playerName);
    } else {
        window.location.href = '/'; // Se não tiver nome, volta para o login
    }

    // --- EVENT HANDLERS ---
    startGameBtn.addEventListener('click', () => socket.emit('startGame'));
    playAgainBtn.addEventListener('click', () => socket.emit('playAgain'));
    
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
        myPlayerIsHost = data.isHost;
        if (myPlayerIsHost) {
            startGameBtn.classList.remove('hidden');
            playAgainBtn.classList.remove('hidden');
        }
    });

    socket.on('lobbyUpdate', updateLobby);
    socket.on('nameError', (message) => {
        alert(message);
        window.location.href = '/';
    });
    socket.on('gameError', (message) => showNotification(message, 'error'));

    socket.on('newTurn', (data) => {
        showScreen('game');
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

    socket.on('gameOver', (scores) => {
        showScreen('podium');
        const medals = ['🥇', '🥈', '🥉'];
        podiumList.innerHTML = scores.map((p, i) => `
            <li class="podium-${i + 1}">
                <span>${medals[i] || '🔹'} ${p.name}</span>
                <span class="score">${p.score} pts</span>
            </li>
        `).join('');
    });

    socket.on('gameReset', () => {
        showScreen('lobby');
        if (myPlayerIsHost) {
            startGameBtn.classList.remove('hidden');
        }
    });
});
