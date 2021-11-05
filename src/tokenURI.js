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

export async function getTokenURIFromContract(id, contractAddress) {
  const uri = await web3.getTokenURIFromContract(id, contractAddress);
  log.debug(`getTokenURIFromContract; id, uri:`, id, uri);
  const normalizedUri = normalizeURI(uri);
  log.debug(`getTokenURIFromContract; normalizedUri:`, normalizedUri);
  return normalizedUri;
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

export function createTokenURI(id, uri) {
  if (typeof uri !== 'string') {
    return '';
  }
  return uri.replace('{ID}', id);
}

export function convertToBaseTokenURI(id, uri) {
  const idString = id.toString();
  const count = miscutil.countInstances(uri, idString);
  if (count === 1) {
    return uri.replace(idString, '{ID}');
  }
  if (count > 1) {
    return miscutil.replaceLastOccurrenceOf(uri, idString, '{ID}');
  }
  log.debug('Invalid conversion to baseTokenURI:', id, uri);
  return '';
}

export function normalizeURI(uri) {
  let normalizedURI = uri;
  if (uri && uri.startsWith(IPFS_URL)) {
    normalizedURI = uri.replace(IPFS_URL, 'https://ipfs.io/ipfs/');
  }
  return normalizedURI;
}
