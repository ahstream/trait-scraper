import _ from 'lodash';

import { get } from './fetch.js';
import { log } from "./logUtils.js";
import { delay } from "./miscUtils.js";
import { notifyRevealed } from "./notify.js";
import * as timer from "./timer.js";
import { getTokenURI } from './tokenURI.js';

// EXPORTED

export async function fetchTokenById(tokenId, contractAddress) {
  const result = await getTokenURI(tokenId, contractAddress);
  if (result.error) {
    return result;
  }
  return await fetchTokenByURI(tokenId, result.uri);
}

export async function isRevealed(tokenIds, contractAddress) {
  const token = await getRevealedToken(tokenIds, contractAddress);
  return typeof token?.tokenId !== 'undefined';
}

export async function getRevealedToken(tokenIds, contractAddress) {
  const maybeRevealedTokens = [];

  for (const tokenId of tokenIds) {
    const token = await fetchTokenById(tokenId, contractAddress);
    const revealStatus = await getRevealedStatus(token);
    if (revealStatus > 0) {
      return token;
    } else if (revealStatus === 0) {
      // Push token and later analyze all tokens to see if collection is revealed!
      maybeRevealedTokens.push(token);
    }
  }

  if (maybeRevealedTokens.length > 1) {
    const imageURIs = maybeRevealedTokens.map(obj => obj.image);
    const uniqueURIs = [...new Set(imageURIs)];
    if (uniqueURIs.length < 2) {
      // If all token images are same, token is not revealed!
      return null;
    } else {
      // If token images are unique, token is revealed!
      return maybeRevealedTokens[0];
    }
  }

  return null;
}

export async function waitForReveal(collection, tokenIds, sleepBetween, silentFlag) {
  while (true) {
    const token = await getRevealedToken(tokenIds, collection.contractAddress);
    if (token !== null) {
      if (!silentFlag) {
        notifyRevealed();
      }
      return token;
    }
    log.info(`(${collection.projectId}) .`);
    await delay(sleepBetween);
  }
}

export function addToTokenTraitMap(token, traitType, traitValue) {
  // const myTimer = timer.create();

  const normalizedType = normalizeTrait(traitType);
  const normalizedValue = normalizeTrait(traitValue);
  const key1 = `${normalizedType}/${normalizedValue}`;
  const key2 = normalizedValue;
  const guiValue = `${traitType}: ${traitValue}`;
  if (!token.traitMap) {
    token.traitMap = {};
  }

  if (!token.traitMap[key1]) {
    token.traitMap[key1] = [];
  }
  if (!token.traitMap[key1].includes(guiValue)) {
    token.traitMap[key1].push(guiValue);
  }

  if (!token.traitMap[key2]) {
    token.traitMap[key2] = [];
  }
  if (!token.traitMap[key2].includes(guiValue)) {
    token.traitMap[key2].push(guiValue);
  }

  // myTimer.pingms(`addToTokenTraitMap duration`);
}

export function normalizeTrait(value) {
  return value
    .replaceAll(' ', '')
    .replaceAll('-', '')
    // .replaceAll('/', '') DON'T include this because rules can contain "/"
    .replaceAll('.', '')
    .toLowerCase();
}

export function matchTraitMap(token, value) {
  return token.traitMap ? (token.traitMap[value] ?? null) : null;
}

// INTERNAL FUNCTIONS

async function fetchTokenByURI(tokenId, tokenURI) {
  try {
    const tokenData = await fetchTokenData(tokenURI);
    if (tokenData.error) {
      return tokenData;
    }
    return {
      tokenId: tokenId.toString(),
      tokenIdSortKey: Number(tokenId),
      tokenURI, ...tokenData.data
    };
  } catch (error) {
    log.error('Error in fetchTokenByURI:', error);
    return { tokenId, tokenURI, error };
  }
}

async function fetchTokenData(tokenURI) {
  return get(tokenURI, {});
}

export async function getRevealedStatus(token) {
  if (!token || _.isEmpty(token) || !token.attributes || token.attributes.length < 1 || _.isEmpty(token.attributes)) {
    return -1;
  }

  if (!isIterable(token.attributes)) {
    return -1;
  }

  let numTraits = 0;
  const valueMap = new Map();
  for (let attr of token.attributes) {
    if (attr.trait_type) {
      if (attr.display_type) {
        // Dont count other types than normal (string) traits!
        continue;
      }
      numTraits++;
      valueMap.set(attr.value, true);
    }
  }

  if (numTraits > 1 && valueMap.size === 1) {
    // All traits have same value => not revealed!
    return -1;
  }

  if (numTraits > 1) {
    return 1;
  }

  if (numTraits === 1) {
    // Might be revealed! Need to check if image property is valid by comparing with other tokens.
    return 0;
  }

  return -1;
}

function isIterable(obj) {
  return !(obj == null || typeof obj[Symbol.iterator] !== 'function');
}

