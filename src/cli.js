/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import program from 'commander';
import fetch from 'node-fetch';

import { reveal } from './collection.js';
import { getConfig } from './config.js';
import { get } from './fetch.js';
import { deleteSpecificFilesInFolder, toAbsFilepath } from './fileUtils.js';
import { log } from "./logUtils.js";
import { range } from './miscUtils.js';
import { getAssets } from './opensea.js';
import { cleanCacheFiles, cleanHtmlFiles } from './tools.js';

const DEFAULT_FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36'
};

const IPFS_URL = 'ipfs://';

// RUNTIME ----------------------------------------------------------------------------------

runProgram();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

async function runProgram() {
  log.info('run program');

  program.option('--debug', 'Write debug info');
  program.option('--all', 'Output all items instead of only buynow items');
  program.option('--nodb', 'Do not get data from DB');
  program.option('--silent', 'Do not notify events');
  program.option('--skippagenums', '');
  program.option('--sample', 'Use test samples');
  program.option('--skiptokencache', '');
  program.option('--skipopensea', '');
  program.option('--top <value>', 'Top N tokens instead of Buynow tokens');
  program.option('--id <value>', 'Token Id');
  program.option('--contract <value>', 'Contract address');
  program.parse();

  const options = program.opts();
  const cmd = program.args[0];
  const projectId = program.args[1];

  log.info(`cmd: ${cmd}, projectId: ${projectId}, options: ${JSON.stringify(options)}`);
  log.info('------------------------------------------------');

  switch (cmd) {
    case 'reveal':
      await reveal(projectId, {
        skipTokenCache: options.skiptokencache,
        skipOpensea: options.skipopensea,
        silent: options.silent,
        top: options.top,
        skipPageNums: options.skippagenums
      });
      break;
    case 'foo':
      deleteSpecificFilesInFolder(toAbsFilepath('../data/projects/nfteams/'), 'reveal', '.html');
      break;
    case 'cleanhtml':
      cleanHtmlFiles(getConfig(null, null));
      break;
    case 'cleancache':
      cleanCacheFiles(getConfig(null, null));
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
    default:
      log.error(`Unknown command: ${cmd}`);
  }
}

