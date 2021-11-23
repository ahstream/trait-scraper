import { log } from "./logUtils.js";
import { addToTokenTraitMap } from "./token.js";

export const TRAIT_NONE_VALUE = 'NONE';

export function addTokenTraits(token, attributes, collection) {
  const normalTraits = attributes.filter((attr) => isNormalTrait(attr, collection.rules.ignoreNumberTraits));
  const traits = normalizeTraitValues(normalTraits);

  for (const traitType of getAllTraitTypes(collection)) {
    if (!traits.find(obj => obj.trait_type === traitType)) {
      traits.push({ trait_type: traitType, value: TRAIT_NONE_VALUE });
    }
  }

  token.traits = traits;
  token.traitCount = traits.filter((item) => item.value !== TRAIT_NONE_VALUE).length;

  if (!token.traitMap) {
    token.traitMap = {};
  }

  token.traits.forEach(trait => {
    addToTokenTraitMap(token, trait.trait_type, trait.value);
  });

  addGlobalTraitCount(token.traitCount, collection, token.tokenId);
  addGlobalTraits(token.traits, collection, token.tokenId);
}

export function getTraitFrequency(collection, traitType, traitValue) {
  if (!collection.traits.items[traitType]) {
    return null;
  }
  if (!collection.traits.items[traitType].items[traitValue]) {
    return null;
  }
  return collection.traits.items[traitType].items[traitValue].freq;
}

export function addNoneTraits(collection) {
  if (!collection.runtime.newTraitTypes) {
    log.debug('no newTraitTypes');
    return;
  }
  for (let trait of Object.keys(collection.traits.items)) {
    if (typeof collection.traits.items[trait] !== 'object') {
      continue;
    }
    for (let token of collection.tokens) {
      if (typeof token.traits.find !== 'function') {
        log.error('ERROR token.traits.find:', token);
        log.error('ERROR typeof token.traits.find:', typeof token.traits.find);
      }
      if (!token.traits.find(o => o.trait_type === trait)) {
        const newTrait = { trait_type: trait, value: TRAIT_NONE_VALUE };
        token.traits.push(newTrait);
        addGlobalTraits([newTrait], collection);
      }
    }
  }
  collection.runtime.newTraitTypes = false;
}

export function addGlobalTraits(traits, collection) {
  for (let trait of traits) {
    if (trait.value === '') {
      trait.value = TRAIT_NONE_VALUE;
    }
    const traitType = trait.trait_type;
    const traitValue = trait.value.toString();

    if (!collection.traits.items[traitType]) {
      collection.traits.items[traitType] = {
        count: 0,
        trait: traitType,
        displayType: trait.display_type,
        items: {},
      };
      collection.runtime.newTraitTypes = true;
      addGlobalTraitMaps(traitType, collection);
    }
    collection.traits.items[traitType].count++;

    if (!collection.traits.items[traitType].items[traitValue]) {
      collection.traits.items[traitType].items[traitValue] = {
        count: 0,
        value: traitValue,
      };
    }
    collection.traits.items[traitType].items[traitValue].count++;
  }
}

function addGlobalTraitMaps(traitType, collection) {
  collection.traits.traitTypesMap = collection.traits.traitTypesMap ?? new Map();
  collection.traits.traitTypesArr = collection.traits.traitTypesArr ?? [];
  collection.traits.traitTypesMap.set(traitType, true);
  collection.traits.traitTypesArr.push(traitType);
}

function getAllTraitTypes(collection) {
  return collection.traits.traitTypesArr ?? [];
}

function addGlobalTraitCount(count, collection) {
  const key = count.toString();
  if (!collection.traitCounts.items[key]) {
    collection.traitCounts.items[key] = {
      count: 0,
      id: key,
      idSortKey: count,
    };
  }
  collection.traitCounts.items[key].count++;
}

function isNormalTrait(attribute, ignoreNumberTraits) {
  if (typeof attribute.value !== 'string' && ignoreNumberTraits) {
    return false;
  }
  if (attribute.display_type) {
    return false;
  }
  if (!attribute.trait_type || !attribute.value) {
    return false;
  }
  return true;
}

function normalizeTraitValues(traits) {
  const result = [];
  for (let trait of traits) {
    let normalizedValue = trait.value.toString();
    if (['none', 'nothing'].includes(normalizedValue.toLowerCase())) {
      normalizedValue = TRAIT_NONE_VALUE;
    }
    result.push({ ...trait, value: normalizedValue });
  }
  return result;
}

