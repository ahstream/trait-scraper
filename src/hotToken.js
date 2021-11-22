import { log } from "./logUtils.js";
import { matchTraitMap } from "./token.js";

export function addToHotTokens(token, collection, config) {
  const hotData = getHotTokenData(token, collection.rules, config);
  if (hotData) {
    hotData.revealOrder = token.revealOrder;
    hotData.price = token.price;
    hotData.ov = token.scoreOV;
    hotData.token = token;
    // token.hot = hotTokenData;
    collection.hotTokens.push(hotData);
    collection.runtime.newHotTokens.push(token.tokenId);
    return true;
  }
  return false;
}

export function updateHotOV(collection, config) {
  for (const token of collection.tokens) {
    const hotData = getHotTokenData(token, collection.rules, config);
    if (hotData && hotData.isHotOV) {
      hotData.revealOrder = token.revealOrder;
      hotData.price = token.price;
      hotData.ov = token.scoreOV;
      hotData.token = token;
      if (!collection.hotTokens.find(obj => obj.tokenId === token.tokenId)) {
        log.debug(`token ${token.tokenId} NOT in hotTokens`);
        // token.hot = hotData;
        collection.hotTokens.push(hotData);
        collection.runtime.newHotTokens.push(token.tokenId);
      }
    }
  }
}

function getHotTokenData(token, rules, config) {
  if (!token.price || token.price > rules.maxPrice) {
    // Only tokens for sale can be hot!
    if (!config.args.top) {
      return null;
    }
    // But show all tokens if args.top!
  }

  const data = {
    isHotTraitCount: false,
    isHotOV: false,
    isHotTrait: false,
    traits: []
  };

  data.isHotTraitCount = token.traitCount <= rules.hotMaxTraits;

  data.ov = token.scoreOV && token.scoreOV !== Infinity ? token.scoreOV : token.temp?.scoreOV;
  data.isHotOV = rules.hotMinOV && data.ov >= rules.hotMinOV;

  rules.hotTraits.forEach(rule => {
    const guiValueList = matchTraitMap(token, rule);
    if (guiValueList) {
      for (const guiValue of guiValueList) {
        if (guiValue && !data.traits.includes(guiValue)) {
          // if (rules.hotTraits.some(substr => traitValue.toLowerCase().includes(substr))) {
          // if (rules.hotTraits.some(substr => traitValue.toLowerCase() === substr)) {
          data.traits.push(guiValue);
        }
      }
    }
  });
  data.isHotTrait = data.traits.length > 0;

  const numTraits = data.traits.length;
  if (data.isHotTraitCount && data.isHotTrait) {
    data.sortOrder = 10;
  } else if (data.isHotTraitCount) {
    data.sortOrder = 20;
  } else if (data.isHotTrait) {
    data.sortOrder = 100 - numTraits;
  } else {
    data.sortOrder = null;
  }

  if (data.isHotTraitCount || data.isHotOV || data.isHotTrait) {
    return data;
  }

  return null;
}


