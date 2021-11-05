import * as miscutil from "./miscutil.js";
import { isTokenRevealed } from "./token.js";
import * as fileutil from "./fileutil.js";
import { getConfig } from "./config.js";
import * as tokenURI from "./tokenURI.js";
import { fetchCollection } from './collection.js';
import {
  countDone,
  countDoneConfig,
  countSkippedConfig,
  countDoneOrSkip,
  countSkip
} from "./count.js";

import open from "open";
import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export async function pollForReveal(config, isTest = false) {
  log.info('Poll for reveal...');

  const tokenId = ((config.pollTokenIds ?? [1234])[0]).toString();
  config.data.collection.tokenURIHistory = config.data.collection.tokenURIHistory ?? [];

  while (true) {
    const newTokenURI = await tokenURI.getTokenURIFromContract(tokenId, config.contractAddress);
    log.debug(`Token URI for ${tokenId}: ${newTokenURI}`);

    if (!tokenURI.isValidTokenURI(newTokenURI)) {
      // log.debug('Invalid tokenURI:', newTokenURI);
      await miscutil.sleep(config.pollForRevealMsec);
      continue;
    }

    const existingTokenURI = tokenURI.createTokenURI(tokenId, config.data.collection.baseTokenURI);
    if (newTokenURI !== existingTokenURI) {
      config.data.collection.baseTokenURI = tokenURI.convertToBaseTokenURI(tokenId, newTokenURI);
      miscutil.addToListIfNotPresent(newTokenURI, config.data.collection.tokenURIHistory);
    }

    if (newTokenURI) {
      if (await isTokenRevealed(newTokenURI, config)) {
        log.info(`Collection ${config.projectId} is revealed, tokenURI: ${newTokenURI}`);
        config.data.collection.isRevealed = true;
        config.data.collection.revealTime = new Date();
        return true;
      }
      if (isTest) {
        // During test, all tokenURI:s should be fetched to measure timing!
        return true;
      }

      config.runtime.numInfoLog++;
      if (config.runtime.numInfoLog % config.freqInfoLog === 0) {
        log.info(`. (${config.projectId})`);
      }

    }

    await miscutil.sleep(config.pollForRevealMsec);
  }
}

export function notifyRevealed(config) {
  if (config.args.silent) {
    return;
  }
  const path2 = fileutil.toAbsFilepath('./audio/reveal-notification.mp3');
  open(path2, { app: { name: 'firefox' } });
}

export function notifyNewResults(config) {
  if (config.args.silent) {
    return;
  }
  const path2 = fileutil.toAbsFilepath('./audio/new-results-notification.mp3');
  open(path2, { app: { name: 'firefox' } });
}
