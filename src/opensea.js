/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import * as miscutil from "./miscutil.js";
import * as timer from "./timer.js";
import { curly } from "node-libcurl";
import fetch from 'node-fetch';

const log = createLogger();

const CURL_HEADERS = [];

// MAIN FUNCTIONS ---

export async function getAssets(contractAddress, offset = 0, limit = 20, order = 'asc') {
  const options = { method: 'GET' };
  const url = `https://api.opensea.io/api/v1/assets?asset_contract_address=${contractAddress}&order_direction=${order}&offset=${offset}&limit=${limit}`;
  log.debug(`Get assets url: ${url}`);
  const response = await fetch(url, options);

  try {
    return await response.json();
  } catch (error) {
    log.error('Error:', error);
    return ({});
  }
}

function assetsURL(contractAddress, offset, limit, order = 'asc') {
  return `https://api.opensea.io/api/v1/assets?asset_contract_address=${contractAddress}&order_direction=${order}&offset=${offset}&limit=${limit}`;
}

export async function getCollection(contractAddress, maxSupply) {
  return getCollectionByChunks(contractAddress, maxSupply);
}

export async function getCollectionByChunks(contractAddress, maxSupply, batchSize = Infinity) {
  const limit = 50;
  const times = Math.ceil(maxSupply / limit);
  const tries = [];

  [...Array(times).keys()].map(i => {
    tries.push({ index: i, status: null, url: assetsURL(contractAddress, i * limit, limit) });
  });

  const finalResult = [];
  let retryAfter = 0;
  while (true) {
    const newTries = tries.filter(obj => obj.status !== 'ok' && obj.status !== 'skip').map(obj => {
      return {
        index: obj.index,
        status: obj.status,
        promise: fetch(obj.url, { method: 'GET' })
      };
    }).slice(0, batchSize);
    if (newTries.length < 1) {
      break;
    }
    log.debug('getCollectionByChunks, batch size:', newTries.length);
    const results = await Promise.all(newTries.map(obj => obj.promise));
    for (let i = 0; i < results.length; i++) {
      const resultsArrIndex = newTries[i].index;
      const response = results[i];
      log.debug('Response status:', response.status, response.statusText);
      tries[resultsArrIndex].status = response.status.toString();
      if (response.status === 200) {
        finalResult.push((await response.json()).assets);
        tries[resultsArrIndex].status = 'ok';
      } else if (response.status === 429) {
        retryAfter = parseInt(response.headers.get('retry-after'));
        console.log('retryAfter:', retryAfter);
      } else if (response.status === 400) {
        tries[resultsArrIndex].status = 'skip';
      } else {
        log.info('Unexpected response status:', response.status, response.statusText);
      }
    }
    const numOk = tries.filter(obj => ['ok', 'skip'].includes(obj.status)).length;
    const num429 = tries.filter(obj => ['429'].includes(obj.status)).length;
    const numNotOk = tries.length - numOk;

    if (retryAfter > 0) {
      log.info(`numOk: ${numOk}, numNotOk: ${numNotOk}, num429: ${num429} (retry after ${retryAfter} secs)`);
      await miscutil.sleep(retryAfter * 1000);
      retryAfter = 0;
    } else {
      log.info(`numOk: ${numOk}, numNotOk: ${numNotOk}, num429: ${num429}`);
      await miscutil.sleep(50);
    }
  }
  return finalResult.flat();
}

export async function getBuynow(contractAddress, maxSupply) {
  const tokens = [];
  const myTimer = timer.create();
  const collection = await getCollectionByChunks(contractAddress, maxSupply);
  myTimer.ping('getCollectionByChunks duration');

  collection.forEach(asset => {
    // if (!asset || !asset.sell_orders || !asset.sell_orders[0]?.payment_token_contract?.symbol === 'ETH') {
    //  return;
    // }
    const token = convertAssetToToken(asset);
    if (token.isBuynow) {
      tokens.push(token);
    }
  });

  log.info(`Num BuyNow from OpenSea: ${tokens.length}`);
  return tokens;
}

function convertAssetToToken(asset) {
  const token = {
    tokenId: asset?.token_id,
    numSales: asset?.num_sales,
    name: asset?.name,
    permalink: asset?.permalink,
    basePrice: asset?.sell_orders && asset?.sell_orders[0] ? asset.sell_orders[0].base_price : null,
    decimals: asset?.sell_orders && asset?.sell_orders[0] ? asset.sell_orders[0].payment_token_contract?.decimals ?? null : null,
    lastSalePrice: asset?.last_sale?.total_price ?? null,
    lastSaleDecimals: asset?.last_sale?.payment_token?.decimals ?? null,
    currency: asset?.sell_orders && asset?.sell_orders[0] ? asset.sell_orders[0].payment_token_contract?.symbol : null,
  };
  token.price = token.basePrice && token.decimals ? token.basePrice / Math.pow(10, token.decimals) : null;
  token.lastPrice = token.lastSalePrice && token.lastSaleDecimals ? token.lastSalePrice / Math.pow(10, token.lastSaleDecimals) : null;
  token.isBuynow = token.price && token.currency === 'ETH';

  return token;
}

export async function getBuynowBAK(contractAddress, limit = 50, maxTokens = Infinity) {
  const tokens = [];
  const collection = await getCollection(contractAddress, limit, maxTokens);

  collection.forEach(asset => {
    if (!asset || !asset.sell_orders || !asset.sell_orders[0]?.payment_token_contract?.symbol === 'ETH') {
      return;
    }
    const token = {
      tokenId: asset.token_id,
      numSales: asset.num_sales,
      name: asset.name,
      permalink: asset.permalink,
      saleKind: asset.sell_orders[0].sale_kind,
      basePrice: asset.sell_orders[0].base_price,
      decimals: asset.sell_orders[0].payment_token_contract.decimals,
    };
    token.price = token.basePrice / Math.pow(10, token.decimals);
    tokens.push(token);
  });

  return tokens;
}

export async function getCollectionBAK(contractAddress, limit = 50, maxTokens = Infinity) {
  const tokens = [];
  let offset = 0;
  while (true) {
    log.info(`Get ${limit} tokens from OpenSea (offset: ${offset})`);
    const result = await getAssets(contractAddress, offset, limit);
    if (!result || !result.assets || result.assets.length < 1) {
      break;
    }
    log.debug(`Got ${result.assets.length} tokens`);
    for (const asset of result.assets) {
      if (tokens.find(obj => obj.token_id === asset.token_id)) {
        log.info('Duplicate token:', asset.token_id);
        continue;
      }
      tokens.push(asset);
    }
    offset = offset + result.assets.length;
    if (offset > maxTokens) {
      break;
    }
  }

  return tokens;
}

export async function pollCollectionData(config, callback) {
  while (true) {
    /**
     * if nextUpdate > now => sleep 1 sec
     * get chunks for config.contractAddress, config.maxSupply
     * update config.cache.opensea
     * run callback?
     * set config.runtime.openseaLastUpdate, openseaNextUpdate (+60 min?)
     * end while
     */
  }
}
