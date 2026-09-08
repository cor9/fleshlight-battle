/* ============================================================
   FLESHLIGHT BATTLE — game logic (static site, no backend)
   Cams run in Kosmi; this page runs the battle structure.
   ============================================================ */

// --- Round definitions ---
const STEPS = [
    {
        title: "Getting Naked & Free-Dick Warm-Up",
        duration: 25,
        instruction: "Strip completely — nothing left on. Get that penis chubby hands-free: swing it side to side, up and down, back and forth. Give it a few helicopter spins. Make it bounce and sway so your opponent can see it moving freely. End with an ass slap on each cheek.",
        proof: "25 seconds on stream"
    },
    {
        title: "Slow Sensual Stroker Start",
        duration: 45,
        instruction: "LUBE UP! Slide fully into your fleshlight/stroker. Stroke slow and deep the entire time — full length, controlled, deliberate. No racing. Feel every inch. Make eye contact with the camera / your opponent when you can. Then stop completely and hold still inside the toy for 5 seconds.",
        proof: "45 seconds of slow, relaxed stroking on stream"
    },
    {
        title: "Fuck Your Plastic",
        duration: null, // player chooses 30 or 45
        choices: [30, 45],
        instruction: "Secure the fleshlight/stroker so it stays in place — shove it between a mattress, use a mount, your hands, or lay on the bed/couch/floor. Now FUCK it. Steady, rhythmic hip thrusts the whole time. Medium pace, keep it consistent.",
        proof: "30–45 seconds of humping on stream"
    },
    {
        title: "Primal Hard & Fast",
        duration: 30,
        instruction: "Go nuts. Determined. Hard, fast, aggressive strokes or thrusts into the toy for the full 30 seconds. BONUS: use your mic — grunt, breathe heavy, get noisy and messy. This is the competitive surge.",
        proof: "30 seconds of pounding on stream (mic encouraged)"
    },
    {
        title: "Build That Load — Climb to the Brink",
        duration: 60,
        instruction: "Hard, fast pounding (stroke or fuck)... breathe... slow deep grinding... then ramp back up again. Keep the intensity climbing. You should both be leaking and pushing it right to the EDGE. DO NOT CUM YET, BUDDY!",
        proof: "Up to 60 seconds of leaky build-up on stream"
    },
    {
        title: "FINAL ROUND — Cummy Shaking Orgasm",
        duration: null, // open-ended (stopwatch)
        openEnded: true,
        instruction: "Pick your ending — every player must choose a DIFFERENT one. Then bust that nut on stream: milk it all out of your penis, buddy!",
        proof: "Bust on stream — no time limit",
        endings: [
            {
                letter: "A",
                name: "Breed the Toy",
                desc: "Fuck it hard and empty everything inside. Keep thrusting through the orgasm. Leave the load in there — show the toy afterward if you want."
            },
            {
                letter: "B",
                name: "Pull-Out Load",
                desc: "Ride the edge, then pull out and shoot into your hand or onto your belly/abs. Keep the camera on the ropes and the aftershocks."
            },
            {
                letter: "C",
                name: "Ruin & Eat",
                desc: "Stroke/fuck to the point of no return, then STOP — toy off, hands off. Ruin it. Collect the dripping cum, EAT IT, show it in your mouth, and swallow."
            },
            {
                letter: "D",
                name: "Surface Load + Tease",
                desc: "Cum onto your desk, floor, or any flat surface in view. Then use the fresh load to smear and tease your sensitive cockhead while you're still twitching."
            }
        ]
    }
];

// --- State ---
const state = {
    players: [],          // [{name, ending: null|{letter,name}, done:false}]
    stepIndex: 0,
    turnOrder: [],        // shuffled player indices for current step
    turnIndex: 0,
    takenEndings: new Set(),
    timer: null,
    seconds: 0,
    camRoom: null
};

// --- DOM helpers ---
const $ = (id) => document.getElementById(id);
const screens = {
    setup: $("setupScreen"),
    battle: $("battleScreen"),
    complete: $("completeScreen")
};

function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
        el.classList.toggle("hidden", key !== name);
    });
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

/* ============================================================
   SETUP SCREEN
   ============================================================ */

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

function addPlayerInput(name = "") {
    const container = $("playerInputs");
    if (container.children.length >= MAX_PLAYERS) return;

    const row = document.createElement("div");
    row.className = "player-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "text-input player-name-input";
    input.placeholder = `Player ${container.children.length + 1} name`;
    input.maxLength = 16;
    input.value = name;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-player";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove player";
    removeBtn.addEventListener("click", () => {
        if (container.children.length > MIN_PLAYERS) row.remove();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

function initSetup() {
    addPlayerInput();
    addPlayerInput();

    $("addPlayerBtn").addEventListener("click", () => addPlayerInput());

    $("saveCamLinkBtn").addEventListener("click", () => {
        const val = $("camLinkInput").value.trim();
        if (val) setCamRoom(val);
    });

    $("copyCamLinkBtn").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(state.camRoom);
            $("copyCamLinkBtn").textContent = "Copied!";
            setTimeout(() => ($("copyCamLinkBtn").textContent = "Copy"), 1500);
        } catch (_) { /* clipboard blocked; user can copy manually */ }
    });

    $("shareCamLinkBtn").addEventListener("click", async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "FLESHLIGHT BATTLE — Cam Room",
                    text: "Loser breeds first. Join the battle cam room:",
                    url: state.camRoom
                });
                return;
            } catch (_) { /* user cancelled share sheet */ }
        }
        // Fallback: copy so they can paste into a text
        try {
            await navigator.clipboard.writeText(state.camRoom);
            alert("Link copied — paste it in a text to your opponent!");
        } catch (_) { /* clipboard blocked */ }
    });

    $("startBattleBtn").addEventListener("click", startBattle);
}

function setCamRoom(url) {
    state.camRoom = url;
    $("camLinkDisplay").classList.remove("hidden");
    $("camLinkText").textContent = url;
    $("openCamLink").href = url;
    $("camBarLink").href = url;
    $("camBarLink").textContent = "Cam Room ↗";
}

function startBattle() {
    const names = [...document.querySelectorAll(".player-name-input")]
        .map((i) => i.value.trim())
        .filter(Boolean);

    if (names.length < MIN_PLAYERS) {
        alert(`Need at least ${MIN_PLAYERS} players to battle!`);
        return;
    }

    state.players = names.map((name) => ({ name, ending: null, done: false }));
    state.stepIndex = 0;
    state.takenEndings = new Set();

    if (state.camRoom && state.camRoom.startsWith("http")) {
        $("camBar").classList.remove("hidden");
    }

    showScreen("battle");
    startStep(0);
}

/* ============================================================
   BATTLE FLOW
   ============================================================ */

function currentStep() {
    return STEPS[state.stepIndex];
}

function startStep(index) {
    state.stepIndex = index;
    state.turnOrder = shuffle(state.players.map((_, i) => i));
    state.turnIndex = 0;

    const step = currentStep();
    $("roundBadge").textContent = `Round ${index + 1} of ${STEPS.length}`;
    $("stepTitle").textContent = step.title;
    $("stepInstruction").textContent = step.instruction;
    $("stepProof").textContent = `📹 ${step.proof}`;

    // Hide turn-specific UI until a turn is chosen
    $("timerSection").classList.remove("hidden");
    $("durationChoice").classList.add("hidden");
    $("endingPicker").classList.add("hidden");
    $("chosenEndingLabel").classList.add("hidden");
    $("finishTurnBtn").classList.add("hidden");
    $("startTimerBtn").classList.remove("hidden");
    stopTimerInterval();
    $("timerDisplay").textContent = "0:00";

    presentTurn();
}

function presentTurn() {
    stopTimerInterval();
    renderTurnOrder();

    const playerIdx = state.turnOrder[state.turnIndex];
    const player = state.players[playerIdx];
    const step = currentStep();

    $("currentPlayerLabel").textContent = `🎯 ${player.name}, you're up!`;

    if (step.choices) {
        // Round 3: player picks 30s or 45s
        $("timerDisplay").textContent = "Pick your time →";
        $("durationChoice").classList.remove("hidden");
        $("startTimerBtn").classList.add("hidden");
    } else if (step.endings) {
        // Final: pick a unique ending, then run an open stopwatch
        renderEndingPicker(player);
        $("timerDisplay").textContent = "Pick your ending →";
        $("startTimerBtn").classList.add("hidden");
        $("endingPicker").classList.remove("hidden");
    } else {
        $("timerDisplay").textContent = formatTime(step.duration);
        $("startTimerBtn").classList.remove("hidden");
    }
}

function renderTurnOrder() {
    const container = $("turnOrder");
    container.innerHTML = "";
    state.turnOrder.forEach((playerIdx, orderIdx) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        if (orderIdx < state.turnIndex) chip.classList.add("done");
        if (orderIdx === state.turnIndex) chip.classList.add("up-next");
        const player = state.players[playerIdx];
        chip.textContent =
            (orderIdx < state.turnIndex ? "✓ " : `${orderIdx + 1}. `) + player.name;
        container.appendChild(chip);
    });
}

function renderEndingPicker(player) {
    const picker = $("endingPicker");
    picker.innerHTML = "";
    currentStep().endings.forEach((ending) => {
        const btn = document.createElement("button");
        btn.className = "ending-btn";
        btn.disabled = state.takenEndings.has(ending.letter);
        btn.innerHTML = `
            <span class="ending-letter">${ending.letter}</span>
            <span class="ending-name">${ending.name}</span>
            <span class="ending-desc">${ending.desc}</span>
            ${state.takenEndings.has(ending.letter) ? '<span class="ending-desc">— taken</span>' : ""}
        `;
        btn.addEventListener("click", () => selectEnding(player, ending));
        picker.appendChild(btn);
    });
}

function selectEnding(player, ending) {
    player.ending = ending;
    state.takenEndings.add(ending.letter);

    $("endingPicker").classList.add("hidden");
    $("chosenEndingLabel").classList.remove("hidden");
    $("chosenEndingLabel").textContent = `${player.name}'s ending: ${ending.letter}) ${ending.name}`;
    $("timerDisplay").textContent = "0:00";
    $("currentPlayerLabel").textContent = `💦 ${player.name} — milk it out, buddy!`;
    $("startTimerBtn").classList.remove("hidden");
    $("startTimerBtn").textContent = `▶ Start (${player.name})`;
}

/* ============================================================
   TIMER
   ============================================================ */

function stopTimerInterval() {
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
}

function startTurn() {
    const step = currentStep();
    stopTimerInterval();

    $("startTimerBtn").classList.add("hidden");
    $("finishTurnBtn").classList.remove("hidden");

    if (step.openEnded) {
        // Count-up stopwatch for the final round
        state.seconds = 0;
        state.timer = setInterval(() => {
            state.seconds++;
            $("timerDisplay").textContent = formatTime(state.seconds);
        }, 1000);
    } else {
        state.seconds = step.duration;
        $("timerDisplay").textContent = formatTime(state.seconds);
        state.timer = setInterval(() => {
            state.seconds--;
            $("timerDisplay").textContent = formatTime(Math.max(state.seconds, 0));
            if (state.seconds <= 0) finishTurn();
        }, 1000);
    }
}

function finishTurn() {
    stopTimerInterval();

    const playerIdx = state.turnOrder[state.turnIndex];
    state.players[playerIdx].done = true;
    state.turnIndex++;

    if (state.turnIndex >= state.turnOrder.length) {
        // Step complete — next round or battle over
        if (state.stepIndex >= STEPS.length - 1) {
            showComplete();
        } else {
            startStep(state.stepIndex + 1);
        }
    } else {
        presentTurn();
    }
}

/* ============================================================
   COMPLETE SCREEN
   ============================================================ */

function showComplete() {
    const list = $("resultsList");
    list.innerHTML = "";
    state.players.forEach((p) => {
        const row = document.createElement("div");
        row.className = "result-row";
        const endingText = p.ending
            ? `${p.ending.letter}) ${p.ending.name}`
            : "Completed all rounds";
        row.innerHTML = `<span>${p.name}</span><span class="result-ending">${endingText}</span>`;
        list.appendChild(row);
    });
    showScreen("complete");
}

/* ============================================================
   EVENTS
   ============================================================ */

function bindBattleEvents() {
    $("startTimerBtn").addEventListener("click", startTurn);
    $("finishTurnBtn").addEventListener("click", finishTurn);

    document.querySelectorAll(".duration-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            currentStep().duration = parseInt(btn.dataset.duration, 10);
            $("durationChoice").classList.add("hidden");
            $("timerDisplay").textContent = formatTime(currentStep().duration);
            $("startTimerBtn").classList.remove("hidden");
        });
    });

    $("quitBtn").addEventListener("click", () => {
        if (confirm("Quit the battle?")) resetToSetup();
    });

    $("rematchBtn").addEventListener("click", () => {
        state.players.forEach((p) => { p.ending = null; p.done = false; });
        state.takenEndings = new Set();
        showScreen("battle");
        startStep(0);
    });

    $("newBattleBtn").addEventListener("click", resetToSetup);
}

function resetToSetup() {
    stopTimerInterval();
    state.players = [];
    state.takenEndings = new Set();
    showScreen("setup");
}

/* ============================================================
   INIT
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    initSetup();
    bindBattleEvents();
});
