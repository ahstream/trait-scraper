import { readFile, writeJSONFile, fileExists, toAbsFilepath } from "./fileutil.js";
import { createLogger } from "./lib/loggerlib.js";
import { createToken } from './token.js';
import { getBuynow } from './opensea.js';

const log = createLogger();

export async function createBuynow(config) {
  let buynowList;
  if (config.args.all) {
    log.info('Get BuyNow from config');
    buynowList = getBuynowListFromConfig(config);
  } else if (config.args.getbuynow) {
    log.info('Get BuyNow from OpenSea');
    buynowList = await getBuynow(config.contractAddress, config.maxSupply);
  } else {
    log.info('Get BuyNow from config');
    buynowList = getBuynowListFromConfig(config);
    if (buynowList.length < 1) {
      log.info('Get BuyNow from OpenSea');
      buynowList = await getBuynow(config.contractAddress, config.maxSupply);
    }
  }

  const buynow = {
    itemList: buynowList,
    itemMap: new Map(),
  };

  buynow.itemList.forEach((item) => {
    buynow.itemMap.set(item.tokenId, item);
  });

  const outputFilepath = `${config.buynowFolder}${config.projectId}.json`;
  writeJSONFile(outputFilepath, { data: buynow.itemList });

  return buynow;
}

export function createBuynowBAK(config) {
  const inputFilepath = `${config.buynowFolder}${config.projectId}.txt`;
  const outputFilepath = `${config.buynowFolder}${config.projectId}.json`;

  const buynow = {
    itemList: parseBuynowSourceFile(inputFilepath),
    itemMap: new Map(),
  };

  buynow.itemList.forEach((item) => {
    buynow.itemMap.set(item.tokenId, item);
  });

  writeJSONFile(outputFilepath, { data: buynow.itemList });

  return buynow;
}

function parseBuynowSourceFile(filepath) {
  if (!fileExists(filepath)) {
    return [];
  }

  let fakePrice = null;

  const data = readFile(filepath, 'utf8');

  const tokenIdResult = [...data.matchAll(/\\"tokenId\\":\\"([0-9]+)\\"/gim)];
  let priceResult = [...data.matchAll(/\\"quantityInEth\\":\\"([0-9]+)\\"/gim)];

  if (tokenIdResult.length < 1) {
    log.error('BuyNow: Empty result!');
    return [];
  }

  if (tokenIdResult.length !== priceResult.length) {
    // Token ID and Price lists have different length!
    // Use fake price when prices are not known for sure!
    log.info('Error: Token ID and Price lists have different length! Use fake price 0.001.');
    fakePrice = 0.001;
  }

  const tokenList = [];
  const tokenMap = new Map();
  for (let i = 0; i < tokenIdResult.length; i++) {
    const thisId = tokenIdResult[i][1];
    const thisToken = tokenMap.get(thisId);
    if (thisToken) {
      continue;
    }
    const thisPrice = fakePrice ?? parseInt(priceResult[i][1]) / Math.pow(10, 18);
    const thisItem = createToken({ tokenId: thisId, price: thisPrice });
    tokenMap.set(thisId, thisItem);
    tokenList.push(thisItem);
  }

  return tokenList;
}

export function hasBuynow(config) {
  return config.buynow.itemList.length > 0;
}

function getBuynowListFromConfig(config) {
  const buynowList = [];
  config.data.collection.tokens.forEach(token => {
      if (token.done && token.price) {
        buynowList.push({ tokenId: token.tokenId, price: token.price });
      }
    }
  );
  return buynowList;
}
