import fs from "fs";
import * as fileutil from "./fileutil.js";
import * as rarity from "./rarity.js";
import * as miscutil from "./miscutil.js";
import { convertTokenURI } from './tokenURI.js';
import {
  countDone,
  countDoneConfig,
  countSkippedConfig,
  countFinishedBuynowConfig, countDoneOrSkip, countSkip
} from "./count.js";

const BASE_ASSET_URL = 'https://opensea.io/assets/';

function buildPage(html, title, config) {
  return pageTemplate(title, config).replace('{CONTENT}', html);
}

function pageTemplate(title, config) {
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
        .hilite {
          background: lightgray;
        }
        .level1, .level2, .level3, .level4, .level5
        {
            float:left;
            display:inline;
            margin: 10px 20px 10px 10px;
        }
    </style>
    </head>
    <body>
    {CONTENT}
    </body>
    </html>
    `;
}

export function createCollectionWebPage(config) {
  const numTokensDone = countDoneConfig(config);
  const path1 = fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity.html`);
  const path2 = fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-${numTokensDone}.html`);
  const html = config.threshold.buynow
    ? createHtmlCollectionBuynow(config, numTokensDone)
    : createHtmlCollectionAll(config, numTokensDone);
  fs.writeFileSync(path1, html);
  fs.writeFileSync(path2, html);
  return path1;
}

function createHtmlCollectionAll(config, numTokensDone) {
  let html = '';

  const tokenList = config.data.tokenList.filter(obj => obj.done);

  const tokensLevel1 = [];
  miscutil.sortBy1Key(tokenList, 'rarity', false);
  rarity.recalcRank(tokenList);
  for (const item of tokenList) {
    if (!item.done) {
      continue;
    }
    if (item.rankPct <= config.threshold.level) {
      tokensLevel1.push(item);
    }
  }
  if (tokensLevel1.length) {
    const desc = "All: Vanilla Rarity";
    html = html + createHtmlCollectionTables(tokensLevel1, numTokensDone, 'rarity', 1, config.threshold.image, desc, config);
  }

  const tokensLevel2 = [];
  miscutil.sortBy1Key(tokenList, 'rarityNormalized', false);
  rarity.recalcRank(tokenList);
  for (const item of tokenList) {
    if (item.rankPct <= config.threshold.level) {
      tokensLevel2.push(item);
    }
  }
  if (tokensLevel2.length) {
    const desc = "All: Rarity Normalized";
    html = html + createHtmlCollectionTables(tokensLevel2, numTokensDone, 'rarityNormalized', 2, config.threshold.image, desc, config);
  }

  return buildPage(html, 'Collection All', config);
}

function createHtmlCollectionBuynow(config, numTokensDone) {
  let html = '';

  const tokenList = config.data.tokenList.filter(obj => obj.done);

  miscutil.sortBy2Keys(tokenList, 'rarityNormalized', 'price', false, true);
  rarity.recalcRank(tokenList);

  const tokensLevel1 = [];
  const tokensLevel2 = [];
  const tokensLevel3 = [];
  for (const item of tokenList) {
    if (!config.buynowMap.get(item.tokenId) || !item.done) {
      continue;
    }

    if (item.rankPct <= config.threshold.level1 && item.price > 0 && item.price <= config.threshold.price1) {
      tokensLevel1.push(item);
    } else if (item.rankPct <= config.threshold.level2 && item.price > 0 && item.price <= config.threshold.price2) {
      tokensLevel2.push(item);
    } else if (item.rankPct <= config.threshold.level3 && item.price > 0 && item.price <= config.threshold.price3) {
      tokensLevel3.push(item);
    }
  }

  const desc1 = `Rank < ${(config.threshold.level1 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${config.threshold.price1} ETH`;
  html = html + createHtmlCollectionTables(tokensLevel1, numTokensDone, 'rarityNormalized', 1, config.threshold.image1, desc1, config);
  const desc2 = `Rank < ${(config.threshold.level2 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${config.threshold.price2} ETH`;
  html = html + createHtmlCollectionTables(tokensLevel2, numTokensDone, 'rarityNormalized', 2, config.threshold.image2, desc2, config);
  const desc3 = `Rank < ${(config.threshold.level3 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${config.threshold.price3} ETH`;
  html = html + createHtmlCollectionTables(tokensLevel3, numTokensDone, 'rarityNormalized', 3, config.threshold.image3, desc3, config);

  return buildPage(html, 'Collection Buynow', config);
}

function createHtmlCollectionTables(tokens, numTokensDone, scorePropertyName, level, maxImagePct, desc, config) {
  let html = '';

  let buttonsHtml = '';
  let lastButtonVal = 1;
  for (let buttonVal of config.buttons) {
    buttonsHtml = buttonsHtml + `<button onClick="openLinks('checkbox_${level}', ${lastButtonVal}, ${buttonVal})">${buttonVal}</button>&nbsp;&nbsp;`;
    lastButtonVal = buttonVal;
  }

  html = html + `
    <div class="level${level}">
    <span>Calc Supply: <b>${numTokensDone}</b> ({QTY})</span>&nbsp;&nbsp;&nbsp;
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
        <th>Rank&nbsp;&nbsp;</th>
        <th>Score&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
        <th>ID</th>
    </tr>`;

  const doHilite = level === 1;
  for (const item of tokens) {
    const assetLink = `${BASE_ASSET_URL}/${config.contractAddress}/${item.tokenId}`;
    const imageHtml = item.rankPct <= maxImagePct ? `<a target="_blank" href="${assetLink}"><img class="thumb" src="${convertTokenURI(item.image)}"></a>` : '';
    const checkboxHtml = `<input type="checkbox" class="checkbox_${level}" ${doHilite ? 'checked' : ''} value="${item.tokenId}">`;
    const percentHtml = `<a target="id_${item.tokenId}" href="${assetLink}">${(item.rankPct * 100).toFixed(1)} %</a>`;
    const priceHtml = item.buynow && item.price > 0 ? `${(item.price.toFixed(3))} eth` : '';
    if (item[scorePropertyName] == undefined) {
      console.log(item);
      console.log(scorePropertyName);
    }
    const rarityHtml = item[scorePropertyName].toFixed(0);
    const rowClass = doHilite ? 'hilite' : '';
    html = html + `
        <tr class="${rowClass}">
            <td>${imageHtml}</td>
            <td>${checkboxHtml}</td>
            <td>${percentHtml}</td>
            <td>${priceHtml}</td>
            <td><b>${item.rank}</b></td>
            <td>${rarityHtml}</b></td>
            <td>:${item.tokenId}</td>
        </tr>`;
  }
  html = html + `</table></div>`;

  html = html.replace('{QTY}', tokens.length.toString());

  return html;
}
