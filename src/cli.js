/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import program from 'commander';
import fetch from 'node-fetch';

import { reveal } from './collection.js';
import { getConfig } from './config.js';
import { get } from './fetch.js';
import { log } from "./logUtils.js";
import { range } from './miscUtils.js';
import { getAssets } from './opensea.js';
import { cleanCache, cleanHtml } from './tools.js';

const DEFAULT_FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36'
};

const IPFS_URL = 'ipfs://';

// RUNTIME ----------------------------------------------------------------------------------

// yarn cli fetch --id waw --debug
// yarn cli test --id waw --debug

runProgram();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

async function runProgram() {
  log.info('run program');

  // program.option('--id <value>', 'Project ID', '');
  program.option('--debug', 'Write debug info');
  program.option('--all', 'Output all items instead of only buynow items');
  program.option('--nodb', 'Do not get data from DB');
  program.option('--silent', 'Do not notify events');
  program.option('--sample', 'Use test samples');
  program.option('--skiptokencache', '');
  program.option('--skipopensea', '');
  program.option('--value <value>', 'Arbitrary value');
  program.option('--id <value>', 'Token Id');
  program.option('--contract <value>', 'Contract address');
  program.parse();

  const options = program.opts();
  const cmd = program.args[0];
  const projectId = program.args[1];

  log.info(`cmd: ${cmd}, projectId: ${projectId}, options: ${options}`);
  log.info('------------------------------------------------');

  switch (cmd) {
    case 'reveal':
      await reveal(projectId, {
        skipTokenCache: options.skiptokencache,
        skipOpensea: options.skipopensea,
        silent: options.silent,
      });
      break;
    case 'foo':
      foo();
      break;
    case 'cleanhtml':
      cleanHtml(getConfig(null, null));
      break;
    case 'cleancache':
      cleanCache(getConfig(null, null));
      break;
    case 'analyze':
      await analyzeCollection({ projectId });
      break;
    case 'fetch':
      await fetchCollections(projectId, {
        forceTokenFetch: options.forcetokenfetch,
        skipOpensea: options.skipopensea,
        silent: options.silent,
        forceBuynow: options.forcebuynow
      });
      break;
    case 'poll':
      await pollCollections(projectId, {
        forceTokenFetch: options.forcetokenfetch,
        skipOpensea: options.skipopensea,
        silent: options.silent,
      });
      break;
    case 'ov':
      await analyzeOV(projectId, {
        forceTokenFetch: false,
        skipOpensea: true,
        silent: true,
      });
      break;
    case 'test':
      await testCollection({ projectId, doSample: options.sample, debug: options.debug });
      break;
    case 'assets':
      const result = await getAssets(options);
    case 'fetchtokendata':
      break;
    case 'createstartpage':
      createStartPage(true);
      break;
    /*
  case 'getassets':
    const result2 = await getAssets(config);
    debugToFile(result2, 'getAssets.json');
    debugToFile(config, 'config2.json');
    break;
  case 'pollassets':
    const result3 = await pollAssets(config, (obj) => {
      return true;
    });
    debugToFile(config, 'config3.json');
    break;

     */
    default:
      log.error(`Unknown command: ${cmd}`);
  }
  // process.exit(0);
}

async function foo() {
  const baseUrl = 'https://strongapeclub.com/SAC_metadata/';
  const results = [];

  // 3410
  // range(1, 3410, 1).forEach(async (id) => {
  const arr = range(501, 3410, 1);
  for (let id of arr) {
    const url = `${baseUrl}${id}.png`;
    const result = await doFoo(url);
    if (result.ok || result.status === 200 || result.status === '200') {
      console.log(url, result);
    } else if (result.status === 404 || result.status === '404') {
      console.log('404', id);
    } else {
      console.log('Re-schedule id:', id, result);
      // setTimeout(() => doFoo(url), 1000);
    }
  }
}

async function doFoo(url) {
  return await get(url, { timeout: 10000 }, 'blob');
}

function getNextTokens(config, qty) {
  const now = new Date();
  const result = [];
  let count = 0;

  for (var token of config.data.collection.tokens) {
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

async function fetchJson(uri, item, debug = false, method = 'GET') {
  try {
    item.statusText = "fetch-begin";
    item.fetchStart = new Date();
    item.tokenURI = uri;
    // console.log('fetchJson', uri);
    log.debug('fetchJson', uri);
    const response = await fetch(uri, {
      "headers": DEFAULT_FETCH_HEADERS,
      "method": method
    });
    if (response.ok) {
      log.debug('ok');
      const jsonData = await response.json();
      item.statusText = "ok";
      item.fetchStop = new Date();
      return jsonData;
    }
    log.debug('error', response.status);
    item.statusCode = response.status;
    item.statusText = "error";
    item.fetchStop = new Date();
    return {};
  } catch (error) {
    log.debug('error', error);
    item.statusText = "error";
    item.fetchStop = new Date();
    return {};
  }
}
