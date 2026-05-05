import { CLAN_DATABASE, MATCH_CONSTANTS, STARTER_DECK_IDS, getCardById } from "./data.js";

const BOT_USER = {
  id: "ascendants-bot",
  name: "Ascendants Bot",
  email: "bot@ascendants.local",
};

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const shuffle = (items) => {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
};

const createCardInstance = (id) => {
  const template = getCardById(id);
  return {
    ...clone(template),
    instanceId: uid(id),
  };
};

const createDeck = (deckIds = STARTER_DECK_IDS) => shuffle(deckIds.map(createCardInstance));

const totalStars = (cards) => cards.reduce((sum, card) => sum + card.stars, 0);

const createRivalState = (label, user, accent, deckIds = STARTER_DECK_IDS) => {
  const deck = createDeck(deckIds);
  const hand = deck.slice(0, MATCH_CONSTANTS.handSize);
  return {
    label,
    userId: user?.id ?? `${label}-guest`,
    name: user?.name ?? (label === "A" ? "Player A" : "Signal Ghost"),
    email: user?.email ?? `${label.toLowerCase()}@ascendants.local`,
    accent,
    hand,
    openingHand: hand.map((card) => ({ id: card.id, clan: card.clan })),
    played: [],
    archive: [],
    reserve: deck.slice(MATCH_CONSTANTS.handSize),
  };
};

const determineLeadPlayer = (coaches) =>
  totalStars(coaches.A.hand) <= totalStars(coaches.B.hand) ? "A" : "B";

const nextRoundStarter = (leadPlayer, round) =>
  round % 2 === 1 ? leadPlayer : leadPlayer === "A" ? "B" : "A";

const armTurnTimer = (game) => ({
  ...game,
  turnStartedAt: new Date().toISOString(),
  turnDurationSeconds: MATCH_CONSTANTS.turnSeconds,
});

export const createGameState = (
  ownerUser,
  mode = "multiplayer",
  ownerDeckIds = STARTER_DECK_IDS,
  rivalDeckIds = STARTER_DECK_IDS
) => {
  const coaches = {
    A: createRivalState("A", ownerUser, "violet", ownerDeckIds),
    B: createRivalState("B", BOT_USER, "neon", rivalDeckIds),
  };
  const leadPlayer = determineLeadPlayer(coaches);
  return {
    mode,
    matchState: "waiting",
    round: 1,
    phase: mode === "ranked" ? "Ranked queue open" : "Awaiting second player",
    leadPlayer,
    currentCoach: nextRoundStarter(leadPlayer, 1),
    life: { A: MATCH_CONSTANTS.startingLife, B: MATCH_CONSTANTS.startingLife },
    pillz: { A: MATCH_CONSTANTS.startingPillz, B: MATCH_CONSTANTS.startingPillz },
    submissions: { A: null, B: null },
    lastRound: null,
    turnStartedAt: null,
    turnDurationSeconds: MATCH_CONSTANTS.turnSeconds,
    log: [
      {
        id: uid("log"),
        title: "Duel shell initialized",
        text: "Eight-card deck loaded, four-card draw armed, eight rounds, eighteen Pills, twenty-one Life.",
      },
    ],
    coaches,
  };
};

export const createRoomState = (user, mode = "multiplayer", deckIds = STARTER_DECK_IDS) => ({
  code: Math.random().toString(36).slice(2, 8).toUpperCase(),
  createdAt: new Date().toISOString(),
  players: {
    A: { id: user.id, name: user.name, email: user.email },
    B: null,
  },
  game: createGameState(user, mode, deckIds),
});

export const joinRoomState = (room, user, deckIds = STARTER_DECK_IDS) => {
  const nextRoom = clone(room);
  nextRoom.players.B = { id: user.id, name: user.name, email: user.email };
  nextRoom.game.mode = nextRoom.game.mode === "ranked" ? "ranked" : "multiplayer";
  nextRoom.game.coaches.B = createRivalState("B", user, "neon", deckIds);
  nextRoom.game.matchState = "live";
  nextRoom.game.phase = `Round ${nextRoom.game.round}`;
  nextRoom.game = armTurnTimer(nextRoom.game);
  nextRoom.game.log.unshift({
    id: uid("log"),
    title: "Link established",
    text: `${user.name} joined slot B. Both rivals can now submit round plays.`,
  });
  return nextRoom;
};

export const startPracticeState = (room) => {
  const nextRoom = clone(room);
  nextRoom.players.B = { ...BOT_USER };
  nextRoom.game.mode = "bot";
  nextRoom.game.matchState = "live";
  nextRoom.game.phase = `Round ${nextRoom.game.round}`;
  nextRoom.game = armTurnTimer(nextRoom.game);
  nextRoom.game.log.unshift({
    id: uid("log"),
    title: "Bot practice armed",
    text: "Ghost Kernel is running prediction routines and is ready to duel.",
  });
  return nextRoom;
};

export const getCoach = (game, slot) => game.coaches[slot];
export const getOpponentSlot = (slot) => (slot === "A" ? "B" : "A");

const getCardFromHand = (coach, instanceId) =>
  coach.hand.find((card) => card.instanceId === instanceId) ?? null;

export const isBonusActive = (game, slot, card) =>
  game.coaches[slot].openingHand.filter((entry) => entry.clan === card.clan).length >= 2;

export const getCardStatus = (game, slot, instanceId) => {
  const coach = game.coaches[slot];
  const card =
    coach.hand.find((entry) => entry.instanceId === instanceId) ??
    coach.played.find((entry) => entry.instanceId === instanceId) ??
    null;

  if (!card) {
    return null;
  }

  return {
    card,
    bonusActive: isBonusActive(game, slot, card),
    bonusLabel: CLAN_DATABASE[card.clan].bonusLabel,
  };
};

const applyEffect = (bucket, effect) => {
  if (!effect) {
    return;
  }
  switch (effect.kind) {
    case "attackPlus":
      bucket.attackPlus += effect.amount;
      break;
    case "powerPlus":
      bucket.powerPlus += effect.amount;
      break;
    case "damagePlus":
      bucket.damagePlus += effect.amount;
      break;
    case "pillzPlusWin":
      bucket.pillzPlusWin += effect.amount;
      break;
    case "oppAttackMinus":
      bucket.oppAttackMinus = effect;
      break;
    case "oppPowerMinus":
      bucket.oppPowerMinus = effect;
      break;
    case "opponentPillzMinusOnLose":
      bucket.opponentPillzMinusOnLose = effect.amount;
      break;
    default:
      break;
  }
};

const reduceWithMin = (value, effect) => Math.max(value - effect.amount, effect.min);

const buildCombatState = (game, slot, submission) => {
  const card = getCardFromHand(game.coaches[slot], submission.cardId);
  const bucket = {
    slot,
    card,
    totalPillz: submission.extraPillz + 1 + (submission.fury ? MATCH_CONSTANTS.furyCost : 0),
    fury: submission.fury,
    powerPlus: 0,
    attackPlus: 0,
    damagePlus: 0,
    pillzPlusWin: 0,
    opponentPillzMinusOnLose: 0,
    oppAttackMinus: null,
    oppPowerMinus: null,
  };

  applyEffect(bucket, card.ability?.effect);
  if (isBonusActive(game, slot, card)) {
    applyEffect(bucket, CLAN_DATABASE[card.clan].bonusEffect);
  }
  return bucket;
};

const finalizeGame = (game, winner, fallbackWinner) => {
  const next = clone(game);
  next.matchState = "finished";
  next.phase = "Finished";
  const resolvedWinner =
    next.life.A === next.life.B ? fallbackWinner : next.life.A > next.life.B ? "A" : "B";
  if (!resolvedWinner) {
    next.log.unshift({
      id: uid("log"),
      title: "Duel finished",
      text: `The match ends in a draw with both players at ${next.life.A} Life.`,
    });
    return next;
  }
  next.log.unshift({
    id: uid("log"),
    title: "Duel finished",
    text: `${next.coaches[resolvedWinner].name} wins the match with ${next.life[resolvedWinner]} Life left.`,
  });
  return next;
};

const recycleLineupsIfNeeded = (game) => {
  const next = clone(game);
  if (next.round <= MATCH_CONSTANTS.recycleAfterRound) {
    return next;
  }

  const everyoneSpent = ["A", "B"].every(
    (slot) => next.coaches[slot].hand.length === 0 && next.coaches[slot].played.length >= MATCH_CONSTANTS.handSize
  );

  if (!everyoneSpent) {
    return next;
  }

  ["A", "B"].forEach((slot) => {
    next.coaches[slot].hand = shuffle(next.coaches[slot].played);
    next.coaches[slot].played = [];
  });

  next.log.unshift({
    id: uid("log"),
    title: "Lineups recycled",
    text: "Both players exhausted the first rotation. Cards are back online for the second cycle.",
  });

  return next;
};

const resolveRound = (game) => {
  const next = clone(game);
  const playA = next.submissions.A;
  const playB = next.submissions.B;
  const a = buildCombatState(next, "A", playA);
  const b = buildCombatState(next, "B", playB);

  let powerA = a.card.power + a.powerPlus;
  let powerB = b.card.power + b.powerPlus;

  if (a.oppPowerMinus) {
    powerB = reduceWithMin(powerB, a.oppPowerMinus);
  }
  if (b.oppPowerMinus) {
    powerA = reduceWithMin(powerA, b.oppPowerMinus);
  }

  let attackA = powerA * a.totalPillz + a.attackPlus;
  let attackB = powerB * b.totalPillz + b.attackPlus;

  if (a.oppAttackMinus) {
    attackB = reduceWithMin(attackB, a.oppAttackMinus);
  }
  if (b.oppAttackMinus) {
    attackA = reduceWithMin(attackA, b.oppAttackMinus);
  }

  const damageA = a.card.damage + a.damagePlus + (a.fury ? MATCH_CONSTANTS.furyDamage : 0);
  const damageB = b.card.damage + b.damagePlus + (b.fury ? MATCH_CONSTANTS.furyDamage : 0);

  let winner = null;
  if (attackA > attackB) {
    winner = "A";
  } else if (attackB > attackA) {
    winner = "B";
  }

  const isDraw = !winner;
  const loser = winner ? getOpponentSlot(winner) : null;
  const winnerCombat = winner === "A" ? a : winner === "B" ? b : null;
  const loserCombat = winner === "A" ? b : winner === "B" ? a : null;
  const damage = winner === "A" ? damageA : winner === "B" ? damageB : 1;

  if (isDraw) {
    next.life.A = Math.max(0, next.life.A - 1);
    next.life.B = Math.max(0, next.life.B - 1);
  } else {
    next.life[loser] = Math.max(0, next.life[loser] - damage);
    if (winnerCombat.pillzPlusWin) {
      next.pillz[winner] += winnerCombat.pillzPlusWin;
    }
    if (loserCombat.opponentPillzMinusOnLose) {
      next.pillz[winner] = Math.max(0, next.pillz[winner] - loserCombat.opponentPillzMinusOnLose);
    }
  }

  next.lastRound = {
    id: uid("round"),
    winner,
    attackA,
    attackB,
    damage,
    cardA: a.card,
    cardB: b.card,
    furyA: a.fury,
    furyB: b.fury,
    starter: next.currentCoach,
    summary: isDraw
      ? `${a.card.name} and ${b.card.name} tied at ${attackA} attack. Both players lost 1 Life.`
      : `${winnerCombat.card.name} beat ${loserCombat.card.name} with ${winner === "A" ? attackA : attackB} attack.`,
  };

  next.coaches.A.played.push(a.card);
  next.coaches.B.played.push(b.card);
  next.coaches.A.archive.push(a.card);
  next.coaches.B.archive.push(b.card);
  next.coaches.A.hand = next.coaches.A.hand.filter((card) => card.instanceId !== a.card.instanceId);
  next.coaches.B.hand = next.coaches.B.hand.filter((card) => card.instanceId !== b.card.instanceId);
  next.submissions = { A: null, B: null };

  next.log.unshift({
    id: uid("log"),
    title: isDraw ? `Round ${next.round} ended in a draw` : `${winnerCombat.card.name} won Round ${next.round}`,
    text: isDraw
      ? `${a.card.name} and ${b.card.name} both reached ${attackA} attack. No star tiebreaker applies; both players lose 1 Life.`
      : `${a.card.name} reached ${attackA} attack versus ${b.card.name} at ${attackB}. ${next.coaches[winner].name} deals ${damage} damage.`,
  });

  if (next.life.A <= 0 || next.life.B <= 0 || next.round >= MATCH_CONSTANTS.rounds) {
    return finalizeGame(next, winner, winner);
  }

  next.round += 1;
  next.phase = `Round ${next.round}`;
  next.currentCoach = nextRoundStarter(next.leadPlayer, next.round);
  const recycled = recycleLineupsIfNeeded(next);
  return {
    ...recycled,
    turnStartedAt: null,
    turnDurationSeconds: MATCH_CONSTANTS.turnSeconds,
  };
};

const pickBotCard = (game) => {
  const hand = game.coaches.B.hand;
  const sorted = [...hand].sort((left, right) => {
    const leftScore = left.damage * 3 + left.power + left.stars * 0.4;
    const rightScore = right.damage * 3 + right.power + right.stars * 0.4;
    return rightScore - leftScore;
  });
  if (game.round >= MATCH_CONSTANTS.recycleAfterRound) {
    return sorted[0];
  }
  return sorted[Math.floor(Math.random() * Math.min(2, sorted.length))];
};

const pickBotSpend = (game, card) => {
  const available = game.pillz.B;
  const desperation = game.life.B <= game.life.A ? 1 : 0;
  const roundsLeft = Math.max(1, MATCH_CONSTANTS.rounds + 1 - game.round);
  const base = Math.max(0, Math.min(available, Math.floor((available + desperation) / roundsLeft) + desperation));
  const fury =
    available >= MATCH_CONSTANTS.furyCost + 1 &&
    (card.damage >= 5 || game.life.A <= card.damage + MATCH_CONSTANTS.furyDamage);
  const reservedForFury = fury ? MATCH_CONSTANTS.furyCost : 0;
  return {
    extraPillz: Math.max(0, Math.min(available - reservedForFury, base)),
    fury,
  };
};

const autoSubmitBot = (game) => {
  const next = clone(game);
  if (next.mode !== "bot" || next.coaches.B.userId !== BOT_USER.id || next.submissions.B) {
    return next;
  }

  const card = pickBotCard(next);
  if (!card) {
    return next;
  }

  const spend = pickBotSpend(next, card);
  const totalSpend = spend.extraPillz + (spend.fury ? MATCH_CONSTANTS.furyCost : 0);
  next.pillz.B -= totalSpend;
  next.submissions.B = {
    cardId: card.instanceId,
    extraPillz: spend.extraPillz,
    fury: spend.fury,
  };
  next.log.unshift({
    id: uid("log"),
    title: "Ghost Kernel locked in",
    text: `${card.name} committed with ${spend.extraPillz + 1 + (spend.fury ? MATCH_CONSTANTS.furyCost : 0)} Pills total${spend.fury ? " and Fury." : "."}`,
  });
  return next;
};

export const submitPlay = (game, slot, cardId, extraPillz, fury = false) => {
  const next = clone(game);

  if (next.matchState !== "live") {
    return { game: next, message: "Create a bot duel or wait for a second player before submitting plays." };
  }
  if (next.submissions[slot]) {
    return { game: next, message: "You already locked a play for this round." };
  }

  const coach = next.coaches[slot];
  const card = getCardFromHand(coach, cardId);
  if (!card) {
    return { game: next, message: "That card is no longer in your hand." };
  }

  const extra = Number(extraPillz);
  const furyEnabled = Boolean(fury);
  const furyCost = furyEnabled ? MATCH_CONSTANTS.furyCost : 0;
  const spend = extra + furyCost;

  if (!Number.isFinite(extra) || extra < 0) {
    return { game: next, message: "Invalid Pills value." };
  }
  if (spend > next.pillz[slot]) {
    return { game: next, message: "Not enough Pills for that commit." };
  }

  next.pillz[slot] -= spend;
  next.submissions[slot] = { cardId, extraPillz: extra, fury: furyEnabled };
  next.log.unshift({
    id: uid("log"),
    title: `${coach.name} locked in`,
    text: `${card.name} committed with ${extra + 1 + furyCost} Pills total${furyEnabled ? " and Fury." : "."}`,
  });

  const withBot = autoSubmitBot(next);
  if (withBot.submissions.A && withBot.submissions.B) {
    return { game: resolveRound(withBot), message: "Round resolved." };
  }
  return { game: withBot, message: "Play locked. Waiting for the other rival." };
};
