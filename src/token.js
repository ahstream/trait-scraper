/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import fetch from "node-fetch";

const log = createLogger();

const DEFAULT_FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
  "accept": "*/*",
};

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

export async function getToken(asset) {
  try {
    return await getTokenFromURI(asset.tokenURI.uri);
  } catch (error) {
    // log.info('Error:', error);
    switch (error) {
      case 'RESPONSE_NOT_OK':
        // Probably server error or network error. Try again next run!
        break;
      case 'INVALID_JSON':
        // Invalid JSON in token file!?
        break;
      default:
    }
    return { error };
  }
}

async function getTokenFromURI(uri) {
  const response = await fetch(uri, {
    "headers": DEFAULT_FETCH_HEADERS,
    "method": "GET",
  });

  if (!response.ok) {
    log.info('Response.status:', response.status, response.statusText, uri);
    throw new Error('RESPONSE_NOT_OK');
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error('INVALID_JSON');
  }
}
