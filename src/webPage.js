import * as fileutil from "./fileutil.js";
import * as rarity from "./rarity.js";
import * as miscutil from "./miscutil.js";
import { hasBuynow } from "./buynow.js";
import { normalizeURI } from './tokenURI.js';
import {
  countDone,
} from "./count.js";
import open from "open";

const BASE_ASSET_URL = 'https://opensea.io/assets/';

function buildPage(config, title, pageNavHtml, pageHeadHtml, pageContentHtml) {
  return pageTemplate(config, title)
    .replace('{PAGE_NAV}', pageNavHtml)
    .replace('{PAGE_HEAD}', pageHeadHtml)
    .replace('{PAGE_CONTENT}', pageContentHtml);
}

function pageTemplate(config, title) {
  return `
    <html><head><title>${title}</title>
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
    </script>
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
            margin: 10px 20px 10px 10px;
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
    </style>
    </head>
    <body>
    {PAGE_NAV}
    {PAGE_HEAD}
    {PAGE_CONTENT}
    </body>
    </html>
    `;
}

export function createAnalyzeWebPage(config, results, doOpen = false) {
  const html = createAnalyzeWebPageHtml(config, results);
  const path = fileutil.toAbsFilepath(`../config/projects/${config.projectId}/analyze.html`);
  fileutil.writeFile(path, html);
  if (doOpen) {
    open(path, { app: 'chrome' });
  }
}

export function createCollectionWebPage(config) {
  const path = `${config.dataFolder}html/tokens-by-rarity.html`;
  const showBuynow = config.args.command === 'poll' || config.args.forceBuynow;
  const html = showBuynow
    ? createCollectionBuynow(config, config.rules.scoreKey, 'Collection Buynow')
    : createCollectionAll(config, config.rules.scoreKey, 'Collection All');
  fileutil.writeFile(path, html);
  return path;
}

function createPageNavHtml() {
  let html = '';

  html = html + `
    [<a href='collection-all'>Projects Start</a>]
    &nbsp;&nbsp;
    [<a href='collection-all'>All Default</a> -
    <a href='collection-all'>Rarity CN</a> -
    <a href='collection-all'>Rarity C</a> -
    <a href='collection-all'>Rarity N</a> -
    <a href='collection-all'>Rarity</a>]
    &nbsp;&nbsp;
    [<a href='collection-all'>Buynow Default</a> -
    <a href='collection-all'>Rarity CN</a> -
    <a href='collection-all'>Rarity C</a> -
    <a href='collection-all'>Rarity N</a> -
    <a href='collection-all'>Rarity</a>]
    <br><br>`;

  return html;
}

function createPageHeadHtml(config, title) {
  return `<span><b>${title}: ${config.projectId}</b></span><br>`;
}

function createCollectionAll(config, scoreKey, title) {
  return buildPage(config, title, createPageNavHtml(), createPageHeadHtml(config, title), createCollectionAllHtml(config, scoreKey));
}

function createCollectionBuynow(config, scoreKey, title) {
  return buildPage(config, title, createPageNavHtml(), createPageHeadHtml(config, title), createCollectionBuynowHtml(config, scoreKey));
}

function createCollectionAllHtml(config, scoreKey) {
  let html = '';
  const numDone = countDone(config.data.collection.tokens);
  miscutil.sortBy1Key(config.data.collection.tokens, scoreKey, false);

  const tokens1 = [];
  for (const token of config.data.collection.tokens) {
    if (token[`${scoreKey}RankPct`] <= config.output.all.rankPct) {
      tokens1.push(token);
    }
  }

  const desc = `All [${scoreKey === 'score' ? config.rules.scoreKey : scoreKey}]`;
  html = html + createCollectionTablesHtml(config, tokens1, numDone, scoreKey, 1, config.output.all.imgPct, desc, true, true);

  return html;
}

function createCollectionBuynowHtml(config, scoreKey) {
  let html = '';
  const numDone = countDone(config.data.collection.tokens);
  miscutil.sortBy1Key(config.data.collection.tokens, config.rules.scoreKey, false);

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
  html = html + createCollectionTablesHtml(config, tokensLevel1, numDone, scoreKey, 1, config.output.buynow1.imgPct, desc1, true, false);

  const desc2 = `Rank < ${(config.output.buynow2.rankPct * 100).toFixed(1)}%, Price < ${config.output.buynow2.price} ETH (${scoreDesc})`;
  html = html + createCollectionTablesHtml(config, tokensLevel2, numDone, scoreKey, 2, config.output.buynow2.imgPct, desc2, true, false);

  const desc3 = `Rank < ${(config.output.buynow3.rankPct * 100).toFixed(1)}%, Price < ${config.output.buynow3.price} ETH (${scoreDesc})`;
  html = html + createCollectionTablesHtml(config, tokensLevel3, numDone, scoreKey, 3, config.output.buynow3.imgPct, desc3, true, false);

  return html;
}

function createCollectionTablesHtml(config, tokens, numDone, scoreKey, level, imgPct, desc, showAllRanks = false, showLastPrice = false) {
  let html = '';

  let buttonsHtml = '';
  let lastButtonVal = 1;
  for (let buttonVal of config.buttons) {
    buttonsHtml = buttonsHtml + `<button onClick="openLinks('checkbox_${level}', ${lastButtonVal}, ${buttonVal})">${buttonVal}</button>&nbsp;&nbsp;`;
    lastButtonVal = buttonVal;
  }

  html = html + `
    <div class="level${level}">
    <span><b>${Math.round(numDone * 100 / config.maxSupply)} %</b> (${numDone} of ${config.maxSupply}): {NUM_INCLUDED} tokens</span>&nbsp;&nbsp;&nbsp;
    ${buttonsHtml}
    `;

  html = html + `
    <table>
    <tr style="background: black; color: white"><td colspan="100%">${desc}</td></tr>
    <tr>
        <th>Image</th>
        <th></th>
        <th>Pct</th>
        <th>Price</th>
        ${!showLastPrice ? '' : '<th>Last</th>'}
        <th>Rank&nbsp;&nbsp;</th>
        ${!showAllRanks ? '' : '<th>RCN</th><th>RC</th><th>RN</th><th>R</th>'}
        <th>Score&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
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

    const rowClass = doHilite ? 'hilite' : '';
    const assetLink = `${BASE_ASSET_URL}/${config.contractAddress}/${token.tokenId}`;
    const imageHtml = rankPct <= imgPct ? `<a target="_blank" href="${assetLink}"><img class="thumb" src="${normalizeURI(token.image)}"></a>` : '';
    const checkboxHtml = `<input type="checkbox" class="checkbox_${level}" ${doHilite ? 'checked' : ''} value="${token.tokenId}">`;
    const percentHtml = `<a target="id_${token.tokenId}" href="${assetLink}">${(rankPct * 100).toFixed(1)} %</a>`;
    const priceHtml = token.price > 0 ? `${(token.price.toFixed(2))}` : '';
    const lastPriceText = token.lastPrice > 0 ? `${(token.lastPrice.toFixed(2))}` : '';
    const lastPriceHtml = !showLastPrice ? '' : `<td class="blur">${lastPriceText}</td>`;
    const scoreHtml = score.toFixed(0);
    const allRanksHtml = !showAllRanks ? '' : `
        <td class="blur">${token.rarityCountNormRank}</td>
        <td class="blur">${token.rarityCountRank}</td>
        <td class="blur">${token.rarityNormRank}</td>
        <td class="blur">${token.rarityRank}</td>`;

    html = html + `
        <tr class="${rowClass}">
            <td>${imageHtml}</td>
            <td>${checkboxHtml}</td>
            <td>${percentHtml}</td>
            <td>${priceHtml}</td>
            ${lastPriceHtml}
            <td><b>${token[`${scoreKey}Rank`]}</b></td>
            ${allRanksHtml}
            <td>${scoreHtml}</b></td>
            <td>:${token.tokenId}</td>
        </tr>`;
  }
  html = html + `</table></div>`;

  html = html.replace('{NUM_INCLUDED}', numIncluded);

  return html;
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
