import { readFile, toAbsFilepath, writeFile, getFilesInFolder, deleteFile } from "./fileutil.js";
import * as miscutil from "./miscutil.js";
import { normalizeURI } from './tokenURI.js';

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
  const prevNextPageNames = [`./reveal-${(pageNum - 1).toString().padStart(4, '0')}.html`, `./reveal-${(pageNum + 1).toString().padStart(4, '0')}.html`];
  const content = createRevealWebPageHtml(config, prevNextPageNames);
  const html = buildPage('Reveal Page', '', '', 'Reveal page', content);
  const path = `${config.projectFolder}reveal-${pageNum.toString().padStart(4, '0')}.html`;
  writeFile(path, html);
  return path;
}

export function createRevealWebPageHtml(config, prevNextPageNames) {
  return importTemplate('reveal.html')
    .replace('{REVEAL_HEADER}', createRevealHeaderHtml(config, prevNextPageNames))
    .replace('{REVEAL_TOKEN_COL}', createRevealTokenColHtml(config.collection, config.rules))
    .replace('{REVEAL_HOT_COL}', createRevealHotColHtml(config.collection, config.rules, config.runtime))
    .replace('{REVEAL_IMAGE_COL}', createRevealImageColHtml(config.collection, config.rules));
}

export function createRevealHeaderHtml(config, prevNextPageNames) {
  let html = '';

  html = html + `<div><a href="${prevNextPageNames[0]}">Prev</a> | <a href="${prevNextPageNames[1]}">Next</a></div>`;

  const numTokens = config.collection.tokens.length;
  const maxSupply = config.collection.maxSupply;

  html = html + `<span>Settings: `;
  html = html + `<b>Max ${normalizePrice(config.rules.maxPrice)} ETH</b>, <b>${config.rules.maxTokens} tokens</b>&nbsp;|&nbsp;`;
  html = html + `Hot Traits: <b>"${config.rules.hotTraits.join(', ')}"</b>&nbsp;|&nbsp;Hot OV: <b>${config.rules.hotMinOV}</b>&nbsp;|&nbsp;Hot Trait Count: <b>${config.rules.hotMaxTraits}</b>`;
  html = html + `</span>`;
  html = html + `<br>`;

  html = html + `<span class="large-count">${numTokens}</span>`;
  html = html + `<span> revealed tokens &nbsp;</span>`;
  html = html + `<span class="large-count">${normalizePct(numTokens * 100 / maxSupply)}%</span>`;
  html = html + `<span> of ${maxSupply} total.</span>`;

  if (config.collection.assetInfo) {
    const ref = config.collection.assetInfo;
    const priceLevels3 = ref.levels.map(obj => `<span>(${obj.price})</span><span class="large-count">${obj.count}</span>`).join('');
    html = html + `<span>&nbsp; Buynow:<span class="large-count">${ref.numBuynow}</span> Floor:<span class="large-count">${normalizePrice(ref.floor)}</span> Price levels: ${priceLevels3}`;
  }

  return html;
}

export function createRevealTokenColHtml(collection, rules) {
  const numWithPrice = collection.tokens.filter(obj => obj.price > 0).length;
  const tokensWithRightPrice = miscutil.sort(collection.tokens.filter(obj => obj.price > 0 && obj.price <= rules.maxPrice), 'score', false);
  const tokens = tokensWithRightPrice.slice(0, rules.maxTokens);

  // const htmlDesc = `<span class="desc-text">Top ${tokens.length} (of ${numWithPrice}) Rare BuyNow tokens (of ${numWithPrice})</span>`;
  // const htmlDesc = `<span class="desc-text">Top ${tokens.length} (of ${numWithPrice}/${collection.tokens.length}) Rare BuyNow</span>`;
  const htmlDesc = `<span class="desc-text">Top ${tokens.length} Rare BuyNow</span>`;

  let html = '';

  for (const token of tokens) {
    const rankPct = token.scoreRankPct;
    const titleTxt = createImageTitleText(token, 'score', collection.tokens.length);
    const imageHtml = `<a target="_blank" href="${token.assetURI}"><img alt='' title="${titleTxt}" class="thumb" src="${normalizeURI(token.image)}"></a>`;
    const rankHtml = `${token.scoreRank}`;
    // const rankPctHtml = `<a target="id_${token.tokenId}" href="${token.assetURI}">${normalizePct(rankPct * 100)}</a>`;
    const rankPctHtml = `${normalizePct(rankPct * 100)}&nbsp;`;
    const traitCountHtml = `${token.traitCount}`;
    const traitCountFreqHtml = `<b>${normalizePct(token.traitCountFreq * 100)}</b> <span class="lolite">(${token.traitCount})</span>`;
    const ovHtml = `<b>${normalizeOV(token.scoreOV)}</b>&nbsp;`;
    const scoreHtml = token.score.toFixed(0);
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
    .replace('{DESC}', htmlDesc)
    .replace('{TABLE_ROWS}', html);
}

export function createRevealHotColHtml(collection, rules, runtime) {
  // const tokensWithRightPrice = miscutil.sort(collection.hotTokens.filter(obj => obj.price > 0), 'revealOrder', true);
  const tokensWithRightPrice = miscutil.sort(collection.hotTokens, 'revealOrder', false);
  const tokens = tokensWithRightPrice.slice(0, rules.maxTokens);

  const htmlDesc = `<span class="desc-text">Top ${tokens.length} Hot BuyNow</span>`;

  let html = '';

  for (const token of tokens) {
    const rowClassName = runtime.newHotTokens.find(obj => obj === token.tokenId) ? 'new-hot-token' : '';
    const titleTxt = createImageTitleText(token, 'score', collection.tokens.length);
    const className = 'thumb';
    const imageHtml = `<a target="_blank" href="${token.assetURI}"><img alt='' title="${titleTxt}" class="${className}" src="${normalizeURI(token.image)}"></a>`;
    const traitCountFreqHtml = `${normalizePct(token.traitCountFreq * 100)}</b> <span class="lolite">(${token.traitCount})</span>`;

    const hotReasons = [];
    if (token.hot.isHotTraitCount) {
      hotReasons.push(`<b>${token.traitCount} traits</b> (${traitCountFreqHtml}%)`);
    }
    if (token.hot.isHotOV) {
      hotReasons.push(`<b>OV ${normalizeOV(token.temp.scoreOV)}</b> (${normalizeOV(token.scoreOV)})`);
    }
    if (token.hot.traits.length) {
      token.hot.traits.forEach(obj => hotReasons.push(`"<b>${obj}</b>"`));
    }
    const ov = normalizeOV(token.scoreOV);
    const priceHtml = token.price ? normalizePrice(token.price) : '-';
    const rankPctHtml = `${normalizePct(token.scoreRankPct * 100)} (${token.scoreRank})`;

    // const reasonHtml = `${hotReasons.join(' + ')}<br>OV: ${ov}<br>Temp OV: ${tempOV}<br>TraitFreq: ${traitCountFreqHtml}<br>Price: ${priceHtml}`;
    const reasonHtml = `${hotReasons.join(' + ')}<br><br>OV: ${ov}<br>Pct: ${rankPctHtml}<br><b>${priceHtml}</b> eth`;

    html = html + `
        <tr class="${rowClassName}">
            <td>${imageHtml}</td>
            <td>${reasonHtml}</td>
        </tr>`;
  }

  runtime.newHotTokens = [];

  return importTemplate('reveal-hot-col.html')
    .replace('{DESC}', htmlDesc)
    .replace('{TABLE_ROWS}', html);
}

export function createRevealImageColHtml(collection, rules) {
  // todo sort by reveal order!?
  const tokensWithRightPrice = miscutil.sort(collection.tokens.filter(obj => obj.price > 0 && obj.price <= rules.maxPrice), 'price', true);
  const tokens = tokensWithRightPrice.slice(0, rules.maxTokens);
  const htmlDesc = `<span class="desc-text">Top ${tokens.length} Cheap BuyNow images</span>`;

  let html = '';

  for (const token of tokens) {
    const titleTxt = createImageTitleText(token, 'score', collection.tokens.length);
    html = html + `<a target="_blank" href="${token.assetURI}"><img alt="" title="${titleTxt}" class="ov-thumb" src="${normalizeURI(token.image)}"></a>`;
  }

  return importTemplate('reveal-image-col.html')
    .replace('{DESC}', htmlDesc)
    .replace('{CONTENT}', html);
}

function createImageTitleText(token, scoreKey, numTokens) {
  const rank = token[`${scoreKey}Rank`];
  const rankPct = token[`${scoreKey}RankPct`];
  const finalRank = '';

  const rankTxt = `Rank: ${rank} (${normalizePct(rankPct * 100)} % of ${numTokens})\n${finalRank}`;
  // Only show ov for simple scoreKey!
  const ovTxt = token.scoreOV ? `OV: ${normalizeOV(token.scoreOV)}\n` : '';
  const traitCountTxt = `Trait Count: ${token.traitCount} (${normalizePct(token.traitCountFreq * 100)} %)\n`;
  const scoreTxt = `Score: ${token[scoreKey].toFixed(0)}\n`;
  const orderTxt = `Reveal order: ${token.revealOrder}\n`;
  const idTxt = `ID: ${token.tokenId}\n`;
  const priceTxt = `Price: ${token.price ? `${normalizePrice(token.price)} eth` : '-'}\n`;
  let traitsTxt = createTraitsText(token, scoreKey, numTokens);

  return `${rankTxt}${ovTxt}${traitCountTxt}${scoreTxt}${idTxt}${orderTxt}${priceTxt}${traitsTxt}`;
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
