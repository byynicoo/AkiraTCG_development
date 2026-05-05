export const APP_TITLE = "Ascendants TCG";
export const APP_SUBTITLE = "xsp-01 // first wave duel shell";
export const VISUAL_ASSETS = {
  bg: "./img/bg.jpg",
  templateCard: "./img/template_card.png",
  iconMenu: "./img/iconmenu.png",
  eddies: "./img/eddies.jpg",
};

export const MATCH_CONSTANTS = {
  startingLife: 21,
  startingPillz: 18,
  handSize: 4,
  deckSize: 8,
  rounds: 8,
  recycleAfterRound: 4,
  turnSeconds: 30,
  furyCost: 3,
  furyDamage: 2,
};

export const HOME_NEWS_ITEMS = [
  {
    title: "XSP-01 // First Expansion is here!",
    body: "The first expansion for Ascendants TCG is about to be released-are you ready to dive into the action?",
    tag: "live feed",
  },
];

export const HOME_CHANGELOG_ITEMS = [
  {
    title: "0.1.1 // Alpha is coming!",
    body: "Players can now create their personal account and start play!",
    tag: "systems",
  },
];

export const RULE_SECTIONS = [
  {
    title: "4-card lineup / 8-round duel",
    summary:
      "Every player enters with an 8-card deck. A random 4-card loadout is drawn for the duel and the match can run up to 8 rounds, ending early if one player reaches 0 Life.",
  },
  {
    title: "21 Life / 18 Pills",
    summary:
      "Each player starts at 21 Life and 18 Pills. Every round uses a mandatory base commit plus any extra Pills you lock in.",
  },
  {
    title: "Attack formula",
    summary:
      "Attack equals Power multiplied by total committed Pills. Fury still adds raw damage after the clash if the card wins.",
  },
  {
    title: "Tied attack",
    summary:
      "If both cards finish with the same attack, there is no star or rarity tiebreaker. The round is a draw and both players lose 1 Life.",
  },
  {
    title: "Round 5 card recycle",
    summary:
      "After the first 4 rounds, if both players have exhausted the full lineup, those same cards rotate back into hand for rounds 5 to 8.",
  },
  {
    title: "Rarity 1 to 5",
    summary:
      "Stars represent rarity tiers from 1 to 5 and are highlighted visually in collection, inspector and battle UI.",
  },
  {
    title: "First expansion",
    summary:
      "The first expansion is XSP-01 with four founding factions: Blaze, Flux, Void Fall and Edgerunners.",
  },
];

export const RULING_TUTORIALS = [
  {
    id: "pillz",
    title: "Commit Pills",
    summary: "Select a card, add extra Pills, then lock the commit before the clash resolves.",
    glyph: "+",
    steps: ["Pick 1 card", "Set extra Pills", "Lock the round"],
  },
  {
    id: "fury",
    title: "Trigger Fury",
    summary: "Fury costs 3 Pills and adds 2 raw damage if the committed card wins the round.",
    glyph: "//",
    steps: ["Reserve 3 Pills", "Enable Fury", "Push lethal damage"],
  },
  {
    id: "draw",
    title: "Tied Clash",
    summary: "When both attacks are equal, the clash has no winner and both players lose 1 Life.",
    glyph: "[]",
    steps: ["Match attack values", "No star tiebreaker", "Both lose 1 Life"],
  },
  {
    id: "recycle",
    title: "Cycle Two",
    summary: "After round 4, if both lineups are empty, all 4 used cards return for rounds 5 to 8.",
    glyph: ">",
    steps: ["Finish first rotation", "Lineup reloads", "Adapt to round 8"],
  },
];

export const CARD_TEMPLATE_FIELDS = [
  "id",
  "name",
  "clan",
  "expansion",
  "code",
  "stars // rarity",
  "power",
  "damage",
  "bonus.text",
  "ability.text",
  "art",
];

const toCardAssetName = (name) =>
  `${name ?? ""}`
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLowerCase();

export const getCardArtPath = (name, extension = "webp") => `./img/${toCardAssetName(name)}.${extension}`;

export const CLAN_DATABASE = {
  maelstrom: {
    id: "maelstrom",
    name: "Blaze",
    colors: ["#ff6a2a", "#ab59ff"],
    fxTheme: "blaze",
    bonusLabel: "If this card wins: DMG +1",
    bonusEffect: { kind: "damagePlus", amount: 1 },
  },
  cyberfunk: {
    id: "cyberfunk",
    name: "Flux",
    colors: ["#ab59ff", "#ffffff"],
    fxTheme: "flux",
    bonusLabel: "Bonus pending",
    bonusEffect: null,
  },
  aksaka: {
    id: "aksaka",
    name: "Void Fall",
    colors: ["#0a0a10", "#ab59ff"],
    fxTheme: "void-fall",
    bonusLabel: "Bonus pending",
    bonusEffect: null,
  },
  trauma_team: {
    id: "trauma_team",
    name: "Edgerunners",
    colors: ["#ffffff", "#ab59ff"],
    fxTheme: "edgerunners",
    bonusLabel: "Bonus pending",
    bonusEffect: null,
  },
};

export const CARD_LIBRARY = [
  {
    id: "jason-tornn",
    code: "XSP-01-001",
    name: "Jason Tornn",
    clan: "maelstrom",
    expansion: "xsp-01",
    stars: 3,
    power: 5,
    damage: 5,
    bonus: {
      text: "If this card wins: DMG +1",
    },
    ability: {
      text: "If this card loses, your opponent loses 1 Pill.",
      effect: { kind: "opponentPillzMinusOnLose", amount: 1 },
    },
    art: "./img/jason_tornn.png",
    crazyartEligible: false,
  },
];

export const STORE_PACKS = [];

export const STARTER_DECK_IDS = Array.from({ length: MATCH_CONSTANTS.deckSize }, () => "jason-tornn");

export const CARD_DATABASE = Object.fromEntries(CARD_LIBRARY.map((card) => [card.id, card]));

export const STARTER_DECK = STARTER_DECK_IDS.map((id, index) => ({
  ...CARD_DATABASE[id],
  starterCopy: index + 1,
}));

export const COLLECTION_GROUPS = Object.values(CLAN_DATABASE).map((clan) => ({
  id: clan.id,
  name: clan.name,
  cards: CARD_LIBRARY.filter((card) => card.clan === clan.id),
}));

export const INITIAL_CLANS = Object.values(CLAN_DATABASE).map((clan) => clan.name);

export const getCardById = (id) => CARD_DATABASE[id] ?? null;
