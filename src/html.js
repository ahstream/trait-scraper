import fs from "fs";
import * as fileutil from "./fileutil.js";

export function createWebPage(config) {
  const tokenList = getTokenListForResult(config);
  const numTokens = countDoneConfig(config);
  if (!config.threshold.buynow) {
    const htmlByRarity1 = createHtmlAll(tokenList, config.threshold, config);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity.html`), htmlByRarity1);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-${numTokens}.html`), htmlByRarity1);
  } else {
    const htmlByRarity1 = createHtmlBuynow(tokenList, config.threshold, config);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity.html`), htmlByRarity1);
    fs.writeFileSync(fileutil.toAbsoluteFilePath(`../config/projects/${config.projectId}/tokens-by-rarity-${numTokens}.html`), htmlByRarity1);
  }
}

function createSharedHtml(config, title) {
  let html = '';

  const revealTime = typeof config.data.revealTime === 'object' ? config.data.revealTime?.toLocaleString() : config.data.revealTime;
  const fetchedTime = typeof config.data.fetchedTime !== 'string' ? config.data.fetchedTime?.toLocaleString() : config.data.fetchedTime;

  html = html + `
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
    </head><body>
    <span>Revealed at: ${revealTime} &nbsp; Fetched at: ${fetchedTime} &nbsp; Secs to fetch all: ${config.data.fetchDuration ?? '-'}</span><br>
`;

  return html;
}

function createHtmlAll(tokenList, threshold, config) {
  const numTotalTokens = tokenList.length;

  let html = createSharedHtml(config, config.projectId);

  const tokensLevel1 = [];
  sortBy1Key(tokenList, 'rarity', false);
  recalcRank(tokenList);
  for (const item of tokenList) {
    if (item.rankPct <= threshold.level) {
      tokensLevel1.push(item);
    }
  }
  if (tokensLevel1.length) {
    const desc = "All: Vanilla Rarity";
    html = html + createHtmlTables(tokensLevel1, numTotalTokens, 'rarity', 1, threshold.image, desc, config);
  }

  const tokensLevel2 = [];
  sortBy1Key(tokenList, 'rarityNormalized', false);
  recalcRank(tokenList);
  for (const item of tokenList) {
    if (item.rankPct <= threshold.level) {
      tokensLevel2.push(item);
    }
  }
  if (tokensLevel2.length) {
    const desc = "All: Rarity Normalized";
    html = html + createHtmlTables(tokensLevel2, numTotalTokens, 'rarityNormalized', 2, threshold.image, desc, config);
  }

  html = html + `</body>`;

  return html;
}

function createHtmlBuynow(tokenList, threshold, config) {
  const numTotalTokens = tokenList.length;

  let html = createSharedHtml(config, config.projectId);

  sortBy2Keys(tokenList, 'rarityNormalized', 'price', false, true);
  recalcRank(tokenList);

  const tokensLevel1 = [];
  const tokensLevel2 = [];
  const tokensLevel3 = [];
  for (const item of tokenList) {
    if (!config.buynowMap.get(item.tokenId)) {
      continue;
    }

    if (item.rankPct <= threshold.level1 && item.price > 0 && item.price <= threshold.price1) {
      tokensLevel1.push(item);
    } else if (item.rankPct <= threshold.level2 && item.price > 0 && item.price <= threshold.price2) {
      tokensLevel2.push(item);
    } else if (item.rankPct <= threshold.level3 && item.price > 0 && item.price <= threshold.price3) {
      tokensLevel3.push(item);
    }
  }

  const desc1 = `Rank < ${(threshold.level1 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price1} ETH`;
  html = html + createHtmlTables(tokensLevel1, numTotalTokens, 'rarityNormalized', 1, threshold.image1, desc1, config);
  const desc2 = `Rank < ${(threshold.level2 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price2} ETH`;
  html = html + createHtmlTables(tokensLevel2, numTotalTokens, 'rarityNormalized', 2, threshold.image2, desc2, config);
  const desc3 = `Rank < ${(threshold.level3 * 100).toFixed(1)} % &nbsp;&nbsp; Price < ${threshold.price3} ETH`;
  html = html + createHtmlTables(tokensLevel3, numTotalTokens, 'rarityNormalized', 3, threshold.image3, desc3, config);

  html = html + `</body>`;

  return html;
}

function createHtmlTables(tokens, numTotalTokens, scorePropertyName, level, maxImagePct, desc, config) {
  let html = '';

  let buttonsHtml = '';
  let lastButtonVal = 1;
  for (let buttonVal of config.buttons) {
    buttonsHtml = buttonsHtml + `<button onClick="openLinks('checkbox_${level}', ${lastButtonVal}, ${buttonVal})">${buttonVal}</button>&nbsp;&nbsp;`;
    lastButtonVal = buttonVal;
  }

  html = html + `
    <div class="level${level}">
    <span>Calc Supply: <b>${numTotalTokens}</b> ({QTY})</span>&nbsp;&nbsp;&nbsp;
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
