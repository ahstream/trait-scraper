import { toAbsFilepath, writeFile, getFilesInFolder, deleteFile } from "./fileutil.js";
import * as rarity from "./rarity.js";
import * as miscutil from "./miscutil.js";
import { normalizeURI } from './tokenURI.js';
import { countDone, } from "./count.js";
import open from "open";
import { debugToFile } from "./config.js";

const BASE_ASSET_URL = 'https://opensea.io/assets/';

export function cleanWebPages() {
  const allProjectsFolder = toAbsFilepath(`../data/projects/`);
  const allProjectsFiles = getFilesInFolder(allProjectsFolder, { withFileTypes: true });
  allProjectsFiles.forEach(fileObj => {
    if (!fileObj.isDirectory()) {
      return;
    }
    const folderName = fileObj.name;
    getFilesInFolder(`${allProjectsFolder}${folderName}/`).forEach(fileName => {
      if (fileName.toLowerCase().endsWith('.html')) {
        deleteFile(`${allProjectsFolder}${folderName}/${fileName}`);
      }
    });
  });
  createStartPage(true);
}

function buildPage(pageTitle, pageMainNavHtml, pageSubNavHtml, pageHeaderHtml, pageContentHtml) {
  return pageTemplate(pageTitle)
    .replace('{PAGE_MAIN_NAV}', pageMainNavHtml)
    .replace('{PAGE_SUB_NAV}', pageSubNavHtml)
    .replace('{PAGE_HEADER}', pageHeaderHtml)
    .replace('{PAGE_CONTENT}', pageContentHtml);
}

function pageTemplate(pageTitle) {
  return `
    <html><head><title>${pageTitle}</title>
    <style>
        tr { vertical-align: top; }
        td { padding-right: 10px; }
        img.thumb { border: 1px solid black; height:100px; width:100px }
        table, th, td {text-align: left;}
        body, table, th, td {font-size: 18px; }
        .blur {color: darkgray; }
        .hilite {
          background: lightgray;
        }
        .level1, .level2, .level3, .level4, .level5
        {
            float:left;
            display:inline;
            margin: 10px 20px 10px 0px;
        }

        .analyze-level1.analyze-final1 {
            border: 4px solid black;
            background-color: lawngreen;
        }
        .analyze-level1.analyze-final2 {
            border: 4px solid black;
            background-color: green;
            color: white;
        }
        .analyze-level1.analyze-final3 {
            border: 4px solid black;
            background-color: lightcoral;
        }

        .analyze-level2.analyze-final1 {
            border: 2px solid black;
            background-color: lawngreen;
        }
        .analyze-level2.analyze-final2 {
            border: 2px solid black;
            background-color: green;
            color: white;
        }
        .analyze-level2.analyze-final3 {
            border: 2px solid black;
            background-color: lightcoral;
        }

        .analyze-level3.analyze-final1 {
            border: none;
            background-color: white;
        }
        .analyze-level3.analyze-final2 {
            border: none;
            background-color: white;
        }
        .analyze-level3.analyze-final3 {
            border: none;
            background-color: white;
        }

        .current-rank-level1 {
            border: 8px solid black;
        }
        .current-rank-level2 {
            border: 6px solid black;
        }
        .current-rank-level3 {
            border: 4px solid black;
        }
        .current-rank-level4 {
            border: 2px solid black;
        }

        .final-rank-level1 {
            background-color: yellow;
        }
        .final-rank-level2 {
            background-color: lawngreen;
        }
        .final-rank-level3 {
            background-color: limegreen;
        }
        .final-rank-level4 {
            background-color: green;
        }
        .final-rank-level5 {
            background-color: lightcoral;
        }
        .final-rank-level6 {
            background-color: red;
            color: white;
        }
        a:link {color:blue}
        a:active {color:red}
        a:visited {color:blue}
        a:hover {color:red}
        .active-page-link {
            color: black;
            font-weight: bold;
            text-decoration: none;
            font-size:x-large;
        }
        .table-desc {
            margin: 10px 0 8px 0;
        }
    </style>
    </head>
    <body>
    {PAGE_MAIN_NAV}
    {PAGE_HEADER}
    {PAGE_SUB_NAV}
    {PAGE_CONTENT}
    </body>
    </html>`;
}

function createSubNavHtml(allOrBuynow, scoreKey, lastSaleKey) {
  let html = '';

  const isSame = (a1, a2, b1, b2) => a1 === a2 && b1 === b2;

  const a1 = allOrBuynow;
  const b1 = scoreKey;

  html = html + `
    [<a href='../../start.html'>Start</a>]
    &nbsp;&nbsp;
    [<a href='./all-score.html' class="${isSame(a1, 'all', b1, 'score') ? 'active-page-link' : ''}">All</a> |
    <a href='./all-rarityCountNorm.html' class="${isSame(a1, 'all', b1, 'rarityCountNorm') ? 'active-page-link' : ''}">RarityCountNorm</a> |
    <a href='./all-rarityCount.html' class="${isSame(a1, 'all', b1, 'rarityCount') ? 'active-page-link' : ''}">RarityCount</a> |
    <a href='./all-rarityNorm.html' class="${isSame(a1, 'all', b1, 'rarityNorm') ? 'active-page-link' : ''}">RarityNorm</a> |
    <a href='./all-rarity.html' class="${isSame(a1, 'all', b1, 'rarity') ? 'active-page-link' : ''}">Rarity</a> |
    <a href='./all-score-last-sale-price.html' class="${isSame(a1, 'all', lastSaleKey, 'price') ? 'active-page-link' : ''}">LastSalePrice</a> |
    <a href='./all-score-last-sale-date.html' class="${isSame(a1, 'all', lastSaleKey, 'date') ? 'active-page-link' : ''}">LastSaleDate</a>]
    &nbsp;&nbsp;
    [<a href='./buynow-score.html' class="${isSame(a1, 'buynow', b1, 'score') ? 'active-page-link' : ''}">Buynow</a> |
    <a href='./buynow-rarityCountNorm.html' class="${isSame(a1, 'buynow', b1, 'rarityCountNorm') ? 'active-page-link' : ''}">RarityCountNorm</a> |
    <a href='./buynow-rarityCount.html' class="${isSame(a1, 'buynow', b1, 'rarityCount') ? 'active-page-link' : ''}">RarityCount</a> |
    <a href='./buynow-rarityNorm.html' class="${isSame(a1, 'buynow', b1, 'rarityNorm') ? 'active-page-link' : ''}">RarityNorm</a> |
    <a href='./buynow-rarity.html' class="${isSame(a1, 'buynow', b1, 'rarity') ? 'active-page-link' : ''}">Rarity</a> |
    <a href='./buynow-score-last-sale-price.html' class="${isSame(a1, 'buynow', lastSaleKey, 'price') ? 'active-page-link' : ''}">LastSalePrice</a> |
    <a href='./buynow-score-last-sale-date.html' class="${isSame(a1, 'buynow', lastSaleKey, 'date') ? 'active-page-link' : ''}">LastSaleDate</a>]
    <br>`;
  return html;
}

function createPageHeaderHtml(header) {
  return `<h3>${header} (${new Date().toLocaleString()})</h3>`;
}

export function createStartPage(openWebPage = false) {
  const filepath = toAbsFilepath(`../data/start.html`);
  writeFile(filepath, createStartPageHtml());
  if (openWebPage) {
    open(filepath, { app: 'chrome' });
  }
}

export function createStartPageHtml() {
  let html = '';

  html = html + `<ul>`;

  const allProjectsFolder = toAbsFilepath(`../data/projects/`);
  const allProjectsFiles = getFilesInFolder(allProjectsFolder, { withFileTypes: true });
  allProjectsFiles.forEach(fileObj => {
    if (!fileObj.isDirectory()) {
      return;
    }
    const folderName = fileObj.name;
    html = html + `<li>${folderName}<ul>`;
    getFilesInFolder(`${allProjectsFolder}${folderName}/`).forEach(fileName => {
      if (fileName.toLowerCase().endsWith('.html')) {
        html = html + `<li><a href="./projects/${folderName}/${fileName}">${fileName}</a></li>`;
      }
    });
    html = html + `</ul>`;
  });

  html = html + `</ul>`;

  return buildPage('Start', 'Main Nav', '', createPageHeaderHtml('Projects'), html);
}

export function foo(config, openWebPage = true) {
  const filepath = toAbsFilepath(`../data/foo.html`);
  writeFile(filepath, fooHtml(config));
  if (openWebPage) {
    open(filepath, { app: 'chrome' });
  }
}

export function fooHtml(config) {
  debugToFile(config, 'config-foo.json');

  let html = '';

  html = html + `<ul>`;

  const tokens = [];
  for (let i = 0; i < 100; i++) {
    tokens.push(config.data.collection.tokens[i]);
  }

  // tokens.forEach(token => console.log(token.tokenId));

  html = html + `</ul>`;

  return buildPage('Start', 'Main Nav', '', createPageHeaderHtml('Foo'), html);
}

export function createCollectionWebPage(config, bothFiles) {
  const showBuynow = config.args.command === 'poll' || config.args.forceBuynow;
  if (bothFiles) {
    createCollectionBuynow(config);
    return createCollectionAll(config);
  } else if (showBuynow) {
    return createCollectionBuynow(config);
  } else {
    return createCollectionAll(config);
  }
}

function createCollectionAll(config) {
  const createResultFile = (scoreKey, sortByLastSalePrice = false, sortByLastSaleDate = false, filepathKey = '') => {
    const sortKey = sortByLastSalePrice ? '-last-sale-price' : sortByLastSaleDate ? '-last-sale-date' : '';
    const path = `${config.projectFolder}all-${scoreKey}${sortKey}${filepathKey}.html`;
    const content = createCollectionAllHtml(config, scoreKey, sortByLastSalePrice, sortByLastSaleDate);
    const lastSaleKey = sortByLastSalePrice ? 'price' : sortByLastSaleDate ? 'date' : '';
    writeFile(path, buildPage(title, '', createSubNavHtml('all', scoreKey, lastSaleKey), createPageHeaderHtml(title), content));
    return path;
  };

  const title = `Collection All > ${config.projectId}`;

  const pctDone = (countDone(config.data.collection.tokens) * 1000 / config.maxSupply).toFixed(0);
  const filepathKey = `-${pctDone}`;

  const mainFilepath = createResultFile('score');
  createResultFile('rarityCountNorm', false, false, filepathKey);
  createResultFile('rarityCountNorm');
  createResultFile('rarityCount');
  createResultFile('rarityNorm');
  createResultFile('rarity');
  createResultFile('score', true, false);
  createResultFile('score', false, true);

  createStartPage();

  return mainFilepath;
}

function createCollectionBuynow(config) {
  const createResultFile = (scoreKey, sortByLastSalePrice = false, sortByLastSaleDate = false) => {
    const sortKey = sortByLastSalePrice ? '-last-sale-price' : sortByLastSaleDate ? '-last-sale-date' : '';
    const path = `${config.projectFolder}buynow-${scoreKey}${sortKey}.html`;
    const content = createCollectionBuynowHtml(config, scoreKey, sortByLastSalePrice, sortByLastSaleDate);
    const lastSaleKey = sortByLastSalePrice ? 'price' : sortByLastSaleDate ? 'date' : '';
    writeFile(path, buildPage(title, '', createSubNavHtml('buynow', scoreKey, lastSaleKey), createPageHeaderHtml(title), content));
    return path;
  };

  const title = `Collection Buynow > ${config.projectId}`;

  const mainFilepath = createResultFile('score');

  // Do not slow down process time by writing all files before collection has been finished polling!
  if (config.data.collection.fetchHasFinished) {
    createResultFile('rarityCountNorm');
    createResultFile('rarityCount');
    createResultFile('rarityNorm');
    createResultFile('rarity');
    createResultFile('score', true, false);
    createResultFile('score', false, true);
    createStartPage();
  }

  return mainFilepath;
}

function createCollectionAllHtml(config, scoreKey, sortByLastSalePrice = false, sortByLastSaleDate = false) {
  let html = '';

  html = html + createCollectionScriptHtml(config);

  const numDone = countDone(config.data.collection.tokens);
  if (sortByLastSalePrice) {
    miscutil.sortBy2Keys(config.data.collection.tokens, 'lastPrice', false, scoreKey, false);
  } else if (sortByLastSaleDate) {
    miscutil.sortBy2Keys(config.data.collection.tokens, 'lastSaleDate', false, scoreKey, false);
  } else {
    miscutil.sortBy1Key(config.data.collection.tokens, scoreKey, false);
  }

  const tokens1 = [];
  for (const token of config.data.collection.tokens) {
    if (config.output.all.rankPct !== null && token[`${scoreKey}RankPct`] > config.output.all.rankPct) {
      continue;
    }
    if (config.output.all.price !== null) {
      if (token.price === 0 || token.price > config.output.all.price)
        continue;
    }
    tokens1.push(token);
  }

  let rankDesc = config.output.all.rankPct !== null ? `Rank < ${(config.output.all.rankPct * 100).toFixed(1)}%` : '';
  let priceDesc = config.output.all.price !== null ? `Price < ${config.output.buynow1.price} ETH` : '';
  const scoreDesc = `${scoreKey === 'score' ? config.rules.scoreKey : scoreKey}`;

  const desc = `${rankDesc} ${priceDesc} (${scoreDesc})`;

  html = html + createCollectionTablesHtml(config, tokens1, numDone, scoreKey, 1, config.output.all.imgPct, desc, true, true);

  return html;
}

function createCollectionBuynowHtml(config, scoreKey, sortByLastSalePrice = false, sortByLastSaleDate = false) {
  let html = '';

  html = html + createCollectionScriptHtml(config);

  const numDone = countDone(config.data.collection.tokens);
  if (sortByLastSalePrice) {
    miscutil.sortBy2Keys(config.data.collection.tokens, 'lastPrice', false, scoreKey, false);
  } else if (sortByLastSaleDate) {
    miscutil.sortBy2Keys(config.data.collection.tokens, 'lastSaleDate', false, scoreKey, false);
  } else {
    miscutil.sortBy1Key(config.data.collection.tokens, scoreKey, false);
  }

  const tokensLevel1 = [];
  const tokensLevel2 = [];
  const tokensLevel3 = [];
  for (const token of config.data.collection.tokens) {
    if (!token.isBuynow || !token.done) {
      continue;
    }
    const rankPct = token[`${scoreKey}RankPct`];
    if (rankPct <= config.output.buynow1.rankPct && token.price <= config.output.buynow1.price) {
      tokensLevel1.push(token);
    } else if (rankPct <= config.output.buynow2.rankPct && token.price <= config.output.buynow2.price) {
      tokensLevel2.push(token);
    } else if (rankPct <= config.output.buynow3.rankPct && token.price <= config.output.buynow3.price) {
      tokensLevel3.push(token);
    } else {
    }
  }

  const scoreDesc = `${scoreKey === 'score' ? config.rules.scoreKey : scoreKey}`;

  const desc1 = `Rank < ${(config.output.buynow1.rankPct * 100).toFixed(1)}%, Price < ${config.output.buynow1.price} ETH (${scoreDesc})`;
  html = html + createCollectionTablesHtml(config, tokensLevel1, numDone, scoreKey, 1, config.output.buynow1.imgPct, desc1, true, sortByLastSalePrice || sortByLastSaleDate);

  const desc2 = `Rank < ${(config.output.buynow2.rankPct * 100).toFixed(1)}%, Price < ${config.output.buynow2.price} ETH (${scoreDesc})`;
  html = html + createCollectionTablesHtml(config, tokensLevel2, numDone, scoreKey, 2, config.output.buynow2.imgPct, desc2, true, sortByLastSalePrice || sortByLastSaleDate);

  const desc3 = `Rank < ${(config.output.buynow3.rankPct * 100).toFixed(1)}%, Price < ${config.output.buynow3.price} ETH (${scoreDesc})`;
  html = html + createCollectionTablesHtml(config, tokensLevel3, numDone, scoreKey, 3, config.output.buynow3.imgPct, desc3, true, sortByLastSalePrice || sortByLastSaleDate);

  return html;
}

function getOutlier(tokens, pct, numDone, scoreKey) {
  const token = tokens.find(obj => obj[`${scoreKey}Rank`] === Math.round(pct * numDone));
  if (token) {
    return token[`${scoreKey}OV`].toFixed(1);
  }
  return '-';
}

function createCollectionTablesHtml(config, tokens, numDone, scoreKey, level, imgPct, desc, showAllRanks = false, showLastSale = false) {
  let html = '';

  let buttonsHtml = '';
  let lastButtonVal = 1;
  for (let buttonVal of config.buttons) {
    buttonsHtml = buttonsHtml + `<button onClick="openLinks('checkbox_${level}', ${lastButtonVal}, ${buttonVal})">${buttonVal}</button>&nbsp;&nbsp;`;
    lastButtonVal = buttonVal;
  }

  html = html + `
    <div class="level${level}">
    <div class="table-desc"><span><b>${Math.round(numDone * 100 / config.maxSupply)} %</b> (${numDone} of ${config.maxSupply}): {NUM_INCLUDED} tokens</span>&nbsp;&nbsp;&nbsp;
    ${buttonsHtml}
    </div>
    `;

  const ov5 = getOutlier(tokens, 0.005, numDone, scoreKey);
  const ov10 = getOutlier(tokens, 0.010, numDone, scoreKey);
  const ov20 = getOutlier(tokens, 0.020, numDone, scoreKey);
  const ov30 = getOutlier(tokens, 0.030, numDone, scoreKey);
  const ov40 = getOutlier(tokens, 0.040, numDone, scoreKey);
  const ov50 = getOutlier(tokens, 0.050, numDone, scoreKey);

  html = html + `<div>
  <table>
  <tr>
    <td>OV 0.5%</td>
    <td>1.0%</td>
    <td>2.0%</td>
    <td>3.0%</td>
    <td>4.0%</td>
    <td>5.0%</td>
  </tr>
  <tr>
    <td><b>${ov5}</b></td>
    <td><b>${ov10}</b></td>
    <td><b>${ov20}</b></td>
    <td><b>${ov30}</b></td>
    <td><b>${ov40}</b></td>
    <td><b>${ov50}</b></td>
  </tr>
  </table>
    </div>
    `;

  html = html + `
    <table>
    <tr style="background: black; color: white"><td colspan="100%">${desc}</td></tr>
    <tr>
        <th>Image</th>
        <th></th>
        <th>Pct</th>
        <th>Price</th>
        ${showLastSale ? '<th>Last</th>' : ''}
        ${showLastSale ? '<th>LastDate</th>' : ''}
        <th>Rank&nbsp;&nbsp;</th>
        ${showAllRanks ? '<th>rcn</th><th>rc</th><th>rn</th><th>r</th>' : ''}
        <th>Score&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
        <th>OV</th>
        <th>rcn</th>
        <th>rc</th>
        <th>rn</th>
        <th>r</th>
        <th>TC</th>
        <th>TCF</th>
        <th>min</th>
        <th>max</th>
        <th>ID</th>
    </tr>`;

  const doHilite = level === 1;
  let numIncluded = 0;
  for (const token of tokens) {
    if (!token.done) {
      continue;
    }
    numIncluded++;

    const score = token[`${scoreKey}`];
    const rankPct = token[`${scoreKey}RankPct`];

    // Non sale dates are encoded as 1901-01-01 so make empty dates work with sorting!
    const normalizedLastSaleDate = token.lastSaleDate <= new Date('1900-01-01') ? null : token.lastSaleDate;

    const rowClass = doHilite ? 'hilite' : '';
    const assetLink = `${BASE_ASSET_URL}/${config.contractAddress}/${token.tokenId}`;
    const imageHtml = rankPct <= imgPct ? `<a target="_blank" href="${assetLink}"><img class="thumb" src="${normalizeURI(token.image)}"></a>` : '';
    const checkboxHtml = `<input type="checkbox" class="checkbox_${level}" ${doHilite ? 'checked' : ''} value="${token.tokenId}">`;
    const percentHtml = `<a target="id_${token.tokenId}" href="${assetLink}">${(rankPct * 100).toFixed(2)} %</a>`;
    const priceHtml = token.price > 0 ? `${(token.price.toFixed(2))}` : '';

    const ovHtml = `${(token.scoreOV.toFixed(1))}`;

    const lastPriceText = token.lastPrice > 0 ? `${(token.lastPrice.toFixed(2))}` : '-';
    const lastPriceHtml = showLastSale ? `<td class="blur">${lastPriceText}</td>` : '';

    const lastSaleDateText = showLastSale && normalizedLastSaleDate ? token.lastSaleDate.toLocaleDateString() : '-';
    const lastSaleDateHtml = showLastSale ? `<td class="blur">${lastSaleDateText}</td>` : '';

    const scoreHtml = score.toFixed(0);
    const allRanksHtml = showAllRanks ? `
        <td class="blur">${token.rarityCountNormRank}</td>
        <td class="blur">${token.rarityCountRank}</td>
        <td class="blur">${token.rarityNormRank}</td>
        <td class="blur">${token.rarityRank}</td>`
      : '';

    html = html + `
        <tr class="${rowClass}">
            <td>${imageHtml}</td>
            <td>${checkboxHtml}</td>
            <td>${percentHtml}</td>
            <td>${priceHtml}</td>
            ${lastPriceHtml}
            ${lastSaleDateHtml}
            <td><b>${token[`${scoreKey}Rank`]}</b></td>
            ${allRanksHtml}
            <td>${scoreHtml}</b></td>
            <td><b>${ovHtml}</b></td>
            <td>${token.rarityCountNormOV.toFixed(1)}</td>
            <td>${token.rarityCountOV.toFixed(1)}</td>
            <td>${token.rarityNormOV.toFixed(1)}</td>
            <td>${token.rarityOV.toFixed(1)}</td>
            <td>${token.traitCount}</td>
            <td><b>${(token.traitCountFreq * 100).toFixed(2)}</b></td>
            <td>${token.minTraits}</td>
            <td>${token.maxTraits}</td>
            <td>:${token.tokenId}:</td>
        </tr>`;
  }
  html = html + `</table></div>`;

  html = html.replace('{NUM_INCLUDED}', numIncluded);

  return html;
}

function createCollectionScriptHtml(config) {
  return `
    <script>
        function openLinks(className, first, last) {
            var checkboxes = document.querySelectorAll('input[class="' + className + '"]:checked');
            var links = [];
            checkboxes.forEach((ck) => { links.push(['${BASE_ASSET_URL}/${config.contractAddress}/'+ck.value, 'id_' + ck.value]);});
            console.log(links);
            console.log('---');
            var links2 = links.slice(first-1, last);
            console.log(links2);
            console.log('---');
            links2.forEach((link) => { console.log(link[1]); window.open(link[0], link[1]); });
        }
    </script>`;
}

function createAnalyzeWebPageHtml(config, results) {
  let html = '';
  const add = (s) => html = html + s;

  const numToIncludePct = 0.005;
  const level1Pct = 0.005;
  const level2Pct = 0.01;

  const rankLevels = [0.001, 0.0025, 0.0050, 0.0100, 0.05];
  const dangerRankLevel = 0.05;

  const getRankLevel = (rank, numDone) => {
    for (let i = 0; i < rankLevels.length; i++) {
      if (rank <= rankLevels[i] * numDone) {
        return i + 1;
      }
    }
    return rankLevels.length + 1;
  };

  add(`<table>`);

  rankLevels.forEach((level, index) => {
    add(`<tr><td class="current-rank-level${index + 1} final-rank-level${index + 1}">${(level * 100).toFixed(2)}%</td>`);
    results.forEach(tokens => {
      const done = countDone(tokens);
      const maxRank = Math.round(level * done);
      add(`<td>${maxRank}</td>`);
    });
    add(`</tr>`);
  });

  add(`<tr style="background: black; color: white"><td colspan="100%">DESC</td></tr>
        <tr><th>Rank</th>`);
  config.analyze.forEach((pct, index) => add(`<th>${Math.round(pct * 100)}%</th>`));
  add(`</tr>`);

  const numFinalDone = countDone(config.data.collection.tokens);
  const numToInclude = Math.round(numFinalDone * numToIncludePct) ?? 1;

  const level1MaxFinalRank = Math.round(level1Pct * numFinalDone);
  const level2MaxFinalRank = Math.round(level2Pct * numFinalDone);

  for (let tokenIdx = 0; tokenIdx < numToInclude; tokenIdx++) {
    const baseRank = tokenIdx + 1;
    add(`<tr><td><b>${tokenIdx + 1}</b></td>`);
    for (let i = 0; i < results.length; i++) {
      const numCurrentDone = countDone(results[i]);
      const level1MaxCurrentRank = Math.round(level1Pct * numCurrentDone);
      const level2MaxCurrentRank = Math.round(level2Pct * numCurrentDone);
      const tokenId = results[i][tokenIdx].tokenId;
      const currentRank = results[i][tokenIdx].rank;
      const finalRank = config.data.collection.tokens.find(obj => obj.tokenId === tokenId).rank;
      const className1 = `current-rank-level${getRankLevel(currentRank, numCurrentDone)}`;
      const className2 = `final-rank-level${getRankLevel(finalRank, numFinalDone)}`;
      /*
      if (currentRank <= level1MaxCurrentRank) {
        className1 = 'analyze-level1';
        className2 = (finalRank <= level1MaxFinalRank) ? 'analyze-final1' : (finalRank <= level2MaxFinalRank) ? 'analyze-final2' : 'analyze-final3';
      } else if (currentRank <= level2MaxCurrentRank) {
        className1 = 'analyze-level2';
        className2 = (finalRank <= level1MaxFinalRank) ? 'analyze-final1' : (finalRank <= level2MaxFinalRank) ? 'analyze-final2' : 'analyze-final3';
      } else {
        className1 = 'analyze-level3';
        className2 = (finalRank <= level1MaxFinalRank) ? 'analyze-final1' : (finalRank <= level2MaxFinalRank) ? 'analyze-final2' : 'analyze-final3';
      }
       */
      // console.log(results[i][j]);
      // add(`<td>${rank1}/${finalRank}/${tokenId}</td>`);
      add(`<td class="${className1} ${className2}">${finalRank}</td>`);
    }
    add(`</tr>`);
  }
  add(`</table>`);

  return buildPage(html, 'Analyze Results', config);
}

export function createAnalyzeWebPage(config, results, doOpen = false) {
  const html = createAnalyzeWebPageHtml(config, results);
  const path = toAbsFilepath(`../config/projects/${config.projectId}/analyze.html`);
  writeFile(path, html);
  if (doOpen) {
    open(path, { app: 'chrome' });
  }
}
