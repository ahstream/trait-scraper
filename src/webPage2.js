import { readFile, toAbsFilepath, writeFile, getFilesInFolder, deleteFile } from "./fileutil.js";
import * as rarity from "./rarity.js";
import * as miscutil from "./miscutil.js";
import { normalizeURI } from './tokenURI.js';
import { countDone, } from "./count.js";
import open from "open";
import { debugToFile } from "./config.js";

const BASE_ASSET_URL = 'https://opensea.io/assets/';

function buildPage(title, mainNavHtml, subNavHtml, headerHtml, contentHtml) {
  return importTemplate('page.html')
    .replace('{PAGE_TITLE}', title)
    .replace('{PAGE_MAIN_NAV}', mainNavHtml)
    .replace('{PAGE_SUB_NAV}', subNavHtml)
    .replace('{PAGE_HEADER}', headerHtml)
    .replace('{PAGE_CONTENT}', contentHtml);
}

function importTemplate(name) {
  return readFile(toAbsFilepath(`./templates/${name}`));
}

export function createRevealWebPage(config, pageNum = 1) {
  const content = createRevealWebPageHtml(config);
  const html = buildPage('Reveal Page', 'mainNavHtml', 'subNavHtml', 'headerHtml', content);
  const path = `${config.projectFolder}reveal-${pageNum.toString().padStart(4, '0')}.html`;
  writeFile(path, html);
  return path;
}

export function createRevealWebPageHtml(config) {
  let html = '';

  return importTemplate('reveal.html')
    .replace('{REVEAL_TOKEN_COL}', createRevealTokenColHtml(config.collection, config.rules.scoreKey))
    .replace('{REVEAL_HOT_COL}', createRevealHotColHtml(config.collection, config.rules.scoreKey))
    .replace('{REVEAL_IMAGE_COL}', createRevealImageColHtml(config.collection, config.rules.scoreKey));
}

export function createRevealTokenColHtml(collection, scoreKey) {
  let html = '';

  const tokens = miscutil.sort(collection.tokens.filter(obj => obj.price > 0), scoreKey, false);

  const numTokens = collection.tokens.length;

  for (const token of tokens.slice(0, 200)) {
    const rankPct = token[`${scoreKey}RankPct`];
    const titleTxt = createImageTitleText(token, scoreKey, numTokens);
    const imageHtml = `<a target="_blank" href="${token.assetURI}"><img alt='' title="${titleTxt}" class="thumb" src="${normalizeURI(token.image)}"></a>`;
    const rankHtml = `${token[`${scoreKey}Rank`]}`;
    // const rankPctHtml = `<a target="id_${token.tokenId}" href="${token.assetURI}">${normalizePct(rankPct * 100)}</a>`;
    const rankPctHtml = `${normalizePct(rankPct * 100)}&nbsp;`;
    const traitCountHtml = `${token.traitCount}`;
    const traitCountFreqHtml = `<b>${normalizePct(token.traitCountFreq * 100)}</b> <span class="lolite">(${token.traitCount})</span>`;
    const ovHtml = `<b>${normalizeOV(token[`${scoreKey}OV`])}</b>&nbsp;`;
    const scoreHtml = token[scoreKey].toFixed(0);
    const priceHtml = token.price ? normalizePrice(token.price) : '-';
    html = html + `
        <tr>
            <td>${imageHtml}</td>
            <td>${rankPctHtml}</td>
            <td>${ovHtml}</td>
            <td>${traitCountFreqHtml}</td>
            <td>${priceHtml}</td>
            <td class="lolite">${scoreHtml}</td>
            <td class="lolite">${rankHtml}</td>
        </tr>`;
  }

  return importTemplate('reveal-token-col.html')
    .replace('{TABLE_ROWS}', html);
}

export function createRevealHotColHtml(config) {
  let html = '';

  return importTemplate('reveal-hot-col.html')
    .replace('{TABLE_ROWS}', html);
}

export function createRevealImageColHtml(collection, scoreKey) {
  let html = '';

  // todo const tokens = miscutil.sort(collection.tokens.filter(obj => obj.price > 0), 'price', true);
  const tokens = miscutil.sort(collection.tokens.filter(obj => obj.price > 0), scoreKey, false);
  const numTokens = collection.tokens.length;

  for (const token of tokens.slice(0, 200)) {
    const titleTxt = createImageTitleText(token, scoreKey, numTokens);
    html = html + `<a target="_blank" href="${token.assetURI}"><img alt="" title="${titleTxt}" class="ov-thumb" src="${normalizeURI(token.image)}"></a>`;
  }

  return importTemplate('reveal-image-col.html')
    .replace('{CONTENT}', html);
}

function createImageTitleText(token, scoreKey, numTokens) {
  const rank = token[`${scoreKey}Rank`];
  const rankPct = token[`${scoreKey}RankPct`];
  const finalRank = '';

  const rankTxt = `Rank: ${rank} (${normalizePct(rankPct * 100)} % of ${numTokens})\n${finalRank}`;
  const ov = normalizeOV(token[`${scoreKey}OV`]);
  const ovTxt = `OV: ${ov}\n`;
  const traitCountTxt = `Trait Count: ${token.traitCount} (${normalizePct(token.traitCountFreq * 100)} %)\n`;
  const scoreTxt = `Score: ${token[scoreKey].toFixed(0)}\n`;
  const idTxt = `ID: ${token.tokenId}\n`;
  const priceTxt = `Price: ${token.price ? `${normalizePrice(token.price)} eth` : '-'}\n`;
  let traitsTxt = createTraitsText(token, scoreKey, numTokens);

  return `${rankTxt}${ovTxt}${traitCountTxt}${scoreTxt}${idTxt}${priceTxt}${traitsTxt}`;
}

function createTraitsText(token, scoreKey, numTokens) {
  // Normalize score key since traits do not have count (rarityCount*)!
  const normalizedScoreKey = scoreKey.replace('Count', '');
  const traits = miscutil.sort([...token.traits], normalizedScoreKey, false);
  let s = '\n';
  for (let trait of traits) {
    s = s + `${trait.value}             (${normalizeScore(trait[normalizedScoreKey])} pts)  (${normalizePct(trait.numWithTrait * 100 / numTokens)} %)  (${trait.trait_type})\n`;
  }
  return s;
}

export function createAnalyzeOVPage(config, numTokens, newToken) {
  const content = createAnalyzeOVHtml(config, numTokens, newToken);
  const path = `${config.projectFolder}ov-${numTokens}.html`;
  const title = `${numTokens.toString()} tokens OV analysis`;
  writeFile(path, buildPage(title, 'mainNav', 'subNav', createPageHeaderHtml(title), content));

  return path;
}

export function createAnalyzeOVHtml(config, numTokens, newToken) {
  let html = '';

  const scoreKey = 'rarityCountNorm';

  html = html + createCollectionScriptHtml(config);
  miscutil.sortBy1Key(config.data.collection.tokens, `${scoreKey}OV`, false);

  const finalRanks = config.data.collection.tokens.map(obj => obj.finalRank).sort((a, b) => {
    return a - b;
  });

  html = html + `<div>`;
  html = html + `<span>Num tokens: ${numTokens} (of ${config.maxSupply})</span>`;
  html = html + `New token ID: ${newToken.tokenId}, Final rank: ${newToken.finalRank}, rank: ${newToken.rarityCountNormRank}, OV: ${newToken.rarityCountNormOV.toFixed(0)}`;
  html = html + `<br>Final ranks: ${finalRanks.slice(0, 10).join(', ')}`;
  html = html + `<div><a href="./ov-${numTokens - 1}.html">Prev</a> | <a href="./ov-${numTokens + 1}.html">Next</a></div>`;
  html = html + `</div>`;

  html = html + `<div class="flex-container">`;

  html = html + `
    <div class="normal-list">
    <table>
    <tr style="background: black; color: white"><td colspan="100%">DESC</td></tr>
    <tr>
        <!--<th>ID</th>-->
        <th>Image</th>
        <th>Pct</th>
        <th>OV</th>
        <th>TF&nbsp;</th>
        <th>T</th>
        <th>Pr</th>
        <th>Sc</th>
        <th>Rnk</th>
    </tr>`;

  let numIncluded = 0;
  for (const token of config.data.collection.tokens) {
    if (!token.done) {
      continue;
    }
    numIncluded++;

    const score = token[`${scoreKey}`];
    const rankPct = token[`${scoreKey}RankPct`];

    const assetLink = `${BASE_ASSET_URL}/${config.contractAddress}/${token.tokenId}`;
    const imageHtml = `<a target="_blank" href="${assetLink}"><img class="thumb" src="${normalizeURI(token.image)}"></a>`;

    const rank = token[`${scoreKey}Rank`];
    const rankHtml = `${rank}`;
    const finalRankHtml = ''; // todo  token.finalRank ? ` <span class="lolite">(${token.finalRank})</span>` : '';

    const rankPctHtml = `<a target="id_${token.tokenId}" href="${assetLink}">${normalizePct(rankPct * 100)}</a>`;
    const finalRankPctHtml = token.finalRankPct ? ` <span class="lolite">(${normalizePct(token.finalRankPct * 100)})</span>` : '';

    const traitCountminMaxHtml = `${token.minTraits}-${token.maxTraits}`;
    const traitCountHtml = `${token.traitCount}`;
    const traitCountFreqHtml = `${normalizePct(token.traitCountFreq * 100)}`;

    const ov = token[`${scoreKey}OV`];
    const ovHtml = `${ov.toFixed(1)}`;

    const scoreHtml = score.toFixed(0);

    const priceHtml = '0.99'; // todo  token.price ? token.price.toFixed(2) : '-';

    html = html + `
        <tr class="hilite">
            <!--<td>${token.tokenId}&nbsp;</td>-->
            <td>${imageHtml}</td>
            <td>${rankPctHtml}${finalRankPctHtml}</td>
            <td><b>${ovHtml}</b></td>
            <td><b>${traitCountFreqHtml}</b></td>
            <td>${traitCountHtml}<!-- todo <span class="lolite">[${traitCountminMaxHtml}]</span>--></td>
            <td>${priceHtml}</td>
            <td class="lolite">${scoreHtml}</td>
            <td>${rankHtml}${finalRankHtml}</td>
        </tr>`;
  }
  html = html + `</table></div>`;

  const token = config.data.collection.tokens[0];

  const titleText = `Rank: 123 (2 % of 10000)\nFinal rank: 34 (1%)\nOV: 23.4\nTraits: 4 (7%, 3-8)\nScore: 345\nID: 1234\nPrice: 0.11 eth`;

  html = html + `
    <div class="hot-list">
    <table>
    <tr style="background: black; color: white"><td colspan="100%">DESC</td></tr>
    <tr>
        <!--<th>ID</th>-->
        <th>Image</th>
        <!--<th>OV</th>-->
        <!--<th>TF</th>-->
        <!--<th>Pr</th>-->
        <th>Reason</th>
    </tr>`;

  const assetLink = `${BASE_ASSET_URL}/${config.contractAddress}/${token.tokenId}`;
  const imageHtml = `<a target="_blank" href="${assetLink}"><img title="${titleText}" class="thumb" src="${normalizeURI(token.image)}"></a>`;

  const ov = token[`${scoreKey}OV`];
  const ovHtml = `${ov.toFixed(1)}`;
  const traitFreqHtml = '2';
  const priceHtml = '0.25';

  html = html + `
        <tr class="hilite-hot">
            <!--<td>${token.tokenId}&nbsp;</td>-->
            <td>${imageHtml}</td>
            <!--<td><b>${ovHtml}</b></td>-->
            <!--<td><b>${traitFreqHtml}</b></td>-->
            <!--<td>${priceHtml}</td>-->
            <td>Only 1 trait (23%)<br>OV 14.9<br>Price 0.99</td>
        </tr>`;
  html = html + `</table></div>`;

  html = html + `<div class="thumb-list">`;
  for (const token of config.data.collection.tokens) {
    if (!token.done) {
      continue;
    }
    0;
    const titleText = `Rank: 123 (2 % of 10000)\nFinal rank: 34 (1%)\nOV: 23.4\nTraits: 4 (7%, 3-8)\nScore: 345\nID: 1234\nPrice: 0.11 eth`;
    const assetLink = `${BASE_ASSET_URL}/${config.contractAddress}/${token.tokenId}`;
    html = html + `<a target="_blank" href="${assetLink}"><img title="${token.finalRank}\n${titleText}" class="ov-thumb" src="${normalizeURI(token.image)}"></a>`;
  }
  html = html + `</div>`;

  html = html + `</div>`;

  return html;
}

function normalizeScore(val) {
  if (val < 1) {
    return val.toFixed(1);
  } else {
    return val.toFixed(0);
  }
}

function normalizePct(val) {
  if (val < 0.1) {
    return val.toFixed(2);
  } else if (val < 10) {
    return val.toFixed(1);
  } else {
    return val.toFixed(0);
  }
}

function normalizePrice(val) {
  if (val >= 1000000000) {
    return `${(val / 1000000000).toFixed(0)}G`;
  }
  if (val >= 1000000) {
    return `${(val / 1000000).toFixed(0)}M`;
  }
  if (val >= 1000) {
    return `${(val / 1000).toFixed(0)}K`;
  }
  if (val < 1) {
    return val.toFixed(2);
  } else if (val < 10) {
    return val.toFixed(1);
  } else {
    return val.toFixed(0);
  }
}

function normalizeOV(val) {
  return val.toFixed(0);
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
