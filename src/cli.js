/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import program from 'commander';
import fetch from 'node-fetch';
import https from 'https';

import * as miscutil from './miscutil.js';
import * as jsonutil from './jsonutil.js';
import { fetchTokens } from './fetchTokens.js';
import { createLogger } from './lib/loggerlib.js';

import { getTokenURIFromEtherscan, isValidTokenURI } from "./tokenURI.js";
import fs from "fs";
import * as fileutil from "./fileutil.js";

import opn from 'opn';

import { curly } from "node-libcurl";

import { fetchCollection } from './collection.js';
import { testCollection } from './test.js';
import { analyzeCollection } from './analyze.js';

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
  program.option('--all', 'Use all items in collection');
  program.option('--nodb', 'Do not get data from DB');
  program.option('--sample', 'Use test samples');
  program.parse();
  const options = program.opts();
  const cmd = program.args[0];
  const projectId = program.args[1];
  switch (cmd) {
    case 'analyze':
      await analyzeCollection({ projectId });
      break;
    case 'fetch':
      await fetchCollection({
        projectId,
        all: options.all,
        debug: options.debug,
        fromDB: !options.nodb
      });
      break;
    case 'poll':
      // await pollCollections({ debug: options.debug });
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
