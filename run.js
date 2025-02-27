import axios from 'axios';
import fs from 'fs';
import { banner } from './banner.js';
import chalk from 'chalk';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { CapMonsterCloudClientFactory, ClientOptions, RecaptchaV2ProxylessRequest } from '@zennolab_com/capmonstercloud-client';

console.log(banner);


const cmcClient = CapMonsterCloudClientFactory.Create(new ClientOptions({ clientKey: '512022458d2ce1dd49909e55ee95e4cc' }));


let wallets = fs.readFileSync('wallets.txt', 'utf-8').split('\n').filter(Boolean);
const proxies = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);

const targetUrl = 'https://faucet.gokite.ai/api/sendToken';


const headers = {
  'authority': 'faucet.gokite.ai',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'origin': 'https://faucet.gokite.ai',
  'referer': 'https://faucet.gokite.ai/?',
  'sec-ch-ua': '"Not-A.Brand";v="99", "Chromium";v="124"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
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
  let successAddresses = [];

  for (let i = 0; i < wallets.length; i++) {
    const address = wallets[i];
    let retryCount = 0;
    const maxRetries = 3;

    console.log(chalk.yellow(`🚀 Running for address: ${address}`));

    while (retryCount < maxRetries) {
      try {
        const proxy = proxies[retryCount % proxies.length];
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
        console.error(chalk.red(`❌ Error for ${address} (Attempt ${retryCount}) using proxy ${proxy}:`), 
                      chalk.red(error.response ? JSON.stringify(error.response.data, null, 2) : error.message));

        if (retryCount < maxRetries) {
          console.log(chalk.yellow(`🔄 Retrying in 5 minutes...`));
          await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
        } else {
          console.error(chalk.red(`⛔ Max retries reached for ${address}. Moving on.`));
        }
      }
    }
  }

  
  wallets = wallets.filter(addr => !successAddresses.includes(addr));
  fs.writeFileSync('wallets.txt', wallets.join('\n'), 'utf-8');

  
  fs.appendFileSync('success-address.txt', successAddresses.join('\n') + '\n', 'utf-8');
  console.log(chalk.green('📜 Successfully saved completed addresses! 🎉'));
}

// Run function
sendRequests();
