import * as miscutil from "./miscutil.js";
import { updateTokens, createToken } from "./token.js";
import * as timer from "./timer.js";
import { getConfig, saveCache, debugToFile } from "./config.js";
import { updateAssets } from "./opensea.js";
import * as rarity from "./rarity.js";
import * as webPage from "./webPage.js";
import { pollForReveal, notifyRevealed, notifyNewResults, isRevealed } from "./reveal.js";
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
import { calcRanks, calcRarityFromTokens } from "./rarity.js";
import { createAnalyzeOVPage } from "./webPage.js";

const log = createLogger();

export async function pollCollections(projectId, args) {
  log.info(`Start polling collections...`);

  if (projectId) {
    return pollCollection(projectId, args);
  }

  const config = getConfig(projectId, args);
  Object.keys(config.projects).forEach((projectId) => {
    if (config.projects[projectId].poll) {
      pollCollection(projectId, args);
    }
  });
}

export async function pollCollection(projectId, args) {
  log.info(`(${projectId}) Start polling collection...`);
  args.command = 'poll';
  await doFetchCollection(projectId, args);
}

export async function fetchCollections(projectId, args) {
  if (projectId) {
    return fetchCollection(projectId, args);
  }

  const config = getConfig(projectId, args);
  const projects = [];
  Object.keys(config.projects).forEach((projectId) => {
    if (!config.projects[projectId].poll) {
      projects.push(projectId);
    }
  });

  for (const [index, projectId] of projects.entries()) {
    log.info(`Fetching project ${index} of ${projects.length}: ${projectId}`);
    try {
      await fetchCollection(projectId, args, true);
    } catch (error) {
      log.error('Error:', JSON.stringify(error));
    }
  }
}

export async function fetchCollection(projectId, args, skipNotRevealed = false) {
  args.command = 'fetch';
  await doFetchCollection(projectId, args, skipNotRevealed);
}

async function doFetchCollection(projectId, args, skipNotRevealed) {
  const myTimer = timer.create();

  log.info(`(${projectId}) Start fetching collection...`);

  const config = getConfig(projectId, args);

  if (skipNotRevealed && !(await isRevealed(config))) {
    log.info(`Skip not revealed project: ${projectId}`);
    return config;
  }

  await setupCollection(config);
  await revealCollection(config);
  await fetchCollectionTokens(config);
  // await miscutil.sleep(5000);
  calcRanks(config.data.collection);
  createResults(config, true);
  saveCache(config);
  // debugToFile(config, 'config1234.json');

  myTimer.ping(`(${config.projectId}) fetchCollection duration`);

  log.info(`(${config.projectId}) Finished fetching collection: ${countDoneConfig(config)} ok, ${countSkippedConfig(config)} skipped`);

  // webPage.foo(config);
  miscutil.sortBy1Key(config.data.collection.tokens, 'score', false);
  // debugToFile(config, 'config-debug.json');

  calcRanks(config.data.collection);

  debugToFile({
    data: config.data.collection.tokens.map(obj => {
      return {
        score: obj.score,
        scoreRank: obj.scoreRank,
        rarityCountNorm: obj.rarityCountNorm,
        rarityCountNormRank: obj.rarityCountNormRank,
        tokenId: obj.tokenId
      };
    })
  }, 'config-debug2.json');

  return config;
}

function createPrepConfig(baseConfig) {
  return {
    contractAddress: baseConfig.contractAddress,
    projectFolder: baseConfig.projectFolder,
    maxSupply: baseConfig.maxSupply,
    autoOpen: {
      firstResultPage: false
    },
    rules: {
      scoreKey: baseConfig.scoreKey,
    },
    data: {
      collection: createCollection()
    }
  };

}

export async function analyzeOV(projectId, args) {
  const baseConfig = await doFetchCollection(projectId, args);

  miscutil.sortBy1Key(baseConfig.data.collection.tokens, 'rarityCountNormRank', true);
  baseConfig.data.collection.tokens.forEach(obj => obj.finalRank = obj.rarityCountNormRank);

  const baseTokens = baseConfig.data.collection.tokens.filter(obj => obj.done);

  miscutil.sortBy1Key(baseTokens, 'tokenIdSortKey', true);
  miscutil.shuffle(baseTokens);

  let path;
  for (let i = 0; i < 100; i++) {
    const prepConfig = createPrepConfig(baseConfig);
    const config = { ...prepConfig };
    config.data.collection.tokens = [...baseTokens.slice(0, i + 1)];
    const newToken = config.data.collection.tokens[i];
    calcRarityFromTokens(config);
    path = createAnalyzeOVPage(config, i + 1, newToken);
  }
  open(path, { app: 'chrome' });

}

async function setupCollection(config) {
  const myTimer = timer.create();

  if (!config.args.skipOpensea) {
    const myTimer2 = timer.create();
    log.info(`(${config.projectId}) Update OpenSea Assets...`);
    await updateAssets(config);
    myTimer2.ping(`(${config.projectId}) updateAssets duration`);
    saveCache(config);
  }

  await createCollectionTokens(config);

  myTimer.ping(`(${config.projectId}) setupCollection duration`);
}

async function revealCollection(config) {
  const myTimer = timer.create();

  if (!config.runtime.isRevealed) {
    log.info(`(${config.projectId}) Check for reveal...`);
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

  config.data.collection.fetchHasFinished = true;
  config.data.collection.fetchTime = new Date();
  config.data.collection.fetchDuration = myTimer.getSeconds();

  myTimer.ping(`(${config.projectId}) fetchCollectionTokens duration`);
}

async function fetchCollectionTokensCallback(config) {
  const numDone = countDone(config.data.collection.tokens);
  const numFinished = countDoneOrSkip(config.data.collection.tokens);
  const numTokens = config.data.collection.tokens.length;

  // todo check for 429 and sleep, config.runtime.tokenDataRetryAfter?

  log.debug(`(${config.projectId}) numDone: ${numDone}, numFinished: ${numFinished}, numTokens: ${numTokens}, numTimeout: ${config.runtime.stats.num2}, num429: ${config.runtime.stats.num429}, `);
  log.debug(`(${config.projectId}) stats:`, config.runtime.stats);

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
  log.debug('flSaveToCache', flSaveToCache);

  if (numFinished >= numTokens || flSaveToCache) {
    config.runtime.nextTimeSaveCache = miscutil.addSecondsToDate(new Date(), config.milestones.saveCacheEverySecs);
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

  if (config.runtime.tokenDataRetryAfter) {
    log.info(`(${config.projectId}) ${numDone} + ${numFinished - numDone} = ${numFinished} (of ${numTokens})`);
    // log.info(`Sleep ${config.runtime.tokenDataRetryAfter} secs because connection refused...`);
    // await miscutil.sleepSecs(config.runtime.tokenDataRetryAfter);
    config.runtime.tokenDataRetryAfter = null;
  }

  /*
  if (config.runtime.tokenDataRetryNextTime) {
    const now = new Date();
    console.log('retry in:', config.runtime.tokenDataRetryAfter);
    console.log('now, next', now, config.runtime.tokenDataRetryNextTime);
    console.log('now < config.runtime.tokenDataRetryNextTime', now < config.runtime.tokenDataRetryNextTime);
    console.log('now > config.runtime.tokenDataRetryNextTime', now > config.runtime.tokenDataRetryNextTime);
    if (now < config.runtime.tokenDataRetryNextTime) {
      log.info(`Sleep until ${config.runtime.tokenDataRetryNextTime} because 429 Too Many Requests error...`);
      await miscutil.sleepSecs(config.runtime.tokenDataRetryAfter);
    }
  } */

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
      lastSaleDate: asset?.lastSaleDate ? new Date(asset.lastSaleDate) : new Date('1900-01-01')
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

function createResults(config, bothFiles = false) {
  const myTimer = timer.create();

  rarity.calcRarity(config);
  const path = webPage.createCollectionWebPage(config, bothFiles);

  myTimer.ping(`(${config.projectId}) createResults duration`);

  if (!config.runtime.webPageShown && config.autoOpen.firstResultPage) {
    open(path, { app: 'chrome' });
    config.runtime.webPageShown = true;
  } else {
    notifyNewResults(config);
  }
}
