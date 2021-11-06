/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import * as miscutil from "./miscutil.js";
import * as web3 from "./web3.js";

const log = createLogger();

const IPFS_URL = 'ipfs://';

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

export async function getTokenURI(tokenId, config) {
  const result = await web3.getTokenURIFromContract(tokenId, config.contractAddress);
  if (result.uri) {
    return { uri: normalizeURI(result.uri) };
  }
  return result;
}

export function isValidTokenURI(uri) {
  try {
    if (!uri) {
      return false;
    }
    const url = new URL(uri);
    return true;
  } catch (_error) {
    return false;
  }
}

export function createTokenURI(tokenId, baseTokenURI) {
  if (typeof baseTokenURI !== 'string') {
    return '';
  }
  return baseTokenURI.replace('{ID}', tokenId);
}

export function convertToBaseTokenURI(tokenId, tokenURI) {
  try {
    if (tokenURI === '') {
      return '';
    }
    const idString = tokenId.toString();
    const count = miscutil.countInstances(tokenURI, idString);
    if (count === 1) {
      return tokenURI.replace(idString, '{ID}');
    }
    if (count > 1) {
      return miscutil.replaceLastOccurrenceOf(tokenURI, idString, '{ID}');
    }
    log.debug('Invalid conversion to baseTokenURI:', tokenId, tokenURI);
    return '';
  } catch (error) {
    log.error('Error inconvertToBaseTokenURI:', error);
    return '';
  }
}

export function normalizeURI(uri) {
  let normalizedURI = uri;
  if (uri && uri.startsWith(IPFS_URL)) {
    normalizedURI = uri.replace(IPFS_URL, 'https://ipfs.io/ipfs/');
  }
  return normalizedURI;
}
