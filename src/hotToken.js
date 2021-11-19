import { log } from "./logUtils.js";

export function checkIfHot(token, collection) {
  const hotData = getHotTokenData(token, collection.rules);
  if (hotData) {
    token.hot = hotData;
    collection.hotTokens.push(token);
    collection.runtime.newHotTokens.push(token.tokenId);
    return true;
  }
  return false;
}

export function updateHotOV(collection) {
  for (const token of collection.tokens) {
    const hotData = getHotTokenData(token, collection.rules);
    if (hotData && hotData.isHotOV) {
      if (!collection.hotTokens.find(obj => obj.tokenId === token.tokenId)) {
        log.debug(`token ${token.tokenId} NOT in hotTokens`);
        token.hot = hotData;
        collection.hotTokens.push(token);
        collection.runtime.newHotTokens.push(token.tokenId);
      }
    }
  }
}

function getHotTokenData(token, rules) {
  if (!token.price || token.price > rules.maxPrice) {
    // Only tokens for sale can be hot!
    return null;
  }

  const data = {
    isHotTraitCount: false,
    isHotOV: false,
    isHotTrait: false,
    traits: []
  };
  data.isHotTraitCount = token.traitCount <= rules.hotMaxTraits;
  data.isHotOV = token.scoreOV >= rules.hotMinOV || token.temp?.scoreOV >= rules.hotMinOV;

  token.traits.map(obj => obj.value).forEach(traitValue => {
    // if (rules.hotTraits.some(substr => traitValue.toLowerCase().includes(substr))) {
    if (rules.hotTraits.some(substr => traitValue.toLowerCase() === substr)) {
      data.traits.push(traitValue);
    }
  });
  data.isHotTrait = data.traits.length > 0;

  if (data.isHotTraitCount || data.isHotOV || data.isHotTrait) {
    return data;
  }

  return null;
}


