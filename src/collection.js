import * as miscutil from "./miscutil.js";
import { fetchTokens } from "./fetchTokens.js";
import * as fileutil from "./fileutil.js";
import * as timer from "./timer.js";
import { getConfig } from "./config.js";
import * as debugutil from "./debugutil.js";
import * as db from "./db.js";
import * as buynow from "./buynow.js";
import * as rarity from "./rarity.js";
import * as html from "./html.js";
import {
  countDone,
  countDoneConfig,
  countSkippedConfig,
  countFinishedBuynowConfig, countDoneOrSkip, countSkip
} from "./count.js";

import opn from "opn";
import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export async function fetchCollection({ projectId, all = false, debug = false, fromDB = true }) {
  const fullTimer = timer.createTimer();
  const partTimer = timer.createTimer();

  log.info(`Start fetching collection ${projectId}`);

  const config = getConfig(projectId, debug, fromDB);
  if (all) {
    config.threshold.buynow = false;
    config.threshold.level = 1;
    config.threshold.image = 0.01;
  }
  partTimer.ping('Get config duration');

  prepareTokens(config);
  db.saveToDB(config);
  partTimer.ping('Prepare tokens duration');

  if (!config.data.isRevealed) {
    // todo await pollForReveal(config);
    // todo notifyRevealed(config);
  }
  partTimer.ping('Poll for reveal duration');

  await fetchCollectionTokens(config);
  log.info(`Finished fetching collection "${projectId}", ${countDoneConfig(config)} ok, ${countSkippedConfig(config)} skipped!`);
  partTimer.ping('Fetch collection tokens');

  debugutil.debugToFile(config);

  createResults(config);
  db.saveToDB(config);
  partTimer.ping('Create results duration');

  config.data.fetchedTime = new Date();
  config.data.fetchDuration = fullTimer.getSeconds();

  fullTimer.ping('Collection fetch duration');
}

async function fetchCollectionTokens(config) {
  config.data.baseTokenURI = 'https://storage.googleapis.com/modznft/meta/{ID}';
  await fetchTokens(config, 6000, fetchTokensIsFinishedCallback);
}

function fetchTokensIsFinishedCallback(config, stats) {
  const numFinished = countDoneOrSkip(config.data.tokenList);
  const numTokens = config.data.tokenList.length;
  log.debug('numDone, numTokens, stats', numFinished, numTokens, stats);
  if (numFinished >= numTokens) {
    log.info(`${countDone(config.data.tokenList)} + ${countSkip(config.data.tokenList)} = ${numFinished} (${numTokens})`);
    return true;
  }
  // todo: create milestones result
  // todo: open web pages?
  return false;
}

async function fetchCollectionMilestones(milestones = [], config) {
  const myTimer = timer.createTimer();
  fetchTokens(config.data.tokenList, config.data.tokenURI, config.nextTokensBatchSize);
  return;

  while (true) {
    const numFinishedBefore = countDoneConfig(config);
    const nextTokens = getNextTokens(config, config.nextTokensBatchSize);

    if (nextTokens.length < 1) {
      break;
    }
    await fetchCollectionTokens(nextTokens, config);

    const numDone = countDoneConfig(config) + countSkippedConfig(config);
    const numFinishedInThisRun = numDone - numFinishedBefore;
    log.info(`Finished: ${numFinishedBefore} + ${numFinishedInThisRun} = ${numDone}`);

    if (milestones.length > 0 && numDone >= milestones[0]) {
      const milestone = milestones.splice(0, 1);
      log.info(`Create results after ${milestone} finished tokens...`);
      myTimer.ping();
      createResults(config);
      myTimer.ping();
    }
  }
}

function prepareTokens(config) {
  buynow.prepareBuynow(config);

  // If tokens exists in DB, use these!
  const currentTokenList = config.data.tokenList ?? [];

  const tokenList = [];

  const source = miscutil.range(config.firstTokenId, config.lastTokenId, 1);
  source.forEach((id) => {
    const existingItem = currentTokenList.find((obj) => obj.tokenId === id) ?? {};
    const buynowItem = config.buynowMap.get(id);
    const newItem = {
      tokenId: id,
      price: buynowItem?.price ?? 0,
      buynow: buynowItem !== undefined,
    };
    tokenList.push({ ...existingItem, ...newItem });
  });

  miscutil.sortBy1Key(tokenList, 'buynow', false);

  config.data.tokenList = tokenList;

  log.info('Num buynow tokens:', config.buynowList.length);
  log.info('Num total tokens:', config.data.tokenList.length);
}

function prepareTokensBAK(config) {
  const fromId = config.firstTokenId;
  const toId = config.maxSupply;

  buynow.prepareBuynow(config);

  // Reset tokenList if it already was present in saved config!
  const currentTokenList = config.data.tokenList ?? [];

  const tokenList = [];

  // First add buynow items so they get fetched first!
  log.info('Num of BuyNow tokens:', config.buynowList.length);
  config.buynowList.forEach((item) => {
    const existingItem = currentTokenList.find((obj) => obj.tokenId === item.tokenId) ?? {};
    const newItem = {
      tokenId: item.tokenId,
      price: item.price,
      buynow: true,
    };
    tokenList.push({ ...existingItem, ...newItem });
  });

  const source = miscutil.range(fromId, toId, 1);
  source.forEach((id) => {
    if (config.buynowMap.get(id)) {
      // Already handled when adding buynow items!
      return;
    }
    const existingItem = currentTokenList.find((obj) => obj.tokenId === id) ?? {};
    const newItem = {
      tokenId: id,
      price: 0,
      buynow: false,
    };
    tokenList.push({ ...existingItem, ...newItem });
  });

  config.data.tokenList = tokenList;

  log.info('Num of total tokens:', config.data.tokenList.length);
}

function createResults(config) {
  calcResultData(config);
  createResultPage(config);
}

function calcResultData(config) {
  rarity.addTokenNoneTrait(config.data);
  rarity.calcGlobalRarity(config.data);
  rarity.calcTokenRarity(config.data);
}

function createResultPage(config) {
  /*
  html.createWebPage(config);
  if (!config.webPageShown) {
    const path = fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity.html`);
    log.info('Open results page:', path);
    opn(path, { app: 'chrome' });
    config.webPageShown = true;
  }
   */
}

function getTokenListForResult(config) {
  console.log('config.data.tokenList.length', config.data.tokenList.length);
  debugutil.debugToFile(config, 'config2.json');
  const tokenList = [];
  for (const token of config.data.tokenList) {
    if (!token.hasRarity) {
      continue;
    }
    tokenList.push(token);
  }
  console.log('tokenList.length xxx', tokenList.length);
  return tokenList;
}
