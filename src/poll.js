import * as miscutil from "./miscutil.js";
import { isTokenRevealed } from "./fetchTokens.js";
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

import opn from "opn";
import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export async function pollCollections({ debug = false }) {
  const config = getConfig(null, debug, false);
  config.projects.forEach((projectId) => {
    fetchCollection({ projectId, debug });
  });
}

export async function pollForReveal(config, isTest = false) {
  log.info('Poll for reveal...');
  const tokenId = (config.pollTokenIds ?? [1234])[0];
  config.data.tokenIdHistory = config.data.tokenIdHistory ?? [];

  while (true) {
    const newTokenURI = await tokenURI.getTokenURIFromEtherscan(tokenId, config.contractAddress, config.etherscanURI, config.tokenURISignatur);
    if (config.debug) {
      log.info('Token URI:', newTokenURI);
    }
    if (newTokenURI && !tokenURI.isValidTokenURI(newTokenURI)) {
      log.info('Invalid tokenURI:', newTokenURI);
    } else if (newTokenURI !== '' && newTokenURI !== tokenURI.createTokenURI(tokenId, config.data.tokenURI)) {
      config.data.tokenURI = tokenURI.convertToTokenURI(tokenId, newTokenURI);
      miscutil.addToListIfNotPresent(newTokenURI, config.data.tokenIdHistory);
    }

    if (config.data.tokenURI) {
      const thisTokenURI = tokenURI.createTokenURI(tokenId, config.data.tokenURI);
      if (config.debug) {
        log.info('Fetch:', thisTokenURI);
      }
      if (await isTokenRevealed(thisTokenURI, config)) {
        log.info('Collection is revealed, tokenURI:', config.data.tokenURI);
        config.data.isRevealed = true;
        config.data.revealTime = new Date();
        return true;
      } else {
        if (isTest) {
          return true;
        }
        log.info('.');
      }
    }
    await miscutil.sleep(config.pollForRevealIntervalMsec);
  }
}

export function notifyRevealed(config) {
  if (config.debug || config.isTest) {
    return;
  }
  const path = fileutil.toAbsoluteFilePath('revealed-collection.html');
  const path2 = fileutil.toAbsoluteFilePath('notification.mp3');
  // opn(path, { app: 'firefox' });
  opn(path2, { app: 'firefox' });
}
