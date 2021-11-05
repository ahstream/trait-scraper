/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import program from 'commander';
import fetch from 'node-fetch';

import { createLogger } from './lib/loggerlib.js';

import { fetchCollection, pollCollections } from './collection.js';
import { testCollection } from './test.js';
import { analyzeCollection } from './analyze.js';
import { getBuynow } from './opensea.js';
import { debugToFile } from './config.js';

const log = createLogger();

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
  program.option('--id <value>', 'Project ID', '');
  program.option('--debug', 'Write debug info');
  program.option('--all', 'Output all items instead of only buynow items');
  program.option('--nodb', 'Do not get data from DB');
  program.option('--silent', 'Do not notify events');
  program.option('--sample', 'Use test samples');
  program.option('--getbuynow', 'Get new buynow tokens from OpenSea');
  program.option('--value <value>', 'Arbitrary value');
  program.option('--contract <value>', 'Contract address');
  program.parse();
  const options = program.opts();
  const cmd = program.args[0];
  const projectId = program.args[1];
  log.info('options', options);
  switch (cmd) {
    case 'analyze':
      await analyzeCollection({ projectId });
      break;
    case 'fetch':
      console.log(projectId);
      await fetchCollection({
        projectId,
        all: options.all,
        debug: options.debug,
        fromDB: !options.nodb,
        silent: options.silent,
        getbuynow: options.getbuynow,
      });
      break;
    case 'poll':
      await pollCollections({
        projectId,
        all: options.all,
        debug: options.debug,
        fromDB: !options.nodb,
        silent: options.silent
      });
      break;
    case 'test':
      await testCollection({ projectId, doSample: options.sample, debug: options.debug });
      break;
    case 'assets':
      const result = await getBuynow(options.contract);
      debugToFile(result, 'getBuynow.json');
      // console.log(result);
      break;
    case 'getchunks':
      const result2 = await getBuynow(options.contract, options.value);
      // console.log(result2[0].length);
      // console.log(result2[1].length);
      debugToFile(result2, 'getChunks2.json');
      // console.log(result);
      break;
    default:
      log.error(`Unknown command: ${cmd}`);
  }
  log.info('Done!');
  // process.exit(0);
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
