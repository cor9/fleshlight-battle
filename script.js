/* ============================================================
   FLESHLIGHT BATTLE — game + network orchestration
   Host runs the authoritative game and broadcasts state;
   peers render and send actions. Shared P2P layer: p2p.js
   ============================================================ */

const ROOM_PREFIX = "flesh";

/* ---------------- Round definitions ---------------- */
const STEPS = [
    {
        title: "Getting Naked & Free-Dick Warm-Up",
        duration: 25,
        instruction: "Strip completely — nothing left on. Get that penis chubby hands-free: swing it side to side, up and down, back and forth. Give it a few helicopter spins. Make it bounce and sway so your opponent can see it moving freely. End with an ass slap on each cheek.",
        proof: "25 seconds on cam"
    },
    {
        title: "Slow Sensual Stroker Start",
        duration: 45,
        instruction: "LUBE UP! Slide fully into your fleshlight/stroker. Stroke slow and deep the entire time — full length, controlled, deliberate. No racing. Feel every inch. Make eye contact with the camera / your opponent when you can. Then stop completely and hold still inside the toy for 5 seconds.",
        proof: "45 seconds of slow, relaxed stroking on cam"
    },
    {
        title: "Fuck Your Plastic",
        duration: 45, // default; player may pick 30
        choices: [30, 45],
        instruction: "Secure the fleshlight/stroker so it stays in place — shove it between a mattress, use a mount, your hands, or lay on the bed/couch/floor. Now FUCK it. Steady, rhythmic hip thrusts the whole time. Medium pace, keep it consistent.",
        proof: "30–45 seconds of humping on cam"
    },
    {
        title: "Primal Hard & Fast",
        duration: 30,
        instruction: "Go nuts. Determined. Hard, fast, aggressive strokes or thrusts into the toy for the full 30 seconds. BONUS: open your mic — grunt, breathe heavy, get noisy and messy. This is the competitive surge.",
        proof: "30 seconds of pounding on cam (mic encouraged)"
    },
    {
        title: "Build That Load — Climb to the Brink",
        duration: 60,
        instruction: "Hard, fast pounding (stroke or fuck)... breathe... slow deep grinding... then ramp back up again. Keep the intensity climbing. You should both be leaking and pushing it right to the EDGE. DO NOT CUM YET, BUDDY!",
        proof: "Up to 60 seconds of leaky build-up on cam"
    },
    {
        title: "FINAL ROUND — Cummy Shaking Orgasm",
        duration: null,
        openEnded: true,
        instruction: "Pick your ending — every player must choose a DIFFERENT one. Then bust that nut on cam: milk it all out of your penis, buddy!",
        proof: "Bust on cam — no time limit",
        endings: [
            { letter: "A", name: "Breed the Toy", desc: "Fuck it hard and empty everything inside. Keep thrusting through the orgasm. Leave the load in there — show the toy afterward if you want." },
            { letter: "B", name: "Pull-Out Load", desc: "Ride the edge, then pull out and shoot into your hand or onto your belly/abs. Keep the camera on the ropes and the aftershocks." },
            { letter: "C", name: "Ruin & Eat", desc: "Stroke/fuck to the point of no return, then STOP — toy off, hands off. Ruin it. Collect the dripping cum, EAT IT, show it in your mouth, and swallow." },
            { letter: "D", name: "Surface Load + Tease", desc: "Cum onto your desk, floor, or any flat surface in view. Then use the fresh load to smear and tease your sensitive cockhead while you're still twitching." }
        ]
    }
];

/* ---------------- Room / game state ---------------- */

let p2p = null;
let lk = null; // LiveKit media layer (lk.js)
let chat = null;

// Host-authoritative game state (peers keep a copy of the snapshot)
const game = {
    phase: "lobby",                  // lobby | battle | complete
    players: [],                     // [{ id, name, ending: null|{letter,name} }]
    stepIndex: 0,
    turnOrder: [],                   // player ids, shuffled per step
    turnIndex: 0,
    chosenDuration: null,            // round-3 choice for current turn
    phaseVersion: 0
};

// Local timer bookkeeping
const timers = { interval: null, running: false };

/* ---------------- DOM helpers ---------------- */
const $ = (id) => document.getElementById(id);
const SCREENS = ["homeScreen", "lobbyScreen", "battleScreen", "completeScreen"];

function showScreen(id) {
    SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
}

function formatTime(total) {
    const t = Math.max(0, Math.round(total));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function me() { return p2p ? p2p.me : null; }
function isHost() { return p2p && p2p.isHost; }

/* ============================================================
   VIDEO TILES
   ============================================================ */

let activeGrid = null;

function setActiveGrid() {
    const visible = SCREENS.find((s) => !$(s).classList.contains("hidden"));
    activeGrid = {
        lobbyScreen: $("videoGrid"),
        battleScreen: $("videoGridBattle"),
        completeScreen: $("videoGridComplete")
    }[visible];
    if (!activeGrid) return;
    // Re-render all tiles into the active grid
    activeGrid.innerHTML = "";
    tiles.forEach((t, id) => addTile(id, t.name, t.stream, t.muted));
}

const tiles = new Map(); // identity -> { name, stream, muted }

function addTile(peerId, label, stream, muted) {
    if (!activeGrid) return;
    let tile = activeGrid.querySelector(`[data-peer="${peerId}"]`);
    if (!tile) {
        tile = document.createElement("div");
        tile.className = "video-tile";
        tile.dataset.peer = peerId;
        tile.innerHTML = `<video autoplay playsinline></video><span class="tile-label"></span>`;
        activeGrid.appendChild(tile);
    }
    const video = tile.querySelector("video");
    video.muted = muted;
    if (video.srcObject !== stream) video.srcObject = stream;
    tile.querySelector(".tile-label").textContent = label;
}

function removeTile(peerId) {
    document.querySelectorAll(`[data-peer="${peerId}"]`).forEach((t) => t.remove());
}

/* ============================================================
   NETWORK WIRING
   ============================================================ */

async function connect(asHost, code) {
    const name = $("nameInput").value.trim() || "Gooner " + Math.floor(Math.random() * 90 + 10);
    $("connectStatus").textContent = "Getting your cam ready…";

        p2p = new P2PRoom({ prefix: ROOM_PREFIX, requireMedia: false }); // data channels only
        p2p.onRosterChange = handleRosterChange;
    p2p.onPeerGone = handlePeerGone;
    p2p.onHostGone = () => {
        alert("The host left — battle over.");
        location.hash = "";
        location.reload();
    };
    p2p.onHostMessage = handleHostMessage;         // peers
    p2p.onPeerMessage = handlePeerAction;          // host receives actions
    p2p.onAnyMessage = (peerId, msg) => {          // chat everywhere
        if (msg && msg.type === "chat") {
            chat.addMessage({ name: msg.name, text: msg.text, self: false });
        }
    };
    p2p.onError = (err) => { $("connectStatus").textContent = "⚠️ " + err.message; };

    try {
        if (asHost) {
            const link = await p2p.host(name);
            $("shareLink").textContent = link;
            p2p.setRoomMeta({ title: "Fleshlight Battle", password: $("passwordInput").value.trim() });
            // hub directory connects in the background so it never blocks the room
            p2p.advertiseWhenReady();
        } else {
            $("connectStatus").textContent = "Joining room…";
            await p2p.join(name, code, $("passwordInput").value.trim());
        }
    } catch (err) {
        $("connectStatus").textContent = "⚠️ " + (err.message || "Could not connect.");
        return;
    }

    // chat
    chat = mountChatUI($("chatRoot"), {
        selfName: name,
        onSend: (text) => {
            p2p.sendAll({ type: "chat", name: me().name, text });
            chat.addMessage({ name: me().name, text, self: true });
        }
    });

    // ---- LiveKit cams (media layer) ----
    window.LK_TILE_CONFIG = {
        isHost: () => p2p && p2p.isHost,
        kick: (id) => p2p.kickPeer(id),
        selfId: () => (p2p && p2p.me && p2p.me.id) || null
    };
    lk = new LKMedia();
    lk.onTile = (id, label, stream, isLocal) => {
        tiles.set(id, { name: label, stream, muted: isLocal });
        addTile(id, label, stream, isLocal);
    };
    lk.onRemoveTile = (id) => { tiles.delete(id); removeTile(id); };
    lk.onError = (err) => { $("connectStatus").textContent = "⚠️ " + err.message; };
    await lk.connect(p2p.hostId, p2p.me.id, name);

    $("mediaBar").classList.remove("hidden");
    if (isHost()) $("startBattleBtn").classList.remove("hidden");
    else $("waitingHostNote").textContent = "Waiting for the host to start the battle…";

    showScreen("lobbyScreen");
    setActiveGrid();
    renderLobby();
    $("connectStatus").textContent = "";
}

function handleRosterChange(roster) {
    if (isHost() && game.phase === "lobby") {
        // keep lobby player list = roster
        broadcastState();
    }
    renderLobby();
    refreshTilesForRoster();
}

function refreshTilesForRoster() {
    // drop tiles for peers no longer in roster (LiveKit identity == p2p id)
    tiles.forEach((_, id) => {
        if (!p2p.roster.some((p) => p.id === id) && id !== (me() && me().id)) {
            tiles.delete(id);
            removeTile(id);
        }
    });
}

function handlePeerGone(peerId, name) {
    chat && chat.addMessage({ name: "", text: `${name} left the room`, system: true });
    if (isHost() && game.phase === "battle") {
        // Remove them from the game; skip their turn if needed
        const wasInTurnOrder = game.turnOrder.includes(peerId);
        game.players = game.players.filter((p) => p.id !== peerId);
        game.turnOrder = game.turnOrder.filter((id) => id !== peerId);
        if (wasInTurnOrder && game.turnIndex >= game.turnOrder.length) game.turnIndex = 0;
        if (game.players.length === 0) return;
        broadcastState();
    }
}

/* ---------------- Messsages: host -> peers ---------------- */

function broadcastState(extra = {}) {
    if (!isHost()) return;
    p2p.hostBroadcast({ type: "state", game: sanitizeGame(), ...extra });
}

function sanitizeGame() {
    return {
        phase: game.phase,
        players: game.players,
        stepIndex: game.stepIndex,
        turnOrder: game.turnOrder,
        turnIndex: game.turnIndex,
        chosenDuration: game.chosenDuration,
        phaseVersion: ++game.phaseVersion
    };
}

function handleHostMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "state") {
        applySnapshot(msg.game);
    }
    if (msg.type === "timer") {
        if (msg.op === "start") runTimerDisplay(msg);
        if (msg.op === "stop") stopTimerDisplay();
    }
    if (msg.type === "chatSystem") {
        chat && chat.addMessage({ name: "", text: msg.text, system: true });
    }
}

function applySnapshot(snap) {
    const prevPhase = game.phase;
    const prevVersion = game.phaseVersion;
    Object.assign(game, snap);

    if (snap.phaseVersion <= prevVersion) return;

    renderLobby();
    if (game.phase !== prevPhase) {
        if (game.phase === "battle") { showScreen("battleScreen"); setActiveGrid(); renderBattle(); }
        if (game.phase === "complete") { showScreen("completeScreen"); setActiveGrid(); renderComplete(); }
    } else if (game.phase === "battle") {
        renderBattle();
    }
}

/* ---------------- Messages: peers -> host (actions) ---------------- */

function doAction(op, data = {}) {
    if (isHost()) {
        hostHandleAction(me().id, me().name, { type: "action", op, ...data });
    } else {
        p2p.sendToHost({ type: "action", op, ...data });
    }
}

function handlePeerAction(peerId, name, msg) {
    if (msg && msg.type === "action") hostHandleAction(peerId, name, msg);
}

function hostHandleAction(peerId, name, msg) {
    const actor = currentActorId();
    const allowed = (peerId === actor) || (peerId === me().id); // actor, or host can always drive
    if (game.phase !== "battle" || !allowed) return;

    switch (msg.op) {
        case "startTurn": hostStartTurn(); break;
        case "finishTurn": hostFinishTurn(); break;
        case "chooseDuration":
            game.chosenDuration = msg.duration;
            broadcastState();
            break;
        case "chooseEnding": {
            const step = STEPS[game.stepIndex];
            const ending = step.endings.find((e) => e.letter === msg.letter);
            const player = game.players.find((p) => p.id === actor);
            const taken = game.players.some((p) => p.ending && p.ending.letter === msg.letter);
            if (ending && player && !taken) {
                player.ending = ending;
                broadcastState();
            }
            break;
        }
    }
}

/* ============================================================
   HOST GAME FLOW (authoritative)
   ============================================================ */

function currentActorId() {
    return game.turnOrder[game.turnIndex];
}

function hostStartBattle() {
    // players = current roster order
    game.players = p2p.roster.map((p) => ({ id: p.id, name: p.name, ending: null }));
    game.phase = "battle";
    hostStartStep(0);
}

function hostStartStep(index) {
    game.stepIndex = index;
    game.turnOrder = shuffle(game.players.map((p) => p.id));
    game.turnIndex = 0;
    game.chosenDuration = STEPS[index].choices ? null : STEPS[index].duration;
    broadcastState();
}

function hostStartTurn() {
    const step = STEPS[game.stepIndex];
    const duration = step.choices ? game.chosenDuration : step.duration;
    p2p.hostBroadcast({
        type: "timer", op: "start",
        duration: step.openEnded ? null : duration,
        openEnded: !!step.openEnded,
        at: Date.now()
    });
    runTimerDisplay({ op: "start", duration, openEnded: !!step.openEnded, at: Date.now() });
}

function hostFinishTurn() {
    p2p.hostBroadcast({ type: "timer", op: "stop" });
    stopTimerDisplay();
    game.turnIndex++;
    if (game.turnIndex >= game.turnOrder.length) {
        if (game.stepIndex >= STEPS.length - 1) {
            game.phase = "complete";
            broadcastState();
            return;
        }
        hostStartStep(game.stepIndex + 1);
    } else {
        game.chosenDuration = STEPS[game.stepIndex].choices ? null : STEPS[game.stepIndex].duration;
        broadcastState();
    }
}

function hostRematch() {
    game.players.forEach((p) => { p.ending = null; });
    hostStartStep(0);
}

function hostQuitToLobby() {
    game.phase = "lobby";
    broadcastState();
}

/* ============================================================
   TIMER DISPLAY (host + peers)
   ============================================================ */

function runTimerDisplay({ duration, openEnded, at }) {
    stopTimerDisplay();
    timers.running = true;
    const tick = () => {
        const elapsed = (Date.now() - at) / 1000;
        if (openEnded) {
            $("timerDisplay").textContent = formatTime(elapsed);
        } else {
            const remaining = duration - elapsed;
            $("timerDisplay").textContent = formatTime(remaining);
            // host ends the turn when the clock hits zero
            if (isHost() && remaining <= 0) hostFinishTurn();
        }
    };
    tick();
    timers.interval = setInterval(tick, 250);
    syncTimerButtons();
}

function stopTimerDisplay() {
    if (timers.interval) clearInterval(timers.interval);
    timers.interval = null;
    timers.running = false;
    syncTimerButtons();
}

/* ============================================================
   RENDERING
   ============================================================ */

function renderLobby() {
    if (game.phase !== "lobby") return;
    $("lobbyPlayers").innerHTML = "";
    p2p && p2p.roster.forEach((p, i) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = (i === 0 ? "👑 " : "") + p.name + (p.id === (me() && me().id) ? " (you)" : "");
        $("lobbyPlayers").appendChild(chip);
    });
    // pluralize invite
    const total = p2p ? p2p.roster.length : 1;
    document.querySelector(".share-panel h2").textContent =
        total >= 3 ? "🔗 Invite Your Opponents" : "🔗 Invite Your Opponent";

    // host never "waits for the host"
    $("waitingHostNote").classList.toggle("hidden", isHost());
    $("waitingHostNote").textContent = "Waiting for the host to start the battle…";
}

function actorIsMe() { return currentActorId() === (me() && me().id); }
function canDrive() { return actorIsMe() || isHost(); }

function renderBattle() {
    const step = STEPS[game.stepIndex];
    $("roundBadge").textContent = `Round ${game.stepIndex + 1} of ${STEPS.length}`;
    $("stepTitle").textContent = step.title;
    $("stepInstruction").textContent = step.instruction;
    $("stepProof").textContent = `📹 ${step.proof}`;

    // Turn order chips
    const wrap = $("turnOrder");
    wrap.innerHTML = "";
    game.turnOrder.forEach((id, i) => {
        const player = game.players.find((p) => p.id === id);
        if (!player) return;
        const chip = document.createElement("span");
        chip.className = "chip";
        if (i < game.turnIndex) chip.classList.add("done");
        if (i === game.turnIndex) chip.classList.add("up-next");
        chip.textContent = (i < game.turnIndex ? "✓ " : `${i + 1}. `) +
            player.name + (id === me().id ? " (you)" : "");
        wrap.appendChild(chip);
    });

    const actor = game.players.find((p) => p.id === currentActorId());
    const actorName = actor ? actor.name : "…";

    // Duration choice (round 3)
    if (step.choices && game.chosenDuration === null) {
        $("durationChoice").classList.toggle("hidden", !canDrive());
        $("timerDisplay").textContent = "Pick your time →";
        $("waitingActorNote").classList.toggle("hidden", canDrive());
        if (!canDrive()) $("waitingActorNote").textContent = `${actorName} is picking a duration…`;
    } else {
        $("durationChoice").classList.add("hidden");
    }

    // Endings (final round)
    const chosenEnding = actor && actor.ending;
    if (step.endings && !chosenEnding) {
        renderEndingPicker();
        $("endingPicker").classList.toggle("hidden", !actorIsMe());
        $("timerDisplay").textContent = "Pick your ending →";
        $("waitingActorNote").classList.toggle("hidden", actorIsMe());
        if (!actorIsMe()) $("waitingActorNote").textContent = `${actorName} is picking their ending…`;
    } else {
        $("endingPicker").classList.add("hidden");
    }

    if (chosenEnding) {
        $("chosenEndingLabel").classList.remove("hidden");
        $("chosenEndingLabel").textContent = `${actorName}'s ending: ${chosenEnding.letter}) ${chosenEnding.name}`;
    } else {
        $("chosenEndingLabel").classList.add("hidden");
    }

    // Current player label
    $("currentPlayerLabel").textContent = currentActorId()
        ? (actorIsMe() ? "🎯 You're up!" : `🎯 ${actorName} is up!`)
        : "";

    // Timer readout when idle
    if (!timers.running) {
        if (step.openEnded && chosenEnding) $("timerDisplay").textContent = "0:00";
        else if (!step.choices || game.chosenDuration !== null) {
            const d = step.choices ? game.chosenDuration : step.duration;
            if (d) $("timerDisplay").textContent = formatTime(d);
        }
    }

    // Start button availability
    const readyToStart = !timers.running &&
        (!step.choices || game.chosenDuration !== null) &&
        (!step.endings || !!chosenEnding);

    if (readyToStart && !canDrive()) {
        $("waitingActorNote").classList.remove("hidden");
        $("waitingActorNote").textContent = `Waiting for ${actorName} to start…`;
    } else if (!step?.choices || game.chosenDuration !== null) {
        if (!$("endingPicker").classList.contains("hidden")) { /* keep note */ }
        else $("waitingActorNote").classList.add("hidden");
    }

    syncTimerButtons();
}

function renderEndingPicker() {
    const picker = $("endingPicker");
    picker.innerHTML = "";
    STEPS[game.stepIndex].endings.forEach((ending) => {
        const taken = game.players.some((p) => p.ending && p.ending.letter === ending.letter);
        const btn = document.createElement("button");
        btn.className = "ending-btn";
        btn.disabled = taken || !actorIsMe();
        btn.innerHTML = `
            <span class="ending-letter">${ending.letter}</span>
            <span class="ending-name">${ending.name}</span>
            <span class="ending-desc">${ending.desc}</span>
            ${taken ? '<span class="ending-desc">— taken</span>' : ""}
        `;
        btn.addEventListener("click", () => doAction("chooseEnding", { letter: ending.letter }));
        picker.appendChild(btn);
    });
}

function syncTimerButtons() {
    const step = STEPS[game.stepIndex];
    const ready = (!step?.choices || game.chosenDuration !== null) &&
                  (!step?.endings || !!(game.players.find((p) => p.id === currentActorId()) || {}).ending);

    $("startTimerBtn").classList.toggle("hidden", timers.running || !ready || !canDrive() ? true : false);
    $("finishTurnBtn").classList.toggle("hidden", !(timers.running && canDrive()));
    if (!timers.running && ready && canDrive()) {
        const actor = game.players.find((p) => p.id === currentActorId());
        $("startTimerBtn").textContent = actorIsMe() ? "▶ Start Your Turn" : `▶ Start (${(actor || {}).name || "…"})`;
    }
}

function renderComplete() {
    const list = $("resultsList");
    list.innerHTML = "";
    game.players.forEach((p) => {
        const row = document.createElement("div");
        row.className = "result-row";
        const endingText = p.ending ? `${p.ending.letter}) ${p.ending.name}` : "Did not finish";
        row.innerHTML = `<span></span><span class="result-ending"></span>`;
        row.children[0].textContent = p.name;
        row.children[1].textContent = endingText;
        list.appendChild(row);
    });
    $("rematchBtn").classList.toggle("hidden", !isHost());
}

/* ============================================================
   EVENTS + INIT
   ============================================================ */

function init() {
    // Home
    $("hostBtn").addEventListener("click", () => connect(true));
    $("joinBtn").addEventListener("click", () => {
        const code = $("joinCodeInput").value.trim().toLowerCase();
        if (!code || code.length !== 6) {
            $("connectStatus").textContent = "Enter the 6-character room code.";
            return;
        }
        connect(false, code);
    });

    // Deep link: #join=code
    const m = location.hash.match(/#join=([a-z0-9]{6})/i);
    if (m) {
        $("joinCodeInput").value = m[1].toLowerCase();
        $("connectStatus").textContent = "Link loaded — enter your name and hit Join.";
        $("nameInput").focus();
    }

    // Lobby
    $("copyLinkBtn").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText($("shareLink").textContent);
            $("copyLinkBtn").textContent = "Copied!";
            setTimeout(() => ($("copyLinkBtn").textContent = "Copy"), 1500);
        } catch (_) {}
    });
    $("textLinkBtn").addEventListener("click", async () => {
        const url = $("shareLink").textContent;
        if (navigator.share) {
            try { await navigator.share({ title: "FLESHLIGHT BATTLE", text: "Loser breeds first — join my battle:", url }); return; } catch (_) {}
        }
        try { await navigator.clipboard.writeText(url); alert("Link copied — text it to your opponent!"); } catch (_) {}
    });
    $("startBattleBtn").addEventListener("click", () => {
        if (!p2p || p2p.roster.length < 1) return;
        hostStartBattle();
        showScreen("battleScreen");
        setActiveGrid();
        renderBattle();
    });
    $("leaveLobbyBtn").addEventListener("click", () => { if (p2p) p2p.destroy(); location.hash = ""; location.reload(); });

    // Battle actions
    $("startTimerBtn").addEventListener("click", () => doAction("startTurn"));
    $("finishTurnBtn").addEventListener("click", () => doAction("finishTurn"));
    document.querySelectorAll(".duration-btn").forEach((btn) =>
        btn.addEventListener("click", () => doAction("chooseDuration", { duration: parseInt(btn.dataset.duration, 10) }))
    );
    $("quitBtn").addEventListener("click", () => {
        if (isHost()) { hostQuitToLobby(); showScreen("lobbyScreen"); setActiveGrid(); }
        else { chat && chat.addMessage({ name: "", text: "Only the host can reset the battle", system: true }); }
    });

    // Complete
    $("rematchBtn").addEventListener("click", () => { hostRematch(); showScreen("battleScreen"); setActiveGrid(); renderBattle(); });
    $("backToLobbyBtn").addEventListener("click", () => {
        if (isHost()) hostQuitToLobby();
        showScreen("lobbyScreen");
        setActiveGrid();
    });

    // Media toggles
    $("toggleMicBtn").addEventListener("click", async () => {
        const on = lk ? await lk.toggleMic() : false;
        $("toggleMicBtn").classList.toggle("media-off", !on);
    });
    $("toggleCamBtn").addEventListener("click", async () => {
        const on = lk ? await lk.toggleCam() : false;
        $("toggleCamBtn").classList.toggle("media-off", !on);
    });
}

document.addEventListener("DOMContentLoaded", init);
