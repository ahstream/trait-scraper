import { curly } from "node-libcurl";
import fs from "fs";

async function curlGet(uri, item) {
  try {
    item.statusText = "fetch-begin";
    item.fetchStart = new Date();
    item.tokenURI = uri;

    // const certfile = 'C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert.pem';

    const options = {
      //  port: 443,
      // when using this code in production, for high throughput you should not read
      //   from the filesystem for every call, it can be quite expensive. Instead
      //   consider storing these in memory
      //  cert: fs.readFileSync(path.resolve(fileutil.currentDir(), '../ssh/certificate.crt'), `utf-8`),
      //  key: fs.readFileSync(path.resolve(fileutil.currentDir(), '../ssh/privatekey.key'), 'utf-8'),
      //  passphrase: '',
      // ca: fs.readFileSync(certfile),
      // key: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/privatekey.pem', 'utf-8'),
      // cert: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/certificate.pem', `utf-8`),
      //  cacert: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert.pem', `utf-8`),
      // key: fs.readFileSync(certfile, 'utf-8'),
      // cert: fs.readFileSync(certfile, `utf-8`),

      // in test, if you're working with self-signed certificates
      // rejectUnauthorized: false
      // ^ if you intend to use this in production, please implement your own
      //  `checkServerIdentity` function to check that the certificate is actually
      //  issued by the host you're connecting to.
      //
      //  eg implementation here:
      //  https://nodejs.org/api/https.html#https_https_request_url_options_callback

      // keepAlive: true // switch to true if you're making a lot of calls from this client
      //  redirect: 'follow' // set to `manual` to extract redirect headers, `error` to reject redirect
    };

    // const sslConfiguredAgent = new https.Agent(options);

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
    // const request = {
    // agent: sslConfiguredAgent,
    // agent: false,
    // headers,
    // authority: 'node1.web3api.com',
    // referrerPolicy: 'origin-when-cross-origin',
    // mode: 'cors'
    // };

    const uri2 = "https://www.example.com/";
    const response = await curly.get(uri2, {
      httpHeader: headers,
      sslCert: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert-curl.pem', `utf-8`),
      //sslKey: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/privatekey.key', `utf-8`),
      //sslVerifyPeer: false,
      //sslVerifyHost: false,
      // cainfo: fs.readFileSync('C:/Users/anhe92/Documents/GitHub/trait-scraper/ssh/cacert-curl.pem', `utf-8`),
    });

    let data;
    try {
      item.statusCode = response.status;
      const jsonData = JSON.parse(response.data);
      item.statusText = "ok";
      item.fetchStop = new Date();
      return jsonData;
    } catch (error) {
      item.statusCode = response.status;
      item.statusText = "error";
      item.fetchStop = new Date();
      return {};
    }
  } catch (error) {
    log.error(JSON.stringify(error));
    item.statusText = "error";
    item.fetchStop = new Date();
    return {};
  }
}
