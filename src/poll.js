import { getTokenURIFromEtherscan, isValidTokenURI } from "./tokenURI.js";
import * as fileutil from "./fileutil.js";
import opn from "opn";

async function pollCollections({ debug = false }) {
  const config = getConfig(null, debug);
  config.projects.forEach((projectId) => {
    fetchCollection({ projectId, debug });
  });
}

async function pollForReveal(config, isTest = false) {
  log.info('Poll for reveal...');
  const tokenId = (config.pollTokenIds ?? [1234])[0];
  config.data.tokenIdHistory = config.data.tokenIdHistory ?? [];
  while (true) {
    const newTokenURI = await getTokenURIFromEtherscan(tokenId, config.contractAddress, config.etherscanURI, config.tokenURISignatur);
    if (config.debug) {
      log.info('Token URI:', newTokenURI);
    }
    if (newTokenURI && !isValidTokenURI(newTokenURI)) {
      log.info('Invalid tokenURI:', newTokenURI);
    } else if (newTokenURI !== '' && newTokenURI !== createTokenURI(tokenId, config.data.tokenURI)) {
      config.data.tokenURI = convertToTokenURI(tokenId, newTokenURI);
      log.info('Converted tokenURI:', config.data.tokenURI);
      addToListIfNotPresent(newTokenURI, config.data.tokenIdHistory);
    }

    if (config.data.tokenURI) {
      const thisTokenURI = createTokenURI(tokenId, config.data.tokenURI);
      if (config.debug) {
        log.info('Fetch:', thisTokenURI);
      }
      const token = await fetchJson(thisTokenURI, {}, config.debug);
      if (isTokenRevealed(token, config)) {
        log.info('Collection is revealed, tokenURI:', config.data.tokenURI);
        log.info('Token:', token);
        config.data.isRevealed = true;
        config.data.revealTime = new Date();
        return true;
      } else {
        if (isTest) {
          return true;
        }
        log.info('.');
        // log.info(`Not revealed: ${config.projectId}`);
      }
    }
    await miscutil.sleep(config.pollForRevealIntervalMsec);
  }
}

function notifyRevealed(config) {
  if (config.debug || config.isTest) {
    return;
  }
  const path = fileutil.toAbsoluteFilePath('revealed-collection.html');
  const path2 = fileutil.toAbsoluteFilePath('notification.mp3');
  // opn(path, { app: 'firefox' });
  opn(path2, { app: 'firefox' });
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

  return false;
}
