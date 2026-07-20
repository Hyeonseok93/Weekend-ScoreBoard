// IndexedDB configuration for victory song storage
const dbName = "ScoreboardDB";
const storeName = "AudioStore";

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            db.createObjectStore(storeName);
        };
        request.onsuccess = function(e) {
            resolve(e.target.result);
        };
        request.onerror = function(e) {
            reject(e.target.error);
        };
    });
}

async function saveAudioBlob(blob, team) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(blob, `victory_sound_${team}`);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadAudioBlob(team) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(`victory_sound_${team}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Preloaded song state
let objectUrls = {
    A: null,
    B: null
};
let songTitles = {
    A: "VICTORY",
    B: "VICTORY"
};

// Global handles for fade-out timers
let fadeInterval = null;
let stopTimeout = null;

async function loadVictorySongSources() {
    const defaultTitle = "VICTORY";
    
    for (let team of ['A', 'B']) {
        const storedTitle = localStorage.getItem(`scoreboard_song_title_${team}`);
        songTitles[team] = storedTitle ? storedTitle.replace(/\.[^/.]+$/, "") : defaultTitle;

        try {
            // Revert to default VICTORY.mp3 if localStorage was cleared
            const blob = storedTitle ? await loadAudioBlob(team) : null;
            if (blob) {
                if (objectUrls[team] && objectUrls[team] !== "VICTORY.mp3") {
                    URL.revokeObjectURL(objectUrls[team]);
                }
                objectUrls[team] = URL.createObjectURL(blob);
            } else {
                objectUrls[team] = "VICTORY.mp3";
            }
        } catch (err) {
            console.error(`Failed to load song for Team ${team}:`, err);
            objectUrls[team] = "VICTORY.mp3";
        }
    }
}

let activeTeamUpload = null;

function triggerFilePicker(team) {
    activeTeamUpload = team;
    document.getElementById("audioFilePicker").click();
}

async function handleAudioUpload(event) {
    const file = event.target.files[0];
    if (!file || !activeTeamUpload) return;

    try {
        await saveAudioBlob(file, activeTeamUpload);
        localStorage.setItem(`scoreboard_song_title_${activeTeamUpload}`, file.name);
        await loadVictorySongSources();
        
        // Show custom toast notification
        const playerName = document.getElementById(`name${activeTeamUpload}`).innerText;
        showToast(`'${playerName}'의 승리 음악이 변경되었습니다.`);
    } catch (err) {
        console.error("Failed to save victory audio file:", err);
        showToast("오디오 파일 저장에 실패했습니다.");
    }
    
    // Clear file picker target
    event.target.value = "";
}

// Check local storage for persistent scores/names
window.onload = function() {
    // Load Names
    const nameA = localStorage.getItem('scoreboard_nameA') || '이름 입력해주세요...';
    const nameB = localStorage.getItem('scoreboard_nameB') || '이름 입력해주세요...';
    document.getElementById('nameA').innerText = nameA;
    document.getElementById('nameB').innerText = nameB;

    // Load Wins
    const winsA = localStorage.getItem('scoreboard_winsA') || '0';
    const winsB = localStorage.getItem('scoreboard_winsB') || '0';
    document.getElementById('winsA').innerText = winsA;
    document.getElementById('winsB').innerText = winsB;

    // Load Scores
    const scoreA = localStorage.getItem('scoreboard_scoreA') || '0';
    const scoreB = localStorage.getItem('scoreboard_scoreB') || '0';
    document.getElementById('scoreA').innerText = scoreA;
    document.getElementById('scoreB').innerText = scoreB;

    // Load custom victory audio links if they exist
    loadVictorySongSources();
};

// Score Actions
function increaseScore(team) {
    const scoreElement = document.getElementById(`score${team}`);
    let score = parseInt(scoreElement.innerText);
    score++;
    scoreElement.innerText = score;
    localStorage.setItem(`scoreboard_score${team}`, score);
    triggerPulse(scoreElement);
}

// Pulse Animation Trigger
function triggerPulse(element) {
    element.classList.remove('pop');
    void element.offsetWidth; // Trigger reflow to restart animation
    element.classList.add('pop');
}

function decreaseScore(team) {
    const scoreElement = document.getElementById(`score${team}`);
    let score = parseInt(scoreElement.innerText);
    if (score > 0) {
        score--;
        scoreElement.innerText = score;
        localStorage.setItem(`scoreboard_score${team}`, score);
        triggerPulse(scoreElement);
    }
}

// Wins Actions
function increaseWins(team) {
    const winsElement = document.getElementById(`wins${team}`);
    let wins = parseInt(winsElement.innerText);
    wins++;
    winsElement.innerText = wins;
    localStorage.setItem(`scoreboard_wins${team}`, wins);

    // Play sound and show playing badge
    const audio = document.getElementById("trophySound");
    const musicWidget = document.getElementById("musicWidget");

    // Clear any active fades/timeouts
    if (fadeInterval) clearInterval(fadeInterval);
    if (stopTimeout) clearTimeout(stopTimeout);

    // Set source and load
    audio.volume = 1.0;
    audio.src = objectUrls[team] || "VICTORY.mp3";
    audio.currentTime = 0;
    
    // Update music widget UI title
    const titleElements = document.getElementsByClassName("music-title");
    if (titleElements.length > 0) {
        titleElements[0].innerText = songTitles[team];
    }

    // Audio error event (if VICTORY.mp3 doesn't exist, fail silently)
    audio.onerror = function() {
        console.log("Victory audio failed to load or is missing. Silencing.");
        stopMusic();
    };

    audio.play().then(() => {
        // Show widget
        musicWidget.style.display = "flex";

        // Set up automatic 30-second play with 3-second fade-out
        const playDuration = 30000; // 30 seconds total play time
        const fadeDuration = 3000;  // 3 seconds fade-out time
        const fadeStepTime = 100;   // Interval step in ms

        stopTimeout = setTimeout(() => {
            let steps = fadeDuration / fadeStepTime;
            let volumeStep = 1.0 / steps;
            
            fadeInterval = setInterval(() => {
                if (audio.volume > volumeStep) {
                    audio.volume -= volumeStep;
                } else {
                    audio.volume = 0;
                    clearInterval(fadeInterval);
                    fadeInterval = null;
                    stopMusic();
                }
            }, fadeStepTime);
        }, playDuration - fadeDuration);

        audio.onended = function() {
            stopMusic();
        };
    }).catch(err => {
        console.log("Audio play blocked or file not found:", err);
        stopMusic();
    });
}

function decreaseWins(team) {
    const winsElement = document.getElementById(`wins${team}`);
    let wins = parseInt(winsElement.innerText);
    if (wins > 0) {
        wins--;
        winsElement.innerText = wins;
        localStorage.setItem(`scoreboard_wins${team}`, wins);
    }
}

// Reset
function resetScores() {
    document.getElementById("scoreA").innerText = 0;
    document.getElementById("scoreB").innerText = 0;
    localStorage.setItem('scoreboard_scoreA', '0');
    localStorage.setItem('scoreboard_scoreB', '0');
    triggerPulse(document.getElementById("scoreA"));
    triggerPulse(document.getElementById("scoreB"));
}

// Stop Music
function stopMusic() {
    const audio = document.getElementById("trophySound");
    const musicWidget = document.getElementById("musicWidget");

    // Clear fade timers
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }
    if (stopTimeout) {
        clearTimeout(stopTimeout);
        stopTimeout = null;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1.0; // Restore volume level
    musicWidget.style.display = "none";
}

// Editable Names Logic
function saveName(team) {
    const nameElement = document.getElementById(`name${team}`);
    let name = nameElement.innerText.trim();
    if (name === "" || name === "이름 입력해주세요...") {
        name = '이름 입력해주세요...';
        nameElement.innerText = name;
    }
    localStorage.setItem(`scoreboard_name${team}`, name);
}

function handleNameKey(event, team) {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.target.blur();
    }
}

// Custom Toast Notification Logic
let toastTimeout = null;
function showToast(message) {
    const toast = document.getElementById("toastNotification");
    const toastMsg = document.getElementById("toastMessage");
    
    toastMsg.innerText = message;
    
    // Clear previous timeout if toast is spammed
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toast.classList.remove("show");
        // Trigger reflow to restart animation
        void toast.offsetWidth;
    }
    
    toast.classList.add("show");
    
    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
        toastTimeout = null;
    }, 3500);
}
