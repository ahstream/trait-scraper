import * as miscutil from "./miscutil.js";
import { fetchTokenById, getRevealedStatus } from "./token.js";
import * as fileutil from "./fileutil.js";
import * as tokenURI from "./tokenURI.js";

import open from "open";
import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export async function isRevealed(config) {
  const token = await getRevealedToken(config);
  return typeof token?.tokenId !== 'undefined';
}

export async function pollForReveal(config) {
  while (true) {
    const token = await getRevealedToken(config);
    if (token !== null) {
      revealToken(token, config);
      return true;
    }
    log.info(`(${config.projectId}) .`);
    await miscutil.sleep(config.pollSleepBetweenReveal);
  }
}

async function getRevealedToken(config) {
  const pollForRevealTokenIds = config.pollForRevealTokenIds;
  const tokens = [];
  for (const tokenId of pollForRevealTokenIds) {
    const token = await fetchTokenById(tokenId, config.collection.contractAddress);
    const revealStatus = await getRevealedStatus(token, config);
    if (revealStatus > 0) {
      return token;
    } else if (revealStatus === 0) {
      // Push token and later analyze all tokens to see if collection is revealed!
      tokens.push(token);
    }
  }
  if (tokens.length > 1) {
    const imageURIs = tokens.map(obj => obj.image);
    const uniqueURIs = [...new Set(imageURIs)];
    if (uniqueURIs.length < 2) {
      return null;
    } else {
      // Otherwise revealed!
      return tokens[0];
    }
  }
  return null;
}

function revealToken(token, config) {
  log.info(`(${config.projectId}) Collection is revealed: ${token.tokenURI}`);
  config.data.collection.baseTokenURI = tokenURI.convertToBaseTokenURI(token.tokenId, token.tokenURI);
  config.runtime.isRevealed = true;
  config.runtime.revealTime = new Date();
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
