import { createLogger } from "./lib/loggerlib.js";
import {
  countDone,
} from "./count.js";

const log = createLogger();

const TRAIT_NONE_VALUE = 'xxNonexx';
const TRAIT_COUNT_TYPE = 'xxTraitCountxx';

export function calc(config) {
  addTokenNoneTrait(config.data);
  calcGlobalRarity(config.data);
  calcTokenRarity(config.data);
}

export function calcGlobalRarity(collectionData) {
  const numTokens = countDone(collectionData.tokenList);
  let numTraitTypes = 0;
  let numTraitValues = 0;
  for (let traitType of Object.keys(collectionData.traits.data)) {
    numTraitTypes++;
    if (typeof collectionData.traits.data[traitType] !== 'object') {
      continue;
    }
    let numTraitValuesInTraitType = 0;
    for (let traitValue of Object.keys(collectionData.traits.data[traitType].data)) {
      numTraitValues++;
      numTraitValuesInTraitType++;
      const frequency = collectionData.traits.data[traitType].data[traitValue].count / numTokens;
      collectionData.traits.data[traitType].data[traitValue].frequency = frequency;
      collectionData.traits.data[traitType].data[traitValue].rarity = 1 / frequency;
    }
    collectionData.traits.data[traitType].numTraitValues = numTraitValuesInTraitType;
  }

  collectionData.traits.numTraitValues = numTraitValues;
  collectionData.traits.numTraitTypes = numTraitTypes;
  collectionData.traits.avgNumTraitValuesPerTraitType = numTraitValues / numTraitTypes;

  for (let traitType of Object.keys(collectionData.traits.data)) {
    if (typeof collectionData.traits.data[traitType] !== 'object') {
      continue;
    }
    for (let traitValue of Object.keys(collectionData.traits.data[traitType].data)) {
      const rarityNormalized =
        collectionData.traits.data[traitType].data[traitValue].rarity *
        (collectionData.traits.avgNumTraitValuesPerTraitType / collectionData.traits.data[traitType].numTraitValues);
      collectionData.traits.data[traitType].data[traitValue].rarityNormalized = rarityNormalized;
    }
  }
}

export function calcTokenRarity(collectionData) {
  let numTokens = 0;
  for (const token of collectionData.tokenList) {
    if (!token.done) {
      continue;
    }
    numTokens++;
    let sumRarity = 0;
    let sumRarityNormalized = 0;
    let numTokenTraits = 0;
    for (const trait of token.traits) {
      const traitType = trait.trait_type;
      const traitValue = trait.value;

      if (collectionData.traits.data[traitType] === undefined) {
        console.log(collectionData.traits);
        console.log(traitType);
      }
      trait.numWithThisTrait = collectionData.traits.data[traitType].data[traitValue].count;
      trait.frequency = collectionData.traits.data[traitType].data[traitValue].frequency;
      trait.rarity = collectionData.traits.data[traitType].data[traitValue].rarity;
      trait.rarityNormalized = collectionData.traits.data[traitType].data[traitValue].rarityNormalized;

      if (traitType !== TRAIT_COUNT_TYPE && traitValue !== TRAIT_NONE_VALUE) {
        numTokenTraits++;
      }

      sumRarity = sumRarity + trait.rarity;
      sumRarityNormalized = sumRarityNormalized + trait.rarityNormalized;
    }

    token.numTraits = numTokenTraits;
    token.rarity = sumRarity;
    token.rarityNormalized = sumRarityNormalized;
    token.hasRarity = token.rarity > 0;
  }
}

function getTraitGroups(attributes) {
  const traits = attributes.filter((attr) => attr.trait_type && !attr.display_type);
  const specialTraits = attributes.filter((attr) => attr.trait_type && attr.display_type);
  return { traits, specialTraits };
}

function normalizeTraits(traits) {
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

export function addTokenTraits(token, attributes, collectionData) {
  const traitGroups = getTraitGroups(attributes);
  token.traits = normalizeTraits(traitGroups.traits);
  token.specialTraits = traitGroups.specialTraits;

  const traitCountTrait = {
    trait_type: TRAIT_COUNT_TYPE,
    value: (token.traits.filter((item) => item.value !== TRAIT_NONE_VALUE).length).toString()
  };
  token.traits.push(traitCountTrait);

  try {
    for (const attr of token.traits) {
      addGlobalTrait(attr, collectionData);
    }
  } catch (error) {
    log.error('error', attributes, error);
  }
}

function addGlobalTrait(attribute, collectionData) {
  if (attribute.value === '') {
    attribute.value = TRAIT_NONE_VALUE;
  }

  const traitType = attribute.trait_type;
  const traitValue = attribute.value.toString();
  const displayType = attribute.display_type;

  if (!collectionData.traits.data[traitType]) {
    collectionData.traits.data[traitType] = {
      count: 0,
      trait: traitType,
      displayType,
      data: {}
    };
  }
  collectionData.traits.data[traitType].count++;

  if (!collectionData.traits.data[traitType].data[traitValue]) {
    collectionData.traits.data[traitType].data[traitValue] = {
      count: 0,
      value: traitValue,
    };
  }
  collectionData.traits.data[traitType].data[traitValue].count++;
}

export function recalcRank(tokenList) {
  let rank = 1;
  const numTokens = tokenList.length;
  for (const item of tokenList) {
    item.rank = rank;
    item.rankPct = rank / numTokens;
    rank++;
  }
}

export function addTokenNoneTrait(collectionData) {
  for (let traitType of Object.keys(collectionData.traits.data)) {
    if (typeof collectionData.traits.data[traitType] !== 'object') {
      continue;
    }
    for (let token of collectionData.tokenList) {
      if (!token.done) {
        continue;
      }
      const item = token.traits.find(o => o.trait_type === traitType);
      if (!item) {
        // log.info('Add None:', trait, token.tokenId);
        token.traits.push({ trait_type: traitType, value: TRAIT_NONE_VALUE });
        addGlobalTrait({ trait_type: traitType, value: TRAIT_NONE_VALUE }, collectionData);
      }
    }
  }
}
