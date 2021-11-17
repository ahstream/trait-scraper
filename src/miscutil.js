/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

/* eslint-disable no-extend-native */
/* eslint-disable func-names */

// ------------------------------------------------------------------------------------------------
// MAIN FUNCTIONS
// ------------------------------------------------------------------------------------------------

export function addSecondsToDate(date, seconds) {
  date.setSeconds(date.getSeconds() + seconds);
  return date;
}

export function subtractSecondsFromDate(date, seconds) {
  date.setSeconds(date.getSeconds() - seconds);
  return date;
}

export function shuffle(array) {
  let currentIndex = array.length, randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

export function range(start, stop, step) {
  return Array.from({ length: (stop - start) / step + 1 }, (_, i) => start + (i * step));
}

export function sort(list, key1, ascending1, key2 = null, ascending2 = null) {
  if (key2) {
    return sortBy1Key(list, key1, ascending1);
  }
  return sortBy2Keys(list, key1, ascending1, key2, ascending2);
}

export function sortBy1Key(list, key, ascending = true) {
  if (ascending) {
    list.sort((a, b) => (b[key] < a[key]) ? 1 : ((a[key] < b[key]) ? -1 : 0));
  } else {
    list.sort((a, b) => (a[key] < b[key]) ? 1 : ((b[key] < a[key]) ? -1 : 0));
  }
  return list;
}

export function sortBy2Keys(list, key1, ascending1 = true, key2, ascending2 = true) {
  list.sort((a, b) => {
    if (a[key1] === b[key1]) {
      return ascending2 ? a[key2] - b[key2] : b[key2] - a[key2];
    }
    return ascending1 ? (a[key1] > b[key1] ? 1 : -1) : (b[key1] > a[key1] ? 1 : -1);
  });
  return list;
}

export function addToListIfNotPresent(item, list) {
  if (!list.includes(item)) {
    list.push(item);
  }
}

export function countInstances(string, word) {
  return string.split(word).length - 1;
}

export function replaceLastOccurrenceOf(string, searchFor, replaceWith) {
  const pos = string.lastIndexOf(searchFor);
  const result = string.substring(0, pos) + replaceWith + string.substring(pos + 1);
}

export function isValidUrl(url) {
  try {
    const temp = new URL(url);
  } catch (e) {
    return false;
  }
  return true;
}

export function trimChars(str, chars) {
  return trimCharsLeft(trimCharsRight(str, chars), chars);
}

export function trimCharsLeft(str, chars) {
  return str.replace(new RegExp(`^[${chars}]+`), '');
}

export function trimCharsRight(str, chars) {
  return str.replace(new RegExp(`[${chars}]+$`), '');
}

export function ensureProperties(baseObj, properties) {
  let obj = baseObj;
  if (typeof obj === 'undefined') {
    throw new Error('Base object cannot be undefined!');
  }
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    if (typeof obj[property] === 'undefined') {
      obj[property] = {};
    }
    obj = obj[property];
  }
}

export function propertiesExists(baseObj, properties) {
  let obj = baseObj;
  if (typeof obj === 'undefined') {
    return false;
  }
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    obj = obj[property];
    if (typeof obj === 'undefined') {
      return false;
    }
  }
  return true;
}

export function capitalize(words) {
  return words
    .split(' ')
    .map((w) => w.substring(0, 1).toUpperCase() + w.substring(1))
    .join(' ');
}

export function convertNumberValToLocaleString(val, locale = 'sv_SE') {
  if (typeof val !== 'number') {
    return val;
  }
  if (locale === 'sv_SE') {
    return val.toString().replace(/\./g, ',');
  }
  return val.toString();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleepSecs(val) {
  return new Promise((resolve) => setTimeout(resolve, val * 1000));
}

export function getRandomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function decodeEntitiesInString(encodedString) {
  const translateRegexp = /&(nbsp|amp|quot|lt|gt);/g;
  const translate = {
    nbsp: ' ',
    amp: '&',
    quot: '"',
    lt: '<',
    gt: '>'
  };
  return encodedString
    .replace(translateRegexp, (match, entity) => translate[entity])
    .replace(/&#(\d+);/gi, (match, numStr) => {
      const num = parseInt(numStr, 10);
      return String.fromCharCode(num);
    });
}

export function normalizeText(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
