import axios from 'axios';
import fs from 'fs';
import { banner } from './banner.js';
import chalk from 'chalk';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { CapMonsterCloudClientFactory, ClientOptions, RecaptchaV2ProxylessRequest } from '@zennolab_com/capmonstercloud-client';


const clientKey = fs.readFileSync('key.txt', 'utf-8').trim();
const cmcClient = CapMonsterCloudClientFactory.Create(new ClientOptions({ clientKey }));

let wallets = fs.readFileSync('wallets.txt', 'utf-8').split('\n').filter(Boolean);
const proxies = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);


const targetUrl = 'https://faucet.gokite.ai/api/sendToken';


const headers = {
  'authority': 'faucet.gokite.ai',
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'origin': 'https://faucet.gokite.ai',
  'referer': 'https://faucet.gokite.ai/?',
  'sec-ch-ua': '"Not-A.Brand";v="99", "Chromium";v="124"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};


function getProxyAgent(proxy) {
  if (!proxy.startsWith('http')) {
    proxy = `http://${proxy}`;
  }
  return new HttpsProxyAgent(proxy);
}

async function solveCaptcha() {
  const recaptchaV2ProxylessRequest = new RecaptchaV2ProxylessRequest({
    websiteURL: 'https://faucet.gokite.ai',
    websiteKey: '6LeNaK8qAAAAAHLuyTlCrZD_U1UoFLcCTLoa_69T',
  });

  const taskId = await cmcClient.CreateTask(recaptchaV2ProxylessRequest);
  console.log(chalk.blue('🛠️ Task created with ID:'), chalk.cyan(taskId));

  const result = await cmcClient.Solve(recaptchaV2ProxylessRequest);
  return result.solution.gRecaptchaResponse;
}


async function sendRequests() {
  console.log(banner);

  let successAddresses = [];

  for (let i = 0; i < wallets.length; i++) {
    const address = wallets[i];
    let retryCount = 0;
    const maxRetries = 5;

    console.log(chalk.yellow(`🚀 Running for address: ${address}`));

    while (retryCount < maxRetries) {
      let proxy = proxies[retryCount % proxies.length];

      try {
        const proxyAgent = getProxyAgent(proxy);
        console.log(chalk.blue(`🌍 Using proxy: ${proxy}`));

        const recaptchaToken = await solveCaptcha();
        const data = {
          address: address.trim(),
          token: '',
          v2Token: recaptchaToken,
          chain: 'KITE',
          couponId: '',
        };

        const response = await axios.post(targetUrl, data, {
          headers,
          httpsAgent: proxyAgent,
          httpAgent: proxyAgent,
        });

        console.log(chalk.green(`✅ Success for address ${address}:`), chalk.cyan(JSON.stringify(response.data, null, 2)));

        successAddresses.push(address);
        break;
      } catch (error) {
        retryCount++;

        if (error.response && error.response.status === 429) {
          console.log(chalk.red(`🚨 429 Too Many Requests - Switching Proxy...`));
        } else {
          console.error(chalk.red(`❌ Error for ${address} (Attempt ${retryCount}) using proxy ${proxy}:`), 
                        error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        }

        if (retryCount < maxRetries) {
          console.log(chalk.yellow(`🔄 Retrying in 1 minute...`));
          await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
        } else {
          console.error(chalk.red(`⛔ Max retries reached for ${address}. Moving on.`));
        }
      }
    }
  }

  
  wallets = wallets.filter(addr => !successAddresses.includes(addr));
  fs.writeFileSync('wallets.txt', wallets.join('\n'), 'utf-8');

  
  if (successAddresses.length > 0) {
    fs.appendFileSync('success-address.txt', successAddresses.join('\n') + '\n', 'utf-8');
    console.log(chalk.green('📜 Successfully saved completed addresses! 🎉'));
  }
}


sendRequests();
