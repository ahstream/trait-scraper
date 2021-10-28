/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import program from 'commander';
import fetch from 'node-fetch';

import * as utilslib from './lib/utilslib.js';
import * as jsonutil from './jsonutil.js';
import { createLogger } from './lib/loggerlib.js';

import { getTokenURIFromEtherscan, isValidTokenURI } from "./tokenURI.js";
import fs from "fs";
import * as fileutil from "./fileutil.js";

import opn from 'opn';
import { toAbsoluteFilePath } from "./fileutil.js";

import child_process from 'child_process';

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
  console.log('run program');
  program.option('--id <value>', 'Project ID', '');
  program.option('--debug', 'Write debug info');
  program.parse();
  const options = program.opts();
  const cmd = program.args[0];
  switch (cmd) {
    case 'fetch':
      await fetchCollection(options.id, options.debug);
      break;
    case 'poll':
      await pollCollections(options.debug);
      break;
    case 'test':
      await testCollection(options.id, options.debug);
      break;
    case 'buynow':
      const result = await getBuynowList(options.id);
      console.log('result.length', result.length);
      console.log('result[0]', result[0]);
      break;
    default:
      log.error(`Unknown command: ${cmd}`);
  }
  console.log('Done!');
}

function createConfig(projectId, debug) {
  const baseConfig = jsonutil.importFile(`../config/config.json`);
  let projectConfig = {};
  if (projectId) {
    projectConfig = jsonutil.importFile(`../config/projects/${projectId}/config.json`);
  }
  const config = { ...baseConfig, ...projectConfig };

  config.projectId = projectId;
  config.debug = debug;
  config.data = {
    tokenList: [],
    numTokens: 0,
    attributes: {},
  };

  return config;
}

async function pollCollections(debug = false) {
  const config = createConfig(null, debug);
  config.projects.forEach(projectId => {
    console.log(projectId);
    fetchCollection(projectId, debug);
  });
}

async function testCollection(projectId, debug = false) {
  const config = createConfig(projectId, debug);

  const results = {};
  for (const batchSize of config.testParameters.nextTokensBatchSize) {
    const batchKey = batchSize.toString();
    if (!results[batchKey]) {
      results[batchKey] = [];
    }
    for (const finishedPct of config.testParameters.nextTokensFetchNewWhenFinishedPct) {
      const newConfig = createConfig(projectId, debug);
      newConfig.nextTokensBatchSize = batchSize;
      newConfig.nextTokensFetchNewWhenFinishedPct = finishedPct;
      newConfig.isTest = true;
      newConfig.threshold.buynow = true;
      const timer = createTimer();
      await testFetchCollection(projectId, newConfig);
      results[batchKey].push([finishedPct, timer.getSeconds()]);
      console.log('timer:', timer.getSeconds());
    }
  }
  console.log('Results:', results);
}

async function testFetchCollection(projectId, config) {
  log.info('Start testing collection');
  const startDate = new Date();

  prepareTokens(config);

  await pollForReveal(config, true);
  await fetchCollectionMilestones(config.fetchMilestones, config);

  log.info(`Finished pre-fetching collection: ${countFinished(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);

  createResults(config);

  if (config.debug) {
    debugToFile(config);
  }

  log.info(`Finished testing collection: ${countFinished(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);
}

async function fetchCollection(projectId, debug = false, waitForReveal = true) {
  log.info(`Start fetching collection ${projectId}`);
  const timer = createTimer();

  const config = createConfig(projectId, debug);

  prepareTokens(config);

  if (waitForReveal) {
    await pollForReveal(config);
    if (!config.debug && !config.isTest) {
      notifyRevealed();
    }
  }

  await fetchCollectionMilestones(config.fetchMilestones, config);

  log.info(`Finished pre-fetching collection ${projectId}, ${countFinished(config)} tokens`);
  log.info(`Duration: ${timer.getSeconds()} secs`);

  createResults(config);

  let numFinalTries = 0;
  while (countFinished(config) < config.maxSupply) {
    numFinalTries++;
    if (numFinalTries % 5 === 0) {
      createResults(config);
    }
    const x = config.data.tokenList.filter((token) => token.isDone === false);
    await utilslib.sleep(1000);
    await fetchCollectionMilestones([], config);
  }

  createResults(config);

  log.info(`Finished fetching collection ${projectId}, ${countFinished(config)} tokens`);
  log.info(`Duration: ${timer.getSeconds()} secs`);
}

async function fetchCollectionMilestones(milestones = [], config) {
  while (true) {
    const numFinishedBefore = countFinished(config);
    const nextTokens = getNextTokens(config, config.nextTokensBatchSize);

    if (nextTokens.length < 1) {
      break;
    }
    await fetchCollectionTokens(nextTokens, config);

    const numFinished = countFinished(config);
    const numFinishedInThisRun = numFinished - numFinishedBefore;
    log.info(`Finished: ${numFinishedBefore} + ${numFinishedInThisRun} = ${numFinished}`);

    if (milestones.length > 0 && numFinished >= milestones[0]) {
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
    await utilslib.sleep(5);
    while (true) {
      let numFinished = 0;
      for (const item of tokenList) {
        numFinished = numFinished + (item.done || item.status === 'error' ? 1 : 0);
      }
      if (numFinished >= numWhenToGetMoreTokens) {
        return;
      } else {
        // do nothing
      }
      await utilslib.sleep(5);
    }
  }
}

function prepareTokens(config) {
  const fromId = config.firstTokenId;
  const toId = config.maxSupply;

  prepareBuynow(config);

  log.info('Num of BuyNow tokens:', config.buynowList.length);
  config.buynowList.forEach((item) => {
    const newItem = {
      tokenId: item.tokenId,
      price: item.price,
      buynow: true,
    };
    config.data.tokenList.push(newItem);
  });
  const source = range(fromId, toId, 1);
  source.forEach((id) => {
    if (config.buynowMap.get(id)) {
      return;
    }
    const newItem = {
      tokenId: id,
      price: 0,
      buynow: false,
    };
    config.data.tokenList.push(newItem);
  });
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
    if (count > qty) {
      break;
    }
    if (token.done) {
      continue;
    }
    if (token.status === 'fetch-begin') {
      const retryDeadline = new Date(token.fetchStart.getTime() + config.fetchRequestLifetimeMsec);
      if (retryDeadline < now) {
        result.push(token);
        count++;
        continue;
      }
    }
    if (token.status === undefined || token.status === 'error') {
      result.push(token);
      count++;
    }
  }
  return result;
}

function countFinished(config) {
  let numDone = 0;
  let numNotDone = 0;
  for (var token of config.data.tokenList) {
    if (token.done) {
      numDone++;
    } else {
      numNotDone++;
    }
  }
  return numDone;
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

  return utilslib.getRandomInteger(1, 100) > 70;

  return false;
}

async function pollForReveal(config, isTest = false) {
  log.info('Poll for reveal...');
  const tokenId = (config.pollTokenIds ?? [1234])[0];
  while (true) {
    const newTokenURI = await getTokenURIFromEtherscan(tokenId, config.contractAddress, config.etherscanURI, config.tokenURISignatur);
    if (config.debug) {
      log.info('Token URI:', newTokenURI);
    }
    if (newTokenURI && !isValidTokenURI(newTokenURI)) {
      log.info('Invalid tokenURI:', newTokenURI);
    } else if (newTokenURI !== '' && newTokenURI !== createTokenURI(tokenId, config.tokenURI)) {
      config.tokenURI = convertToTokenURI(tokenId, newTokenURI);
    }

    if (config.tokenURI) {
      const token = await fetchJson(createTokenURI(tokenId, config.tokenURI), {});
      if (isTokenRevealed(token, config)) {
        log.info('Token is revealed!');
        config.isRevealed = true;
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
    const path = fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-1.html`);
    log.info('Open results page:', path);
    opn(path, { app: 'chrome' });
    config.webPageShown = true;
  }
  if (config.debug) {
    debugToFile(config);
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
  let numCategories = 0;
  let numTotalTraits = 0;
  for (let trait of Object.keys(config.data.attributes)) {
    numCategories++;
    if (typeof config.data.attributes[trait] !== 'object') {
      continue;
    }
    let numTraitsInCategory = 0;
    for (let value of Object.keys(config.data.attributes[trait].values)) {
      numTotalTraits++;
      numTraitsInCategory++;
      const rarity = config.data.attributes[trait].values[value].count / config.data.numTokens;
      config.data.attributes[trait].values[value].rarity = rarity;
      config.data.attributes[trait].values[value].rarityScore = 1 / rarity;
    }
    config.data.attributes[trait].numTraitsInCategory = numTraitsInCategory;
  }
  config.data.attributes.numTotalTraits = numTotalTraits;
  config.data.attributes.numCategories = numCategories;
  config.data.attributes.avgTraitsPerCategory = numTotalTraits / numCategories;
}

function foo(config) {
  /*
  vanilla rarity score and multiply that by the average number of traits per category divided by the
  number of traits in that category, so categories with fewer traits will have generally higher rarity scores.
  config.data.attributes.avgTraitsPerCategory = numTotalTraits / numCategories;
    trait.numTraitsInCategory = numTraitsInCategory;
    */
}

function calcTokenRarity(config) {
  for (const token of config.data.tokenList) {
    if (!token.done) {
      continue;
    }
    let sumRarityScore = 0;
    let sumRarityScoreWithNone = 0;
    let sumRarityScoreWithTraitCount = 0;
    let sumRarityScoreWithAll = 0;
    let sumRarityScoreNormalized = 0;
    for (const attr of token.traits) {
      const trait = attr.trait_type;
      const value = attr.value;
      attr.numWithThisTrait = config.data.attributes[trait].values[value].count;
      attr.rarity = config.data.attributes[trait].values[value].rarity;
      attr.rarityScore = config.data.attributes[trait].values[value].rarityScore;
      attr.rarityScoreNormalized = attr.rarityScore * config.data.attributes.avgTraitsPerCategory / config.data.attributes[trait].numTraitsInCategory;

      if (attr.value === TRAIT_NONE_VALUE) {
        sumRarityScoreWithNone = sumRarityScoreWithNone + attr.rarityScore;
        sumRarityScoreWithAll = sumRarityScoreWithAll + attr.rarityScore;
      } else if (attr.trait_type === TRAIT_COUNT_TYPE) {
        sumRarityScoreWithTraitCount = sumRarityScoreWithTraitCount + attr.rarityScore;
        sumRarityScoreWithAll = sumRarityScoreWithAll + attr.rarityScore;
      } else {
        sumRarityScore = sumRarityScore + attr.rarityScore;
        sumRarityScoreWithNone = sumRarityScoreWithNone + attr.rarityScore;
        sumRarityScoreWithTraitCount = sumRarityScoreWithTraitCount + attr.rarityScore;
        sumRarityScoreWithAll = sumRarityScoreWithAll + attr.rarityScore;
        sumRarityScoreNormalized = sumRarityScoreNormalized + attr.rarityScoreNormalized;
      }
    }
    /*
    vanilla rarity score and multiply that by the average number of traits per category divided by the
    number of traits in that category, so categories with fewer traits will have generally higher rarity scores.
    config.data.attributes.avgTraitsPerCategory = numTotalTraits / numCategories;
      trait.numTraitsInCategory = numTraitsInCategory;
      */

    token.rarityScore = sumRarityScore;
    token.rarityScoreWithNone = sumRarityScoreWithNone;
    token.rarityScoreWithTraitCount = sumRarityScoreWithTraitCount;
    token.rarityScoreWithAll = sumRarityScoreWithAll;
    token.rarityScoreNormalized = sumRarityScoreNormalized;
    token.hasRarity = token.rarityScore > 0;
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

function getTokenListsForResult(config) {
  const tokensByRarity = [];
  for (const token of config.data.tokenList) {
    if (!token.hasRarity) {
      continue;
    }
    tokensByRarity.push(token);
  }

  // sortBy1Key(tokensByRarity, 'rarityScore', false);
  sortBy2Keys(tokensByRarity, 'rarityScore', 'price', false, true);

  const numIncludedTokens = tokensByRarity.length;

  let rank = 1;
  for (let i = 0; i < tokensByRarity.length; i++) {
    tokensByRarity[i].rank = rank;
    tokensByRarity[i].percent = rank / numIncludedTokens;
    rank++;
  }

  const tokensByPrice = [...tokensByRarity];
  tokensByPrice.sort((a, b) => {
    if (a.price === b.price) {
      return b.rarityScore - a.rarityScore;
    }
    return a.price > b.price ? 1 : -1;
  });

  return {
    tokensByRarity,
    tokensByPrice
  };
}

function buildWebPage(config) {
  const tokenLists = getTokenListsForResult(config);
  if (!config.threshold.buynow) {
    const htmlByRarity1 = createHtmlAll(tokenLists, config.threshold, config);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-1.html`), htmlByRarity1);
  } else {
    const htmlByRarity1 = createHtmlBuynow(tokenLists, config.threshold, config);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-1.html`), htmlByRarity1);
  }
}

function createSharedHtml(config, title) {
  let html = '';

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
    </head><body>`;

  return html;
}

function createHtmlAll(tokenLists, threshold, config) {
  const numTotalTokens = tokenLists.tokensByRarity.length;

  let html = createSharedHtml(config, config.projectId);

  const tokensLevel1 = [];
  for (const item of tokenLists.tokensByRarity) {
    if (item.percent <= threshold.level) {
      tokensLevel1.push(item);
    }
  }
  if (tokensLevel1.length) {
    const desc = "All: Rarity Score";
    html = html + createHtmlTables(tokensLevel1, numTotalTokens, 'rarityScore', 1, threshold.image, desc, config);
  }

  /*
  const tokensLevel2 = [];
  tokenLists.tokensByRarity.sort((a, b) => (a.rarityScoreWithNone < b.rarityScoreWithNone) ? 1 : ((b.rarityScoreWithNone < a.rarityScoreWithNone) ? -1 : 0));
  for (const item of tokenLists.tokensByRarity) {
    if (item.percent <= threshold.level) {
      tokensLevel2.push(item);
    }
  }
  if (tokensLevel2.length) {
    const desc = "All: Rarity Score + None";
    html = html + createHtmlTables(tokensLevel2, numTotalTokens, 'rarityScoreWithNone', 2, threshold.image, desc, config);
  }
  */

  const tokensLevel3 = [];
  tokenLists.tokensByRarity.sort((a, b) => (a.rarityScoreWithTraitCount < b.rarityScoreWithTraitCount) ? 1 : ((b.rarityScoreWithTraitCount < a.rarityScoreWithTraitCount) ? -1 : 0));
  for (const item of tokenLists.tokensByRarity) {
    if (item.percent <= threshold.level) {
      tokensLevel3.push(item);
    }
  }
  if (tokensLevel3.length) {
    const desc = "All: Rarity Score + Trait Count";
    html = html + createHtmlTables(tokensLevel3, numTotalTokens, 'rarityScoreWithTraitCount', 3, threshold.image, desc, config);
  }

  const tokensLevel4 = [];
  tokenLists.tokensByRarity.sort((a, b) => (a.rarityScoreWithAll < b.rarityScoreWithAll) ? 1 : ((b.rarityScoreWithAll < a.rarityScoreWithAll) ? -1 : 0));
  for (const item of tokenLists.tokensByRarity) {
    if (item.percent <= threshold.level) {
      tokensLevel4.push(item);
    }
  }
  if (tokensLevel4.length) {
    const desc = "All: Rarity Score + None + Trait Count";
    html = html + createHtmlTables(tokensLevel4, numTotalTokens, 'rarityScoreWithAll', 4, threshold.image, desc, config);
  }

  const tokensLevel5 = [];
  tokenLists.tokensByRarity.sort((a, b) => (a.rarityScoreNormalized < b.rarityScoreNormalized) ? 1 : ((b.rarityScoreNormalized < a.rarityScoreNormalized) ? -1 : 0));
  for (const item of tokenLists.tokensByRarity) {
    if (item.percent <= threshold.level) {
      tokensLevel5.push(item);
    }
  }
  if (tokensLevel5.length) {
    const desc = "All: Rarity Score Normalized";
    html = html + createHtmlTables(tokensLevel5, numTotalTokens, 'rarityScoreNormalized', 5, threshold.image, desc, config);
  }

  html = html + `</body>`;

  return html;
}

function createHtmlBuynow(tokenLists, threshold, config) {
  const numTotalTokens = tokenLists.tokensByRarity.length;

  let html = createSharedHtml(config, config.projectId);

  const tokensLevel1 = [];
  const tokensLevel2 = [];
  const tokensLevel3 = [];
  for (const item of tokenLists.tokensByRarity) {
    if (!config.buynowMap.get(item.tokenId)) {
      continue;
    } else if (item.percent <= threshold.level1 && item.price > 0 && item.price <= threshold.price1) {
      tokensLevel1.push(item);
    } else if (item.percent <= threshold.level2 && item.price > 0 && item.price <= threshold.price2) {
      tokensLevel2.push(item);
    } else if (item.percent <= threshold.level3 && item.price > 0 && item.price <= threshold.price3) {
      tokensLevel3.push(item);
    }
  }

  if (tokensLevel1.length) {
    const desc = `Rank < ${(threshold.level1 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price1} ETH`;
    html = html + createHtmlTables(tokensLevel1, numTotalTokens, 'rarityScore', 1, threshold.image1, desc, config);
  }
  if (tokensLevel2.length) {
    const desc = `Rank < ${(threshold.level2 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price2} ETH`;
    html = html + createHtmlTables(tokensLevel2, numTotalTokens, 'rarityScore', 2, threshold.image2, desc, config);
  }
  if (tokensLevel3.length) {
    const desc = `Rank < ${(threshold.level3 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price3} ETH`;
    html = html + createHtmlTables(tokensLevel3, numTotalTokens, 'rarityScore', 3, threshold.image3, desc, config);
  }

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
    const imageHtml = item.percent <= maxImagePct ? `<a target="_blank" href="${assetLink}"><img class="thumb" src="${convertTokenURI(item.image)}"></a>` : '';
    const checkboxHtml = `<input type="checkbox" class="checkbox_${level}" ${doHilite ? 'checked' : ''} value="${item.tokenId}">`;
    const percentHtml = `<a target="id_${item.tokenId}" href="${assetLink}">${(item.percent * 100).toFixed(1)} %</a>`;
    const priceHtml = item.buynow && item.price > 0 ? `${(item.price)} eth` : '';
    // const rarityScoreHtml = Math.round(item[scorePropertyName]);
    const rarityScoreHtml = item[scorePropertyName].toFixed(0);
    const rowClass = doHilite ? 'hilite' : '';
    html = html + `
        <tr class="${rowClass}">
            <td>${imageHtml}</td>
            <td>${checkboxHtml}</td>
            <td>${percentHtml}</td>
            <td>${priceHtml}</td>
            <td><b>${item.rank}</b></td>
            <td>${rarityScoreHtml}</b></td>
            <td>:${item.tokenId}</td>
        </tr>`;
  }
  html = html + `</table></div>`;

  html = html.replace('{QTY}', tokens.length.toString());

  return html;
}

async function processTokenItem(item, config) {
  if (item.done) {
    return;
  }
  item.tokenURI = createTokenURI(item.tokenId, config.tokenURI);
  const tokenData = await fetchJson(item.tokenURI, item);
  if (tokenData?.attributes) {
    addTokenData(tokenData, item, config);
    item.done = true;
  } else if (config.isTest) {
    item.done = true;
  } else {
    item.done = false;
  }
}

function getTraitGroups(attributes) {
  const traits = attributes.filter((attr) => attr.trait_type && !attr.display_type);
  const specialTraits = attributes.filter((attr) => attr.trait_type && attr.display_type);
  return { traits, specialTraits };
}

function addTokenData(data, item, config) {
  config.data.numTokens++;
  item.image = data.image;
  item.source = data;
  addTokenTraits(data.attributes, item, config);
}

function normalizeTraits(traits) {
  const result = [];
  traits.forEach((trait) => {
    let normalizedValue = trait.value;
    const thisValue = trait.value.toLowerCase();
    if (['none', 'nothing'].includes(thisValue)) {
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
  const traitValue = attribute.value;
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

async function fetchJson(uri, item, method = 'GET') {
  try {
    item.status = "fetch-begin";
    item.fetchStart = new Date();
    item.tokenURI = uri;
    const response = await fetch(uri, {
      "headers": DEFAULT_FETCH_HEADERS,
      "method": method
    });
    if (response.ok) {
      const jsonData = await response.json();
      item.status = "ok";
      item.fetchStop = new Date();
      return jsonData;
    }
    item.status = "error";
    item.fetchStop = new Date();
    return {};
  } catch (error) {
    item.status = "error";
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

function notifyRevealed() {
  const path = fileutil.toAbsoluteFilePath('revealed-collection.html');
  const path2 = fileutil.toAbsoluteFilePath('notification.mp3');
  // opn(path, { app: 'firefox' });
  opn(path2, { app: 'firefox' });
}

function debugToFile(config) {
  fileutil.writeRelativeFile(`../config/projects/${config.projectId}/debug.json`, JSON.stringify({ data: config }, null, 2));
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
