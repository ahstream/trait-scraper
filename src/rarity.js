import { createLogger } from "./lib/loggerlib.js";
import {
  countDone,
} from "./count.js";
import * as miscutil from "./miscutil.js";
import { debugToFile } from "./config.js";
import { Stats } from 'fast-stats';

const log = createLogger();

const TRAIT_NONE_VALUE = 'xxNonexx';
const TRAIT_COUNT_TYPE = 'xxTraitCountxx';

export function calcRarity(config) {
  addTokenNoneTrait(config.data.collection);
  calcGlobalRarity(config.data.collection);
  calcTokenRarity(config.data.collection, config);
  calcRanks(config.data.collection);
  calcOutliers(config);
}

function calcOutliers(config) {
  calcOutlier(config, 'score');
  calcOutlier(config, 'rarityCountNorm');
  calcOutlier(config, 'rarityCount');
  calcOutlier(config, 'rarityNorm');
  calcOutlier(config, 'rarity');
}

function calcOutlier(config, scoreKey) {
  const scores = config.data.collection.tokens.map(token => token[scoreKey]).filter(score => typeof score === 'number');
  miscutil.sortBy1Key(scores, scoreKey, true);

  const stats = new Stats();
  stats.push(scores);

  const q3 = stats.percentile(75);
  const q1 = stats.percentile(25);
  const iqr = q3 - q1;

  const calcOV = val => (val - q3) / iqr;

  config.data.collection.tokens.forEach(token => {
    token[`${scoreKey}OV`] = calcOV(token[scoreKey]);
  });

}

export function calcGlobalRarity(collection) {
  calcGlobalTraitsRarity(collection);
  calcGlobalTraitCountsRarity(collection); // Need to be done after calcGlobalTraitsRarity!
}

function calcGlobalTraitsRarity(collection) {
  const numTokens = countDone(collection.tokens);
  let numTraitTypes = 0;
  let numTraitValuesInTotal = 0;

  for (let traitType of Object.keys(collection.traits.data)) {
    numTraitTypes++;
    if (typeof collection.traits.data[traitType] !== 'object') {
      continue;
    }
    let numTraitValuesInTraitType = 0;
    for (let traitValue of Object.keys(collection.traits.data[traitType].data)) {
      numTraitValuesInTotal++;
      numTraitValuesInTraitType++;
      const freq = collection.traits.data[traitType].data[traitValue].count / numTokens;
      collection.traits.data[traitType].data[traitValue].freq = freq;
      collection.traits.data[traitType].data[traitValue].rarity = 1 / freq;
    }

    collection.traits.data[traitType].numTraitValues = numTraitValuesInTraitType;
  }

  collection.traits.numTraitValues = numTraitValuesInTotal;
  collection.traits.numTraitTypes = numTraitTypes;
  collection.traits.avgNumTraitValuesPerTraitType = numTraitValuesInTotal / numTraitTypes;

  for (let traitType of Object.keys(collection.traits.data)) {
    if (typeof collection.traits.data[traitType] !== 'object') {
      continue;
    }
    for (let traitValue of Object.keys(collection.traits.data[traitType].data)) {
      const normFactor = (collection.traits.avgNumTraitValuesPerTraitType / collection.traits.data[traitType].numTraitValues);
      collection.traits.data[traitType].data[traitValue].rarityNorm = collection.traits.data[traitType].data[traitValue].rarity * normFactor;
    }
  }
}

function calcGlobalTraitCountsRarity(collection) {
  const numTokens = countDone(collection.tokens);

  const normFactor = (collection.traits.avgNumTraitValuesPerTraitType / Object.keys(collection.traitCounts.data).length);

  for (let trait of Object.keys(collection.traitCounts.data)) {
    const freq = collection.traitCounts.data[trait].count / numTokens;
    const rarity = 1 / freq;
    collection.traitCounts.data[trait].freq = freq;
    collection.traitCounts.data[trait].rarity = rarity;
    collection.traitCounts.data[trait].rarityNorm = rarity * normFactor;
  }
}

export function calcTokenRarity(collection, config) {
  let numTokens = 0;
  const numDone = countDone(collection.tokens);
  const counts = Object.values(collection.traitCounts.data).map(obj => obj.numValue);
  const minTraits = Math.min(...counts);
  const maxTraits = Math.max(...counts);
  for (const token of collection.tokens) {
    if (!token.done) {
      continue;
    }

    numTokens++;
    let sumRarity = 0;
    let sumRarityCount = 0;
    let sumRarityNorm = 0;
    let sumRarityCountNorm = 0;

    let traitCount = 0;

    for (const trait of token.traits) {
      const traitType = trait.trait_type;
      const traitValue = trait.value;

      if (traitType !== TRAIT_COUNT_TYPE && traitValue !== TRAIT_NONE_VALUE) {
        traitCount++;
      }

      trait.numWithThisTrait = collection.traits.data[traitType].data[traitValue].count;
      trait.freq = collection.traits.data[traitType].data[traitValue].freq;
      trait.rarity = collection.traits.data[traitType].data[traitValue].rarity;
      trait.rarityNorm = collection.traits.data[traitType].data[traitValue].rarityNorm;

      if (traitType === TRAIT_COUNT_TYPE) {
        sumRarityCount = sumRarityCount + trait.rarity;
        sumRarityCountNorm = sumRarityCountNorm + trait.rarityNorm;
      } else {
        sumRarity = sumRarity + trait.rarity;
        sumRarityNorm = sumRarityNorm + trait.rarityNorm;
        sumRarityCount = sumRarityCount + trait.rarity;
        sumRarityCountNorm = sumRarityCountNorm + trait.rarityNorm;
      }
    }

    token.traitCount = traitCount;
    token.numWithTraitCount = collection.traitCounts.data[traitCount.toString()].count;
    token.traitCountFreq = token.numWithTraitCount / numDone;
    token.minTraits = minTraits;
    token.maxTraits = maxTraits;

    token.rarity = sumRarity;
    token.rarityNorm = sumRarityNorm;
    token.rarityCount = sumRarityCount;
    token.rarityCountNorm = sumRarityCountNorm;

    token.score = token[`${config.rules.scoreKey}`];

    token.hasRarity = token.rarity > 0;
  }
}

function getTraitGroups(attributes, config) {
  const traits = attributes.filter((attr) => !isSpecialTrait(attr, config));
  const specialTraits = attributes.filter((attr) => isSpecialTrait(attr, config));
  return { traits, specialTraits };
}

function isSpecialTrait(attribute, config) {
  if (typeof attribute.value !== 'string' && !config.rules.numberValues) {
    return true;
  }
  if (attribute.trait_type && attribute.display_type) {
    return true;
  }
  return false;
}

function normalizeTraitValues(traits) {
  const result = [];
  traits.forEach((trait) => {
    let normalizedValue = trait.value.toString();
    if (['none', 'nothing'].includes(normalizedValue.toLowerCase())) {
      normalizedValue = TRAIT_NONE_VALUE;
    }
    result.push({ ...trait, value: normalizedValue });
  });
  return result;
}

export function addTokenTraits(token, attributes, collection, config) {
  const traitGroups = getTraitGroups(attributes, config);
  token.traits = normalizeTraitValues(traitGroups.traits);
  token.specialTraits = traitGroups.specialTraits;

  const traitCount = token.traits.filter((item) => item.value !== TRAIT_NONE_VALUE).length;
  const traitCountTrait = {
    trait_type: TRAIT_COUNT_TYPE,
    value: traitCount.toString()
  };
  token.traits.push(traitCountTrait);
  token.traitCount = traitCount;

  try {
    for (const attr of token.traits) {
      addGlobalTrait(attr, collection, token.tokenId);
    }
    addGlobalTraitCount(traitCount, collection, token.tokenId);
  } catch (error) {
    log.error('error', attributes, error);
  }
}

export function addTokenNoneTrait(collection) {
  for (let traitType of Object.keys(collection.traits.data)) {
    if (typeof collection.traits.data[traitType] !== 'object') {
      continue;
    }
    for (let token of collection.tokens) {
      if (!token.done) {
        continue;
      }
      if (typeof token.traits.find !== 'function') {
        log.info('ERROR token.traits.find:', token);
        log.info('ERROR typeof token.traits.find:', typeof token.traits.find);
      }
      const item = token.traits.find(o => o.trait_type === traitType);
      if (!item) {
        // log.info('Add None:', trait, token.tokenId);
        token.traits.push({ trait_type: traitType, value: TRAIT_NONE_VALUE });
        addGlobalTrait({ trait_type: traitType, value: TRAIT_NONE_VALUE }, collection);
      }
    }
  }
}

function addGlobalTrait(attribute, collection, tokenId) {
  if (attribute.value === '') {
    attribute.value = TRAIT_NONE_VALUE;
  }

  const traitType = attribute.trait_type;
  const traitValue = attribute.value.toString();
  const displayType = attribute.display_type;

  if (!collection.traits.data[traitType]) {
    collection.traits.data[traitType] = {
      count: 0,
      trait: traitType,
      displayType,
      data: {},
    };
  }
  collection.traits.data[traitType].count++;

  if (!collection.traits.data[traitType].data[traitValue]) {
    collection.traits.data[traitType].data[traitValue] = {
      count: 0,
      value: traitValue,
      tokenIds: {},
    };
  }
  collection.traits.data[traitType].data[traitValue].count++;
  collection.traits.data[traitType].data[traitValue].tokenIds[tokenId] = true;
}

export function addGlobalTraitCount(count, collection, tokenId) {
  const value = count.toString();
  if (!collection.traitCounts.data[value]) {
    collection.traitCounts.data[value] = {
      count: 0,
      stringValue: value,
      numValue: count,
      tokenIds: {},
    };
  }
  collection.traitCounts.data[value].count++;
  collection.traitCounts.data[value].tokenIds[tokenId] = true;
}

export function calcRanks(collection) {
  const numDone = countDone(collection.tokens);
  calcRank(collection.tokens, numDone, 'score', false);
  calcRank(collection.tokens, numDone, 'rarity', false);
  calcRank(collection.tokens, numDone, 'rarityNorm', false);
  calcRank(collection.tokens, numDone, 'rarityCount', false);
  calcRank(collection.tokens, numDone, 'rarityCountNorm', false);
}

function calcRank(tokens, numDone, sortKey, ascending) {
  miscutil.sortBy1Key(tokens, sortKey, ascending);
  const rankKey = `${sortKey}Rank`;
  let rank = 1;
  let lastRank = 1;
  let lastScore = 0;
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    const thisScore = item[sortKey];
    let thisRank = rank;
    if (thisScore === lastScore) {
      thisRank = lastRank;
    }
    lastScore = thisScore;
    lastRank = thisRank;
    item[rankKey] = thisRank;
    item[`${rankKey}Pct`] = thisRank / numDone;
    rank++;
  }
}
