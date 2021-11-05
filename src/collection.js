import * as miscutil from "./miscutil.js";
import { fetchTokens, createToken } from "./token.js";
import * as timer from "./timer.js";
import { getConfig, debugToFile } from "./config.js";
import * as db from "./db.js";
import { createBuynow } from "./buynow.js";
import * as rarity from "./rarity.js";
import * as webPage from "./webPage.js";
import { pollForReveal, notifyRevealed, notifyNewResults } from "./reveal.js";
import {
  countDone,
  countDoneConfig,
  countSkippedConfig,
  countDoneOrSkip,
  countSkip
} from "./count.js";

import open from "open";
import { createLogger } from "./lib/loggerlib.js";
import { saveToDB } from "./db.js";

const log = createLogger();

export async function pollCollections(args) {
  const config = getConfig(args);
  Object.keys(config.projects).forEach((projectId) => {
    if (config.projects[projectId].enabled) {
      fetchCollection({ ...args, projectId });
    }
  });
}

export async function fetchCollection(args) {
  const fullTimer = timer.create();
  const partTimer = timer.create();

  const config = getConfig(args);
  log.info(`Start fetching collection (${config.projectId})`);

  if (config.args.all) {
    config.forceAll = true;
  }
  partTimer.ping(`Get config duration (${config.projectId})`);

  await createCollectionTokens(config);
  db.saveToDB(config);
  partTimer.ping(`Prepare tokens duration (${config.projectId})`);

  if (!config.data.collection.isRevealed) {
    await pollForReveal(config);
    notifyRevealed(config);
  }
  partTimer.ping(`Poll for reveal duration (${config.projectId})`);

  await fetchCollectionTokens(config);
  log.info(`Finished fetching collection "${config.projectId}", ${countDoneConfig(config)} ok, ${countSkippedConfig(config)} skipped!`);
  partTimer.ping(`Fetch collection tokens (${config.projectId})`);

  createResults(config);
  partTimer.ping(`Create results duration (${config.projectId})`);

  db.saveToDB(config);
  partTimer.ping(`Save to DB duration (${config.projectId})`);

  config.data.collection.fetchedTime = new Date();
  config.data.collection.fetchDuration = fullTimer.getSeconds();

  fullTimer.ping(`Collection fetch duration (${config.projectId})`);

  debugToFile(config, 'config-done.json');

  return config;
}

export async function fetchCollectionTokens(config) {
  config.runtime.fetchStartTime = new Date();
  config.runtime.nextTimeCreateResults = miscutil.addSecondsToDate(new Date(), config.milestones.createResultEverySecs);
  config.runtime.nextTimeSaveDB = miscutil.addSecondsToDate(new Date(), config.milestones.saveDBEverySecs);

  await fetchTokens(config, fetchCollectionTokensCallback);
}

function fetchCollectionTokensCallback(config) {
  const numDone = countDone(config.data.collection.tokens);
  const numFinished = countDoneOrSkip(config.data.collection.tokens);
  const numTokens = config.data.collection.tokens.length;
  log.debug(`numDone: ${numDone}, numFinished: ${numFinished}, numTokens: ${numTokens} (${config.projectId}`);
  log.debug(`stats: ${config.runtime.stats} (${config.projectId}`);

  let flCreateResults = false;
  const now = new Date();
  const numDoneMilestone = config.runtime.milestones.donePct.length > 0 ? Math.round(config.runtime.milestones.donePct[0] * config.maxSupply) : Infinity;
  if (numDone >= numDoneMilestone) {
    log.info(`Create results after ${numDoneMilestone} finished tokens (${config.projectId})`);
    config.runtime.milestones.donePct.splice(0, 1);

    flCreateResults = true;
  } else if (now >= config.runtime.nextTimeCreateResults) {
    log.info(`Create results after ${config.milestones.createResultEverySecs} seconds since last time (${config.projectId})`);
    flCreateResults = true;
  }

  if (flCreateResults) {
    const myTimer = timer.create();
    createResults(config);
    config.runtime.nextTimeCreateResults = miscutil.addSecondsToDate(new Date(), config.milestones.createResultEverySecs);
    myTimer.ping(`Create results ${config.projectId}`);
  }

  let flSaveToDB = (now >= config.runtime.nextTimeSaveDB) && flCreateResults;
  if (numFinished >= numTokens || flSaveToDB) {
    config.runtime.nextTimeSaveDB = miscutil.addSecondsToDate(new Date(), config.milestones.firstSaveDBSeconds);
    const myTimer = timer.create();
    saveToDB(config);
    myTimer.ping(`Save to DB (${config.projectId})`);
  }
  if (flCreateResults && !flSaveToDB) {
    log.debug('Skip save to DB');
  }

  // todo: open hot pages?

  if (numFinished >= numTokens) {
    log.info(`${countDone(config.data.collection.tokens)} + ${countSkip(config.data.collection.tokens)} = ${numFinished} (${numTokens})`);
    return true;
  }

  return false;
}

function createCollection() {
  return {
    tokens: [],
    traits: { data: {} },
    traitCounts: { data: {} },
  };
}

export async function createCollectionTokens(config) {
  config.buynow = await createBuynow(config);

  const collection = createCollection();

  // If tokens exists from DB, use these!
  const currentTokenList = config.data.collection.tokens ?? [];

  const source = miscutil.range(config.tokenIdRange[0], config.tokenIdRange[1], 1).map(obj => obj.toString());
  source.forEach((id) => {
    const existingItem = currentTokenList.find((obj) => obj.tokenId === id) ?? {};
    const buynowItem = config.buynow.itemMap.get(id);
    const newItem = {
      tokenId: id,
      price: buynowItem?.price ?? 0,
      buynow: buynowItem !== undefined,
    };
    const newToken = { ...existingItem, ...newItem };
    collection.tokens.push(newToken);
  });

  // Make sure buynow items are fetched first!
  miscutil.sortBy1Key(collection.tokens, 'buynow', false);

  collection.traits = config.data.collection.traits ?? collection.traits;
  collection.traitCounts = config.data.collection.traitCounts ?? collection.traitCounts;

  config.data.collection = collection;

  log.info(`Created collection of ${config.data.collection.tokens.length} tokens where ${config.buynow.itemList.length} is buynow items!`);
}

function createResults(config) {
  rarity.calcRarity(config);
  const path = webPage.createCollectionWebPage(config);
  if (!config.runtime.webPageShown && config.autoOpen.firstResultPage) {
    open(path, { app: 'chrome' });
    config.runtime.webPageShown = true;
  } else {
    notifyNewResults(config);
  }
  if (config.autoOpen.hotPct && config.autoOpen.hotPct > 0) {
    // todo;
  }
}
