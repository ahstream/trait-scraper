import _ from 'lodash';
import open from "open";

import { getFromCache } from "./cache.js";
import { debugToFile, getConfig, saveCache } from "./config.js";
import { fetchTokenURIs } from "./fetchTokenURIs.js";
import { addToHotTokens, updateHotOV } from "./hotToken.js";
import { log } from "./logUtils.js";
import { addSecondsToDate, delay, doIfTrue, range, sort } from "./miscUtils.js";
import { notifyHotToken, notifyNewResults } from "./notify.js";
import { updateAssets } from "./opensea.js";
import { calcRarity, calcTemporaryTokenRarity } from "./rarity.js";
import { release, take } from "./semaphore.js";
import * as timer from "./timer.js";
import { waitForReveal } from "./token.js";
import * as tokenURI from "./tokenURI.js";
import { cleanProjectHtmlFiles } from "./tools.js";
import { addTokenTraits } from "./trait.js";
import * as webPage from "./webPage.js";

const BASE_ASSET_URI = 'https://opensea.io/assets/';

// EXPORTED FUNCTIONS

export async function reveal(projectId, args) {
  log.info(`Start revealing collections...`);

  args.command = 'reveal';
  const config = getConfig(projectId, args);

  if (config.projectId) {
    return await revealOneProject(projectId, args);
  }

  Object.keys(config.projects).forEach((projectId) => {
    if (!config.projects[projectId].disabled) {
      revealOneProject(projectId, args);
    }
  });
}

export async function revealOneProject(projectId, args) {
  const config = getConfig(projectId, args);

  cleanProjectHtmlFiles(config, config.projectId, 'reveal');

  config.collection.retryTo = addSecondsToDate(new Date(), 60 * 60);
  config.collection.waitBeforeRetry = 500;

  await getOpenseaAssets(config);
  updateAssetInfo(config);
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
    hotTokens: [],
    traits: { items: {} },
    traitCounts: { items: {} },
    runtime: {}
  };
}

// INTERNAL FUNCTIONS

async function getOpenseaAssets2(config) {
  if (config.args.skipOpensea) {
    log.debug('Skip Opensea');
    return;
  }

  if (!take('getOpenseaAssets', log.info, config.projectId)) {
    log.info(`(${config.projectId}) Asset fetcher is busy, wait for my turn to fetch tokens...`);
    while (!take('getOpenseaAssets', log.info, config.projectId)) {
      await delay(1000);
    }
  }
  log.info(`(${config.projectId}) Get Opensea assets...`);

  const myTimer = timer.create();
  await updateAssets(config);
  // myTimer.ping(`(${config.projectId}) getOpenseaAssets duration`);

  release('getOpenseaAssets');

  saveCache(config);
}

async function getOpenseaAssets(config) {
  try {
    if (config.args.skipOpensea) {
      log.debug('Skip Opensea');
      return;
    }

    if (!take('getOpenseaAssets', log.info, config.projectId)) {
      log.info(`(${config.projectId}) Asset fetcher is busy, wait for my turn to fetch tokens...`);
      while (!take('getOpenseaAssets', log.info, config.projectId)) {
        await delay(1000);
      }
    }
    log.info(`(${config.projectId}) Get Opensea assets...`);

    const myTimer = timer.create();
    await updateAssets(config);
    // myTimer.ping(`(${config.projectId}) getOpenseaAssets duration`);

    release('getOpenseaAssets');

    saveCache(config);
  } catch
    (error) {
    log.error(error);
    release('getOpenseaAssets');
  }
}

function updateAssetInfo(config) {
  const assetArr = Object.entries(config.cache.opensea.assets.data).map(([key, val]) => val);
  const assets = assetArr.filter(obj => obj.price > 0);
  const prices = assets.map(obj => obj.price).sort((a, b) => a - b);

  config.collection.assetInfo = {
    numBuynow: prices.length,
    floor: Math.min(...prices),
    roof: Math.max(...prices),
    levels: [
      { price: 0.2, count: prices.filter(price => price <= 0.2).length },
      { price: 0.3, count: prices.filter(price => price <= 0.3).length },
      { price: 0.4, count: prices.filter(price => price <= 0.4).length },
      { price: 0.5, count: prices.filter(price => price <= 0.5).length },
      { price: 0.75, count: prices.filter(price => price <= 0.75).length },
      { price: 1.0, count: prices.filter(price => price <= 1.0).length },
    ]
  };
}

async function revealCollection(config) {
  const myTimer = timer.create();

  log.info(`(${config.projectId}) Wait for reveal...`);

  const token = await waitForReveal(config.collection, config.pollForRevealTokenIds, config.sleepBetween, config.args.silent, config.unrevealedImage);

  config.collection.baseTokenURI = tokenURI.convertToBaseTokenURI(token.tokenId, token.tokenURI);

  // myTimer.ping(`(${config.projectId}) revealCollection duration`);
}

async function fetchCollection(config) {
  const baseTokens = range(config.collection.firstTokenId, config.collection.lastTokenId, 1).map(id => {
    const asset = getFromCache(config.cache.opensea.assets, id);
    return {
      tokenId: id.toString(),
      tokenIdSortKey: id,
      tokenURI: tokenURI.createTokenURI(id, config.collection.baseTokenURI),
      assetURI: asset?.permalink ?? null,
      price: asset?.price ?? null,
      hasAsset: !_.isEmpty(asset)
      // traits: asset?.traits ?? null,
    };
  });

  const tokensOnSale = sort(baseTokens.filter(token => token.price > 0), 'price', true);
  const tokensNotOnSale = baseTokens.filter(token => token.price <= 0);
  const allTokens = [...tokensOnSale, ...tokensNotOnSale];

  log.info(`(${config.projectId}) Total tokens: ${allTokens.length} (Buynow: ${tokensOnSale.length})`);

  const fetchInfoRefs = allTokens.map(token => {
    return {
      ref: token,
      url: token.tokenURI,
      hasAsset: token.hasAsset,
      fetchFromCache: config.args.skipTokenCache ? false : true,
    };
  });

  config.collection.runtime.fetchStartTime = new Date();
  config.collection.runtime.nextTimeCreateResults = addSecondsToDate(new Date(), config.milestones.createResultEverySecs);
  config.collection.runtime.nextTimeSaveCache = addSecondsToDate(new Date(), config.milestones.saveCacheEverySecs);

  await fetchCollectionProcess(config, fetchInfoRefs);
}

async function fetchCollectionProcess(config, inputArray, totalProcessedTokens = 0) {
  const outputArray = [];
  const stats = {};

  const lastRetryDate = addSecondsToDate(new Date(), 60 * 60);

  fetchTokenURIs(config.projectId, inputArray, outputArray, config.fetchTokenOptions, lastRetryDate, config.cache.tokens, stats);

  let numProcessedTokensThisRun = 0;
  let lastToken = null;
  while (numProcessedTokensThisRun < inputArray.length) {
    while (outputArray.length) {
      numProcessedTokensThisRun++;

      const result = outputArray.shift();
      if (result.status !== '200') {
        continue;
      }

      const token = addTokenRef(result.ref, result.data, config.collection, numProcessedTokensThisRun + totalProcessedTokens);
      if (!token) {
        continue;
      }

      lastToken = token;

      if (addToHotTokens(token, config.collection, config)) {
        await createRevealResults(config, lastToken);
        doIfTrue(!config.args.silent, notifyHotToken);
        continue;
      }

      const milestoneInfo = checkMilestones(config, lastToken);
      if (milestoneInfo.createResults) {
        await createRevealResults(config, lastToken);
      }
      if (milestoneInfo.saveCache) {
        saveCache(config);
      }
    }
    await delay(10);
  }

  log.info(`(${config.projectId}) Stats:`, stats);
  await createRevealResults(config, null, true);

  debugToFile(config, 'tokens.json');

  debugToFile(config.collection.traits, 'traits.json');
}

function checkMilestones(config, lastToken) {
  const info = {};

  const now = new Date();

  info.saveToCache = (now >= config.collection.runtime.nextTimeSaveCache);

  if (now >= config.collection.runtime.nextTimeCreateResults) {
    log.debug('nextTimeCreateResults!');
    info.createResults = true;
    return info;
  }

  if (config.milestones.createResultOnTokenNum.find(obj => obj === lastToken.revealOrder)) {
    log.debug('createResultOnTokenNum!', lastToken.revealOrder);
    info.createResults = true;
    return info;
  }

  const onNthToken = lastToken.price > 0 ? config.milestones.createResultOnNthToken[0] : config.milestones.createResultOnNthToken[1];
  if (lastToken.revealOrder % onNthToken === 0) {
    log.debug('onNthToken!', lastToken.revealOrder);
    info.createResults = true;
    return info;
  }

  return info;
}

function addTokenRef(tokenRef, tokenData, collection, revealOrder) {
  if (_.isEmpty(tokenData) || _.isEmpty(tokenData.attributes) || !tokenData.image) {
    log.debug('Not proper JSON:', tokenData);
    return false;
  }

  const { attributes, ...otherTokenProperties } = tokenData;
  const token = { ...otherTokenProperties, ...tokenRef };
  collection.tokens.push(token);

  token.revealOrder = revealOrder;

  if (!token.assetURI) {
    token.assetURI = `${BASE_ASSET_URI}${collection.contractAddress}/${token.tokenId}`;
  }

  addTokenTraits(token, attributes, collection);
  calcTemporaryTokenRarity(token, collection);

  return token;
}

async function createRevealResults(config, lastToken = null, isLastPage = false) {
  const myTimer = timer.create();

  if (config.args.top && !isLastPage) {
    return;
  }
  // todo: ersätt skipPageNums med usePageNums!
  if (config.args.skipPageNums) {
    config.collection.runtime.revealPageNum = null;
  } else if (isLastPage) {
    config.collection.runtime.revealPageNum = 0;
  } else {
    config.collection.runtime.revealPageNum = config.collection.runtime.revealPageNum ?? 0;
    config.collection.runtime.revealPageNum++;
  }

  calcRarity(config.collection);
  updateHotOV(config.collection, config);

  const path = webPage.createRevealWebPage(config, config.collection.runtime.revealPageNum);

  // myTimer.ping(`createResults length ${config.collection.tokens.length} duration`);

  const everySecs = lastToken ? config.milestones.createResultEverySecs[0] : config.milestones.createResultEverySecs[1];
  config.collection.runtime.nextTimeCreateResults = addSecondsToDate(new Date(), everySecs);

  if (!config.collection.runtime.webPageShown && config.autoOpen.firstResultPage) {
    open(path, { app: 'chrome' });
    config.collection.runtime.webPageShown = true;
    await delay(1);
  } else {
    doIfTrue(!config.args.silent, notifyNewResults);
    await delay(1);
  }
}

