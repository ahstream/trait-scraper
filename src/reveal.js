import * as miscutil from "./miscutil.js";
import { fetchTokenById, isTokenRevealed } from "./token.js";
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

export async function pollForReveal(config) {
  const pollForRevealTokenIds = config.pollForRevealTokenIds;
  while (true) {
    for (const tokenId of pollForRevealTokenIds) {
      const token = await fetchTokenById(tokenId, config);
      if (await isTokenRevealed(token, config)) {
        log.info(`(${config.projectId}) Collection is revealed: ${token.tokenURI}`);
        config.data.collection.baseTokenURI = tokenURI.convertToBaseTokenURI(tokenId, token.tokenURI);
        config.runtime.isRevealed = true;
        config.runtime.revealTime = new Date();
        return true;
      }
    }
    config.runtime.numInfoLog++;
    if (config.runtime.numInfoLog % config.freqInfoLog === 0) {
      log.info(`(${config.projectId}) .`);
    }

    await miscutil.sleep(config.pollForRevealMsec);
  }
}

export function notifyRevealed(config) {
  if (!config.args.silent) {
    open(fileutil.toAbsFilepath('./audio/reveal-notification.mp3'), { app: { name: 'firefox' } });
  }
}

export function notifyNewResults(config) {
  if (!config.args.silent) {
    open(fileutil.toAbsFilepath('./audio/new-results-notification.mp3'), { app: { name: 'firefox' } });
  }
}
