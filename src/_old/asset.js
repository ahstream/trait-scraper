/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';

import * as tokenurilib from "./tokenURI.js";
import * as tokenlib from "./token.js";

const log = createLogger();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

export function create(id) {
  return {
    id,
    tokenURI: {},
    state: 0,
    // stateDesc: '0=Undefined|1=NotFound|2=HasGenericImage|3=HasRealImage|4=HasTraits',
    name: '',
    image: '',
    attributes: [],
    token: {}
  };
}

export async function processAsset(asset, config) {
  // log.info('asset', asset);
  if (!asset) {
    return false;
  }
  if (asset.done) {
    return false;
  }
  asset.tokenURI = await tokenurilib.getTokenURI(asset, config);
  if (asset.tokenURI.error || !asset.tokenURI.uri) {
    return false;
  }

  const token = await tokenlib.getToken(asset, config);
  // todo: merge token and asset and analyze if asset.done = true;
  asset.token = token;
  asset.done = token && token.attributes && token.attributes.length > 0;

  return asset;
}
