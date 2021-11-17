import { waitForReveal } from "./token2.js";
import * as timer from "./timer.js";
import { getConfig, saveCache, debugToFile } from "./config2.js";
import { updateAssets } from "./opensea.js";

import { createLogger } from "./lib/loggerlib.js";
import * as tokenURI from "./tokenURI.js";
import * as miscutil from "./miscutil.js";
import { fetchTokenURIs } from "./fetchTokenURIs.js";
import { getFromCache } from "./cache.js";
import { addTokenTraits } from "./trait.js";

import _ from 'lodash';
import { calcRarity } from "./rarity2.js";
import * as webPage from "./webPage2.js";
import open from "open";
import { notifyNewResults } from "./reveal.js";

const log = createLogger();

// EXPORTED FUNCTIONS

export async function reveal(projectId, args) {
  log.info(`(${projectId}) Start revealing collection...`);
  args.command = 'poll';
  await fetch(projectId, args);
}

export async function fetch(projectId, args) {
  const config = getConfig(projectId, args);

  await getOpenseaAssets(config);
  await revealCollection(config);
  await fetchCollection(config);
  saveCache(config);
  // debugToFile(config, 'config1234.json');

  log.info(`(${config.projectId}) Finished fetching collection`);
  // log.info(`(${config.projectId}) Finished fetching collection: ${countDoneConfig(config)} ok, ${countSkippedConfig(config)} skipped`);

  return config;
}

export function createCollection() {
  return {
    tokens: [],
    traits: { items: {} },
    traitCounts: { items: {} },
  };
}

// INTERNAL FUNCTIONS

async function getOpenseaAssets(config) {
  if (!config.args.skipOpensea) {
    const myTimer = timer.create();

    log.info(`(${config.projectId}) Get Opensea assets...`);
    await updateAssets(config);

    myTimer.ping(`(${config.projectId}) getOpenseaAssets duration`);

    saveCache(config);
  }
}

async function revealCollection(config) {
  const myTimer = timer.create();

  log.info(`(${config.projectId}) Wait for reveal...`);

  const token = await waitForReveal(config.projectId, config.pollForRevealTokenIds, config.contractAddress, config.sleepBetween, config.args.silent);

  config.collection.baseTokenURI = tokenURI.convertToBaseTokenURI(token.tokenId, token.tokenURI);

  myTimer.ping(`(${config.projectId}) revealCollection duration`);
}

async function fetchCollection(config) {
  const myTimer = timer.create();

  const baseTokens = miscutil.range(config.firstTokenId, config.lastTokenId, 1).map(id => {
    const asset = getFromCache(config.cache.opensea.assets, id);
    return {
      tokenId: id.toString(),
      tokenIdSortKey: id,
      tokenURI: tokenURI.createTokenURI(id, config.collection.baseTokenURI),
      assetURI: asset?.permalink ?? null,
      price: asset?.price ?? null,
      // asset,
    };
  });

  const tokensOnSale = miscutil.sort(baseTokens.filter(token => token.price > 0), 'price', true);
  const tokensNotOnSale = baseTokens.filter(token => token.price <= 0);
  const allTokens = [...tokensOnSale, ...tokensNotOnSale];

  console.log('tokensOnSale.length', tokensOnSale.length);
  console.log('tokensNotOnSale.length', tokensNotOnSale.length);
  console.log('allTokens.length', allTokens.length);

  const inputArray = allTokens.map(token => {
    return {
      ref: token,
      url: token.tokenURI,
    };
  });
  const outputArray = [];

  const stats = {};

  fetchTokenURIs(config.projectId, inputArray, outputArray, config.fetchTokenOptions, config.cache.tokens, true, stats);

  let numProcessedTokens = 0;
  while (numProcessedTokens < inputArray.length) {
    // console.log('outputArray.length', outputArray.length);
    while (outputArray.length) {
      numProcessedTokens++;
      const result = outputArray.shift();
      if (result.status !== '200') {
        continue;
      }
      const token = addTokenRef(result.ref, result.data, config.collection, numProcessedTokens, config.includeNonStringValues);
      // todo: create result?
    }
    await miscutil.sleep(500);
  }

  console.log('config.fetchTokenOptions', config.fetchTokenOptions);
  console.log('stats', stats);
  console.log('outputArray[0]', outputArray[0]);

  createRevealResults(config);

  debugToFile(config.collection, 'collection.json');

  myTimer.ping(`(${config.projectId}) fetchCollection duration`);
}

function addTokenRef(tokenRef, tokenData, collection, revealOrder, includeNonStringValues = false) {
  if (_.isEmpty(tokenData) || _.isEmpty(tokenData.attributes) || !tokenData.image) {
    console.log('Not proper JSON:', tokenData);
    return false;
  }
  const { attributes, ...otherTokenProperties } = tokenData;
  const token = { ...otherTokenProperties, ...tokenRef };
  collection.tokens.push(token);

  token.revealOrder = revealOrder;

  addTokenTraits(token, attributes, collection, includeNonStringValues);

  return token;
}

function createRevealResults(config) {
  const myTimer = timer.create();

  calcRarity(config.collection, config.rules.scoreKey);
  myTimer.ping(`(${config.projectId}) createResults duration`);

  debugToFile(config.collection, 'collection2.json');

  const path = webPage.createRevealWebPage(config);

  if (!config.runtime.webPageShown && config.autoOpen.firstResultPage) {
    open(path, { app: 'chrome' });
    config.runtime.webPageShown = true;
  } else {
    notifyNewResults(config);
  }
}
