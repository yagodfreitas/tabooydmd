document.addEventListener("DOMContentLoaded", () => {
    const socket = io();

    // --- ELEMENTOS DO DOM ---
    const screens = { lobby: document.getElementById('lobby-screen'), game: document.getElementById('game-screen'), podium: document.getElementById('podium-screen') };
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    const playerList = document.getElementById('player-list');
    const startGameBtn = document.getElementById('start-game-btn');
    const roundNumber = document.getElementById('round-number');
    const timerDisplay = document.getElementById('timer');
    const currentGiverName = document.getElementById('current-giver-name');
    const scoreboard = document.getElementById('scoreboard');
    const giverPanel = document.getElementById('giver-panel');
    const guesserPanel = document.getElementById('guesser-panel');
    const targetWord = document.getElementById('target-word');
    const tabooWords = document.getElementById('taboo-list');
    const skipCardBtn = document.getElementById('skip-card-btn');
    const giverNameForGuesser = document.getElementById('giver-name-for-guesser');
    const guessForm = document.getElementById('guess-form');
    const guessInput = document.getElementById('guess-input');
    const reportBtn = document.getElementById('report-btn');
    const reportCount = document.getElementById('report-count');
    const guessLog = document.getElementById('guess-log');
    const podiumList = document.getElementById('podium-list');
    const playAgainBtn = document.getElementById('play-again-btn');
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
    let lastReviewedCardWord = null;
    let lastGiverId = null; // Para detetar o início de um novo turno
    let lastCardResolutionCount = 0; // Para detetar novas cartas dentro de um turno
    const REVIEW_DURATION_SECONDS = 10;

    // --- FUNÇÃO DE RENDERIZAÇÃO CENTRAL ---
    function renderGameState(state) {
        if (!myPlayerId) return;

        // Detetar início de um novo turno para reativar o botão de denúncia
        if (state.currentGiverId !== lastGiverId) {
            lastGiverId = state.currentGiverId;
            reportBtn.disabled = false;
            lastCardResolutionCount = 0; // Reinicia o contador para o novo turno
        }

        // Detetar uma nova carta dentro do mesmo turno (após acerto, pulo ou anulação)
        const currentCardResolutionCount = (state.guessLog || []).filter(log => ['success', 'invalid', 'skipped'].includes(log.type)).length;
        if (currentCardResolutionCount > lastCardResolutionCount) {
            lastCardResolutionCount = currentCardResolutionCount;
            reportBtn.disabled = false; // Reativa o botão para a nova carta
        }

        Object.values(screens).forEach(s => s.classList.remove('active'));
        if (state.gamePhase === 'lobby') screens.lobby.classList.add('active');
        else if (state.gamePhase === 'podium') screens.podium.classList.add('active');
        else screens.game.classList.add('active');

        const me = state.players.find(p => p.id === myPlayerId);
        const myPlayerIsHost = me ? me.isHost : false;
        playerList.innerHTML = state.players.map(p => `<li><span>${p.name}</span>${p.isHost ? '<span class="host-tag">HOST</span>' : ''}</li>`).join('');
        startGameBtn.disabled = state.players.length < 3;
        startGameBtn.classList.toggle('hidden', !myPlayerIsHost);

        roundNumber.textContent = state.currentRound;
        timerDisplay.textContent = state.timeLeft;
        const giver = state.players.find(p => p.id === state.currentGiverId);
        currentGiverName.textContent = giver ? giver.name : '...';
        
        scoreboard.innerHTML = [...state.players].sort((a,b) => b.score - a.score).map(p => `<li><span>${p.name}</span> <span class="score">${p.score}</span></li>`).join('');

        const isGiver = myPlayerId === state.currentGiverId;
        giverPanel.classList.toggle('hidden', !isGiver);
        guesserPanel.classList.toggle('hidden', isGiver);
        
        if (isGiver && state.currentCard) {
            targetWord.textContent = state.currentCard.palavraAlvo;
            tabooWords.innerHTML = state.currentCard.tabus.map(t => `<li>${t}</li>`).join('');
        }
        giverNameForGuesser.textContent = giver ? giver.name : '...';

        guessLog.innerHTML = (state.guessLog || []).map(log => {
            let content = '';
            switch(log.type) {
                case 'success':
                    content = `<strong class="guess-log-success">🎯 ${log.guesserName} acertou! (+4 pts)</strong><br><small>Dica de: ${log.giverName} (+1 pt)</small>`;
                    break;
                case 'invalid':
                    content = `<strong class="guess-log-invalid">🚨 Palavra "${log.word}" foi invalidada!</strong>`;
                    break;
                case 'skipped':
                    content = `<strong class="guess-log-skipped">⏩ A palavra "${log.word}" foi pulada!</strong>`;
                    break;
                default:
                    content = `<strong>${log.name}:</strong> ${log.text}`;
            }
            return `<p>${content}</p>`;
        }).join('');
        if (guessLog.children.length > 0) {
            guessLog.scrollTop = guessLog.scrollHeight;
        }

        reviewOverlay.classList.toggle('hidden', state.gamePhase !== 'review');
        if (state.gamePhase === 'review') {
            if (state.currentReviewCard) {
                reviewCardArea.classList.remove('hidden');
                reviewResultArea.classList.add('hidden');
                const reviewGiver = state.players.find(p => p.id === state.currentReviewCard.giverId);
                const reviewGuesser = state.players.find(p => p.id === state.currentReviewCard.guesserId);
                reviewGuesserName.textContent = reviewGuesser ? reviewGuesser.name : '?';
                reviewTargetWord.textContent = state.currentReviewCard.card.palavraAlvo;
                reviewTabooList.innerHTML = state.currentReviewCard.card.tabus.map(t => `<li>${t}</li>`).join('');
                
                const currentCardWord = state.currentReviewCard.card.palavraAlvo;
                if (currentCardWord !== lastReviewedCardWord) {
                    lastReviewedCardWord = currentCardWord;
                    // Reativa o botão de denúncia da avaliação, exceto para o giver
                    reviewReportBtn.disabled = (myPlayerId === (reviewGiver ? reviewGiver.id : null));
                    reviewTimerProgress.style.transition = 'none';
                    reviewTimerProgress.style.width = '100%';
                    setTimeout(() => {
                        reviewTimerProgress.style.transition = `width ${REVIEW_DURATION_SECONDS}s linear`;
                        reviewTimerProgress.style.width = '0%';
                    }, 100);
                }
            } else if (state.reviewResultData) {
                lastReviewedCardWord = null;
                reviewCardArea.classList.add('hidden');
                reviewResultArea.classList.remove('hidden');
                if (state.reviewResultData.invalidated) {
                    reviewResultText.textContent = `Carta "${state.reviewResultData.word}" invalidada! (${state.reviewResultData.reports}/${state.reviewResultData.required} votos).`;
                    reviewResultText.className = 'invalidated';
                } else {
                    reviewResultText.textContent = `Carta "${state.reviewResultData.word}" validada. (${state.reviewResultData.reports}/${state.reviewResultData.required} votos)`;
                    reviewResultText.className = 'validated';
                }
            }
        }

        if (state.gamePhase === 'podium') {
            playAgainBtn.classList.toggle('hidden', !myPlayerIsHost);
            const medals = ['🥇', '🥈', '🥉'];
            podiumList.innerHTML = state.players.map((p, i) => `<li class="podium-${i + 1}"><span>${medals[i] || '🔹'} ${p.name}</span><span class="score">${p.score} pts</span></li>`).join('');
        }
    }

    // --- EVENT HANDLERS ---
    startGameBtn.addEventListener('click', () => socket.emit('startGame'));
    playAgainBtn.addEventListener('click', () => socket.emit('playAgain'));
    reviewReportBtn.addEventListener('click', () => { socket.emit('reportReview'); reviewReportBtn.disabled = true; });
    skipCardBtn.addEventListener('click', () => socket.emit('skipCard'));
    guessForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const guess = guessInput.value.trim();
        if (guess) { socket.emit('guess', guess); guessInput.value = ''; }
    });
    reportBtn.addEventListener('click', () => { socket.emit('reportLive'); reportBtn.disabled = true; });

    // --- LÓGICA DE CONEXÃO E SOCKETS ---
    const urlParams = new URLSearchParams(window.location.search);
    const playerName = urlParams.get("name");
    if (playerName) { socket.emit("joinLobby", playerName); } 
    else { window.location.href = '/'; }

    socket.on('welcome', (data) => { myPlayerId = data.id; });
    socket.on('nameError', (message) => { alert(message); window.location.href = '/'; });
    socket.on('gameError', (message) => showNotification(message, 'error'));

    socket.on('syncState', renderGameState);
});
