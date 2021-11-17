import { createLogger } from "./lib/loggerlib.js";
import * as miscutil from "./miscutil.js";
import { addNoneTraits } from "./trait.js";
import { Stats } from 'fast-stats';
import * as timer from "./timer.js";

const log = createLogger();

const TRAIT_COUNT_TYPE = 'xxTraitCountxx';

export function calcRarity(collection, scoreKey) {
  const myTimer = timer.create();
  addNoneTraits(collection);
  myTimer.ping(`addNoneTraits duration`);
  calcGlobalRarity(collection);
  myTimer.ping(`calcGlobalRarity duration`);
  calcTokenRarity(collection, scoreKey);
  myTimer.ping(`calcTokenRarity duration`);
  calcRanks(collection);
  myTimer.ping(`calcRanks duration`);
  calcOutliers(collection);
  myTimer.ping(`calcOutliers duration`);
}

function calcGlobalRarity(collection) {
  calcGlobalTraitsRarity(collection);
  calcGlobalTraitCountsRarity(collection); // Need to be done after calcGlobalTraitsRarity!
}

function calcGlobalTraitsRarity(collection) {
  const numTokens = collection.tokens.length;

  let numTraits = 0;
  let numTraitValues = 0;

  for (let trait of Object.keys(collection.traits.items)) {
    numTraits++;
    let numTraitValuesInTrait = 0;
    for (let traitValue of Object.keys(collection.traits.items[trait].items)) {
      numTraitValues++;
      numTraitValuesInTrait++;
      const freq = collection.traits.items[trait].items[traitValue].count / numTokens;
      collection.traits.items[trait].items[traitValue].freq = freq;
      collection.traits.items[trait].items[traitValue].rarity = 1 / freq;
    }

    collection.traits.items[trait].numTraitValues = numTraitValuesInTrait;
  }

  collection.traits.numTraitValues = numTraitValues;
  collection.traits.numTraits = numTraits;
  collection.traits.numValuesPerTrait = numTraitValues / numTraits;

  for (let trait of Object.keys(collection.traits.items)) {
    for (let traitValue of Object.keys(collection.traits.items[trait].items)) {
      const normFactor = (collection.traits.numValuesPerTrait / collection.traits.items[trait].numTraitValues);
      collection.traits.items[trait].items[traitValue].rarityNorm = collection.traits.items[trait].items[traitValue].rarity * normFactor;
    }
  }
}

function calcGlobalTraitCountsRarity(collection) {
  const numTokens = collection.tokens.length;
  const normFactor = (collection.traits.numValuesPerTrait / Object.keys(collection.traitCounts.items).length);

  for (let trait of Object.keys(collection.traitCounts.items)) {
    const freq = collection.traitCounts.items[trait].count / numTokens;
    const rarity = 1 / freq;
    collection.traitCounts.items[trait].freq = freq;
    collection.traitCounts.items[trait].rarity = rarity;
    collection.traitCounts.items[trait].rarityNorm = rarity * normFactor;
  }

  const counts = Object.values(collection.traitCounts.items).map(obj => obj.idSortKey);

  collection.traitCounts.minTraits = Math.min(...counts);
  collection.traitCounts.maxTraits = Math.max(...counts);
}

export function calcTokenRarity(collection, scoreKey) {
  const numTokens = collection.tokens.length;

  for (let token of collection.tokens) {
    let sumRarity = 0;
    let sumRarityNorm = 0;

    for (let trait of token.traits) {
      const traitType = trait.trait_type;
      const traitValue = trait.value;

      trait.numWithTrait = collection.traits.items[traitType].items[traitValue].count;
      trait.freq = collection.traits.items[traitType].items[traitValue].freq;
      trait.rarity = collection.traits.items[traitType].items[traitValue].rarity;
      trait.rarityNorm = collection.traits.items[traitType].items[traitValue].rarityNorm;

      sumRarity = sumRarity + trait.rarity;
      sumRarityNorm = sumRarityNorm + trait.rarityNorm;
    }

    token.numWithTraitCount = collection.traitCounts.items[token.traitCount].count;
    token.traitCountFreq = token.numWithTraitCount / numTokens;

    token.rarity = sumRarity;
    token.rarityCount = sumRarity + collection.traitCounts.items[token.traitCount].rarity;
    token.rarityNorm = sumRarityNorm;
    token.rarityCountNorm = sumRarityNorm + collection.traitCounts.items[token.traitCount].rarityNorm;

    token.score = token[`${scoreKey}`] ?? null;

    token.hasRarity = token.rarity > 0;
  }
}

export function calcRanks(collection) {
  calcRank(collection.tokens, 'score', false);
  calcRank(collection.tokens, 'rarity', false);
  calcRank(collection.tokens, 'rarityNorm', false);
  calcRank(collection.tokens, 'rarityCount', false);
  calcRank(collection.tokens, 'rarityCountNorm', false);
}

function calcRank(tokens, scoreKey, ascending) {
  const numTokens = tokens.length;
  miscutil.sort(tokens, scoreKey, ascending);
  const rankKey = `${scoreKey}Rank`;
  let rank = 1;
  let lastRank = 1;
  let lastScore = 0;
  for (let i = 0; i < numTokens; i++) {
    const item = tokens[i];
    const thisScore = item[scoreKey];
    let thisRank = rank;
    if (thisScore === lastScore) {
      thisRank = lastRank;
    }
    lastScore = thisScore;
    lastRank = thisRank;
    item[rankKey] = thisRank;
    item[`${rankKey}Pct`] = thisRank / numTokens;
    rank++;
  }
}

function calcOutliers(collection) {
  calcOutlier(collection, 'score');
  calcOutlier(collection, 'rarityCountNorm');
  calcOutlier(collection, 'rarityCount');
  calcOutlier(collection, 'rarityNorm');
  calcOutlier(collection, 'rarity');
}

function calcOutlier(collection, scoreKey) {
  const scores = collection.tokens.map(token => token[scoreKey]).filter(score => typeof score === 'number');
  miscutil.sort(scores, scoreKey, true);

  const stats = new Stats();
  stats.push(scores);

  const q3 = stats.percentile(75);
  const q1 = stats.percentile(25);
  const iqr = q3 - q1;

  const calcOV = val => (val - q3) / iqr;

  collection.tokens.forEach(token => {
    token[`${scoreKey}OV`] = calcOV(token[scoreKey]);
  });
}
