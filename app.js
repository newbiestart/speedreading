/**
 * Speed Reader — Personal RSVP Speed Reading App
 * Inspired by Squirt's ORP (Optimal Recognition Point) technique.
 * Uses Squirt's exact centering method: pre-render word, measure ORP offset,
 * then shift word so ORP character is always at the fixed center line.
 */
(function () {
    'use strict';

    // ─── State ───
    const state = {
        words: [],
        wordIndex: 0,
        wpm: parseInt(localStorage.getItem('sr-wpm') || '350', 10),
        paused: true,
        running: false,
        timerId: null,
        startTime: null,
    };

    // ─── DOM Refs ───
    const $ = (sel) => document.querySelector(sel);
    const inputView = $('#input-view');
    const readerView = $('#reader-view');
    const textArea = $('#text-input');
    const wordCountEl = $('#word-count');
    const wpmSlider = $('#wpm-slider');
    const wpmDisplay = $('#wpm-display');
    const startBtn = $('#start-btn');
    const backBtn = $('#back-btn');
    const wordContainer = $('#word-container');
    const prerenderer = $('#word-prerenderer');
    const wordDisplay = $('.word-display');
    const playBtn = $('#play-btn');
    const rewindBtn = $('#rewind-btn');
    const fwdBtn = $('#fwd-btn');
    const wpmDownBtn = $('#wpm-down-btn');
    const wpmUpBtn = $('#wpm-up-btn');
    const wpmLabel = $('#wpm-label');
    const progressBar = $('#progress-bar');
    const progressWrapper = $('.progress__bar-wrapper');
    const progressCurrent = $('#progress-current');
    const progressTotal = $('#progress-total');
    const progressPercent = $('#progress-percent');
    const statWords = $('#stat-words');
    const statTime = $('#stat-time');
    const displayHint = $('.word-display__hint');
    const finishedContainer = $('#finished-container');

    let lastNode = null;

    // ─── Init ───
    function init() {
        wpmSlider.value = state.wpm;
        updateWPMDisplay();

        textArea.addEventListener('input', onTextChange);
        wpmSlider.addEventListener('input', onSliderChange);
        startBtn.addEventListener('click', startReading);
        backBtn.addEventListener('click', goBack);
        playBtn.addEventListener('click', togglePlayPause);
        rewindBtn.addEventListener('click', rewind);
        fwdBtn.addEventListener('click', forward);
        wpmDownBtn.addEventListener('click', () => adjustWPM(-50));
        wpmUpBtn.addEventListener('click', () => adjustWPM(50));
        wordDisplay.addEventListener('click', function (e) {
            // Don't toggle if clicking on the finished container buttons
            if (e.target.closest('.finished')) return;
            togglePlayPause();
        });
        progressWrapper.addEventListener('click', seekProgress);

        document.addEventListener('keydown', handleKeyboard);

        onTextChange();
    }

    // ─── Text Processing ───
    function onTextChange() {
        const text = textArea.value.trim();
        const words = text ? text.split(/\s+/).filter(w => w.length) : [];
        wordCountEl.textContent = words.length + ' words';
        startBtn.disabled = words.length === 0;
    }

    function processText(text) {
        return text
            .trim()
            .replace(/\s+\n/g, '\n')
            .replace(/[,\.!:;](?!["'\)\]\}])/g, '$& ')
            .split(/\s+/)
            .filter(w => w.length > 0);
    }

    // ─── ORP (Optimal Recognition Point) — exact Squirt algorithm ───
    function getORPIndex(word) {
        let length = word.length;
        const lastChar = word[word.length - 1];
        if (lastChar === '\n') {
            length--;
        }
        const effectiveLastChar = word[length - 1];
        if (',.?!:;"'.includes(effectiveLastChar)) length--;
        if (length <= 1) return 0;
        if (length === 2) return 1;
        if (length === 3) return 1;
        return Math.floor(length / 2) - 1;
    }

    // ─── Smart Delay (from Squirt) ───
    function getDelay(word) {
        if (!word) return 1;
        let lastChar = word[word.length - 1];
        if (lastChar === '\n') lastChar = word[word.length - 2] || '';
        if ('""'.includes(lastChar)) lastChar = word[word.length - 2] || '';

        if (word === 'Mr.' || word === 'Mrs.' || word === 'Ms.') return 1;
        if (lastChar === '\n') return 3.5;
        if ('.!?'.includes(lastChar)) return 3;
        if (',;:–—'.includes(lastChar)) return 2;
        if (word.length < 4) return 1.2;
        if (word.length > 11) return 1.5;
        return 1;
    }

    // ─── Build Word Node (Squirt's approach) ───
    // Creates a div with spans for each char, with a center() method
    // that measures the ORP character's position and shifts the word
    // so the ORP is always at the center point.
    function buildWordNode(word) {
        const node = document.createElement('div');
        node.className = 'word';
        node.dataset.word = word;

        const cleanWord = word.replace(/\n/g, '');
        const orpIdx = getORPIndex(word);

        cleanWord.split('').forEach((char, idx) => {
            const span = document.createElement('span');
            span.textContent = char;
            if (idx === orpIdx) span.classList.add('orp');
            node.appendChild(span);
        });

        // center() — Squirt's exact technique:
        // Pre-render in hidden container, measure ORP offset, shift word left
        const orpSpan = node.children[orpIdx];
        node.centerWord = function () {
            if (!orpSpan) return;
            const val = orpSpan.offsetLeft + (orpSpan.offsetWidth / 2);
            node.style.left = '-' + val + 'px';
        };

        return node;
    }

    // ─── Render Word with Squirt-style centering ───
    function renderWord(word) {
        // Remove previous word
        if (lastNode && lastNode.parentNode) {
            lastNode.remove();
        }

        if (!word) return;

        const node = buildWordNode(word);

        // Pre-render to measure (Squirt technique)
        prerenderer.appendChild(node);
        node.centerWord();

        // Move to visible container
        prerenderer.removeChild(node);
        wordContainer.appendChild(node);
        lastNode = node;
    }

    // ─── Update Progress ───
    function updateProgress() {
        const total = state.words.length;
        const current = state.wordIndex;
        const pct = total > 0 ? (current / total) * 100 : 0;
        progressBar.style.width = pct + '%';
        progressCurrent.textContent = current;
        progressTotal.textContent = total;
        progressPercent.textContent = Math.round(pct) + '%';
    }

    // ─── WPM ───
    function updateWPMDisplay() {
        wpmDisplay.textContent = state.wpm;
        wpmLabel.textContent = state.wpm + ' WPM';
    }

    function onSliderChange() {
        state.wpm = parseInt(wpmSlider.value, 10);
        localStorage.setItem('sr-wpm', state.wpm);
        updateWPMDisplay();
    }

    function adjustWPM(delta) {
        state.wpm = Math.max(50, Math.min(1500, state.wpm + delta));
        wpmSlider.value = state.wpm;
        localStorage.setItem('sr-wpm', state.wpm);
        updateWPMDisplay();
    }

    function getIntervalMs() {
        return 60000 / state.wpm;
    }

    // ─── Countdown and Start ───
    function startReading() {
        const text = textArea.value.trim();
        if (!text) return;

        state.words = processText(text);
        state.wordIndex = 0;
        state.paused = true;
        state.running = true;
        state.startTime = null;
        lastNode = null;

        // Switch view
        inputView.classList.remove('view--active');
        readerView.classList.add('view--active');

        // Reset display
        wordContainer.innerHTML = '';
        finishedContainer.style.display = 'none';
        wordContainer.style.display = 'block';

        updateProgress();
        statWords.textContent = state.words.length;
        if (displayHint) displayHint.style.display = '';

        // Countdown 3, 2, 1
        countdown(3, () => {
            if (displayHint) displayHint.style.display = 'none';
            state.paused = false;
            state.startTime = Date.now();
            updatePlayButton();
            nextWord();
        });
    }

    function countdown(n, callback) {
        if (n <= 0) {
            // Clear the countdown number before starting real words
            wordContainer.innerHTML = '';
            callback();
            return;
        }
        // Remove any existing word
        if (lastNode && lastNode.parentNode) lastNode.remove();
        lastNode = null;

        const node = document.createElement('div');
        node.className = 'word countdown-num';
        node.textContent = n;
        // Center the countdown number
        wordContainer.innerHTML = '';
        wordContainer.appendChild(node);
        // Center it after layout
        requestAnimationFrame(() => {
            const w = node.offsetWidth;
            node.style.left = '-' + (w / 2) + 'px';
        });

        setTimeout(() => {
            countdown(n - 1, callback);
        }, 700);
    }

    // ─── Playback ───
    function nextWord() {
        if (state.paused || !state.running) return;

        if (state.wordIndex >= state.words.length) {
            finishReading();
            return;
        }

        const word = state.words[state.wordIndex];
        renderWord(word);
        state.wordIndex++;
        updateProgress();

        const delay = getDelay(word);
        state.timerId = setTimeout(nextWord, getIntervalMs() * delay);
    }

    function togglePlayPause() {
        if (!state.running) return;

        state.paused = !state.paused;
        updatePlayButton();

        if (!state.paused) {
            if (!state.startTime) state.startTime = Date.now();
            nextWord();
        } else {
            clearTimeout(state.timerId);
        }
    }

    function updatePlayButton() {
        playBtn.textContent = state.paused ? '▶' : '⏸';
        playBtn.title = state.paused ? 'Play (Space)' : 'Pause (Space)';
    }

    function rewind() {
        clearTimeout(state.timerId);
        const wordsBack = Math.floor(10 * state.wpm / 60);
        state.wordIndex = Math.max(0, state.wordIndex - wordsBack);

        while (state.wordIndex > 0 && !state.words[state.wordIndex - 1].match(/[.!?]$/)) {
            state.wordIndex--;
        }

        const word = state.words[state.wordIndex];
        if (word) renderWord(word);
        updateProgress();

        if (!state.paused) {
            nextWord();
        }
    }

    function forward() {
        clearTimeout(state.timerId);
        const wordsFwd = Math.floor(10 * state.wpm / 60);
        state.wordIndex = Math.min(state.words.length - 1, state.wordIndex + wordsFwd);

        while (state.wordIndex < state.words.length - 1 && !state.words[state.wordIndex].match(/[.!?]$/)) {
            state.wordIndex++;
        }
        state.wordIndex = Math.min(state.wordIndex + 1, state.words.length - 1);

        const word = state.words[state.wordIndex];
        if (word) renderWord(word);
        updateProgress();

        if (!state.paused) {
            nextWord();
        }
    }

    function seekProgress(e) {
        const rect = progressWrapper.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        state.wordIndex = Math.floor(pct * state.words.length);
        state.wordIndex = Math.max(0, Math.min(state.wordIndex, state.words.length - 1));

        clearTimeout(state.timerId);
        const word = state.words[state.wordIndex];
        if (word) renderWord(word);
        updateProgress();

        if (!state.paused) {
            nextWord();
        }
    }

    // ─── Finish ───
    function finishReading() {
        state.running = false;
        clearTimeout(state.timerId);

        if (lastNode && lastNode.parentNode) lastNode.remove();
        lastNode = null;

        const elapsed = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
        const minutes = Math.floor(elapsed / 60);
        const seconds = Math.round(elapsed % 60);
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        wordContainer.style.display = 'none';
        finishedContainer.style.display = 'flex';
        finishedContainer.innerHTML = `
      <div class="finished__emoji">🎉</div>
      <div class="finished__title">Reading Complete!</div>
      <div class="finished__stats">
        You read <span class="finished__stat-value">${state.words.length}</span> words<br>
        in <span class="finished__stat-value">${timeStr}</span> at <span class="finished__stat-value">${state.wpm}</span> WPM
      </div>
      <div class="finished__actions">
        <button class="btn btn--primary" style="width:auto;padding:0.75rem 2rem" id="read-again-btn">Read Again</button>
        <button class="btn btn--ghost" id="new-text-btn">New Text</button>
      </div>
    `;

        document.getElementById('read-again-btn').addEventListener('click', restartReading);
        document.getElementById('new-text-btn').addEventListener('click', goBack);

        if (displayHint) displayHint.style.display = 'none';
        updateProgress();
    }

    function restartReading() {
        state.wordIndex = 0;
        state.running = true;
        state.paused = true;
        state.startTime = null;
        lastNode = null;

        finishedContainer.style.display = 'none';
        wordContainer.style.display = 'block';
        wordContainer.innerHTML = '';

        updateProgress();
        updatePlayButton();
        if (displayHint) displayHint.style.display = '';

        countdown(3, () => {
            if (displayHint) displayHint.style.display = 'none';
            state.paused = false;
            state.startTime = Date.now();
            updatePlayButton();
            nextWord();
        });
    }

    // ─── Go Back ───
    function goBack() {
        state.running = false;
        state.paused = true;
        clearTimeout(state.timerId);
        lastNode = null;

        wordContainer.innerHTML = '';
        finishedContainer.style.display = 'none';
        wordContainer.style.display = 'block';

        readerView.classList.remove('view--active');
        inputView.classList.add('view--active');
        updatePlayButton();
    }

    // ─── Keyboard Shortcuts ───
    function handleKeyboard(e) {
        if (!state.running) return;
        if (e.target === textArea) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'Escape':
                e.preventDefault();
                goBack();
                break;
            case 'ArrowUp':
                e.preventDefault();
                adjustWPM(25);
                break;
            case 'ArrowDown':
                e.preventDefault();
                adjustWPM(-25);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                rewind();
                break;
            case 'ArrowRight':
                e.preventDefault();
                forward();
                break;
        }
    }

    // ─── Boot ───
    init();
})();
