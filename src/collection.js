import * as miscutil from "./miscutil.js";
import { updateTokens, createToken } from "./token.js";
import * as timer from "./timer.js";
import { getConfig, saveCache, debugToFile } from "./config.js";
import { updateAssets } from "./opensea.js";
import * as rarity from "./rarity.js";
import * as webPage from "./webPage.js";
import { pollForReveal, notifyRevealed, notifyNewResults } from "./reveal.js";
import {
  countDone,
  countDoneConfig,
  countSkippedConfig,
  countDoneOrSkip,
  countSkip,
  countBuynow
} from "./count.js";

import open from "open";
import { createLogger } from "./lib/loggerlib.js";
import { getFromCache } from "./cache.js";

const log = createLogger();

export async function pollCollections(projectId, args) {
  log.info(`Start polling collections...`);

  const config = getConfig(projectId, args);
  Object.keys(config.projects).forEach((projectId) => {
    if (config.projects[projectId].enabled) {
      pollCollection(projectId, args);
    }
  });
}

export async function pollCollection(projectId, args) {
  log.info(`(${projectId}) Start polling collection...`);
  args.command = 'poll';
  await doFetchCollection(projectId, args);
}

export async function fetchCollection(projectId, args) {
  args.command = 'fetch';
  await doFetchCollection(projectId, args);
}

async function doFetchCollection(projectId, args) {
  const myTimer = timer.create();

  log.info(`(${projectId}) Start fetching collection...`);

  const config = getConfig(projectId, args);
  await setupCollection(config);
  await revealCollection(config);
  await fetchCollectionTokens(config);
  createResults(config);
  saveCache(config);
  // debugToFile(config, 'config1234.json');

  myTimer.ping(`(${config.projectId}) fetchCollection duration`);

  log.info(`(${config.projectId}) Finished fetching collection: ${countDoneConfig(config)} ok, ${countSkippedConfig(config)} skipped`);

  return config;
}

async function setupCollection(config) {
  const myTimer = timer.create();

  if (!config.args.skipOpensea) {
    const myTimer2 = timer.create();
    log.info(`(${config.projectId}) Update OpenSea Assets...`);
    await updateAssets(config);
    myTimer2.ping(`(${config.projectId}) updateAssets duration`);
  }

  await createCollectionTokens(config);

  myTimer.ping(`(${config.projectId}) setupCollection duration`);
}

async function revealCollection(config) {
  const myTimer = timer.create();

  if (!config.runtime.isRevealed) {
    await pollForReveal(config);
    notifyRevealed(config);
  }

  myTimer.ping(`(${config.projectId}) revealCollection duration`);
}

export async function fetchCollectionTokens(config) {
  const myTimer = timer.create();

  config.runtime.fetchStartTime = new Date();
  config.runtime.nextTimeCreateResults = miscutil.addSecondsToDate(new Date(), config.milestones.createResultEverySecs);
  config.runtime.nextTimeSaveCache = miscutil.addSecondsToDate(new Date(), config.milestones.saveCacheEverySecs);

  await updateTokens(config, fetchCollectionTokensCallback);

  config.data.collection.fetchedTime = new Date();
  config.data.collection.fetchDuration = myTimer.getSeconds();

  myTimer.ping(`(${config.projectId}) fetchCollectionTokens duration`);
}

function fetchCollectionTokensCallback(config) {
  const numDone = countDone(config.data.collection.tokens);
  const numFinished = countDoneOrSkip(config.data.collection.tokens);
  const numTokens = config.data.collection.tokens.length;

  log.debug(`(${config.projectId}) numDone: ${numDone}, numFinished: ${numFinished}, numTokens: ${numTokens}`);
  log.debug(`(${config.projectId}) stats: ${config.runtime.stats}`);

  let flCreateResults = false;

  const now = new Date();
  const numDoneMilestone = config.runtime.milestones.donePct.length > 0 ? Math.round(config.runtime.milestones.donePct[0] * config.maxSupply) : Infinity;
  if (numDone >= numDoneMilestone) {
    log.info(`(${config.projectId}) Create results after ${numDoneMilestone} finished tokens`);
    config.runtime.milestones.donePct.splice(0, 1);

    flCreateResults = true;
  } else if (now >= config.runtime.nextTimeCreateResults) {
    log.info(`(${config.projectId}) Create results after ${config.milestones.createResultEverySecs} seconds since last time`);
    flCreateResults = true;
  }

  if (flCreateResults) {
    createResults(config);
    config.runtime.nextTimeCreateResults = miscutil.addSecondsToDate(new Date(), config.milestones.createResultEverySecs);
  }

  let flSaveToCache = (now >= config.runtime.nextTimeSaveCache) && flCreateResults;

  if (numFinished >= numTokens || flSaveToCache) {
    config.runtime.nextTimeSaveCache = miscutil.addSecondsToDate(new Date(), config.milestones.firstSaveDBSeconds);
    saveCache(config);
  }
  if (flCreateResults && !flSaveToCache) {
    log.debug('Skip saving cache');
  }

  if (config.autoOpen.hotPct && config.autoOpen.hotPct > 0) {
    // todo;
  }

  if (numFinished >= numTokens) {
    log.info(`(${config.projectId}) ${countDone(config.data.collection.tokens)} + ${countSkip(config.data.collection.tokens)} = ${numFinished} (${numTokens})`);
    return true;
  }

  return false;
}

export async function createCollectionTokens(config) {
  const source = miscutil.range(config.firstTokenId, config.lastTokenId, 1);
  source.forEach((id) => {
    const idString = id.toString();
    const asset = getFromCache(config.cache.opensea.assets, idString);
    const token = createToken({
      tokenId: idString,
      tokenIdSortKey: id,
      isBuynow: asset?.isBuynow ?? null,
      price: asset?.price ?? null,
      lastPrice: asset?.lastPrice ?? null,
      lastSaleDate: asset?.lastSaleDate ?? null
    });
    token.asset = asset;
    config.data.collection.tokens.push(token);
  });

  // Make sure less expensive buynow items are fetched first!
  miscutil.sortBy2Keys(config.data.collection.tokens, 'isBuynow', false, 'price', true);

  const numBuynow = countBuynow(config.data.collection.tokens);

  log.info(`(${config.projectId}) Created ${config.data.collection.tokens.length} tokens (${numBuynow} BuyNow)`);
}

export function createCollection() {
  return {
    tokens: [],
    traits: { data: {} },
    traitCounts: { data: {} },
  };
}

function createResults(config) {
  const myTimer = timer.create();

  rarity.calcRarity(config);
  const path = webPage.createCollectionWebPage(config);

  myTimer.ping(`(${config.projectId}) createResults duration`);

  if (!config.runtime.webPageShown && config.autoOpen.firstResultPage) {
    open(path, { app: 'chrome' });
    config.runtime.webPageShown = true;
  } else {
    notifyNewResults(config);
  }
}
