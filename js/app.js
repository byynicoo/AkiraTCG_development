import {
  APP_TITLE,
  CARD_LIBRARY,
  CLAN_DATABASE,
  HOME_CHANGELOG_ITEMS,
  HOME_NEWS_ITEMS,
  INITIAL_CLANS,
  MATCH_CONSTANTS,
  RULE_SECTIONS,
  RULING_TUTORIALS,
  STORE_PACKS,
  STARTER_DECK,
  VISUAL_ASSETS,
} from "./data.js";
import {
  createRoomState,
  getCardStatus,
  getCoach,
  getOpponentSlot,
  joinRoomState,
  startPracticeState,
  submitPlay,
} from "./engine.js";
import {
  deleteRoom,
  getSession,
  listRooms,
  listUsers,
  loadRoom,
  login,
  logout,
  onStorageChange,
  saveRoom,
  signup,
  syncChannel,
  updateUser,
} from "./sync.js";

const app = document.querySelector("#app");
const SETTINGS_KEY = "ascendants-tcg-settings-v1";
const PROFILE_HISTORY_LIMIT = 36;
const PROFILE_RECENT_MATCHES = 3;
const RANKED_WIN_MMR = 25;
const RANKED_LOSS_MMR = 18;
const RANKED_TIERS = [
  { min: 0, max: 150, label: "Newbie", symbol: "+" },
  { min: 151, max: 215, label: "Cyber Thug", symbol: "//" },
  { min: 216, max: 315, label: "Activist", symbol: ">" },
  { min: 316, max: 450, label: "Hacker", symbol: "[]" },
  { min: 451, max: 550, label: "Noble", symbol: "O" },
  { min: 551, max: 650, label: "Cyber Commander", symbol: "^" },
  { min: 651, max: Number.POSITIVE_INFINITY, label: "Cyber Elite", symbol: "X" },
];
let combatReplayTimer = null;
let gameOverTimer = null;
let roundBannerTimer = null;
let turnTimerInterval = null;
let lastRenderedTurnSecond = null;
let backgroundMusic = null;
let musicSourceIndex = 0;
const COMBAT_REPLAY_MS = 8600;
const ROUND_BANNER_MS = 3000;
const BACKGROUND_MUSIC_SOURCES = [
  "./assets/audio/music.mp3",
  "./assets/audio/background.mp3",
  "./assets/audio/bgm.mp3",
  "./img/background.mp3",
  "./img/music.mp3",
  "./music.mp3",
];

const DEFAULT_SETTINGS = {
  masterVolume: 84,
  musicVolume: 70,
  sfxVolume: 82,
  graphicsQuality: "ultra",
  glitchFx: true,
  scanlines: true,
  muted: false,
};

const loadSettings = () => {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const saveSettings = (settings) => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const getMusicVolume = () =>
  state.settings.muted ? 0 : Math.max(0, Math.min(1, (state.settings.masterVolume / 100) * (state.settings.musicVolume / 100)));

const createBackgroundMusic = () => {
  if (backgroundMusic || typeof Audio === "undefined") {
    return backgroundMusic;
  }

  backgroundMusic = new Audio(BACKGROUND_MUSIC_SOURCES[musicSourceIndex]);
  backgroundMusic.loop = true;
  backgroundMusic.preload = "auto";
  backgroundMusic.volume = getMusicVolume();
  backgroundMusic.addEventListener("error", () => {
    musicSourceIndex += 1;
    if (musicSourceIndex >= BACKGROUND_MUSIC_SOURCES.length || !backgroundMusic) {
      return;
    }
    backgroundMusic.src = BACKGROUND_MUSIC_SOURCES[musicSourceIndex];
    backgroundMusic.load();
    if (!state.settings.muted) {
      backgroundMusic.play().catch(() => {});
    }
  });
  return backgroundMusic;
};

const syncBackgroundMusic = (tryPlay = false) => {
  const audio = backgroundMusic || tryPlay ? createBackgroundMusic() : null;
  if (!audio) {
    return;
  }

  audio.volume = getMusicVolume();
  if (state.settings.muted) {
    audio.pause();
    return;
  }

  if (tryPlay) {
    audio.play().catch(() => {});
  }
};

const state = {
  authMode: "login",
  authPanel: "login",
  user: getSession(),
  view: "home",
  navOpen: false,
  room: null,
  roomCodeInput: "",
  selectedCardId: null,
  selectedCollectionCard: CARD_LIBRARY[0]?.id ?? null,
  selectedCollectionClan: "all",
  selectedDeckId: getSession()?.profile?.activeDeckId ?? null,
  pendingExtraPillz: 0,
  pendingFury: false,
  combatReplay: null,
  lastAnimatedRoundId: null,
  gameOverReady: false,
  lastGameOverKey: null,
  gameOverModalKey: null,
  gameOverShownKey: null,
  roundBanner: null,
  settings: loadSettings(),
  notice: null,
};

const escapeHtml = (value) =>
  `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const setNotice = (text, tone = "success") => {
  state.notice = { text, tone };
  render();
};

const clearNotice = () => {
  state.notice = null;
};

const setView = (view) => {
  state.view = view;
  state.navOpen = false;
  clearNotice();
  render();
};

const updateCurrentUser = (updater) => {
  if (!state.user) {
    return null;
  }
  const updated = updateUser(state.user.id, updater);
  if (updated) {
    state.user = updated;
  }
  return updated;
};

const getOwnedCardMap = () => state.user?.profile?.collection?.ownedCards ?? {};

const getOwnedCardCount = (cardId) => Number(getOwnedCardMap()[cardId] ?? 0);

const getOwnedLibrary = () => CARD_LIBRARY.filter((card) => getOwnedCardCount(card.id) > 0);

const getUserDecks = () => state.user?.profile?.decks ?? [];

const getDeckById = (deckId) => getUserDecks().find((deck) => deck.id === deckId) ?? null;

const getSelectedDeck = () => getDeckById(state.selectedDeckId) ?? getDeckById(state.user?.profile?.activeDeckId) ?? getUserDecks()[0] ?? null;

const getActiveDeck = () => getDeckById(state.user?.profile?.activeDeckId) ?? getSelectedDeck();

const getDeckCardCount = (deck, cardId) =>
  Array.isArray(deck?.cardIds) ? deck.cardIds.filter((entry) => entry === cardId).length : 0;

const getDeckCards = (deck) => (Array.isArray(deck?.cardIds) ? deck.cardIds.map((cardId) => CARD_LIBRARY.find((card) => card.id === cardId)).filter(Boolean) : []);

const getDeckFavoriteIds = (deck) => (Array.isArray(deck?.favoriteCardIds) ? deck.favoriteCardIds : []);

const getActiveDeckIds = (strict = false) => {
  const activeDeck = getActiveDeck();
  const cardIds = Array.isArray(activeDeck?.cardIds) ? activeDeck.cardIds.filter(Boolean) : [];
  if (strict) {
    return cardIds;
  }
  return cardIds.length === MATCH_CONSTANTS.deckSize ? [...cardIds] : [...STARTER_DECK.map((card) => card.id)];
};

const syncSelections = () => {
  const decks = getUserDecks();
  if (decks.length && !decks.some((deck) => deck.id === state.selectedDeckId)) {
    state.selectedDeckId = state.user?.profile?.activeDeckId ?? decks[0].id;
  }

  const visibleCards = getVisibleCollectionCards();
  if (visibleCards.length && !visibleCards.some((card) => card.id === state.selectedCollectionCard)) {
    state.selectedCollectionCard = visibleCards[0].id;
  }
};

const getCoachName = (game, slot) => game.coaches[slot]?.name ?? `Player ${slot}`;

const getMySlot = () => {
  if (!state.room || !state.user) {
    return "A";
  }
  if (state.room.players.B?.id === state.user.id) {
    return "B";
  }
  return "A";
};

const getSelectedHandCard = () => {
  if (!state.room || !state.selectedCardId) {
    return null;
  }
  const coach = getCoach(state.room.game, getMySlot());
  return coach.hand.find((card) => card.instanceId === state.selectedCardId) ?? null;
};

const getTurnRemainingSeconds = (game) => {
  if (!game?.turnStartedAt || game.matchState !== "live") {
    return MATCH_CONSTANTS.turnSeconds;
  }
  const started = Date.parse(game.turnStartedAt);
  if (!Number.isFinite(started)) {
    return MATCH_CONSTANTS.turnSeconds;
  }
  const duration = Number(game.turnDurationSeconds ?? MATCH_CONSTANTS.turnSeconds);
  return Math.max(0, Math.ceil((started + duration * 1000 - Date.now()) / 1000));
};

const getTurnTimerTone = (seconds) => (seconds <= 5 ? "danger" : seconds <= 10 ? "warning" : "stable");

const rearmCurrentRoundTimer = () => {
  if (!state.room || state.room.game.matchState !== "live") {
    return false;
  }
  state.room.game.turnStartedAt = new Date().toISOString();
  state.room.game.turnDurationSeconds = MATCH_CONSTANTS.turnSeconds;
  lastRenderedTurnSecond = MATCH_CONSTANTS.turnSeconds;
  saveRoom(state.room);
  return true;
};

const getRandomHandCard = (game, slot) => {
  const hand = game?.coaches?.[slot]?.hand ?? [];
  if (!hand.length) {
    return null;
  }
  return hand[Math.floor(Math.random() * hand.length)];
};

const renderTurnTimer = (game) => {
  const seconds = getTurnRemainingSeconds(game);
  const tone = getTurnTimerTone(seconds);
  const fill = Math.max(0, Math.min(100, Math.round((seconds / MATCH_CONSTANTS.turnSeconds) * 100)));
  return `
    <div class="turn-timer turn-timer--${tone}" style="--turn-fill:${fill}%" data-turn-timer>
      <span>Turn Timer</span>
      <strong data-turn-seconds>${String(seconds).padStart(2, "0")}</strong>
    </div>
  `;
};

const updateTurnTimerDom = (seconds) => {
  const timer = document.querySelector("[data-turn-timer]");
  if (!timer) {
    return;
  }
  const tone = getTurnTimerTone(seconds);
  const fill = Math.max(0, Math.min(100, Math.round((seconds / MATCH_CONSTANTS.turnSeconds) * 100)));
  timer.classList.toggle("turn-timer--stable", tone === "stable");
  timer.classList.toggle("turn-timer--warning", tone === "warning");
  timer.classList.toggle("turn-timer--danger", tone === "danger");
  timer.style.setProperty("--turn-fill", `${fill}%`);
  const secondsNode = timer.querySelector("[data-turn-seconds]");
  if (secondsNode) {
    secondsNode.textContent = String(seconds).padStart(2, "0");
  }
};

const getVisibleCollectionCards = () =>
  getOwnedLibrary().filter((card) => state.selectedCollectionClan === "all" || card.clan === state.selectedCollectionClan).sort(
    (left, right) => {
      const leftCrazy = Number(Boolean(left.crazyart));
      const rightCrazy = Number(Boolean(right.crazyart));
      if (rightCrazy !== leftCrazy) {
        return rightCrazy - leftCrazy;
      }
      if (right.stars !== left.stars) {
        return right.stars - left.stars;
      }
      return left.name.localeCompare(right.name);
    }
  );

const getCollectionCard = () =>
  getVisibleCollectionCards().find((card) => card.id === state.selectedCollectionCard) ??
  getVisibleCollectionCards()[0] ??
  CARD_LIBRARY[0] ??
  null;

const updateRoom = (room) => {
  state.room = room;
  if (!room) {
    state.selectedCardId = null;
    state.pendingExtraPillz = 0;
    state.pendingFury = false;
    state.gameOverReady = false;
    state.lastGameOverKey = null;
    state.gameOverModalKey = null;
    state.gameOverShownKey = null;
    state.roundBanner = null;
    render();
    return;
  }
  saveRoom(room);
  syncGameEndState(room);
  render();
};

const clampBattleInputs = () => {
  const card = getSelectedHandCard();
  if (!card || !state.room) {
    state.selectedCardId = null;
    state.pendingExtraPillz = 0;
    state.pendingFury = false;
    return;
  }
  const mySlot = getMySlot();
  const available = state.room.game.pillz[mySlot];
  if (state.pendingFury && available < MATCH_CONSTANTS.furyCost) {
    state.pendingFury = false;
  }
  const reserved = state.pendingFury ? MATCH_CONSTANTS.furyCost : 0;
  const maxExtra = Math.max(0, available - reserved);
  state.pendingExtraPillz = Math.max(0, Math.min(state.pendingExtraPillz, maxExtra));
};

const startCombatReplay = (roundData) => {
  if (!roundData?.id) {
    return false;
  }
  if (state.lastAnimatedRoundId === roundData.id) {
    return false;
  }

  state.lastAnimatedRoundId = roundData.id;
  state.combatReplay = roundData;
  state.roundBanner = null;
  if (combatReplayTimer) {
    window.clearTimeout(combatReplayTimer);
  }
  combatReplayTimer = window.setTimeout(() => {
    if (state.combatReplay?.id === roundData.id) {
      state.combatReplay = null;
      const matchFinished = state.room?.game?.matchState === "finished";
      if (!matchFinished) {
        rearmCurrentRoundTimer();
      }
      if (roundBannerTimer) {
        window.clearTimeout(roundBannerTimer);
      }
      if (matchFinished) {
        state.roundBanner = null;
        syncGameEndState(state.room, false);
        render();
        return;
      }
      const mySlot = getMySlot();
      const outcome =
        roundData.winner === mySlot ? "win" : roundData.winner ? "loss" : "draw";
      state.roundBanner = {
        outcome,
        text: outcome === "win" ? "ROUND WON" : outcome === "loss" ? "ROUND LOST" : "ROUND DRAW",
      };
      roundBannerTimer = window.setTimeout(() => {
        state.roundBanner = null;
        roundBannerTimer = null;
        render();
      }, ROUND_BANNER_MS);
      render();
    }
  }, COMBAT_REPLAY_MS);
  return true;
};

const getMatchRecordKey = (room) => {
  if (!room) {
    return null;
  }
  return `${room.code}:${room.createdAt}:${room.game.round}:${room.game.mode}`;
};

const queueGameOverModal = (room, replayWasStarted = false) => {
  const matchKey = getMatchRecordKey(room);
  if (!matchKey || state.gameOverModalKey === matchKey || state.gameOverShownKey === matchKey) {
    return;
  }

  if (gameOverTimer) {
    window.clearTimeout(gameOverTimer);
    gameOverTimer = null;
  }

  state.gameOverReady = false;
  state.gameOverModalKey = matchKey;
  const delay = replayWasStarted ? COMBAT_REPLAY_MS + 650 : 1300;
  gameOverTimer = window.setTimeout(() => {
    if (
      !state.room ||
      state.room.code !== room.code ||
      state.room.game.matchState !== "finished" ||
      state.gameOverModalKey !== matchKey
    ) {
      return;
    }
    if (state.gameOverShownKey === matchKey) {
      gameOverTimer = null;
      return;
    }
    state.gameOverReady = true;
    state.gameOverShownKey = matchKey;
    gameOverTimer = null;
    render();
  }, delay);
};

const recordMatchForCurrentUser = (room) => {
  if (!room || !state.user || room.game.matchState !== "finished") {
    return;
  }

  const mySlot =
    room.players.A?.id === state.user.id ? "A" : room.players.B?.id === state.user.id ? "B" : null;
  if (!mySlot) {
    return;
  }

  const opponentSlot = getOpponentSlot(mySlot);
  const matchId = getMatchRecordKey(room);
  const myLife = room.game.life[mySlot];
  const opponentLife = room.game.life[opponentSlot];
  const opponentCoach = room.game.coaches[opponentSlot];
  const queue =
    room.game.mode === "bot" ? "vs_bot" : room.game.mode === "ranked" ? "ranked" : "normal";
  const outcome = myLife > opponentLife ? "win" : myLife < opponentLife ? "loss" : "draw";
  const eddiesReward = getEddiesReward(queue, outcome);

  updateCurrentUser((user) => {
    if (user.history.some((entry) => entry.id === matchId)) {
      return user;
    }

    const rankedProfile = getRankedProfile(user);
    const rankedDelta =
      queue === "ranked" ? (outcome === "win" ? RANKED_WIN_MMR : outcome === "loss" ? -RANKED_LOSS_MMR : 0) : 0;
    const nextRanked =
      queue === "ranked"
        ? {
            ...rankedProfile,
            mmr: Math.max(0, rankedProfile.mmr + rankedDelta),
            wins: rankedProfile.wins + (outcome === "win" ? 1 : 0),
            losses: rankedProfile.losses + (outcome === "loss" ? 1 : 0),
            played: rankedProfile.played + 1,
          }
        : rankedProfile;

    return {
      ...user,
      profile: {
        ...user.profile,
        eddies: (user.profile?.eddies ?? 100) + eddiesReward,
        ranked: nextRanked,
        collection: {
          crazyartOwned: Array.isArray(user.profile?.collection?.crazyartOwned)
            ? user.profile.collection.crazyartOwned
            : [],
        },
      },
      history: [
        {
          id: matchId,
          timestamp: new Date().toISOString(),
          queue,
          mode: room.game.mode,
          outcome,
          roomCode: room.code,
          opponentName: opponentCoach?.name ?? "Unknown",
          myLife,
          opponentLife,
          roundsPlayed: room.game.round,
          mmrDelta: rankedDelta,
          mmrAfter: nextRanked.mmr,
          eddiesReward,
        },
        ...user.history,
      ].slice(0, PROFILE_HISTORY_LIMIT),
    };
  });
};

const syncGameEndState = (room, replayWasStarted = false) => {
  if (!room || room.game.matchState !== "finished") {
    state.gameOverReady = false;
    state.lastGameOverKey = null;
    state.gameOverModalKey = null;
    state.gameOverShownKey = null;
    if (gameOverTimer) {
      window.clearTimeout(gameOverTimer);
      gameOverTimer = null;
    }
    return;
  }

  recordMatchForCurrentUser(room);
  const matchKey = getMatchRecordKey(room);
  if (state.gameOverShownKey === matchKey) {
    return;
  }
  if (state.lastGameOverKey !== matchKey) {
    state.lastGameOverKey = matchKey;
    queueGameOverModal(room, replayWasStarted);
    return;
  }

  if (!state.gameOverReady && !gameOverTimer && state.gameOverModalKey !== matchKey) {
    queueGameOverModal(room, replayWasStarted);
  }
};

const refreshRoomFromStorage = (code, rawValue) => {
  if (!state.room || state.room.code !== code) {
    return;
  }
  if (rawValue === null) {
    if (combatReplayTimer) {
      window.clearTimeout(combatReplayTimer);
      combatReplayTimer = null;
    }
    state.room = null;
    state.view = "multiplayer";
    state.selectedCardId = null;
    state.pendingExtraPillz = 0;
    state.pendingFury = false;
    state.combatReplay = null;
    render();
    return;
  }
  const freshRoom = loadRoom(code);
  if (freshRoom) {
    state.room = freshRoom;
    clampBattleInputs();
    const startedReplay = startCombatReplay(freshRoom.game.lastRound);
    syncGameEndState(freshRoom, startedReplay);
    if (!startedReplay) {
      render();
    }
  }
};

const renderNotice = () =>
  state.notice?.text
    ? `<div class="notice ${state.notice.tone === "warning" ? "is-warning" : "is-success"}">${escapeHtml(state.notice.text)}</div>`
    : "";

const renderRarityMeterLegacy = (stars) => `
  <div class="rarity-meter" aria-label="Rarity ${stars}">
    <span class="rarity-meter__label">R${stars}</span>
    <div class="rarity-meter__pips">
      ${Array.from({ length: 5 }, (_, index) => `<span class="rarity-meter__pip ${index < stars ? "is-active" : ""}">${index < stars ? "◈" : "+"}</span>`).join("")}
    </div>
  </div>
`;

const renderRarityMeter = (stars) => `
  <div class="rarity-meter" aria-label="Rarity ${stars}">
    <span class="rarity-meter__label">R${stars}</span>
    <div class="rarity-meter__pips">
      ${Array.from({ length: 5 }, (_, index) => `<span class="rarity-meter__pip ${index < stars ? "is-active" : ""}" aria-hidden="true"></span>`).join("")}
    </div>
  </div>
`;

const getQueueStats = (history, queue) => {
  const normalizedQueue = queue === "normal" ? ["normal", "multiplayer_casual"] : [queue];
  const games = history.filter((entry) => normalizedQueue.includes(entry.queue));
  const wins = games.filter((entry) => entry.outcome === "win").length;
  const draws = games.filter((entry) => entry.outcome === "draw").length;
  const played = games.length;
  const winrate = played ? Math.round(((wins + draws * 0.5) / played) * 100) : 0;
  return { played, wins, draws, winrate };
};

const getRankedProfile = (user) => ({
  mmr: 0,
  wins: 0,
  losses: 0,
  played: 0,
  ...(user?.profile?.ranked ?? {}),
});

const getRankedTier = (mmr) =>
  RANKED_TIERS.find((tier) => mmr >= tier.min && mmr <= tier.max) ?? RANKED_TIERS[0];

const getQueueLabel = (queue) => {
  if (queue === "multiplayer_casual" || queue === "normal") {
    return "normal";
  }
  if (queue === "vs_bot") {
    return "vs bot";
  }
  return queue.replaceAll("_", " ");
};

const getEddiesReward = (queue, outcome) => {
  if (queue === "vs_bot") {
    return 0;
  }
  if (queue === "ranked") {
    if (outcome === "win") {
      return 25;
    }
    return 10;
  }
  if (queue === "normal" || queue === "multiplayer_casual") {
    if (outcome === "win") {
      return 15;
    }
    return 10;
  }
  return 0;
};

const getOwnedCrazyartIds = () => state.user?.profile?.collection?.crazyartOwned ?? [];

const hasCrazyartVariant = (card) => card.crazyart || getOwnedCrazyartIds().includes(card.id);

const renderCardPortrait = (card, mode = "medium") => {
  const crazyart = hasCrazyartVariant(card);
  return `
    <div class="card-portrait card-portrait--${mode} ${card.art ? "has-art" : ""} ${crazyart ? "is-crazyart" : ""}">
      ${card.art ? `<img class="card-portrait__image" src="${escapeHtml(card.art)}" alt="${escapeHtml(card.name)} artwork" loading="lazy" draggable="false">` : ""}
      <div class="card-portrait__footer">
        <div class="card-portrait__stats">
          <span>PWR ${card.power}</span>
          <span>DMG ${card.damage}</span>
        </div>
      </div>
    </div>
  `;
};

const renderMenuButton = (label, panel, icon) => `
  <button
    class="auth-menu-button ${state.authPanel === panel ? "is-active" : ""}"
    type="button"
    data-action="open-auth-panel"
    data-panel="${panel}"
  >
    <span class="auth-menu-icon">${icon}</span>
    <span>${label}</span>
  </button>
`;

const renderAuthPanel = () => {
  if (state.authPanel === "settings") {
    return `
      <div class="auth-panel">
        <div class="auth-panel__head">
          <span>SETTINGS</span>
          <button class="tiny-button" type="button" data-action="close-auth-panel">CLOSE</button>
        </div>
        <div class="settings-grid">
          ${renderSettingsControls()}
        </div>
        ${renderNotice()}
      </div>
    `;
  }

  const mode = state.authMode;
  return `
    <div class="auth-panel">
      <div class="auth-panel__head">
        <span>${mode === "signup" ? "SIGNUP" : "LOGIN"}</span>
        <button class="tiny-button" type="button" data-action="close-auth-panel">CLOSE</button>
      </div>
      <form class="auth-form" data-form="${mode}">
        ${
          mode === "signup"
            ? `
              <label class="field">
                <span>PLAYER ALIAS</span>
                <input name="name" placeholder="Neon Drifter" required>
              </label>
            `
            : ""
        }
        <label class="field">
          <span>EMAIL</span>
          <input name="email" type="email" placeholder="player@ascendants.city" required>
        </label>
        <label class="field">
          <span>PASSWORD</span>
          <input name="password" type="password" placeholder="********" required>
        </label>
        <button class="primary-button" type="submit">${mode === "signup" ? "CREATE ACCOUNT" : "ENTER GRID"}</button>
        ${renderNotice()}
      </form>
    </div>
  `;
};

const renderAuthScreen = () => `
  <section class="auth-screen">
    <div class="auth-stage">
      <div class="auth-stage__bg"></div>
      <div class="auth-stage__grid"></div>
      <div class="auth-stage__beam"></div>
      <div class="auth-stage__noise"></div>
      <div class="auth-stage__content">
        <div class="hero-copy">
          <div class="hero-copy__label">ascendants.city protocol</div>
          <h1 class="hero-copy__title" data-glitch="${APP_TITLE}">${APP_TITLE}</h1>
          <div class="hero-copy__meta">
            <span>${MATCH_CONSTANTS.startingLife} LIFE</span>
            <span>${MATCH_CONSTANTS.startingPillz} PILLS</span>
            <span>${MATCH_CONSTANTS.rounds} ROUNDS</span>
          </div>
        </div>

        <div class="auth-menu">
          <div class="auth-menu__stack">
            ${renderMenuButton("LOGIN", "login", "01")}
            ${renderMenuButton("SIGNUP", "signup", "02")}
            ${renderMenuButton("SETTINGS", "settings", "03")}
          </div>
          ${renderAuthPanel()}
        </div>
      </div>
    </div>
  </section>
`;

const renderTopbar = () => `
  <header class="app-topbar">
    <div class="app-topbar__left">
      <button class="menu-trigger" data-action="toggle-nav" aria-label="Open menu">
        <img src="${VISUAL_ASSETS.iconMenu}" alt="MENU">
      </button>
      <h1 class="app-topbar__micro">${APP_TITLE}</h1>
    </div>
    <div class="app-topbar__right">
      <button class="audio-toggle ${state.settings.muted ? "is-muted" : "is-on"}" data-action="toggle-audio" aria-label="${state.settings.muted ? "Unmute music" : "Mute music"}">
        <span>${state.settings.muted ? "MUTE" : "MUSIC"}</span>
        <i>${state.settings.muted ? "OFF" : "ON"}</i>
      </button>
      <div class="app-topbar__wallet">
        <img src="${VISUAL_ASSETS.eddies}" alt="Eddies">
        <span>${state.user?.profile?.eddies ?? 100}</span>
      </div>
    </div>
  </header>
`;

const renderNav = () => `
  <aside class="app-nav ${state.navOpen ? "is-open" : ""}">
    <div class="app-nav__head">
      <span>MENU //</span>
      <button class="tiny-button" data-action="close-nav">CLOSE</button>
    </div>
    <button class="nav-button ${state.view === "home" ? "is-active" : ""}" data-action="nav-view" data-view="home">Home</button>
    <div class="nav-group ${["multiplayer", "rulings", "battle"].includes(state.view) ? "is-open" : ""}">
      <div class="nav-group__label">Duels</div>
      <button class="nav-button nav-button--sub ${state.view === "multiplayer" ? "is-active" : ""}" data-action="nav-view" data-view="multiplayer">Matchmaking</button>
      <button class="nav-button nav-button--sub ${state.view === "rulings" ? "is-active" : ""}" data-action="nav-view" data-view="rulings">Rulings</button>
      <button class="nav-button nav-button--sub ${state.view === "battle" ? "is-active" : ""}" data-action="nav-view" data-view="battle" ${!state.room ? "disabled" : ""}>Battle</button>
    </div>
    <div class="nav-group ${["collection", "deck"].includes(state.view) ? "is-open" : ""}">
      <div class="nav-group__label">Collection</div>
      <button class="nav-button nav-button--sub ${state.view === "collection" ? "is-active" : ""}" data-action="nav-view" data-view="collection">Your Cards</button>
      <button class="nav-button nav-button--sub ${state.view === "deck" ? "is-active" : ""}" data-action="nav-view" data-view="deck">Deck Lab</button>
    </div>
    <button class="nav-button ${state.view === "profile" ? "is-active" : ""}" data-action="nav-view" data-view="profile">Profile</button>
    <button class="nav-button ${state.view === "settings" ? "is-active" : ""}" data-action="nav-view" data-view="settings">Settings</button>
    <button class="nav-button" data-action="logout">Logout</button>
  </aside>
`;

const renderRuleRows = () =>
  RULE_SECTIONS.map(
    (rule, index) => `
      <article class="ruling-row">
        <span class="ruling-row__index">${String(index + 1).padStart(2, "0")}</span>
        <div class="ruling-row__body">
          <strong>${escapeHtml(rule.title)}</strong>
          <p>${escapeHtml(rule.summary)}</p>
        </div>
      </article>
    `
  ).join("");

const renderHomeView = () => `
  <section class="view-grid view-grid--home">
    <div class="panel hero-panel">
      <div class="panel__inner">
        <div class="section-kicker">Ascendants TCG</div>
        <h3 class="view-title"></h3>
        <div class="action-row">
          <button class="primary-button" data-action="quick-start-bot">VS Bot</button>
          <button class="secondary-button" data-action="nav-view" data-view="multiplayer">Normal Game</button>
          <button class="ghost-button" data-action="find-ranked-match">Ranked</button>
          <button class="ghost-button" data-action="nav-view" data-view="collection">Your Collection</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__inner">
        <div class="section-kicker">News</div>
        <div class="feed-list">
          ${HOME_NEWS_ITEMS.map(
            (entry) => `
              <article class="feed-item">
                <div class="feed-item__head">
                  <strong>${escapeHtml(entry.title)}</strong>
                  <span>${escapeHtml(entry.tag)}</span>
                </div>
                <p>${escapeHtml(entry.body)}</p>
              </article>
            `
          ).join("")}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__inner">
        <div class="section-kicker">Changelog</div>
        <div class="feed-list">
          ${HOME_CHANGELOG_ITEMS.map(
            (entry) => `
              <article class="feed-item">
                <div class="feed-item__head">
                  <strong>${escapeHtml(entry.title)}</strong>
                  <span>${escapeHtml(entry.tag)}</span>
                </div>
                <p>${escapeHtml(entry.body)}</p>
              </article>
            `
          ).join("")}
        </div>
      </div>
    </div>
  </section>
`;

const renderMultiplayerView = () => {
  const room = state.room;
  return `
    <section class="view-grid view-grid--multiplayer">
      <div class="panel">
        <div class="panel__inner">
          <div class="section-kicker">Lobby</div>
          <h2 class="view-title">DUEL FINDER</h2>
          <div class="action-row">
            <button class="primary-button" data-action="create-room">Create Room</button>
            <button class="secondary-button" data-action="quick-start-bot">Play vs Bot</button>
            <button class="ghost-button" data-action="find-ranked-match">Find Ranked Match</button>
          </div>
          <div class="divider"></div>
          <label class="field">
            <span>JOIN ROOM CODE</span>
            <input id="roomCodeInput" value="${escapeHtml(state.roomCodeInput)}" placeholder="AB12CD">
          </label>
          <div class="action-row">
            <button class="ghost-button" data-action="join-room">Join Room</button>
            ${room ? `<button class="ghost-button" data-action="leave-room">Leave Current Room</button>` : ""}
          </div>
          ${renderNotice()}
        </div>
      </div>

      <div class="panel">
        <div class="panel__inner">
          <div class="section-kicker">Current Status</div>
          ${
            room
              ? `
                <div class="room-code">${escapeHtml(room.code)}</div>
                <div class="metric-grid">
                  <div class="metric-box"><span>Owner</span><strong>${escapeHtml(room.players.A?.name ?? "Open")}</strong></div>
                  <div class="metric-box"><span>Guest</span><strong>${escapeHtml(room.players.B?.name ?? "Waiting")}</strong></div>
                  <div class="metric-box"><span>Mode</span><strong>${escapeHtml(room.game.mode)}</strong></div>
                  <div class="metric-box"><span>State</span><strong>${escapeHtml(room.game.matchState)}</strong></div>
                </div>
                <div class="divider"></div>
                <div class="action-row">
                  <button class="secondary-button" data-action="copy-room">Copy Code</button>
                  <button class="primary-button" data-action="enter-battle">Open Duel Board</button>
                </div>
              `
              : `
                <div class="empty-state">No active room.</div>
              `
          }
        </div>
      </div>
    </section>
  `;
};

const renderClanFilterButton = (clanId, label) => `
  <button class="clan-filter ${state.selectedCollectionClan === clanId ? "is-active" : ""}" data-action="filter-collection-clan" data-clan="${clanId}">
    ${escapeHtml(label)}
  </button>
`;

const renderCollectionView = () => {
  const selected = getCollectionCard();
  const visibleCards = getVisibleCollectionCards();

  return `
    <section class="view-grid view-grid--collection">
      <div class="panel">
        <div class="panel__inner">
          <div class="section-kicker">Collection</div>
          <div class="clan-filter-row">
            ${renderClanFilterButton("all", "All")}
            ${Object.values(CLAN_DATABASE)
              .map((clan) => renderClanFilterButton(clan.id, clan.name))
              .join("")}
          </div>
          <div class="collection-grid">
            ${visibleCards
              .map(
                (card) => `
                  <button class="collection-card ${state.selectedCollectionCard === card.id ? "is-selected" : ""}" data-action="select-collection-card" data-card-id="${card.id}">
                    ${renderCardPortrait(card, "small")}
                    <div class="collection-card__meta">
                      <strong>${escapeHtml(card.name)}</strong>
                      ${renderRarityMeter(card.stars)}
                      <span>PWR ${card.power} / DMG ${card.damage}</span>
                    </div>
                  </button>
                `
              )
              .join("") || `<div class="empty-state">No cards in your collection.</div>`}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel__inner">
          <div class="section-kicker">Inspector</div>
          ${
            selected
              ? `
                <div class="collection-inspector">
                  <div class="collection-inspector__card">
                    ${renderCardPortrait(selected, "inspect")}
                  </div>
                  <div class="collection-inspector__details">
                    <h2 class="subheading">${escapeHtml(selected.name)}</h2>
                    <div class="chip-row">
                      <button class="chip chip--interactive" data-action="filter-collection-clan" data-clan="${escapeHtml(selected.clan)}">${escapeHtml(CLAN_DATABASE[selected.clan].name)}</button>
                      <span class="chip chip--rarity">${renderRarityMeter(selected.stars)}</span>
                      <span class="chip">PWR ${selected.power} / DMG ${selected.damage}</span>
                    </div>
                    <div class="divider"></div>
                    <div class="info-row">
                      <span>Bonus</span>
                      <p>${escapeHtml(selected.bonus?.text ?? CLAN_DATABASE[selected.clan].bonusLabel)}</p>
                    </div>
                    <div class="info-row">
                      <span>Ability</span>
                      <p>${escapeHtml(selected.ability?.text ?? "No ability loaded.")}</p>
                    </div>
                    <div class="info-row">
                      <span>Expansion</span>
                      <p>${escapeHtml(selected.expansion.toUpperCase())}</p>
                    </div>
                    <div class="info-row">
                      <span>Code</span>
                      <p>${escapeHtml(selected.code)}</p>
                    </div>
                  </div>
                </div>
              `
              : `<div class="empty-state">No card selected.</div>`
          }
        </div>
      </div>
    </section>
  `;
};

const renderStoreView = () => `
  <section class="view-grid view-grid--store">
    <div class="panel hero-panel">
      <div class="panel__inner">
        <div class="section-kicker">Store</div>
        <h2 class="view-title">Wallet // ${state.user?.profile?.eddies ?? 100}</h2>
        <div class="chip-row">
         <span class="chip"><b>INFO: </b></span>
          <span class="chip">Bot > 0</span>
          <span class="chip">Normal > 15 win > 10 loss-draw</span>
          <span class="chip">Ranked > 25 win > 10 loss-draw</span>
          <span class="chip">Fullarts // 2% pack rate</span>
        </div>
        <div class="divider"></div>
        ${
          STORE_PACKS.length
            ? `<div class="metric-grid">${STORE_PACKS.map((pack) => `<div class="metric-box"><span>${escapeHtml(pack.name)}</span><strong>${pack.price}</strong></div>`).join("")}</div>`
            : `<div class="empty-state">No packs online yet, stay tuned!</div>`
        }
      </div>
    </div>
  </section>
`;

const renderDeckView = () => {
  const decks = getUserDecks();
  const selectedDeck = getSelectedDeck();
  const selectedDeckCards = getDeckCards(selectedDeck);
  const canCreateDeck = decks.length < 6;
  const poolCards = getOwnedLibrary();
  const favoriteIds = getDeckFavoriteIds(selectedDeck);
  const favoriteCards = favoriteIds.map((cardId) => CARD_LIBRARY.find((card) => card.id === cardId)).filter(Boolean);

  return `
  <section class="view-grid view-grid--deck deck-lab-view">
    <div class="panel">
      <div class="panel__inner">
        <div class="section-kicker">Deck Library</div>
        <div class="deck-slot-list">
          ${decks
            .map(
              (deck, index) => `
                <article class="deck-slot ${selectedDeck?.id === deck.id ? "is-selected" : ""}">
                  <button class="deck-slot__body" data-action="select-deck" data-deck-id="${deck.id}">
                    <strong>${escapeHtml(deck.name)}</strong>
                    <span>${deck.cardIds.length}/${MATCH_CONSTANTS.deckSize} cards</span>
                    <small>${deck.id === state.user?.profile?.activeDeckId ? "ACTIVE LOADOUT" : `SLOT ${String(index + 1).padStart(2, "0")}`}</small>
                  </button>
                  <div class="deck-slot__actions">
                    <button class="ghost-button" data-action="set-active-deck" data-deck-id="${deck.id}" ${deck.id === state.user?.profile?.activeDeckId ? "disabled" : ""}>Set Active</button>
                    <button class="ghost-button" data-action="delete-deck" data-deck-id="${deck.id}" ${decks.length === 1 ? "disabled" : ""}>Delete</button>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
        <div class="action-row">
          <button class="secondary-button" data-action="create-deck" ${!canCreateDeck ? "disabled" : ""}>Create Deck</button>
        </div>
      </div>
    </div>

    <div class="panel deck-editor-panel">
      <div class="panel__inner">
        <div class="section-kicker">Loadout Editor</div>
        ${
          selectedDeck
            ? `
              <div class="deck-lab-summary">
                <form class="deck-name-form" data-form="deck-rename">
                  <input type="hidden" name="deckId" value="${escapeHtml(selectedDeck.id)}">
                  <label class="field">
                    <span>Deck Name</span>
                    <input name="deckName" value="${escapeHtml(selectedDeck.name)}" maxlength="32" required>
                  </label>
                  <button class="primary-button" type="submit">Save Name</button>
                </form>
                <div class="deck-status-strip">
                  <span>${selectedDeck.cardIds.length}/${MATCH_CONSTANTS.deckSize} CARDS</span>
                  <span>RANDOM ${MATCH_CONSTANTS.handSize} DRAW</span>
                  <span>${favoriteIds.length} FAVORITES</span>
                  <span>${selectedDeck.id === state.user?.profile?.activeDeckId ? "ACTIVE" : "READY"}</span>
                </div>
              </div>
              <div class="deck-builder-grid">
                <div class="deck-current">
                  <div class="deck-zone-head">
                    <strong>Current Deck</strong>
                    <span>${selectedDeck.cardIds.length}/${MATCH_CONSTANTS.deckSize}</span>
                  </div>
                  <div class="deck-current__list">
                    ${selectedDeckCards
                      .map(
                        (card, index) => `
                          <article class="deck-current-card ${favoriteIds.includes(card.id) ? "is-favorite" : ""}">
                            <span>${String(index + 1).padStart(2, "0")}</span>
                            <div>
                              <strong>${escapeHtml(card.name)}</strong>
                              <small>${escapeHtml(CLAN_DATABASE[card.clan].name)} // PWR ${card.power} / DMG ${card.damage}</small>
                            </div>
                            <div class="deck-current-card__actions">
                              <button class="ghost-button" data-action="deck-toggle-favorite" data-deck-id="${selectedDeck.id}" data-card-id="${card.id}">${favoriteIds.includes(card.id) ? "★ Favorite" : "☆ Favorite"}</button>
                              <button class="ghost-button" data-action="deck-remove-card" data-deck-id="${selectedDeck.id}" data-card-index="${index}">Remove</button>
                            </div>
                          </article>
                        `
                      )
                      .join("") || `<div class="empty-state">No cards loaded.</div>`}
                  </div>
                </div>
                <div class="deck-favorites">
                  <div class="deck-zone-head">
                    <strong>Favorites</strong>
                    <span>${favoriteIds.length}</span>
                  </div>
                  <div class="deck-favorite-list">
                    ${favoriteCards
                      .map(
                        (card) => `
                          <article class="deck-favorite-card">
                            <span>★</span>
                            <strong>${escapeHtml(card.name)}</strong>
                            <button class="ghost-button" data-action="deck-toggle-favorite" data-deck-id="${selectedDeck.id}" data-card-id="${card.id}">Remove</button>
                          </article>
                        `
                      )
                      .join("") || `<div class="empty-state">No favorites selected.</div>`}
                  </div>
                </div>
                <div class="deck-pool">
                  <div class="deck-zone-head">
                    <strong>Your Cards</strong>
                    <span>${poolCards.length}</span>
                  </div>
                  ${poolCards
                    .map((card) => {
                      const owned = getOwnedCardCount(card.id);
                      const used = getDeckCardCount(selectedDeck, card.id);
                      const available = Math.max(0, owned - used);
                      const inFavorites = favoriteIds.includes(card.id);
                      return `
                        <article class="deck-pool-card ${inFavorites ? "is-favorite" : ""}">
                          <div class="deck-pool-card__art">${renderCardPortrait(card, "small")}</div>
                          <div class="deck-pool-card__meta">
                            <strong>${escapeHtml(card.name)}</strong>
                            <span>Owned ${owned} // Used ${used} // Free ${available}</span>
                            <span>${escapeHtml(CLAN_DATABASE[card.clan].name)} // PWR ${card.power} / DMG ${card.damage}</span>
                          </div>
                          <div class="deck-pool-card__actions">
                            <button class="primary-button" data-action="deck-add-card" data-deck-id="${selectedDeck.id}" data-card-id="${card.id}" ${available <= 0 || selectedDeck.cardIds.length >= MATCH_CONSTANTS.deckSize ? "disabled" : ""}>Add</button>
                            <button class="ghost-button" data-action="deck-toggle-favorite" data-deck-id="${selectedDeck.id}" data-card-id="${card.id}">${inFavorites ? "★" : "☆"}</button>
                          </div>
                        </article>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
            : `<div class="empty-state">No deck selected.</div>`
        }
      </div>
    </div>
  </section>
`;
};

const renderTutorialLoop = (tutorial) => `
  <div class="tutorial-loop tutorial-loop--${tutorial.id}">
    <span class="tutorial-loop__hud tutorial-loop__hud--a"></span>
    <span class="tutorial-loop__hud tutorial-loop__hud--b"></span>
    <span class="tutorial-loop__card tutorial-loop__card--left"></span>
    <span class="tutorial-loop__card tutorial-loop__card--right"></span>
    <span class="tutorial-loop__beam"></span>
    <span class="tutorial-loop__marker tutorial-loop__marker--1"></span>
    <span class="tutorial-loop__marker tutorial-loop__marker--2"></span>
    <span class="tutorial-loop__glyph">${escapeHtml(tutorial.glyph ?? "+")}</span>
  </div>
`;

const renderRulingsView = () => `
  <section class="view-grid view-grid--rulings">
    <div class="panel hero-panel">
      <div class="panel__inner">
        <div class="section-kicker">Rulings</div>
        ${renderRuleRows()}
        <div class="divider"></div>
        <div class="rulings-tutorial-grid">
          ${RULING_TUTORIALS.map(
            (tutorial) => `
              <article class="rulings-tutorial">
                ${renderTutorialLoop(tutorial)}
                <strong>${escapeHtml(tutorial.title)}</strong>
                <p>${escapeHtml(tutorial.summary)}</p>
                <div class="rulings-tutorial__steps">
                  ${tutorial.steps.map((step, index) => `<span><em>${String(index + 1).padStart(2, "0")}</em>${escapeHtml(step)}</span>`).join("")}
                </div>
              </article>
            `
          ).join("")}
        </div>
      </div>
    </div>
  </section>
`;

const renderHistoryItem = (entry) => `
  <article class="history-item history-item--${escapeHtml(entry.outcome)}">
    <div class="history-item__head">
      <strong>${escapeHtml(entry.outcome.toUpperCase())}</strong>
      <span>${escapeHtml(getQueueLabel(entry.queue))}</span>
    </div>
    <p>${escapeHtml(entry.opponentName)} // ${entry.myLife}-${entry.opponentLife} // room ${escapeHtml(entry.roomCode)}</p>
    ${
      entry.queue === "ranked"
        ? `<small>${entry.mmrDelta > 0 ? `+${entry.mmrDelta}` : entry.mmrDelta} MMR // ${entry.mmrAfter} total</small>`
        : ""
    }
    <small>+${entry.eddiesReward ?? 0} EDDIES</small>
    <small>${new Date(entry.timestamp).toLocaleString("it-IT")}</small>
  </article>
`;

const renderProfileView = () => {
  const user = state.user;
  const history = user?.history ?? [];
  const botStats = getQueueStats(history, "vs_bot");
  const casualStats = getQueueStats(history, "normal");
  const rankedStats = getQueueStats(history, "ranked");
  const recentHistory = history.slice(0, PROFILE_RECENT_MATCHES);
  const rankedProfile = getRankedProfile(user);
  const rankedTier = getRankedTier(rankedProfile.mmr);
  const leaderboardPreview = listUsers()
    .filter((entry) => entry.id !== "ascendants-bot")
    .map((entry) => {
      const ranked = getRankedProfile(entry);
      return {
        id: entry.id,
        alias: entry.name,
        mmr: ranked.mmr,
        wins: ranked.wins,
        losses: ranked.losses,
        played: ranked.played,
        tier: getRankedTier(ranked.mmr),
      };
    })
    .sort((left, right) => {
      if (right.mmr !== left.mmr) {
        return right.mmr - left.mmr;
      }
      return right.wins - left.wins;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const myRank = leaderboardPreview.find((entry) => entry.id === user?.id)?.rank ?? (leaderboardPreview.length || 1);

  return `
    <section class="view-grid view-grid--profile">
      <div class="panel">
        <div class="panel__inner">
          <div class="section-kicker">Player Profile</div>
          <div class="profile-shell">
            <div class="profile-avatar-shell">
              <div class="profile-avatar ${user?.profile?.avatar ? "has-image" : ""}">
                ${
                  user?.profile?.avatar
                    ? `<img src="${escapeHtml(user.profile.avatar)}" alt="${escapeHtml(user.name)} avatar">`
                    : `<span>${escapeHtml((user?.name ?? "AK").slice(0, 2).toUpperCase())}</span>`
                }
              </div>
              <label class="secondary-button profile-upload-button">
                Upload avatar
                <input id="profileAvatarInput" type="file" accept="image/png,image/jpeg,image/webp">
              </label>
              <div class="ranked-tier-card">
                <span class="ranked-tier-card__symbol">${escapeHtml(rankedTier.symbol)}</span>
                <strong>${escapeHtml(rankedTier.label)}</strong>
                <small>${rankedProfile.mmr} MMR // RANK ${myRank}</small>
              </div>
            </div>
            <form class="profile-form" data-form="profile">
              <label class="field">
                <span>Player Alias</span>
                <input name="name" value="${escapeHtml(user?.name ?? "")}" maxlength="28" required>
              </label>
              <label class="field">
                <span>Description</span>
                <textarea name="bio" rows="5" maxlength="240" placeholder="Write your player bio...">${escapeHtml(user?.profile?.bio ?? "")}</textarea>
              </label>
              <div class="action-row">
                <button class="primary-button" type="submit">Save Profile</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel__inner">
          <div class="section-kicker">Match Record</div>
          <div class="metric-grid profile-metric-grid">
            <div class="metric-box"><span>VS Bot</span><strong>${botStats.played}</strong><em>${botStats.winrate}% WR</em></div>
            <div class="metric-box"><span>Normal</span><strong>${casualStats.played}</strong><em>${casualStats.winrate}% WR</em></div>
            <div class="metric-box"><span>Ranked</span><strong>${rankedStats.played}</strong><em>${rankedStats.winrate}% WR</em></div>
            <div class="metric-box"><span>MMR</span><strong>${rankedProfile.mmr}</strong><em>${rankedProfile.wins}W / ${rankedProfile.losses}L</em></div>
          </div>
          <div class="divider"></div>
          <div class="chip-row chip-row--season">
            <span class="chip">SEASON // PRELUDE</span>
            <span class="chip">EDDIES // ${user?.profile?.eddies ?? 100}</span>
            <span class="chip">RANKED ${rankedProfile.wins}W-${rankedProfile.losses}L</span>
          </div>
          <div class="divider"></div>
          <div class="profile-history">
            ${recentHistory.length ? recentHistory.map(renderHistoryItem).join("") : `<div class="empty-state">No matches logged.</div>`}
          </div>
        </div>
      </div>

      <div class="panel hero-panel">
        <div class="panel__inner">
          <div class="section-kicker">World Grid</div>
          <div class="leaderboard-head">
            <span>Rank</span>
            <span>Player</span>
            <span>MMR</span>
            <span>W/L</span>
          </div>
          <div class="leaderboard-preview">
            ${leaderboardPreview
              .map(
                (entry) => `
                  <article class="leaderboard-row ${entry.id === user?.id ? "is-you" : ""}">
                    <span>${escapeHtml(`${entry.rank}`)}</span>
                    <strong>${escapeHtml(`${entry.tier.symbol} ${entry.alias}`)}</strong>
                    <em>${entry.mmr}</em>
                    <small>${entry.wins}W / ${entry.losses}L</small>
                  </article>
                `
              )
              .join("") || `<div class="empty-state">No ranked players yet.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
};

const renderSettingsControls = () => `
  <label class="field">
    <span>MASTER VOLUME</span>
    <input type="range" min="0" max="100" value="${state.settings.masterVolume}" data-setting="masterVolume">
  </label>
  <label class="field">
    <span>MUSIC VOLUME</span>
    <input type="range" min="0" max="100" value="${state.settings.musicVolume}" data-setting="musicVolume">
  </label>
  <label class="field">
    <span>SFX VOLUME</span>
    <input type="range" min="0" max="100" value="${state.settings.sfxVolume}" data-setting="sfxVolume">
  </label>
  <label class="field">
    <span>GRAPHICS QUALITY</span>
    <select data-setting="graphicsQuality">
      <option value="ultra" ${state.settings.graphicsQuality === "ultra" ? "selected" : ""}>Ultra</option>
      <option value="high" ${state.settings.graphicsQuality === "high" ? "selected" : ""}>High</option>
      <option value="safe" ${state.settings.graphicsQuality === "safe" ? "selected" : ""}>Safe</option>
    </select>
  </label>
  <label class="toggle-row">
    <span>GLITCH FX</span>
    <input type="checkbox" data-setting="glitchFx" ${state.settings.glitchFx ? "checked" : ""}>
  </label>
  <label class="toggle-row">
    <span>SCANLINES</span>
    <input type="checkbox" data-setting="scanlines" ${state.settings.scanlines ? "checked" : ""}>
  </label>
  <label class="toggle-row">
    <span>MUTE</span>
    <input type="checkbox" data-setting="muted" ${state.settings.muted ? "checked" : ""}>
  </label>
`;

const renderSettingsView = () => `
  <section class="view-grid view-grid--settings">
    <div class="panel">
      <div class="panel__inner">
        <div class="section-kicker">Settings</div>
        <div class="settings-grid">
          ${renderSettingsControls()}
        </div>
      </div>
    </div>
  </section>
`;

const renderOpponentHand = (game, opponentSlot) => {
  const opponent = getCoach(game, opponentSlot);
  return opponent.hand.length
    ? opponent.hand
        .map(
          () => `
            <article class="battle-mini-card battle-mini-card--hidden">
              <strong>Encrypted Card</strong>
              <span>Signal masked</span>
            </article>
          `
        )
        .join("")
      : `<div class="empty-state">Opponent hand empty.</div>`;
};

const renderPlayedCards = (cards) =>
  cards.length
    ? cards
        .map(
          (card) => `
            <article class="battle-mini-card battle-mini-card--revealed">
              <strong>${escapeHtml(card.name)}</strong>
              <span>R${card.stars} / ${card.damage}D</span>
            </article>
          `
        )
        .join("")
      : `<div class="empty-state">No archive yet.</div>`;

const renderNodeStrip = (count, max, type, accent = "player") => {
  const segmentSize = type === "life" ? 3 : 3;
  const segments = Math.ceil(max / segmentSize);
  return Array.from({ length: segments }, (_, index) => {
    const threshold = (index + 1) * segmentSize;
    const active = count >= threshold;
    const partial = !active && count > index * segmentSize;
    return `<span class="resource-node resource-node--${type} ${active ? "is-active" : ""} ${partial ? "is-partial" : ""} resource-node--${accent}"></span>`;
  }).join("");
};

const renderResourceTrack = (label, count, max, type, accent = "player", symbol = "+") => `
  <div class="resource-track resource-track--${type}">
    <div class="resource-track__head">
      <span>${label}</span>
      <div class="resource-track__count">
        <em>${symbol}</em>
        <strong>${count}</strong>
        <small>/${max}</small>
      </div>
    </div>
    <div class="resource-strip resource-strip--${type}">${renderNodeStrip(count, max, type, accent)}</div>
  </div>
`;

const renderCompactResource = (label, value, max, type) => {
  const percentage = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return `
    <div class="combat-resource combat-resource--${type}">
      <div class="combat-resource__line">
        <span>${label}</span>
        <strong>${value}<small>/${max}</small></strong>
      </div>
      <div class="combat-resource__bar" aria-hidden="true">
        <i style="width:${percentage}%"></i>
      </div>
    </div>
  `;
};

const renderCombatantHud = (name, slot, life, pillz, isCurrent, isLocked) => `
  <article class="combatant-hud combatant-hud--${slot === "A" ? "player" : "opponent"} ${isCurrent ? "is-current" : ""}">
    <div class="combatant-hud__head">
      <div>
        <span class="combatant-hud__label">${slot === "A" ? "You" : "Enemy"}</span>
        <strong>${escapeHtml(name)}</strong>
      </div>
      <span class="combatant-state ${isLocked ? "is-locked" : "is-open"}">${isLocked ? "LOCKED" : "OPEN"}</span>
    </div>
    <div class="combatant-hud__resources">
      ${renderCompactResource("Life", life, MATCH_CONSTANTS.startingLife, "life")}
      ${renderCompactResource("Pills", pillz, MATCH_CONSTANTS.startingPillz, "pills")}
    </div>
  </article>
`;

const renderArenaCard = (card, side, metaLabel, revealed = true, result = "neutral") => {
  if (!card) {
    return `
      <div class="arena-card arena-card--${side} arena-card--ghost">
        <div class="arena-card__ghost">
          <span>Signal pending</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="arena-card arena-card--${side} arena-card--${result}">
      ${revealed ? renderCardPortrait(card, "battle") : `<div class="arena-card__encrypted"><span>ENCRYPTED</span></div>`}
      <div class="arena-card__meta">
        <span>${escapeHtml(metaLabel)}</span>
        <strong>${revealed ? `PWR ${card.power} / DMG ${card.damage} / R${card.stars}` : "Signal locked"}</strong>
      </div>
    </div>
  `;
};

const renderImpactBursts = (winnerSide) =>
  Array.from({ length: 3 }, (_, index) => {
    const angle = -18 + index * 18;
    return `<span class="impact-particle impact-particle--${winnerSide}" style="--angle:${angle}deg;--delay:${index * 0.22}s;"></span>`;
  }).join("");

const getClanFxTheme = (card) => CLAN_DATABASE[card?.clan]?.fxTheme ?? "neutral";

const renderSpellMotes = () =>
  Array.from(
    { length: 12 },
    (_, index) =>
      `<span class="arcane-mote" style="--mote-angle:${index * 30}deg;--delay:${(index * 0.13).toFixed(2)}s;"></span>`
  ).join("");

const renderBlazeVolley = (winnerSide, losingSide) => `
  <div class="weapon-volley weapon-volley--${winnerSide} weapon-volley--blaze spell-volley">
    <div class="spell-cast spell-cast--${winnerSide}">
      <span class="arcane-rune arcane-rune--outer"></span>
      <span class="arcane-rune arcane-rune--inner"></span>
      <span class="spell-lance spell-lance--flame"></span>
      <span class="spell-orb spell-orb--blaze"></span>
      ${renderSpellMotes()}
    </div>
    <div class="impact-bloom impact-bloom--${losingSide}">
      <span class="impact-bloom__core"></span>
      <span class="impact-bloom__ring"></span>
    </div>
  </div>
`;

const renderFluxVolley = (winnerSide, losingSide) => `
  <div class="weapon-volley weapon-volley--${winnerSide} weapon-volley--flux spell-volley">
    <div class="spell-cast spell-cast--${winnerSide}">
      <span class="arcane-rune arcane-rune--outer"></span>
      <span class="arcane-rune arcane-rune--inner"></span>
      <span class="spell-wave spell-wave--main"></span>
      <span class="spell-lance spell-lance--flux"></span>
      ${renderSpellMotes()}
    </div>
    <div class="impact-bloom impact-bloom--${losingSide}">
      <span class="impact-bloom__core"></span>
      <span class="impact-bloom__ring"></span>
    </div>
  </div>
`;

const renderVoidFallVolley = (winnerSide, losingSide) => `
  <div class="weapon-volley weapon-volley--${winnerSide} weapon-volley--void-fall spell-volley">
    <div class="spell-cast spell-cast--${winnerSide}">
      <span class="arcane-rune arcane-rune--eclipse"></span>
      <span class="spell-orb spell-orb--void"></span>
      <span class="void-shard void-shard--a"></span>
      <span class="void-shard void-shard--b"></span>
      <span class="void-shard void-shard--c"></span>
      ${renderSpellMotes()}
    </div>
    <div class="impact-bloom impact-bloom--${losingSide}">
      <span class="impact-bloom__core"></span>
      <span class="impact-bloom__ring"></span>
    </div>
  </div>
`;

const renderEdgerunnersVolley = (winnerSide, losingSide) => `
  <div class="weapon-volley weapon-volley--${winnerSide} weapon-volley--edgerunners spell-volley">
    <div class="spell-cast spell-cast--${winnerSide}">
      <span class="arcane-rune arcane-rune--outer"></span>
      <span class="spell-slash spell-slash--a"></span>
      <span class="spell-slash spell-slash--b"></span>
      <span class="spell-lance spell-lance--edge"></span>
      ${renderSpellMotes()}
    </div>
    <div class="impact-bloom impact-bloom--${losingSide}">
      <span class="impact-bloom__core"></span>
      <span class="impact-bloom__ring"></span>
    </div>
  </div>
`;

const renderWeaponVolley = (winnerSide, winnerClanTheme) => {
  if (winnerSide === "neutral") {
    return "";
  }
  const losingSide = winnerSide === "player" ? "opponent" : "player";

  switch (winnerClanTheme) {
    case "flux":
      return renderFluxVolley(winnerSide, losingSide);
    case "void-fall":
      return renderVoidFallVolley(winnerSide, losingSide);
    case "edgerunners":
      return renderEdgerunnersVolley(winnerSide, losingSide);
    case "blaze":
    default:
      return renderBlazeVolley(winnerSide, losingSide);
  }
};

const renderClashScene = (game, mySlot, opponentSlot, selected, replayRound) => {
  const activeRound = replayRound;
  const myRoundCard = activeRound
    ? mySlot === "A"
      ? activeRound.cardA
      : activeRound.cardB
    : selected;
  const rivalRoundCard = activeRound
    ? opponentSlot === "A"
      ? activeRound.cardA
      : activeRound.cardB
    : null;
  const winnerSlot = activeRound?.winner ?? null;
  const playerArenaState = !activeRound || !winnerSlot ? "neutral" : winnerSlot === mySlot ? "winner" : "defeated";
  const rivalArenaState = !activeRound || !winnerSlot ? "neutral" : winnerSlot === opponentSlot ? "winner" : "defeated";
  const winnerText = winnerSlot
    ? winnerSlot === mySlot
      ? "ROUND WON"
      : "ROUND LOST"
    : activeRound
      ? "ROUND DRAW"
      : game.matchState === "waiting"
      ? "Waiting link"
      : "Select and commit";
  const resultHoldText = activeRound
    ? winnerSlot
      ? winnerSlot === mySlot
        ? `${getCoachName(game, mySlot)} WINS THE ROUND`
        : `${getCoachName(game, opponentSlot)} WINS THE ROUND`
      : "ROUND DRAW // BOTH LOSE 1 LIFE"
    : "";
  const winnerSide = winnerSlot ? (winnerSlot === mySlot ? "player" : "opponent") : "neutral";
  const winnerCard = winnerSlot ? (winnerSlot === "A" ? activeRound?.cardA : activeRound?.cardB) : null;
  const winnerClanTheme = getClanFxTheme(winnerCard);

  return `
    <div class="clash-stage ${activeRound ? "has-result" : ""} ${winnerSlot ? `is-winner-${winnerSide}` : ""} fx-theme-${winnerClanTheme}" data-fx-id="${escapeHtml(activeRound?.id ?? "idle")}">
      <div class="clash-stage__fx clash-stage__fx--violet"></div>
      <div class="clash-stage__fx clash-stage__fx--green"></div>
      <div class="clash-stage__grid"></div>
      ${winnerSlot ? `<div class="fantasy-flare fantasy-flare--${winnerSide}"></div>` : ""}
      ${winnerSlot ? `<div class="fantasy-impact fantasy-impact--${winnerSide}">${renderImpactBursts(winnerSide)}</div>` : ""}
      ${winnerSlot ? `<div class="glitch-fight glitch-fight--${winnerSide}"><span></span><span></span><span></span><i></i></div>` : ""}
      ${renderWeaponVolley(winnerSide, winnerClanTheme)}
      <div class="clash-stage__center">
        <span class="clash-stage__round">Round ${game.round}</span>
        <strong class="clash-stage__versus">VS</strong>
        <span class="clash-stage__winner ${winnerSlot ? (winnerSlot === mySlot ? "is-player" : "is-opponent") : ""}">${escapeHtml(winnerText)}</span>
        ${activeRound ? `<span class="clash-stage__result-hold">${escapeHtml(resultHoldText)}</span>` : ""}
        ${
          activeRound
            ? `<p class="clash-stage__summary">${
                winnerSlot
                  ? `${escapeHtml(activeRound.summary)} ${activeRound.damage} damage dealt. ${winnerCard ? `${escapeHtml(CLAN_DATABASE[winnerCard.clan].name)} finisher online.` : ""}`
                  : escapeHtml(activeRound.summary)
              }</p>`
            : `<p class="clash-stage__summary">ROUND LIVE // FURY +${MATCH_CONSTANTS.furyDamage}</p>`
        }
      </div>
      ${renderArenaCard(myRoundCard, "player", activeRound ? `${activeRound.attackA ?? 0} ATK` : "Selected card", true, playerArenaState)}
      ${renderArenaCard(rivalRoundCard, "opponent", activeRound ? `${activeRound.attackB ?? 0} ATK` : "Opponent signal", Boolean(activeRound), rivalArenaState)}
    </div>
  `;
};

const getGameOverState = () => {
  if (!state.room || state.room.game.matchState !== "finished") {
    return null;
  }

  const game = state.room.game;
  const mySlot = getMySlot();
  const opponentSlot = getOpponentSlot(mySlot);
  const myLife = game.life[mySlot];
  const opponentLife = game.life[opponentSlot];
  const outcome = myLife > opponentLife ? "win" : myLife < opponentLife ? "loss" : "draw";
  const opponentName = game.coaches[opponentSlot]?.name ?? "Opponent";

  return {
    mode: game.mode,
    outcome,
    title: outcome === "win" ? "GAME WON" : outcome === "loss" ? "GAME LOST" : "GAME DRAW",
    detail:
      outcome === "win"
        ? `${opponentName} has been flatlined, duel finished in your favor.`
        : outcome === "loss"
          ? `Your Life hit zero before ${opponentName}, duel finished.`
          : "Both players ended on the same Life total, the duel is finished as a draw.",
    myLife,
    opponentLife,
  };
};

const renderGameOverModal = () => {
  const result = getGameOverState();
  if (!result || !state.gameOverReady || state.gameOverModalKey !== getMatchRecordKey(state.room)) {
    return "";
  }

  return `
    <div class="gameover-overlay">
      <div class="gameover-modal gameover-modal--${result.outcome}">
        <span class="gameover-modal__kicker">match complete</span>
        <strong class="gameover-modal__title">${result.title}</strong>
        <p class="gameover-modal__copy">${escapeHtml(result.detail)}</p>
        <div class="gameover-modal__score">
          <div><span>Your Life</span><strong>${result.myLife}</strong></div>
          <div><span>Enemy Life</span><strong>${result.opponentLife}</strong></div>
        </div>
        <div class="action-row">
          ${
            result.mode === "bot"
              ? `<button class="primary-button" data-action="rematch-bot">New Bot Match</button>`
              : ""
          }
          <button class="secondary-button" data-action="leave-room">Return to Rooms</button>
        </div>
      </div>
    </div>
  `;
};

const renderBattleView = () => {
  if (!state.room) {
    return `
      <section class="view-grid">
        <div class="panel">
          <div class="panel__inner">
            <div class="empty-state">No active duel.</div>
          </div>
        </div>
      </section>
    `;
  }

  clampBattleInputs();
  const game = state.room.game;
  if (game.matchState === "live" && !game.turnStartedAt && !state.combatReplay) {
    rearmCurrentRoundTimer();
  }
  const mySlot = getMySlot();
  const opponentSlot = getOpponentSlot(mySlot);
  const me = getCoach(game, mySlot);
  const rival = getCoach(game, opponentSlot);
  const selected = getSelectedHandCard();
  const available = game.pillz[mySlot];
  const furyReserve = state.pendingFury ? MATCH_CONSTANTS.furyCost : 0;
  const maxExtra = Math.max(0, available - furyReserve);
  const pillFill = maxExtra ? Math.round((Math.min(state.pendingExtraPillz, maxExtra) / maxExtra) * 100) : 0;
  const totalCommittedPills = state.pendingExtraPillz + 1 + (state.pendingFury ? MATCH_CONSTANTS.furyCost : 0);
  const totalAttackPreview = selected ? selected.power * totalCommittedPills : 0;
  const canPlay =
    game.matchState === "live" &&
    !game.submissions[mySlot] &&
    selected &&
    (game.mode === "bot" || state.user.id === state.room.players[mySlot]?.id);
  const initiativeName = game.coaches[game.currentCoach]?.name ?? "Pending";
  const replayRound = state.combatReplay;
  const selectedPreview =
    game.matchState === "finished"
      ? `
      <div class="empty-state">Match complete.</div>
    `
      : selected
        ? `
      <div class="commit-card-summary">
        <span>Selected</span>
        <strong>${escapeHtml(selected.name)}</strong>
        <div>
          <b>PWR ${selected.power}</b>
          <b>DMG ${selected.damage}</b>
          <b>${escapeHtml(CLAN_DATABASE[selected.clan].name)}</b>
        </div>
      </div>
      <div class="pill-console" style="--pill-fill:${pillFill}%">
        <div class="pill-console__head">
          <span>Extra Pills</span>
          <strong>${state.pendingExtraPillz}<small>/${maxExtra}</small></strong>
        </div>
        <div class="pill-console__controls">
          <button class="pill-console__step" data-action="adjust-pillz" data-delta="-1" ${state.pendingExtraPillz <= 0 ? "disabled" : ""}>-</button>
          <input id="pillzRange" class="pill-console__range" type="range" min="0" max="${maxExtra}" value="${Math.min(state.pendingExtraPillz, maxExtra)}">
          <button class="pill-console__step" data-action="adjust-pillz" data-delta="1" ${state.pendingExtraPillz >= maxExtra ? "disabled" : ""}>+</button>
        </div>
        <div class="pill-console__cells" aria-hidden="true">
          ${Array.from({ length: 9 }, (_, index) => `<span class="${index < Math.ceil((pillFill / 100) * 9) ? "is-active" : ""}"></span>`).join("")}
        </div>
        <div class="pill-console__meta">
          <span>Committed ${totalCommittedPills}</span>
          <span>Reserve ${Math.max(0, available - totalCommittedPills)}</span>
        </div>
      </div>
      <label class="toggle-row">
        <span>Fury +${MATCH_CONSTANTS.furyDamage} DMG / -${MATCH_CONSTANTS.furyCost} Pills</span>
        <input type="checkbox" data-action="toggle-fury" ${state.pendingFury ? "checked" : ""} ${available < MATCH_CONSTANTS.furyCost ? "disabled" : ""}>
      </label>
      <div class="battle-commit-preview">
        <span>Attack</span>
        <strong>${totalAttackPreview}</strong>
      </div>
      <button class="primary-button" data-action="submit-play" ${!canPlay ? "disabled" : ""}>Lock Play</button>
    `
        : `
      <div class="empty-state">Select a card from hand.</div>
    `;

  return `
    <section class="view-grid view-grid--battle">
      <div class="panel">
        <div class="panel__inner">
          <div class="battle-header">
            <div>
              <div class="section-kicker">Live Duel</div>
              <h2 class="view-title">${escapeHtml(me.name)} vs ${escapeHtml(rival.name)}</h2>
            </div>
            <div class="action-row">
              <button class="ghost-button" data-action="nav-view" data-view="multiplayer">Rooms</button>
              <button class="ghost-button" data-action="leave-room">Leave Room</button>
            </div>
          </div>

          <div class="battle-hud">
            ${renderCombatantHud(me.name, mySlot, game.life[mySlot], game.pillz[mySlot], game.currentCoach === mySlot, Boolean(game.submissions[mySlot]))}
            <div class="battle-round-core">
              ${renderTurnTimer(game)}
              <div class="battle-round-core__code">${escapeHtml(state.room.code)}</div>
              <div class="battle-round-core__phase">${escapeHtml(game.phase)}</div>
              <div class="battle-round-core__meta">
                <span>Round ${game.round}/${MATCH_CONSTANTS.rounds}</span>
                <span>Initiative ${escapeHtml(initiativeName)}</span>
                <span>${escapeHtml(game.mode === "bot" ? "Bot duel" : game.mode === "ranked" ? "Ranked queue" : "Normal duel")}</span>
              </div>
            </div>
            ${renderCombatantHud(rival.name, opponentSlot, game.life[opponentSlot], game.pillz[opponentSlot], game.currentCoach === opponentSlot, Boolean(game.submissions[opponentSlot]))}
          </div>

          ${renderNotice()}
          ${state.roundBanner ? `<div class="round-banner round-banner--${state.roundBanner.outcome}">${escapeHtml(state.roundBanner.text)}</div>` : ""}

          ${
            game.matchState === "waiting"
              ? `<div class="notice is-warning">Waiting for a second human player. Use this room code in another local window: ${escapeHtml(state.room.code)}</div>`
              : ""
          }

          <div class="battle-stage-layout">
            <div class="battle-side-stack battle-side-stack--left">
              <h3>Your hand</h3>
              <div class="battle-hand-rail">
                ${me.hand
                  .map(
                    (card) => `
                      <button class="hand-card hand-card--rail ${state.selectedCardId === card.instanceId ? "is-selected" : ""}" data-action="select-hand-card" data-card-id="${card.instanceId}">
                        ${renderCardPortrait(card, "small")}
                        <div class="hand-card__meta">
                          <strong>${escapeHtml(card.name)}</strong>
                          <span>PWR ${card.power} / DMG ${card.damage}</span>
                        </div>
                      </button>
                    `
                  )
                  .join("") || `<div class="empty-state">Hand empty.</div>`}
              </div>
            </div>

            <div class="battle-arena-shell">
              ${renderClashScene(game, mySlot, opponentSlot, selected, replayRound)}
            </div>

            <div class="battle-side-stack battle-side-stack--right">
              <div class="battle-controls">
                <h3>Commit selected card</h3>
                ${selectedPreview}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
};

const renderMainView = () => {
  switch (state.view) {
    case "multiplayer":
      return renderMultiplayerView();
    case "store":
      return renderStoreView();
    case "rulings":
      return renderRulingsView();
    case "profile":
      return renderProfileView();
    case "collection":
      return renderCollectionView();
    case "deck":
      return renderDeckView();
    case "settings":
      return renderSettingsView();
    case "battle":
      return renderBattleView();
    case "home":
    default:
      return renderHomeView();
  }
};

const renderAppShell = () => `
  <section class="app-shell ${state.navOpen ? "app-shell--nav-open" : ""}">
    ${renderTopbar()}
    ${state.navOpen ? `<button class="nav-backdrop" data-action="close-nav" aria-label="Close menu"></button>` : ""}
    ${renderNav()}
    <div class="app-shell__body">
      <main class="app-main">${renderMainView()}</main>
    </div>
    ${renderGameOverModal()}
  </section>
`;

const render = () => {
  document.body.dataset.glitch = state.settings.glitchFx ? "on" : "off";
  document.body.dataset.scanlines = state.settings.scanlines ? "on" : "off";
  document.body.dataset.graphics = state.settings.graphicsQuality;
  syncBackgroundMusic(false);
  syncSelections();
  app.innerHTML = state.user ? renderAppShell() : renderAuthScreen();
};

const handleAuthSubmit = (event) => {
  event.preventDefault();
  const form = event.target.closest("form[data-form]");
  if (!form) {
    return;
  }
  const formData = new FormData(form);
  const mode = form.dataset.form;
  if (mode === "profile") {
    const nextName = `${formData.get("name") ?? ""}`.trim() || state.user?.name || "Neon Drifter";
    const nextBio = `${formData.get("bio") ?? ""}`.trim();
    updateCurrentUser((user) => ({
      ...user,
      name: nextName,
      profile: {
        ...user.profile,
        bio: nextBio,
      },
    }));
    setNotice("Profile updated.", "success");
    render();
    return;
  }

  if (mode === "deck-rename") {
    const deckId = `${formData.get("deckId") ?? ""}`;
    const deckName = `${formData.get("deckName") ?? ""}`.trim().slice(0, 32) || "Unnamed Loadout";
    updateCurrentUser((user) => ({
      ...user,
      profile: {
        ...user.profile,
        decks: user.profile.decks.map((deck) => (deck.id === deckId ? { ...deck, name: deckName } : deck)),
      },
    }));
    setNotice("Deck name updated.", "success");
    render();
    return;
  }

  const name = `${formData.get("name") ?? ""}`.trim() || "Neon Drifter";
  const email = `${formData.get("email") ?? ""}`.trim();
  const password = `${formData.get("password") ?? ""}`.trim();

  try {
    state.user =
      mode === "signup"
        ? signup({ name, email, password })
        : login({ email, password });
    state.authPanel = null;
    state.room = null;
    state.view = "home";
    state.navOpen = false;
    state.selectedDeckId = state.user?.profile?.activeDeckId ?? null;
    clearNotice();
    render();
  } catch (error) {
    setNotice(error.message, "warning");
  }
};

const hasPlayableDeck = () => getActiveDeckIds(true).length === MATCH_CONSTANTS.deckSize;

const ensurePlayableDeck = () => {
  if (hasPlayableDeck()) {
    return true;
  }
  setNotice(`Active deck must contain ${MATCH_CONSTANTS.deckSize} cards.`, "warning");
  return false;
};

const createFreshRoom = (mode = "multiplayer") => {
  if (!ensurePlayableDeck()) {
    return false;
  }
  state.room = createRoomState(state.user, mode, getActiveDeckIds());
  state.selectedCardId = null;
  state.pendingExtraPillz = 0;
  state.pendingFury = false;
  saveRoom(state.room);
  return true;
};

const handleJoinRoom = () => {
  const code = state.roomCodeInput.trim().toUpperCase();
  if (!code) {
    setNotice("Enter a room code first.", "warning");
    return;
  }
  const room = loadRoom(code);
  if (!room) {
    setNotice("Room code not found.", "warning");
    return;
  }
  if (room.game.mode === "bot" && room.players.A?.id !== state.user.id) {
    setNotice("This room is already running a bot duel.", "warning");
    return;
  }

  const alreadyInside = room.players.A?.id === state.user.id || room.players.B?.id === state.user.id;
  if (room.players.B && !alreadyInside) {
    setNotice("This room already has two connected players.", "warning");
    return;
  }

  if (!alreadyInside && !room.players.B && !ensurePlayableDeck()) {
    return;
  }
  const updatedRoom = alreadyInside || room.players.B ? room : joinRoomState(room, state.user, getActiveDeckIds());
  state.room = updatedRoom;
  state.view = "battle";
  state.selectedCardId = null;
  state.pendingExtraPillz = 0;
  state.pendingFury = false;
  saveRoom(updatedRoom);
  setNotice(`Joined room ${updatedRoom.code}.`, "success");
};

const handleQuickStartBot = () => {
  if (!createFreshRoom()) {
    return;
  }
  state.room = startPracticeState(state.room);
  state.view = "battle";
  saveRoom(state.room);
  setNotice("Bot duel online. Ghost Kernel is waiting.", "success");
};

const handleFindRankedMatch = () => {
  const ownOpenRankedRoom = listRooms().find(
    (room) =>
      room?.game?.mode === "ranked" &&
      room.game.matchState === "waiting" &&
      room.players.A?.id === state.user.id &&
      !room.players.B
  );

  if (ownOpenRankedRoom) {
    state.room = ownOpenRankedRoom;
    state.view = "multiplayer";
    setNotice(`Ranked queue already open in room ${ownOpenRankedRoom.code}.`, "success");
    return;
  }

  const openRankedRoom = listRooms().find(
    (room) =>
      room?.game?.mode === "ranked" &&
      room.game.matchState === "waiting" &&
      room.players.A?.id !== state.user.id &&
      !room.players.B
  );

  if (openRankedRoom) {
    if (!ensurePlayableDeck()) {
      return;
    }
    const joinedRoom = joinRoomState(openRankedRoom, state.user, getActiveDeckIds());
    state.room = joinedRoom;
    state.view = "battle";
    state.selectedCardId = null;
    state.pendingExtraPillz = 0;
    state.pendingFury = false;
    saveRoom(joinedRoom);
    setNotice(`Ranked match found: ${joinedRoom.code}.`, "success");
    return;
  }

  if (!createFreshRoom("ranked")) {
    return;
  }
  state.view = "multiplayer";
  setNotice(`Ranked queue armed. Room ${state.room.code} is waiting for an opponent.`, "success");
};

const handleSubmitPlay = () => {
  if (!state.room) {
    setNotice("Create or join a duel first.", "warning");
    return;
  }
  const selected = getSelectedHandCard();
  if (!selected) {
    setNotice("Select a card from your hand first.", "warning");
    return;
  }

  const mySlot = getMySlot();
  const result = submitPlay(state.room.game, mySlot, selected.instanceId, state.pendingExtraPillz, state.pendingFury);
  state.room.game = result.game;
  state.selectedCardId = null;
  state.pendingExtraPillz = 0;
  state.pendingFury = false;
  saveRoom(state.room);
  const replayStarted = startCombatReplay(result.game.lastRound);
  syncGameEndState(state.room, replayStarted);
  setNotice(result.message, result.message.includes("waiting") ? "warning" : "success");
};

const handleTurnTimeout = () => {
  if (!state.room || state.room.game.matchState !== "live" || state.combatReplay) {
    return;
  }

  const timeoutRound = state.room.game.round;
  let nextGame = state.room.game;
  const autoLocked = [];

  ["A", "B"].forEach((slot) => {
    if (nextGame.matchState !== "live" || nextGame.round !== timeoutRound || nextGame.submissions[slot]) {
      return;
    }

    const fallbackCard = getRandomHandCard(nextGame, slot);
    if (!fallbackCard) {
      return;
    }

    const result = submitPlay(nextGame, slot, fallbackCard.instanceId, 0, false);
    nextGame = result.game;
    autoLocked.push(`${getCoachName(state.room.game, slot)}: ${fallbackCard.name}`);
  });

  if (!autoLocked.length) {
    return;
  }

  state.room.game = nextGame;
  state.selectedCardId = null;
  state.pendingExtraPillz = 0;
  state.pendingFury = false;
  saveRoom(state.room);
  const replayStarted = startCombatReplay(nextGame.lastRound);
  syncGameEndState(state.room, replayStarted);
  setNotice(`Time expired. Auto-locked with 0 extra Pills: ${autoLocked.join(" / ")}.`, "warning");
};

const tickTurnTimer = () => {
  if (!state.room || state.view !== "battle" || state.room.game.matchState !== "live" || state.combatReplay) {
    lastRenderedTurnSecond = null;
    return;
  }

  const remaining = getTurnRemainingSeconds(state.room.game);
  if (remaining <= 0) {
    handleTurnTimeout();
    lastRenderedTurnSecond = null;
    return;
  }

  if (remaining !== lastRenderedTurnSecond) {
    lastRenderedTurnSecond = remaining;
    updateTurnTimerDom(remaining);
  }
};

const handleClick = async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const { action } = target.dataset;

  if (action === "open-auth-panel") {
    state.authPanel = target.dataset.panel;
    if (state.authPanel === "login" || state.authPanel === "signup") {
      state.authMode = state.authPanel;
    }
    clearNotice();
    render();
    return;
  }

  if (action === "close-auth-panel") {
    state.authPanel = null;
    clearNotice();
    render();
    return;
  }

  if (action === "nav-view") {
    setView(target.dataset.view);
    return;
  }

  if (action === "toggle-nav") {
    state.navOpen = !state.navOpen;
    syncBackgroundMusic(true);
    render();
    return;
  }

  if (action === "toggle-audio") {
    state.settings = {
      ...state.settings,
      muted: !state.settings.muted,
    };
    saveSettings(state.settings);
    syncBackgroundMusic(!state.settings.muted);
    render();
    return;
  }

  if (action === "close-nav") {
    state.navOpen = false;
    render();
    return;
  }

  if (action === "logout") {
    if (combatReplayTimer) {
      window.clearTimeout(combatReplayTimer);
      combatReplayTimer = null;
    }
    if (gameOverTimer) {
      window.clearTimeout(gameOverTimer);
      gameOverTimer = null;
    }
    if (roundBannerTimer) {
      window.clearTimeout(roundBannerTimer);
      roundBannerTimer = null;
    }
    logout();
    state.user = null;
    state.room = null;
    state.view = "home";
    state.authPanel = "login";
    state.authMode = "login";
    state.navOpen = false;
    state.selectedDeckId = null;
    state.selectedCardId = null;
    state.pendingExtraPillz = 0;
    state.pendingFury = false;
    state.gameOverReady = false;
    state.lastGameOverKey = null;
    state.gameOverModalKey = null;
    state.gameOverShownKey = null;
    state.roundBanner = null;
    clearNotice();
    render();
    return;
  }

  if (action === "quick-start-bot") {
    handleQuickStartBot();
    return;
  }

  if (action === "find-ranked-match") {
    handleFindRankedMatch();
    return;
  }

  if (action === "rematch-bot") {
    handleQuickStartBot();
    return;
  }

  if (action === "create-room") {
    if (!createFreshRoom()) {
      return;
    }
    state.view = "multiplayer";
    setNotice(`Room ${state.room.code} created. Share it with the second player.`, "success");
    return;
  }

  if (action === "join-room") {
    handleJoinRoom();
    return;
  }

  if (action === "copy-room") {
    if (!state.room) {
      setNotice("No room available to copy.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(state.room.code);
      setNotice(`Room code ${state.room.code} copied.`, "success");
    } catch {
      setNotice("Clipboard access failed.", "warning");
    }
    return;
  }

  if (action === "enter-battle") {
    if (!state.room) {
      setNotice("Create or join a room first.", "warning");
      return;
    }
    setView("battle");
    return;
  }

  if (action === "leave-room") {
    if (combatReplayTimer) {
      window.clearTimeout(combatReplayTimer);
      combatReplayTimer = null;
    }
    if (gameOverTimer) {
      window.clearTimeout(gameOverTimer);
      gameOverTimer = null;
    }
    if (roundBannerTimer) {
      window.clearTimeout(roundBannerTimer);
      roundBannerTimer = null;
    }
    if (state.room?.code && state.room.players.A?.id === state.user?.id) {
      deleteRoom(state.room.code);
    }
    state.room = null;
    state.selectedCardId = null;
    state.pendingExtraPillz = 0;
    state.pendingFury = false;
    state.gameOverReady = false;
    state.lastGameOverKey = null;
    state.gameOverModalKey = null;
    state.gameOverShownKey = null;
    state.roundBanner = null;
    state.view = "multiplayer";
    state.navOpen = false;
    setNotice("Local room cleared.", "success");
    return;
  }

  if (action === "select-collection-card") {
    state.selectedCollectionCard = target.dataset.cardId;
    render();
    return;
  }

  if (action === "filter-collection-clan") {
    state.selectedCollectionClan = target.dataset.clan ?? "all";
    state.selectedCollectionCard = getVisibleCollectionCards()[0]?.id ?? CARD_LIBRARY[0]?.id ?? null;
    render();
    return;
  }

  if (action === "select-deck") {
    state.selectedDeckId = target.dataset.deckId ?? null;
    render();
    return;
  }

  if (action === "create-deck") {
    const decks = getUserDecks();
    updateCurrentUser((user) => ({
      ...user,
      profile: {
        ...user.profile,
        decks: [
          ...decks,
          {
            id: `deck-${Math.random().toString(36).slice(2, 8)}`,
            name: `Loadout ${String(decks.length + 1).padStart(2, "0")}`,
            cardIds: [],
            favoriteCardIds: [],
          },
        ],
      },
    }));
    const updatedDecks = state.user?.profile?.decks ?? [];
    state.selectedDeckId = updatedDecks[updatedDecks.length - 1]?.id ?? state.selectedDeckId;
    render();
    return;
  }

  if (action === "set-active-deck") {
    const deckId = target.dataset.deckId;
    updateCurrentUser((user) => ({
      ...user,
      profile: {
        ...user.profile,
        activeDeckId: deckId,
      },
    }));
    state.selectedDeckId = deckId ?? state.selectedDeckId;
    render();
    return;
  }

  if (action === "delete-deck") {
    const deckId = target.dataset.deckId;
    const remainingDecks = getUserDecks().filter((deck) => deck.id !== deckId);
    if (!remainingDecks.length) {
      return;
    }
    updateCurrentUser((user) => ({
      ...user,
      profile: {
        ...user.profile,
        decks: remainingDecks,
        activeDeckId: user.profile.activeDeckId === deckId ? remainingDecks[0].id : user.profile.activeDeckId,
      },
    }));
    state.selectedDeckId = remainingDecks[0].id;
    render();
    return;
  }

  if (action === "deck-add-card") {
    const deckId = target.dataset.deckId;
    const cardId = target.dataset.cardId;
    const selectedDeck = getDeckById(deckId);
    if (!selectedDeck || !cardId) {
      return;
    }
    const owned = getOwnedCardCount(cardId);
    const used = getDeckCardCount(selectedDeck, cardId);
    if (selectedDeck.cardIds.length >= MATCH_CONSTANTS.deckSize || used >= owned) {
      return;
    }
    updateCurrentUser((user) => ({
      ...user,
      profile: {
        ...user.profile,
        decks: user.profile.decks.map((deck) =>
          deck.id === deckId ? { ...deck, cardIds: [...deck.cardIds, cardId] } : deck
        ),
      },
    }));
    render();
    return;
  }

  if (action === "deck-toggle-favorite") {
    const deckId = target.dataset.deckId;
    const cardId = target.dataset.cardId;
    if (!deckId || !cardId) {
      return;
    }
    updateCurrentUser((user) => ({
      ...user,
      profile: {
        ...user.profile,
        decks: user.profile.decks.map((deck) => {
          if (deck.id !== deckId) {
            return deck;
          }
          const favorites = Array.isArray(deck.favoriteCardIds) ? deck.favoriteCardIds : [];
          const hasFavorite = favorites.includes(cardId);
          return {
            ...deck,
            favoriteCardIds: hasFavorite ? favorites.filter((id) => id !== cardId) : [...favorites, cardId],
          };
        }),
      },
    }));
    render();
    return;
  }

  if (action === "deck-remove-card") {
    const deckId = target.dataset.deckId;
    const cardIndex = Number(target.dataset.cardIndex);
    updateCurrentUser((user) => ({
      ...user,
      profile: {
        ...user.profile,
        decks: user.profile.decks.map((deck) => {
          if (deck.id !== deckId) {
            return deck;
          }
          const removedCardId = deck.cardIds[cardIndex];
          const nextCardIds = deck.cardIds.filter((_, index) => index !== cardIndex);
          const stillInDeck = nextCardIds.includes(removedCardId);
          return {
            ...deck,
            cardIds: nextCardIds,
            favoriteCardIds: stillInDeck
              ? deck.favoriteCardIds
              : (deck.favoriteCardIds ?? []).filter((cardId) => cardId !== removedCardId),
          };
        }),
      },
    }));
    render();
    return;
  }

  if (action === "select-hand-card") {
    state.selectedCardId = target.dataset.cardId;
    state.pendingExtraPillz = 0;
    state.pendingFury = false;
    render();
    return;
  }

  if (action === "toggle-fury") {
    if (!state.room) {
      return;
    }
    const available = state.room.game.pillz[getMySlot()];
    if (!state.pendingFury && available < MATCH_CONSTANTS.furyCost) {
      setNotice("Not enough Pills for Fury.", "warning");
      return;
    }
    state.pendingFury = !state.pendingFury;
    clampBattleInputs();
    render();
    return;
  }

  if (action === "adjust-pillz") {
    if (!state.room || !getSelectedHandCard()) {
      return;
    }
    const delta = Number(target.dataset.delta ?? 0);
    const available = state.room.game.pillz[getMySlot()];
    const reserved = state.pendingFury ? MATCH_CONSTANTS.furyCost : 0;
    const maxExtra = Math.max(0, available - reserved);
    state.pendingExtraPillz = Math.max(0, Math.min(maxExtra, state.pendingExtraPillz + delta));
    render();
    return;
  }

  if (action === "submit-play") {
    handleSubmitPlay();
    return;
  }
};

document.addEventListener("submit", handleAuthSubmit);
document.addEventListener("click", handleClick);
document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
    return;
  }

  if (target.id === "roomCodeInput") {
    state.roomCodeInput = target.value;
    return;
  }

  if (target.id === "pillzRange") {
    state.pendingExtraPillz = Number(target.value);
    render();
    return;
  }

  const settingKey = target.dataset.setting;
  if (!settingKey) {
    return;
  }

  let nextValue;
  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    nextValue = target.checked;
  } else if (target instanceof HTMLInputElement && target.type === "range") {
    nextValue = Number(target.value);
  } else {
    nextValue = target.value;
  }

  state.settings = {
    ...state.settings,
    [settingKey]: nextValue,
  };
  saveSettings(state.settings);
  syncBackgroundMusic(settingKey === "muted" ? !state.settings.muted : false);
  render();
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.id !== "profileAvatarInput" || !target.files?.[0]) {
    return;
  }

  const file = target.files[0];
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    setNotice("Unsupported image format. Use PNG, JPG or WEBP.", "warning");
    return;
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Avatar load failed."));
    reader.readAsDataURL(file);
  }).catch(() => null);

  if (!dataUrl || typeof dataUrl !== "string") {
    setNotice("Avatar load failed.", "warning");
    return;
  }

  updateCurrentUser((user) => ({
    ...user,
    profile: {
      ...user.profile,
      avatar: dataUrl,
    },
  }));
  setNotice("Avatar updated.", "success");
  render();
});

onStorageChange(refreshRoomFromStorage);
syncChannel?.addEventListener("message", (event) => {
  if (event.data?.type === "room-update") {
    refreshRoomFromStorage(event.data.code);
  }
  if (event.data?.type === "room-delete") {
    refreshRoomFromStorage(event.data.code, null);
  }
});

turnTimerInterval = window.setInterval(tickTurnTimer, 1000);

render();
