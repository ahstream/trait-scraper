/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import program from 'commander';
import fetch from 'node-fetch';
import https from 'https';

import * as utilslib from './lib/utilslib.js';
import * as jsonutil from './jsonutil.js';
import { createLogger } from './lib/loggerlib.js';

import { getTokenURIFromEtherscan, isValidTokenURI } from "./tokenURI.js";
import fs from "fs";
import * as fileutil from "./fileutil.js";

import opn from 'opn';
import { fileExistsRelPath, toAbsoluteFilePath } from "./fileutil.js";

import child_process from 'child_process';
import { curly } from "node-libcurl";

const log = createLogger();

const DEFAULT_FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
  "accept": "*/*",
};
const BASE_ASSET_URL = 'https://opensea.io/assets/';
const IPFS_URL = 'ipfs://';
const TRAIT_NONE_VALUE = 'xxNonexx';
const TRAIT_COUNT_TYPE = 'xxTraitCountxx';

// RUNTIME ----------------------------------------------------------------------------------

// yarn cli fetch --id waw --debug
// yarn cli test --id waw --debug

runProgram();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

async function runProgram() {
  log.info('run program');
  program.option('--id <value>', 'Project ID', '');
  program.option('--debug', 'Write debug info');
  program.option('--all', 'Use all items in collection');
  program.option('--sample', 'Use test samples');
  program.parse();
  const options = program.opts();
  const cmd = program.args[0];
  const projectId = program.args[1];
  switch (cmd) {
    case 'fetch':
      await fetchCollection({ projectId, all: options.all, debug: options.debug });
      break;
    case 'poll':
      await pollCollections({ debug: options.debug });
      break;
    case 'test':
      await testCollection({ projectId, doSample: options.sample, debug: options.debug });
      break;
    default:
      log.error(`Unknown command: ${cmd}`);
  }
  log.info('Done!');
  // process.exit(0);
}

function getConfig(projectId, debug) {
  const baseConfig = jsonutil.importFile(`../config/config.json`);

  let projectConfig = {};
  if (projectId) {
    projectConfig = jsonutil.importFile(`../config/projects/${projectId}/config.json`);
  }

  const dataFromDB = getFromDB(projectId);
  const configFromDB = { data: dataFromDB };

  const config = { ...configFromDB, ...baseConfig, ...projectConfig };

  config.projectId = projectId;
  config.debug = debug;

  config.data = config.data ?? {};
  config.data.tokenList = config.data.tokenList ?? [];
  config.data.attributes = config.data.attributes ?? {};

  return config;
}

async function pollCollections({ debug = false }) {
  const config = getConfig(null, debug);
  config.projects.forEach((projectId) => {
    fetchCollection({ projectId, debug });
  });
}

async function testCollection({ projectId, doSample = false, debug = false }) {
  const config = getConfig(projectId, debug);

  const nextTokensBatchSize = doSample ? config.testSamples.nextTokensBatchSize : [config.nextTokensBatchSize];
  const nextTokensFetchNewWhenFinishedPct = doSample ? config.testSamples.nextTokensFetchNewWhenFinishedPct : [config.nextTokensFetchNewWhenFinishedPct];

  const results = {};
  for (const batchSize of nextTokensBatchSize) {
    const batchKey = batchSize.toString();
    if (!results[batchKey]) {
      results[batchKey] = [];
    }
    for (const finishedPct of nextTokensFetchNewWhenFinishedPct) {
      const newConfig = getConfig(projectId, debug);
      newConfig.nextTokensBatchSize = batchSize;
      newConfig.nextTokensFetchNewWhenFinishedPct = finishedPct;
      newConfig.isTest = true;
      newConfig.threshold.buynow = true;
      const timer = createTimer();
      await testFetchCollection(projectId, newConfig);
      results[batchKey].push([finishedPct, timer.getSeconds()]);
      log.info('timer:', timer.getSeconds());
    }
  }
  log.info('Results:', results);
}

async function testFetchCollection(projectId, config) {
  log.info('Start testing collection');
  const startDate = new Date();

  prepareTokens(config);

  await pollForReveal(config, true);
  await fetchCollectionMilestones(config.fetchMilestones, config);

  log.info(`Finished pre-fetching collection: ${countDone(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);

  createResults(config);

  if (config.debug) {
    debugToFile(config);
  }

  log.info(`Finished testing collection: ${countDone(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);
}

async function fetchCollection({ projectId, all = false, debug = false }) {
  log.info(`Start fetching collection ${projectId}`);
  const timer = createTimer();

  const config = getConfig(projectId, debug);
  if (all) {
    config.threshold.buynow = false;
    config.threshold.level = 1;
    config.threshold.image = 0.01;
  }

  prepareTokens(config);
  saveToDB(config);

  if (!config.data.isRevealed) {
    await pollForReveal(config);
    notifyRevealed(config);
  }

  await fetchCollectionMilestones(config.fetchMilestones, config);

  log.info(`Finished pre-fetching collection "${projectId}", ${countDone(config)} ok, ${countSkipped(config)} skipped!`);
  log.info(`Create results...`);
  createResults(config);
  saveToDB(config);
  config.data.fetchedTime = new Date();
  config.data.fetchDuration = timer.getSeconds();
  log.info(`Duration: ${config.data.fetchDuration} secs`);

  let numFinalTries = 0;
  while (countDone(config) + countSkipped(config) < config.maxSupply) {
    numFinalTries++;
    if (numFinalTries % 10 === 0) {
      createResults(config);
      saveToDB(config);
    }
    await utilslib.sleep(1000);
    await fetchCollectionMilestones([], config);
  }

  log.info(`Finished fetching collection "${projectId}", ${countDone(config)} ok, ${countSkipped(config)} skipped!`);
  log.info(`Create results...`);
  createResults(config);
  saveToDB(config);
  log.info(`Duration: ${timer.getSeconds()} secs`);
}

async function fetchCollectionMilestones(milestones = [], config) {
  while (true) {
    const numFinishedBefore = countDone(config);
    const nextTokens = getNextTokens(config, config.nextTokensBatchSize);

    if (nextTokens.length < 1) {
      break;
    }
    await fetchCollectionTokens(nextTokens, config);

    const numDone = countDone(config) + countSkipped(config);
    const numFinishedInThisRun = numDone - numFinishedBefore;
    log.info(`Finished: ${numFinishedBefore} + ${numFinishedInThisRun} = ${numDone}`);

    if (milestones.length > 0 && numDone >= milestones[0]) {
      const milestone = milestones.splice(0, 1);
      log.info(`Create results after ${milestone} finished tokens...`);
      createResults(config);
    }
  }
}

async function fetchCollectionTokens(tokenList, config) {
  const numTokens = tokenList.length;
  const numWhenToGetMoreTokens = Math.round(config.nextTokensFetchNewWhenFinishedPct * numTokens);

  while (true) {
    tokenList.forEach(async (item) => {
      processTokenItem(item, config);
    });
    await utilslib.sleep(10);
    while (true) {
      let numFinished = 0;
      for (const item of tokenList) {
        numFinished = numFinished + (item.done || item.statusText === 'error' ? 1 : 0);
        if (item.statusText === 'error') {
          // log.error(item);
        }
      }
      if (numFinished >= numWhenToGetMoreTokens) {
        return;
      } else {
        // do nothing
      }
      await utilslib.sleep(10);
    }
  }
}

function prepareTokens(config) {
  const fromId = config.firstTokenId;
  const toId = config.maxSupply;

  prepareBuynow(config);

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

  const source = range(fromId, toId, 1);
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

function prepareBuynow(config) {
  const textFilePath = fileutil.absFilePath(`../config/projects/${config.projectId}/buynow.txt`);
  const buynowList = getBuynowList(textFilePath);

  const jsonFilePath = fileutil.absFilePath(`../config/projects/${config.projectId}/buynow.json`);
  fileutil.writeFile(jsonFilePath, JSON.stringify({ data: buynowList }, null, 2));

  config.buynowList = buynowList;
  config.buynowMap = new Map();
  config.buynowList.forEach((item) => {
    config.buynowMap.set(item.tokenId, item);
  });
}

function getBuynowList(filePath) {
  if (!fileutil.fileExists(filePath)) {
    return [];
  }

  let fakePrice = null;

  const data = fileutil.readFile(filePath, 'utf8');

  const tokenIdResult = [...data.matchAll(/\\"tokenId\\":\\"([0-9]+)\\"/gim)];
  let priceResult = [...data.matchAll(/\\"quantityInEth\\":\\"([0-9]+)\\"/gim)];

  if (tokenIdResult.length < 1) {
    throw new Error('BuyNow: Empty result!');
  }

  if (tokenIdResult.length !== priceResult.length) {
    // Token ID and Price lists have different length!
    // Use fake price when prices are not known for sure!
    log.info('Error: Token ID and Price lists have different length! Use fake price 0.001.');
    fakePrice = 0.001;
  }

  const tokenList = [];
  const tokenMap = new Map();
  for (let i = 0; i < tokenIdResult.length; i++) {
    const thisId = parseInt(tokenIdResult[i][1]);
    const thisToken = tokenMap.get(thisId);
    if (thisToken) {
      continue;
    }
    const thisPrice = fakePrice ?? parseInt(priceResult[i][1]) / Math.pow(10, 18);
    const thisItem = { tokenId: thisId, price: thisPrice };
    tokenMap.set(thisId, thisItem);
    tokenList.push(thisItem);
  }

  return tokenList.sort((a, b) => (a.price > b.price) ? 1 : ((b.price > a.price) ? -1 : 0));
}

function getNextTokens(config, qty) {
  const now = new Date();
  const result = [];
  let count = 0;
  for (var token of config.data.tokenList) {
    if (count >= qty) {
      break;
    }
    if (token.done || token.skip) {
      continue;
    }
    if (token.statusText === 'fetch-begin') {
      const retryDeadline = new Date(token.fetchStart.getTime() + config.fetchRequestLifetimeMsec);
      if (retryDeadline < now) {
        result.push(token);
        count++;
        continue;
      }
    }
    if (token.statusText === undefined || token.statusText === 'error') {
      result.push(token);
      count++;
    }
  }
  return result;
}

function countDone(config) {
  let count = 0;
  for (var token of config.data.tokenList) {
    if (token.done) {
      count++;
    }
  }
  return count;
}

function countSkipped(config) {
  let count = 0;
  for (var token of config.data.tokenList) {
    if (token.skip) {
      count++;
    }
  }
  return count;
}

function countFinishedBuynow(config) {
  let count = 0;
  for (var token of config.data.tokenList) {
    if (token.buynow && token.done) {
      count++;
    }
  }
  return count;
}

function countInstances(string, word) {
  return string.split(word).length - 1;
}

function replaceLastOccurrenceOf(string, searchFor, replaceWith) {
  const pos = string.lastIndexOf(searchFor);
  const result = string.substring(0, pos) + replaceWith + string.substring(pos + 1);
  log.info('replaceLastOccurrence; string, searchFor, replaceWith, result:', string, searchFor, replaceWith, result);
}

function createTokenURI(id, uri) {
  if (typeof uri !== 'string') {
    return '';
  }
  return uri.replace('{ID}', id);
}

function convertToTokenURI(id, uri) {
  const idString = id.toString();
  const count = countInstances(uri, idString);
  if (count === 1) {
    return uri.replace(idString, '{ID}');
  }
  if (count > 1) {
    return replaceLastOccurrenceOf(uri, idString, '{ID}');
  }
  log.error('Invalid conversion to tokenURI:', id, uri);
  return '';
}

function isTokenRevealed(token, config) {
  if (!token?.attributes) {
    return false;
  }
  let numTraits = 0;
  const valueMap = new Map();
  for (let attr of token?.attributes) {
    if (attr.trait_type) {
      if (attr.display_type) {
        // Dont count other types than normal (string) traits!
        continue;
      }
      numTraits++;
      valueMap.set(attr.value, true);
    }
  }
  if (numTraits >= config.minTraitsNeeded && valueMap.size >= config.minDifferentTraitValuesNeeded) {
    return true;
  }

  return false;
}

function addToListIfNotPresent(item, list) {
  if (!list.includes(item)) {
    list.push(item);
  }
}

async function pollForReveal(config, isTest = false) {
  log.info('Poll for reveal...');
  const tokenId = (config.pollTokenIds ?? [1234])[0];
  config.data.tokenIdHistory = config.data.tokenIdHistory ?? [];
  while (true) {
    const newTokenURI = await getTokenURIFromEtherscan(tokenId, config.contractAddress, config.etherscanURI, config.tokenURISignatur);
    if (config.debug) {
      log.info('Token URI:', newTokenURI);
    }
    if (newTokenURI && !isValidTokenURI(newTokenURI)) {
      log.info('Invalid tokenURI:', newTokenURI);
    } else if (newTokenURI !== '' && newTokenURI !== createTokenURI(tokenId, config.data.tokenURI)) {
      config.data.tokenURI = convertToTokenURI(tokenId, newTokenURI);
      log.info('Converted tokenURI:', config.data.tokenURI);
      addToListIfNotPresent(newTokenURI, config.data.tokenIdHistory);
    }

    if (config.data.tokenURI) {
      const thisTokenURI = createTokenURI(tokenId, config.data.tokenURI);
      if (config.debug) {
        log.info('Fetch:', thisTokenURI);
      }
      const token = await fetchJson(thisTokenURI, {}, config.debug);
      if (isTokenRevealed(token, config)) {
        log.info('Collection is revealed, tokenURI:');
        log.info('Token:', token);
        config.data.isRevealed = true;
        config.data.revealTime = new Date();
        return true;
      } else {
        if (isTest) {
          return true;
        }
        log.info('.');
        // log.info(`Not revealed: ${config.projectId}`);
      }
    }
    await utilslib.sleep(config.pollForRevealIntervalMsec);
  }
}

function createResults(config) {
  if (config.isTest) {
    return;
  }

  addTokenNoneTrait(config);
  calcGlobalRarity(config);
  calcTokenRarity(config);
  buildWebPage(config);

  if (!config.webPageShown) {
    const path = fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity.html`);
    log.info('Open results page:', path);
    opn(path, { app: 'chrome' });
    config.webPageShown = true;
  }
}

function addTokenNoneTrait(config) {
  for (let trait of Object.keys(config.data.attributes)) {
    if (typeof config.data.attributes[trait] !== 'object') {
      continue;
    }
    for (let token of config.data.tokenList) {
      if (!token.done) {
        continue;
      }
      const item = token.traits.find(o => o.trait_type === trait);
      if (!item) {
        // log.info('Add None:', trait, token.tokenId);
        token.traits.push({ trait_type: trait, value: TRAIT_NONE_VALUE });
        addGlobalTrait({ trait_type: trait, value: TRAIT_NONE_VALUE }, config);
      }
    }
  }
}

function calcGlobalRarity(config) {
  const numTokens = countDone(config);
  let numCategories = 0;
  let numTraitsTotal = 0;
  for (let trait of Object.keys(config.data.attributes)) {
    numCategories++;
    if (typeof config.data.attributes[trait] !== 'object') {
      continue;
    }
    let numTraitsInCategory = 0;
    for (let value of Object.keys(config.data.attributes[trait].values)) {
      numTraitsTotal++;
      numTraitsInCategory++;
      const frequency = config.data.attributes[trait].values[value].count / numTokens;
      config.data.attributes[trait].values[value].frequency = frequency;
      config.data.attributes[trait].values[value].rarity = 1 / frequency;
    }
    config.data.attributes[trait].numTraitsInCategory = numTraitsInCategory;
  }

  config.data.attributes.numTraitsTotal = numTraitsTotal;
  config.data.attributes.numCategories = numCategories;
  config.data.attributes.avgTraitsPerCategory = numTraitsTotal / numCategories;

  for (let trait of Object.keys(config.data.attributes)) {
    if (typeof config.data.attributes[trait] !== 'object') {
      continue;
    }
    for (let value of Object.keys(config.data.attributes[trait].values)) {
      const rarityNormalized =
        config.data.attributes[trait].values[value].rarity *
        (config.data.attributes.avgTraitsPerCategory / config.data.attributes[trait].numTraitsInCategory);
      config.data.attributes[trait].values[value].rarityNormalized = rarityNormalized;
    }
  }
}

function calcTokenRarity(config) {
  let numTokenTraitsTotal = 0;
  let numTokens = 0;
  for (const token of config.data.tokenList) {
    if (!token.done) {
      continue;
    }
    numTokens++;
    let sumRarity = 0;
    let sumRarityNormalized = 0;
    let numTokenTraits = 0;
    for (const attr of token.traits) {
      const trait = attr.trait_type;
      const value = attr.value;
      const obj = config.data.attributes[trait];

      attr.numWithThisTrait = obj.values[value].count;
      attr.frequency = obj.values[value].frequency;
      attr.rarity = obj.values[value].rarity;
      attr.rarityNormalized = config.data.attributes[trait].values[value].rarityNormalized;

      if (trait === TRAIT_COUNT_TYPE) {
        // skip trait counts, not sure how they should influence total rarity!
        // continue;
      }
      if (trait !== TRAIT_COUNT_TYPE && value !== TRAIT_NONE_VALUE) {
        // skip trait counts, not sure how they should influence total rarity!
        // continue;
        numTokenTraits++;
      }

      sumRarity = sumRarity + attr.rarity;
      sumRarityNormalized = sumRarityNormalized + attr.rarityNormalized;
    }

    token.numTraits = numTokenTraits;
    token.rarity = sumRarity;
    token.rarityNormalized = sumRarityNormalized;
    token.hasRarity = token.rarity > 0;

    numTokenTraitsTotal = numTokenTraitsTotal + numTokenTraits;
    config.data.attributes.numTokenTraitsTotal = numTokenTraitsTotal;
    config.data.attributes.avgTraitsPerToken = numTokenTraitsTotal / numTokens;
  }
}

function sortBy1Key(list, key, ascending = true) {
  if (ascending) {
    list.sort((a, b) => (b[key] < a[key]) ? 1 : ((a[key] < b[key]) ? -1 : 0));
  } else {
    list.sort((a, b) => (a[key] < b[key]) ? 1 : ((b[key] < a[key]) ? -1 : 0));
  }
}

function sortBy2Keys(list, key1, key2, ascending1 = true, ascending2 = true) {
  list.sort((a, b) => {
    if (a[key1] === b[key1]) {
      return ascending2 ? a[key2] - b[key2] : b[key2] - a[key2];
    }
    return ascending1 ? (a[key1] > b[key1] ? 1 : -1) : (b[key1] > a[key1] ? 1 : -1);
  });
}

function getTokenListForResult(config) {
  const tokenList = [];
  for (const token of config.data.tokenList) {
    if (!token.hasRarity) {
      continue;
    }
    tokenList.push(token);
  }
  /*
    const tokensByPrice = [...tokensByRarity];
    tokensByPrice.sort((a, b) => {
      if (a.price === b.price) {
        return b.rarity - a.rarity;
      }
      return a.price > b.price ? 1 : -1;
    });
    */

  return tokenList;
}

function recalcRank(tokenList) {
  let rank = 1;
  const numTokens = tokenList.length;
  for (const item of tokenList) {
    item.rank = rank;
    item.rankPct = rank / numTokens;
    rank++;
  }
}

function buildWebPage(config) {
  const tokenList = getTokenListForResult(config);
  const numTokens = countDone(config);
  if (!config.threshold.buynow) {
    const htmlByRarity1 = createHtmlAll(tokenList, config.threshold, config);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity.html`), htmlByRarity1);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-${numTokens}.html`), htmlByRarity1);
  } else {
    const htmlByRarity1 = createHtmlBuynow(tokenList, config.threshold, config);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity.html`), htmlByRarity1);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-${numTokens}.html`), htmlByRarity1);
  }
}

function createSharedHtml(config, title) {
  let html = '';

  const revealTime = typeof config.data.revealTime === 'object' ? config.data.revealTime?.toLocaleString() : config.data.revealTime;
  const fetchedTime = typeof config.data.fetchedTime !== 'string' ? config.data.fetchedTime?.toLocaleString() : config.data.fetchedTime;

  html = html + `
    <html><head><title>${title}</title>
    <script>
        function openLinks(className, first, last) {
            var checkboxes = document.querySelectorAll('input[class="' + className + '"]:checked');
            var links = [];
            checkboxes.forEach((ck) => { links.push(['${BASE_ASSET_URL}/${config.contractAddress}/'+ck.value, 'id_' + ck.value]);});
            console.log(links);
            console.log('---');
            var links2 = links.slice(first-1, last);
            console.log(links2);
            console.log('---');
            links2.forEach((link) => { console.log(link[1]); window.open(link[0], link[1]); });
        }
    </script>
    <style>
        tr { vertical-align: top; }
        td { padding-right: 10px; }
        img.thumb { border: 1px solid black; height:100px; width:100px }
        table, th, td {text-align: left;}
        body, table, th, td {font-size: 18px; }
        .hilite {
          background: lightgray;
        }
        .level1, .level2, .level3, .level4, .level5
        {
            float:left;
            display:inline;
            margin: 10px 20px 10px 10px;
        }
    </style>
    </head><body>
    <span>Revealed at: ${revealTime} &nbsp; Fetched at: ${fetchedTime} &nbsp; Secs to fetch all: ${config.data.fetchDuration ?? '-'}</span><br>
`;

  return html;
}

function createHtmlAll(tokenList, threshold, config) {
  const numTotalTokens = tokenList.length;

  let html = createSharedHtml(config, config.projectId);

  const tokensLevel1 = [];
  sortBy1Key(tokenList, 'rarity', false);
  recalcRank(tokenList);
  for (const item of tokenList) {
    if (item.rankPct <= threshold.level) {
      tokensLevel1.push(item);
    }
  }
  if (tokensLevel1.length) {
    const desc = "All: Vanilla Rarity";
    html = html + createHtmlTables(tokensLevel1, numTotalTokens, 'rarity', 1, threshold.image, desc, config);
  }

  const tokensLevel2 = [];
  sortBy1Key(tokenList, 'rarityNormalized', false);
  recalcRank(tokenList);
  for (const item of tokenList) {
    if (item.rankPct <= threshold.level) {
      tokensLevel2.push(item);
    }
  }
  if (tokensLevel2.length) {
    const desc = "All: Rarity Normalized";
    html = html + createHtmlTables(tokensLevel2, numTotalTokens, 'rarityNormalized', 2, threshold.image, desc, config);
  }

  html = html + `</body>`;

  return html;
}

function createHtmlBuynow(tokenList, threshold, config) {
  const numTotalTokens = tokenList.length;

  let html = createSharedHtml(config, config.projectId);

  sortBy2Keys(tokenList, 'rarityNormalized', 'price', false, true);
  recalcRank(tokenList);

  const tokensLevel1 = [];
  const tokensLevel2 = [];
  const tokensLevel3 = [];
  for (const item of tokenList) {
    if (!config.buynowMap.get(item.tokenId)) {
      continue;
    }

    if (item.rankPct <= threshold.level1 && item.price > 0 && item.price <= threshold.price1) {
      tokensLevel1.push(item);
    } else if (item.rankPct <= threshold.level2 && item.price > 0 && item.price <= threshold.price2) {
      tokensLevel2.push(item);
    } else if (item.rankPct <= threshold.level3 && item.price > 0 && item.price <= threshold.price3) {
      tokensLevel3.push(item);
    }
  }

  const desc1 = `Rank < ${(threshold.level1 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price1} ETH`;
  html = html + createHtmlTables(tokensLevel1, numTotalTokens, 'rarityNormalized', 1, threshold.image1, desc1, config);
  const desc2 = `Rank < ${(threshold.level2 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price2} ETH`;
  html = html + createHtmlTables(tokensLevel2, numTotalTokens, 'rarityNormalized', 2, threshold.image2, desc2, config);
  const desc3 = `Rank < ${(threshold.level3 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price3} ETH`;
  html = html + createHtmlTables(tokensLevel3, numTotalTokens, 'rarityNormalized', 3, threshold.image3, desc3, config);

  html = html + `</body>`;

  return html;
}

function createHtmlTables(tokens, numTotalTokens, scorePropertyName, level, maxImagePct, desc, config) {
  let html = '';

  let buttonsHtml = '';
  let lastButtonVal = 1;
  for (let buttonVal of config.buttons) {
    buttonsHtml = buttonsHtml + `<button onClick="openLinks('checkbox_${level}', ${lastButtonVal}, ${buttonVal})">${buttonVal}</button>&nbsp;&nbsp;`;
    lastButtonVal = buttonVal;
  }

  html = html + `
    <div class="level${level}">
    <span>Calc Supply: <b>${numTotalTokens}</b> ({QTY})</span>&nbsp;&nbsp;&nbsp;
    ${buttonsHtml}
    `;

  html = html + `
    <table>
    <tr style="background: black; color: white"><td colspan="100%">${desc}</td></tr>
    <tr>
        <th>Image</th>
        <th></th>
        <th>Pct</th>
        <th>Price</th>
        <th>Rank&nbsp;&nbsp;</th>
        <th>Score&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
        <th>ID</th>
    </tr>`;

  const doHilite = level === 1;
  for (const item of tokens) {
    const assetLink = `${BASE_ASSET_URL}/${config.contractAddress}/${item.tokenId}`;
    const imageHtml = item.rankPct <= maxImagePct ? `<a target="_blank" href="${assetLink}"><img class="thumb" src="${convertTokenURI(item.image)}"></a>` : '';
    const checkboxHtml = `<input type="checkbox" class="checkbox_${level}" ${doHilite ? 'checked' : ''} value="${item.tokenId}">`;
    const percentHtml = `<a target="id_${item.tokenId}" href="${assetLink}">${(item.rankPct * 100).toFixed(1)} %</a>`;
    const priceHtml = item.buynow && item.price > 0 ? `${(item.price.toFixed(3))} eth` : '';
    const rarityHtml = item[scorePropertyName].toFixed(0);
    const rowClass = doHilite ? 'hilite' : '';
    html = html + `
        <tr class="${rowClass}">
            <td>${imageHtml}</td>
            <td>${checkboxHtml}</td>
            <td>${percentHtml}</td>
            <td>${priceHtml}</td>
            <td><b>${item.rank}</b></td>
            <td>${rarityHtml}</b></td>
            <td>:${item.tokenId}</td>
        </tr>`;
  }
  html = html + `</table></div>`;

  html = html.replace('{QTY}', tokens.length.toString());

  return html;
}

async function processTokenItem(item, config) {
  if (item.done || item.skip) {
    return;
  }
  item.tokenURI = createTokenURI(item.tokenId, config.data.tokenURI);
  const tokenData = await fetchJson(item.tokenURI, item, config.debug);
  if (tokenData?.attributes) {
    addTokenData(tokenData, item, config);
    item.done = true;
  } else if (config.isTest) {
    item.done = true;
  } else if (item.statusCode === 404) {
    item.skip = true;
  } else {
    item.done = false;
  }
  if (item.statusCode) {
    log.debug(item.statusCode);
  }
}

function getTraitGroups(attributes) {
  const traits = attributes.filter((attr) => attr.trait_type && !attr.display_type);
  const specialTraits = attributes.filter((attr) => attr.trait_type && attr.display_type);
  return { traits, specialTraits };
}

function addTokenData(data, item, config) {
  item.image = data.image;
  item.source = data;
  addTokenTraits(data.attributes, item, config);
}

function normalizeTraits(traits) {
  const result = [];
  traits.forEach((trait) => {
    let normalizedValue = trait.value.toString();
    if (['none', 'nothing'].includes(normalizedValue.toLowerCase())) {
      normalizedValue = TRAIT_NONE_VALUE;
    }
    result.push({ ...trait, value: normalizedValue });
  });
  return result;
}

function addTokenTraits(attributes, item, config) {
  const traitGroups = getTraitGroups(attributes);
  item.traits = normalizeTraits(traitGroups.traits);
  item.specialTraits = traitGroups.specialTraits;

  const traitCountTrait = {
    trait_type: TRAIT_COUNT_TYPE,
    value: (item.traits.filter((item) => item.value !== TRAIT_NONE_VALUE).length).toString()
  };
  item.traits.push(traitCountTrait);
  item.traitsCount = item.traits.filter((item) => item.value !== TRAIT_NONE_VALUE).length;

  try {
    for (const attr of item.traits) {
      addGlobalTrait(attr, config);
    }
  } catch (error) {
    log.error('error', attributes, error);
  }
}

function addGlobalTrait(attribute, config) {
  if (attribute.value === '') {
    attribute.value = TRAIT_NONE_VALUE;
  }

  const traitType = attribute.trait_type;
  const traitValue = attribute.value.toString();
  const displayType = attribute.display_type;

  if (!config.data.attributes[traitType]) {
    config.data.attributes[traitType] = {
      count: 0,
      trait: traitType,
      displayType,
      values: {}
    };
  }
  config.data.attributes[traitType].count++;

  if (!config.data.attributes[traitType].values[traitValue]) {
    config.data.attributes[traitType].values[traitValue] = {
      count: 0,
      value: traitValue,
    };
  }
  config.data.attributes[traitType].values[traitValue].count++;
}

async function fetchJson(uri, item, debug = false, method = 'GET') {
  // return curlGet(uri, item);
  try {
    item.statusText = "fetch-begin";
    item.fetchStart = new Date();
    item.tokenURI = uri;
    const response = await fetch(uri, {
      "headers": DEFAULT_FETCH_HEADERS,
      "method": method
    });
    if (response.ok) {
      const jsonData = await response.json();
      item.statusText = "ok";
      item.fetchStop = new Date();
      return jsonData;
    }
    item.statusCode = response.status;
    item.statusText = "error";
    item.fetchStop = new Date();
    return {};
  } catch (error) {
    item.statusText = "error";
    item.fetchStop = new Date();
    return {};
  }
}

async function curlGet(uri, item) {
  try {
    item.statusText = "fetch-begin";
    item.fetchStart = new Date();
    item.tokenURI = uri;

    // const certfile = 'C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert.pem';

    const options = {
      //  port: 443,
      // when using this code in production, for high throughput you should not read
      //   from the filesystem for every call, it can be quite expensive. Instead
      //   consider storing these in memory
      //  cert: fs.readFileSync(path.resolve(fileutil.currentDir(), '../ssh/certificate.crt'), `utf-8`),
      //  key: fs.readFileSync(path.resolve(fileutil.currentDir(), '../ssh/privatekey.key'), 'utf-8'),
      //  passphrase: '',
      // ca: fs.readFileSync(certfile),
      // key: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/privatekey.pem', 'utf-8'),
      // cert: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/certificate.pem', `utf-8`),
      //  cacert: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert.pem', `utf-8`),
      // key: fs.readFileSync(certfile, 'utf-8'),
      // cert: fs.readFileSync(certfile, `utf-8`),

      // in test, if you're working with self-signed certificates
      // rejectUnauthorized: false
      // ^ if you intend to use this in production, please implement your own
      //  `checkServerIdentity` function to check that the certificate is actually
      //  issued by the host you're connecting to.
      //
      //  eg implementation here:
      //  https://nodejs.org/api/https.html#https_https_request_url_options_callback

      // keepAlive: true // switch to true if you're making a lot of calls from this client
      //  redirect: 'follow' // set to `manual` to extract redirect headers, `error` to reject redirect
    };

    // const sslConfiguredAgent = new https.Agent(options);

    const headers = [
      'authority: node1.web3api.com',
      'pragma: no-cache',
      'cache-control: no-cache',
      'sec-ch-ua: "Chromium";v="94", "Google Chrome";v="94", ";Not A Brand";v="99"',
      'sec-ch-ua-mobile: ?0',
      'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
      'sec-ch-ua-platform: "Windows"',
      'content-type: application/json',
      'accept: */*',
      'origin: https://etherscan.io',
      'sec-fetch-site: cross-site',
      'sec-fetch-mode: cors',
      'sec-fetch-dest: empty',
      'referer: https://etherscan.io/',
      'accept-language: sv,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,la;q=0.6,da;q=0.5,de;q=0.4',
    ];
    // const request = {
    // agent: sslConfiguredAgent,
    // agent: false,
    // headers,
    // authority: 'node1.web3api.com',
    // referrerPolicy: 'origin-when-cross-origin',
    // mode: 'cors'
    // };

    const uri2 = "https://www.example.com/";
    const response = await curly.get(uri2, {
      httpHeader: headers,
      sslCert: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert-curl.pem', `utf-8`),
      //sslKey: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/privatekey.key', `utf-8`),
      //sslVerifyPeer: false,
      //sslVerifyHost: false,
      // cainfo: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert-curl.pem', `utf-8`),
    });

    let data;
    try {
      item.statusCode = response.status;
      const jsonData = JSON.parse(response.data);
      item.statusText = "ok";
      item.fetchStop = new Date();
      return jsonData;
    } catch (error) {
      item.statusCode = response.status;
      item.statusText = "error";
      item.fetchStop = new Date();
      return {};
    }
  } catch (error) {
    log.error(JSON.stringify(error));
    item.statusText = "error";
    item.fetchStop = new Date();
    return {};
  }
}

function range(start, stop, step) {
  return Array.from({ length: (stop - start) / step + 1 }, (_, i) => start + (i * step));
}

function convertTokenURI(uri) {
  if (!uri) {
    return uri;
  }
  let normalizedURI = uri;
  if (uri.startsWith(IPFS_URL)) {
    normalizedURI = uri.replace(IPFS_URL, 'https://ipfs.io/ipfs/');
  }
  return normalizedURI;
}

function notifyRevealed(config) {
  if (config.debug || config.isTest) {
    return;
  }
  const path = fileutil.toAbsoluteFilePath('revealed-collection.html');
  const path2 = fileutil.toAbsoluteFilePath('notification.mp3');
  // opn(path, { app: 'firefox' });
  opn(path2, { app: 'firefox' });
}

function debugToFile(config, filename = 'debug.json') {
  if (config.projectId) {
    fileutil.writeRelativeFile(`../config/projects/${config.projectId}/${filename}`, JSON.stringify({ debug: config }, null, 2));
  } else {
    fileutil.writeRelativeFile(`../config/${filename}`, JSON.stringify({ debug: config }, null, 2));
  }
}

function getFromDB(projectId) {
  const path = `../config/projects/${projectId}/db.json`;
  if (fileutil.fileExistsRelPath(path)) {
    const obj = jsonutil.importFile(path);
    if (obj) {
      return obj.data;
    }
  }
  return {};
}

function saveToDB(config) {
  const data = {};
  const tokenList = [];
  for (let i = 0; i < config.data.tokenList.length; i++) {
    if (config.data.tokenList[i].done) {
      tokenList.push(config.data.tokenList[i]);
    }
  }
  data.tokenList = tokenList;
  data.attributes = config.data.attributes;
  data.isRevealed = config.data.isRevealed;
  data.revealTime = config.data.revealTime;
  data.fetchedTime = config.data.fetchedTime;
  data.fetchDuration = config.data.fetchDuration;
  data.tokenURI = config.data.tokenURI;
  data.tokenIdHistory = config.data.tokenIdHistory;

  fileutil.writeRelativeFile(`../config/projects/${config.projectId}/db.json`, JSON.stringify({ data }, null, 2));

  if (config.debug) {
    debugToFile(config);
  }
}

function createTimer() {
  const timer = {
    startDate: new Date(),
  };

  return {
    startDate: timer.startDate,
    getSeconds: () => {
      return ((new Date()).getTime() - timer.startDate.getTime()) / 1000;
    }
  };
}
