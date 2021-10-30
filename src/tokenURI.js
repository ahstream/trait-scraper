/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import { curly } from "node-libcurl";

const log = createLogger();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

/*
export async function getTokenURI(asset, config) {
  const tokenURI = asset.tokenURI || {
    source: '',
    uri: '',
    originalURI: '',
    error: ''
  };

  // Reset error!
  tokenURI.error = '';

  if (tokenURI.uri) {
    return tokenURI;
  }

  try {
    if (config.tokenURITemplate) {
      tokenURI.uri = config.tokenURITemplate.replace('{ID}', asset.id);
      tokenURI.source = 'template';
      return tokenURI;
    }

    const etherscanTokenURI = await getFromEtherscan(asset.id, config.contractAddress, config.tokenURISignatur, config.etherscanUrl);
    tokenURI.uri = etherscanTokenURI.uri;
    tokenURI.originalURI = etherscanTokenURI.originalURI;
    tokenURI.source = 'etherscan';
  } catch (error) {
    tokenURI.error = error;
    log.info(`${error} error when getting Etherscan tokenURI for asset id ${asset.id}`);
    switch (error) {
      case 'RESPONSE_NOT_OK':
        // Probably server error or network error. Try again next run!
        break;
      case 'NON_EXISTING_TOKEN':
        // Either not revealed yet or outside supply limit. Try again next run!
        // If polling for updates, polling can be paused after a couple of these occurs!
        log.info('NON_EXISTING_TOKEN error for Asset ID:', asset.id);
        break;
      case 'INVALID_JSON':
      case 'INVALID_URI':
      case 'UNKNOWN_ERROR':
        log.error(`${error} error when getting Etherscan tokenURI for asset id ${asset.id}`);
        break;
      default:
    }
  }

  return tokenURI;
}
 */

export async function getTokenURIFromEtherscan(id, contractAddress, url, signatur) {
  try {
    const uri = await getAndThrow(id, contractAddress, url, signatur);
    return uri.uri;
  } catch (error) {
    return error.message;
  }
}

export function isValidTokenURI(uri) {
  try {
    const url = new URL(uri);
    return true;
  } catch (_error) {
    return false;
  }

}

async function getAndThrow(id, contractAddress, etherscanUrl, signatur) {
  const tokenURIData = createTokenURIData(id, signatur);
  const postFields = `{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"from":"0x0000000000000000000000000000000000000000","data":"${tokenURIData}","to":"${contractAddress}"},"latest"]}`;
  const headers = [
    'authority: node1.web3api.com',
    'pragma: no-cache',
    'cache-control: no-cache',
    'sec-ch-ua: "Chromium";v="94", "Google Chrome";v="94", ";Not A Brand";v="99"',
    'sec-ch-ua-mobile: ?0',
    'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
    'sec-ch-ua-platform: "Windows"',
    'content-type: application/json',
    'accept: */*',
    'origin: https://etherscan.io',
    'sec-fetch-site: cross-site',
    'sec-fetch-mode: cors',
    'sec-fetch-dest: empty',
    'referer: https://etherscan.io/',
    'accept-language: sv,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,la;q=0.6,da;q=0.5,de;q=0.4',
  ];
  const response = await curly.post(etherscanUrl, {
    postFields,
    httpHeader: headers
  });

  let data;
  try {
    data = JSON.parse(response.data);
  } catch (error) {
    throw new Error('INVALID_JSON');
  }

  if (data.error) {
    if (data.error.message && data.error.message.includes('URI query for nonexistent token')) {
      throw new Error('NON_EXISTING_TOKEN');
    }
    throw new Error('UNKNOWN_ERROR');
  }

  const { result } = data;
  if (!result || result.length < 130) {
    throw new Error('INVALID_URI');
  }

  const uri = hex2a(data.result.substring(130)).replace(/\0/g, '').trim();
  log.debug('getFromEtherscan, result uri:', uri);

  return { uri: convertTokenURI(uri), originalURI: uri };
}

function convertTokenURI(uri) {
  const IPFS_URL = 'ipfs://';
  let normalizedURI = uri;
  if (uri.startsWith(IPFS_URL)) {
    normalizedURI = uri.replace(IPFS_URL, 'https://ipfs.io/ipfs/');
  }
  return normalizedURI;
}

function createTokenURIData(id, signatur) {
  const hexId = id.toString(16);
  const suffix = hexId.padStart(64, '0');
  return `${signatur}${suffix}`;
}

function hex2a(hexValue) {
  const hexStr = hexValue.toString(); // force conversion
  let str = '';
  for (let i = 0; i < hexStr.length; i += 2)
    str += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16));
  return str;
}
