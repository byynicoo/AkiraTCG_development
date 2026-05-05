import { STARTER_DECK_IDS } from "./data.js";

const USERS_KEY = "ascendants-tcg-users-v1";
const SESSION_KEY = "ascendants-tcg-session-v1";
const ROOM_KEY_PREFIX = "ascendants-tcg-room-";
const CHANNEL_NAME = "ascendants-tcg-channel";

export const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

const loadJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const saveJson = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

const buildStarterOwnedCards = () =>
  STARTER_DECK_IDS.reduce((bucket, cardId) => {
    bucket[cardId] = (bucket[cardId] ?? 0) + 1;
    return bucket;
  }, {});

const buildStarterDeck = () => ({
  id: "deck-01",
  name: "Loadout 01",
  cardIds: [...STARTER_DECK_IDS],
  favoriteCardIds: [],
});

const normalizeDeck = (deck, index) => ({
  id: deck?.id ?? `deck-${String(index + 1).padStart(2, "0")}`,
  name: deck?.name?.trim?.() || `Loadout ${String(index + 1).padStart(2, "0")}`,
  cardIds: Array.isArray(deck?.cardIds) ? deck.cardIds.filter(Boolean) : [...STARTER_DECK_IDS],
  favoriteCardIds: Array.isArray(deck?.favoriteCardIds) ? deck.favoriteCardIds.filter(Boolean) : [],
});

const normalizeUser = (user) => {
  const decks =
    Array.isArray(user?.profile?.decks) && user.profile.decks.length
      ? user.profile.decks.map(normalizeDeck)
      : [buildStarterDeck()];
  const activeDeckId = decks.some((deck) => deck.id === user?.profile?.activeDeckId)
    ? user.profile.activeDeckId
    : decks[0].id;

  return {
    ...user,
    profile: {
      ...(user?.profile ?? {}),
      bio: user?.profile?.bio ?? "",
      avatar: user?.profile?.avatar ?? null,
      eddies: user?.profile?.eddies ?? 100,
      ranked: {
        mmr: 0,
        wins: 0,
        losses: 0,
        played: 0,
        ...(user?.profile?.ranked ?? {}),
      },
      collection: {
        crazyartOwned: [],
        ownedCards: buildStarterOwnedCards(),
        ...(user?.profile?.collection ?? {}),
      },
      decks,
      activeDeckId,
    },
    history: Array.isArray(user?.history) ? user.history : [],
  };
};

export const listUsers = () => loadJson(USERS_KEY, []).map(normalizeUser);

export const signup = ({ name, email, password }) => {
  const users = listUsers();
  const existing = users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    throw new Error("An account with this email already exists.");
  }
  const user = {
    id: `pilot-${Math.random().toString(36).slice(2, 9)}`,
    name,
    email,
    password,
    createdAt: new Date().toISOString(),
    profile: {
      bio: "",
      avatar: null,
      eddies: 100,
      collection: {
        crazyartOwned: [],
        ownedCards: buildStarterOwnedCards(),
      },
      decks: [buildStarterDeck()],
      activeDeckId: "deck-01",
    },
    history: [],
  };
  users.push(user);
  saveJson(USERS_KEY, users);
  saveJson(SESSION_KEY, user);
  return normalizeUser(user);
};

export const login = ({ email, password }) => {
  const user = listUsers().find(
    (entry) => entry.email.toLowerCase() === email.toLowerCase() && entry.password === password
  );
  if (!user) {
    throw new Error("Invalid email or password.");
  }
  saveJson(SESSION_KEY, user);
  return normalizeUser(user);
};

export const logout = () => {
  window.localStorage.removeItem(SESSION_KEY);
};

export const getSession = () => {
  const session = loadJson(SESSION_KEY, null);
  return session ? normalizeUser(session) : null;
};

export const updateUser = (userId, updater) => {
  const users = listUsers();
  const index = users.findIndex((user) => user.id === userId);
  if (index === -1) {
    return null;
  }

  const current = users[index];
  const nextValue =
    typeof updater === "function"
      ? normalizeUser(updater(current))
      : normalizeUser({
          ...current,
          ...updater,
        });

  users[index] = nextValue;
  saveJson(USERS_KEY, users);

  const session = getSession();
  if (session?.id === userId) {
    saveJson(SESSION_KEY, nextValue);
  }

  return nextValue;
};

export const saveRoom = (room) => {
  saveJson(`${ROOM_KEY_PREFIX}${room.code}`, room);
  syncChannel?.postMessage({ type: "room-update", code: room.code });
};

export const loadRoom = (code) => loadJson(`${ROOM_KEY_PREFIX}${code.toUpperCase()}`, null);

export const listRooms = () => {
  const rooms = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(ROOM_KEY_PREFIX)) {
      continue;
    }
    const room = loadJson(key, null);
    if (room) {
      rooms.push(room);
    }
  }
  return rooms;
};

export const deleteRoom = (code) => {
  const upperCode = code.toUpperCase();
  window.localStorage.removeItem(`${ROOM_KEY_PREFIX}${upperCode}`);
  syncChannel?.postMessage({ type: "room-delete", code: upperCode });
};

export const onStorageChange = (handler) => {
  const listener = (event) => {
    if (!event.key?.startsWith(ROOM_KEY_PREFIX)) {
      return;
    }
    const code = event.key.replace(ROOM_KEY_PREFIX, "");
    handler(code, event.newValue);
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
};
