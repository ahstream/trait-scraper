import * as miscutil from "./miscutil.js";
import { fetchTokens } from "./fetchTokens.js";
import * as timer from "./timer.js";
import { getConfig } from "./config.js";
import * as debugutil from "./debugutil.js";
import * as db from "./db.js";
import * as buynow from "./buynow.js";
import * as rarity from "./rarity.js";
import * as webPage from "./webPage.js";
import * as poll from "./poll.js";
import {
  countDone,
  countDoneConfig,
  countSkippedConfig,
  countDoneOrSkip,
  countSkip
} from "./count.js";

import opn from "opn";
import { createLogger } from "./lib/loggerlib.js";
import { debugToFile } from "./debugutil.js";

const log = createLogger();

export async function fetchCollection({ projectId, all = false, debug = false, fromDB = true }) {
  const fullTimer = timer.createTimer();
  const partTimer = timer.createTimer();

  log.info(`Start fetching collection ${projectId}`);

  const config = getConfig(projectId, debug, fromDB);
  debugToFile(config, "bar.json");
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
    await poll.pollForReveal(config);
    poll.notifyRevealed(config);
  }
  partTimer.ping('Poll for reveal duration');

  await fetchCollectionTokens(config);
  log.info(`Finished fetching collection "${projectId}", ${countDoneConfig(config)} ok, ${countSkippedConfig(config)} skipped!`);
  partTimer.ping('Fetch collection tokens');

  debugutil.debugToFile(config);
  partTimer.ping('Debug to file duration');

  createResults(config);
  partTimer.ping('Create results duration');

  db.saveToDB(config);
  partTimer.ping('Save to DB duration');

  config.data.fetchedTime = new Date();
  config.data.fetchDuration = fullTimer.getSeconds();

  fullTimer.ping('Collection fetch duration');

  return config;
}

export async function fetchCollectionTokens(config) {
  await fetchTokens(config, 6000, fetchTokensIsFinishedCallback);
}

function fetchTokensIsFinishedCallback(config, stats) {
  const numDone = countDone(config.data.tokenList);
  const numFinished = countDoneOrSkip(config.data.tokenList);
  const numTokens = config.data.tokenList.length;
  log.debug('numDone, numFinished, numTokens, stats', numDone, numFinished, numTokens, stats);

  if (config.milestones.length > 0 && numDone >= config.milestones[0] * config.maxSupply) {
    const myTimer = timer.createTimer();
    const milestone = config.milestones.splice(0, 1);
    log.info(`Create results after ${numDone} finished tokens...`);
    createResults(config);
    myTimer.ping('Create results');
  }

  if (numFinished >= numTokens) {
    log.info(`${countDone(config.data.tokenList)} + ${countSkip(config.data.tokenList)} = ${numFinished} (${numTokens})`);
    return true;
  }
  // todo: create milestones result
  // todo: open web pages?
  return false;
}

export function prepareTokens(config) {
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
  rarity.calc(config);
  const path = webPage.createCollectionWebPage(config);
  if (!config.webPageShown && config.openWebPage.firstResultPage) {
    log.info('Open results page:', path);
    opn(path, { app: 'chrome' });
    config.webPageShown = true;
  }
  if (config.openWebPage.maxRarityPct && config.openWebPage.maxRarityPct > 0) {
    // todo;
  }
}
