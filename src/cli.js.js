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
import { writeRelativeFile } from "./fileutil.js";

const log = createLogger();

const DEFAULT_FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
  "accept": "*/*",
};
const BASE_ASSET_URL = 'https://opensea.io/assets/';
const IPFS_URL = 'ipfs://';
const TRAIT_NONE_VALUE = 'xnonex';

const global = {
  numTokens: 0,
  attributes: {}
};

// RUNTIME ----------------------------------------------------------------------------------

// yarn cli fetchCollection --id waw --buynow

runProgram();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

async function runProgram() {
  console.log('run program');
  program.option('--id <value>', 'Project ID', '');
  program.option('--all', 'Show all items');
  program.parse();
  const options = program.opts();
  const cmd = program.args[0];
  switch (cmd) {
    case 'fetchCollection':
      await fetchCollection(options.id, options.all);
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

function debugToFile(config) {
  fileutil.writeRelativeFile(`../config/projects/${config.projectId}/debug.json`, JSON.stringify({ data: config }, null, 2));
}

function createConfig(projectId, showAll) {
  const baseConfig = jsonutil.importFile(`../config/config.json`);
  const projectConfig = jsonutil.importFile(`../config/projects/${projectId}/config.json`);
  const config = { ...baseConfig, ...projectConfig };

  config.projectId = projectId;
  config.buynowOnly = !showAll;
  config.data = {
    tokenList: [],
    numTokens: 0,
    attributes: {},
  };

  return config;
}

async function fetchCollection(projectId, showAll = false, waitForReveal = true) {
  log.info('Start fetching collection');
  const startDate = new Date();

  const config = createConfig(projectId, showAll);

  prepareTokens(config);

  if (waitForReveal) {
    await pollForReveal(config);
  }

  await fetchCollectionMilestones(config.fetchMilestones, config);

  log.info(`Finished pre-fetching collection: ${countFinished(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);

  fileutil.writeRelativeFile(`../config/projects/${projectId}/debug.json`, JSON.stringify({ data: config }, null, 2));

  createResults(config);

  while (countFinished(config) < config.maxSupply) {
    await utilslib.sleep(1000);
    await fetchCollectionMilestones([], config);
  }

  createResults(config);

  log.info(`Finished fetching collection: ${countFinished(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);
}

async function fetchCollectionMilestones(milestones = [], config) {
  while (true) {
    const numFinishedBefore = countFinished(config);
    const nextTokens = getNextTokens(config, config.tokensBatchSize);
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
  const limit = Math.round(numTokens / config.tokensBatchDivider);
  const numWhenToGetMoreTokens = limit < numTokens ? limit : numTokens;

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

  const data = fileutil.readFile(filePath, 'utf8');

  const tokenIdResult = [...data.matchAll(/\\"tokenId\\":\\"([0-9]+)\\"/gim)];
  const priceResult = [...data.matchAll(/\\"quantityInEth\\":\\"([0-9]+)\\"/gim)];

  if (tokenIdResult.length < 1) {
    throw new Error('BuyNow: Empty result!');
  }

  if (tokenIdResult.length !== priceResult.length) {
    throw new Error('BuyNow: Token ID and Price lists have different length!');
  }

  const tokenList = [];
  const tokenMap = new Map();
  for (let i = 0; i < tokenIdResult.length; i++) {
    const thisId = parseInt(tokenIdResult[i][1]);
    const thisToken = tokenMap.get(thisId);
    if (thisToken) {
      continue;
    }
    const thisPrice = parseInt(priceResult[i][1]) / Math.pow(10, 18);
    const thisItem = { tokenId: thisId, price: thisPrice };
    tokenMap.set(thisId, thisItem);
    tokenList.push(thisItem);
  }

  return tokenList.sort((a, b) => (a.price > b.price) ? 1 : ((b.price > a.price) ? -1 : 0));
}

function getNextTokens(config, qty = 100) {
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
  let count = 0;
  for (var token of config.data.tokenList) {
    if (token.done) {
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

function tokenHasTraits(token, config) {
  if (!token?.attributes) {
    return false;
  }
  let numTraits = 0;
  for (let attr of token?.attributes) {
    if (attr.trait_type) {
      if (attr.display_type) {
        // Dont count other types than normal (string) traits!
        continue;
      }
      numTraits++;
      if (numTraits >= config.minTraitsNeeded) {
        return true;
      }
    }
  }
  return false;
}

async function pollForReveal(config) {
  log.info('Poll for reveal...');
  const tokenId = (config.pollTokenIds ?? [1234])[0];
  while (true) {
    const newTokenURI = await getTokenURIFromEtherscan(tokenId, config.contractAddress, config.etherscanURI, config.tokenURISignatur);
    if (newTokenURI && !isValidTokenURI(newTokenURI)) {
      log.info('Invalid tokenURI:', newTokenURI);
    } else if (newTokenURI !== '' && newTokenURI !== createTokenURI(tokenId, config.tokenURI)) {
      config.tokenURI = convertToTokenURI(tokenId, newTokenURI);
    }

    if (config.tokenURI) {
      const token = await fetchJson(createTokenURI(tokenId, config.tokenURI), {});
      if (tokenHasTraits(token, config)) {
        log.info('Token have traits, collection is revealed!');
        config.isRevealed = true;
        return true;
      } else {
        log.info('Token have NO traits, collection is NOT revealed!');
      }
    }
    await utilslib.sleep(config.pollForRevealIntervalMsec);
  }
}

function createResults(config) {
  debugToFile(config);
  calcTraits(config);
  calcTokenRarity(config);
  buildWebPage(config);
}

function calcTraits(config) {
  calcNoneTraits(config);
  calcTraitsStats(config);
}

function calcNoneTraits(config) {
  for (let trait of Object.keys(config.data.attributes)) {
    if (typeof config.data.attributes[trait] !== 'object') {
      continue;
    }
    for (let token of config.data.tokenList) {
      if (!token.done) {
        continue;
      }
      // console.log(token.data);
      const item = token.traits.find(o => o.trait_type === trait);
      if (!item) {
        // log.info('Add None:', trait, token.tokenId);
        token.traits.push({ trait_type: trait, value: TRAIT_NONE_VALUE });
        addTrait(trait, TRAIT_NONE_VALUE, '', config);
      }
    }
  }
}

function calcTraitsStats(config) {
  let numTraits = 0;
  for (let trait of Object.keys(config.data.attributes)) {
    numTraits++;
    if (typeof config.data.attributes[trait] !== 'object') {
      continue;
    }
    for (let value of Object.keys(config.data.attributes[trait].values)) {
      const rarity = config.data.attributes[trait].values[value].count / config.data.numTokens;
      config.data.attributes[trait].values[value].rarity = rarity;
      config.data.attributes[trait].values[value].rarityScore = 1 / rarity;
    }
  }
  config.data.attributes.numTraits = numTraits;
}

function calcTokenRarity(config) {
  for (const token of config.data.tokenList) {
    if (!token.done) {
      continue;
    }
    for (const attr of token.traits) {
      // console.log('attr', attr);
      const trait = attr.trait_type;
      const value = attr.value;
      attr.rarity = config.data.attributes[trait].values[value].rarity;
      attr.rarityScore = config.data.attributes[trait].values[value].rarityScore;
    }
  }

  for (const token of config.data.tokenList) {
    if (!token.done) {
      continue;
    }
    let rarityScore = 0;
    let rarityWithNoneScore = 0;
    for (const attr of token.traits) {
      rarityWithNoneScore = rarityWithNoneScore + attr.rarityScore;
      if (attr.value !== TRAIT_NONE_VALUE) {
        rarityScore = rarityScore + attr.rarityScore;
      }
    }
    token.rarityScore = rarityScore;
    token.rarityWithNoneScore = rarityWithNoneScore;
    token.hasRarity = true;
  }
}

function getTokenListsForResult(config) {
  const tokensByRarity = [];
  for (const token of config.data.tokenList) {
    if (!token.hasRarity) {
      continue;
    }
    tokensByRarity.push(token);
  }
  tokensByRarity.sort((a, b) => (a.rarityScore < b.rarityScore) ? 1 : ((b.rarityScore < a.rarityScore) ? -1 : 0));

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

function createSharedHtml(config) {
  let html = '';

  html = html + `
    <html><head>
    <script>
        function openLinks(className, first, last) {
            var checkboxes = document.querySelectorAll('input[class="' + className + '"]:checked');
            var links = [];
            checkboxes.forEach((ck) => { links.push(['${BASE_ASSET_URL}/${config.contractAddress}/'+ck.value, 'id_' + ck.value]);});
            links.slice(first-1, last-1).forEach((link) => { console.log(link[1]); window.open(link[0], link[1]); });
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
        .level1, .level2, .level3
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

  let html = createSharedHtml(config);

  const tokensLevel1 = [];
  for (const item of tokenLists.tokensByRarity) {
    if (item.percent <= threshold.level) {
      tokensLevel1.push(item);
    }
  }
  if (tokensLevel1.length) {
    const desc = "All, rarity without None";
    html = html + createHtmlTables(tokensLevel1, numTotalTokens, 'rarityScore', 1, threshold.image, desc, config);
  }

  const tokensLevel2 = [];
  tokenLists.tokensByRarity.sort((a, b) => (a.rarityWithNoneScore < b.rarityWithNoneScore) ? 1 : ((b.rarityWithNoneScore < a.rarityWithNoneScore) ? -1 : 0));
  for (const item of tokenLists.tokensByRarity) {
    if (item.percent <= threshold.level) {
      tokensLevel2.push(item);
    }
  }
  if (tokensLevel2.length) {
    const desc = "All, rarity with None";
    html = html + createHtmlTables(tokensLevel2, numTotalTokens, 'rarityWithNoneScore', 2, threshold.image, desc, config);
  }

  html = html + `</body>`;

  return html;
}

function createHtmlBuynow(tokenLists, threshold, config) {
  const numTotalTokens = tokenLists.tokensByRarity.length;

  let html = createSharedHtml(config);

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

  html = html + `
    <div class="level${level}">
    <span>Calc Supply: <b>${numTotalTokens}</b> ({QTY})</span>
    <button onClick="openLinks('checkbox_${level}', 1, 3)">1-3</button>
    <button onClick="openLinks('checkbox_${level}', 4, 6)">4-6</button>`;

  html = html + `
    <table>
    <tr style="background: black; color: white"><td colspan="100%" style=" text-align: center">${desc}</td></tr>
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
    const rarityScoreHtml = Math.round(item[scorePropertyName]);
    const rowClass = doHilite ? 'hilite' : '';
    html = html + `
        <tr class="${rowClass}">
            <td>${imageHtml}</td>
            <td>${checkboxHtml}</td>
            <td>${percentHtml}</td>
            <td>${priceHtml}</td>
            <td><b>${item.rank}</b></td>
            <td>${rarityScoreHtml}</b></td>
            <td>${item.tokenId}</td>
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
  const tokenData = await fetchJson(createTokenURI(item.tokenId, config.tokenURI), item);
  if (tokenData?.attributes) {
    addTokenData(tokenData, item, config);
    item.done = true;
  } else {
    item.done = false;
  }
}

function getValidTraits(attributes) {
  const result = attributes.filter((attr) => attr.trait_type && !attr.display_type);
  log.verbose('getValidTraits', attributes, result);
  return result;
}

function addTokenData(data, item, config) {
  config.data.numTokens++;
  item.image = data.image;
  item.data = data;
  item.traits = getValidTraits(data.attributes);
  try {
    for (const attr of item.traits) {
      addTrait(attr.trait_type, attr.value, attr.display_type, config);
    }
  } catch (error) {
    log.error('error', data, error);
  }
}

function addTrait(trait, value, displayType, config) {
  if (!config.data.attributes[trait]) {
    config.data.attributes[trait] = {
      count: 0,
      trait,
      displayType,
      values: {}
    };
  }
  config.data.attributes[trait].count++;

  if (!config.data.attributes[trait].values[value]) {
    config.data.attributes[trait].values[value] = {
      count: 0,
      value,
    };
  }
  config.data.attributes[trait].values[value].count++;
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
