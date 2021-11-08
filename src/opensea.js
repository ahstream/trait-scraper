/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import * as miscutil from "./miscutil.js";
import { addToCache } from "./cache.js";
import fetch from 'node-fetch';
import { debugToFile } from "./config.js";

const log = createLogger();

// MAIN FUNCTIONS

export async function pollAssets(config, callback) {
  log.info(`(${config.projectId}) Start Poll Assets`);
  while (true) {
    const now = new Date();
    if (!config.cache.opensea.assets.nextFullUpdate) {
      config.cache.opensea.assets.nextFullUpdate = now;
    }
    if (config.cache.opensea.assets.nextFullUpdate > now) {
      log.info(`(${config.projectId}) Not ready to update assets, wait ${config.opensea.pollAssetsCheckFreqSecs} secs`);
      await miscutil.sleepSecs(config.opensea.pollAssetsCheckFreqSecs);
      continue;
    }

    log.info(`(${config.projectId}) Update assets`);
    await updateAssets(config);
    config.cache.opensea.assets.lastFullUpdate = new Date();
    config.cache.opensea.assets.nextFullUpdate = miscutil.addSecondsToDate(new Date(), config.opensea.pollAssetsUpdateFreqSecs);

    if (callback && !callback(config)) {
      break;
    }
  }
  log.info(`(${config.projectId}) Exit Poll Assets`);
}

export async function getAssets(config) {
  log.info(`(${config.projectId}) Start Get Assets`);

  const fromTokenId = config.tokenIdRange[0];
  const toTokenId = config.tokenIdRange[1];
  const assets = await getAssetsByChunks(config.contractAddress, fromTokenId, toTokenId, config);
  const tokens = [];
  assets.forEach(asset => {
    const token = convertAsset(asset);
    tokens.push(token);
    addToCache(config.cache.opensea.assets, token.tokenId, token);
  });
  config.cache.opensea.assets.lastFullUpdate = new Date();

  log.info(`(${config.projectId}) Exit Get Assets`);

  return tokens;
}

export async function updateAssets(config) {
  const fromTokenId = config.tokenIdRange[0];
  const toTokenId = config.tokenIdRange[1];
  const assets = await getAssetsByChunks(config.contractAddress, fromTokenId, toTokenId, config);
  assets.forEach(asset => {
    const token = convertAsset(asset);
    addToCache(config.cache.opensea.assets, token.tokenId, token);
  });
  return true;
}

async function getAssetsByChunks(contractAddress, fromTokenId, toTokenId, config, batchSize = Infinity) {
  const maxSupply = parseInt(toTokenId) - parseInt(fromTokenId) + 1;
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
        url: obj.url,
        promise: fetch(obj.url, { method: 'GET' })
      };
    }).slice(0, batchSize);
    if (newTries.length < 1) {
      break;
    }
    log.debug(`(${config.projectId}) getCollectionByChunks, batch size: ${newTries.length}`);
    const results = await Promise.all(newTries.map(obj => obj.promise));
    for (let i = 0; i < results.length; i++) {
      const resultsArrIndex = newTries[i].index;
      const response = results[i];
      log.debug(`(${config.projectId}) Response status: ${response.status} ${response.statusText} (${newTries[i]})`);
      tries[resultsArrIndex].status = response.status.toString();
      if (response.status === 200) {
        finalResult.push((await response.json()).assets);
        tries[resultsArrIndex].status = 'ok';
      } else if (response.status === 429) {
        retryAfter = parseInt(response.headers.get('retry-after'));
      } else if (response.status === 400) {
        tries[resultsArrIndex].status = 'skip';
      } else {
        log.info(`(${config.projectId}) Unexpected response status: ${response.status} ${response.statusText} (${newTries[i]})`);
      }
    }
    const numOk = tries.filter(obj => ['ok', 'skip'].includes(obj.status)).length;
    const num429 = tries.filter(obj => ['429'].includes(obj.status)).length;
    const numNotOk = tries.length - numOk;

    if (retryAfter > 0) {
      log.info(`(${config.projectId}) numOk: ${numOk}, numNotOk: ${numNotOk}, num429: ${num429} (retry after ${retryAfter} secs)`);
      await miscutil.sleep(retryAfter * 1000);
      retryAfter = 0;
    } else {
      log.info(`(${config.projectId}) numOk: ${numOk}, numNotOk: ${numNotOk}, num429: ${num429}`);
      await miscutil.sleep(50);
    }
  }
  return finalResult.flat();
}

function convertAsset(asset) {
  const convertedAsset = {
    tokenId: asset?.token_id,
    tokenIdSortKey: asset?.token_id ? Number(asset.token_id) : null,
    imageThumbnailUrl: asset?.image_thumbnail_url,
    imageOriginalUrl: asset?.image_original_url,
    description: asset?.description,
    collectionSlug: asset?.collection?.slug,
    tokenMetadata: asset?.token_metadata,
    traits: asset?.traits,
    topBid: asset?.top_bid,
    // listingDate: asset?.listing_date, // this is null even for items on sale, opensea bug?!
    numSales: asset?.num_sales,
    name: asset?.name,
    permalink: asset?.permalink,
    basePrice: asset?.sell_orders && asset?.sell_orders[0] ? asset.sell_orders[0].base_price : null,
    decimals: asset?.sell_orders && asset?.sell_orders[0] ? asset.sell_orders[0].payment_token_contract?.decimals ?? null : null,
    listingDate: asset?.sell_orders && asset?.sell_orders[0] ? asset.sell_orders[0].created_date ?? null : null,
    lastSalePrice: asset?.last_sale?.total_price ?? null,
    lastSaleDecimals: asset?.last_sale?.payment_token?.decimals ?? null,
    lastSaleDate: asset?.last_sale?.event_timestamp ?? null,
    currency: asset?.sell_orders && asset?.sell_orders[0] ? asset.sell_orders[0].payment_token_contract?.symbol : null,
  };
  convertedAsset.price = convertedAsset.basePrice && convertedAsset.decimals ? convertedAsset.basePrice / Math.pow(10, convertedAsset.decimals) : null;
  convertedAsset.lastPrice = convertedAsset.lastSalePrice && convertedAsset.lastSaleDecimals ? convertedAsset.lastSalePrice / Math.pow(10, convertedAsset.lastSaleDecimals) : null;
  convertedAsset.isBuynow = convertedAsset.price && convertedAsset.price > 0 && convertedAsset.currency === 'ETH';

  return convertedAsset;
}

function assetsURL(contractAddress, offset, limit, order = 'asc') {
  return `https://api.opensea.io/api/v1/assets?asset_contract_address=${contractAddress}&order_direction=${order}&offset=${offset}&limit=${limit}`;
}
