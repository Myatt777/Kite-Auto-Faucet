import axios from 'axios';
import fs from 'fs';
import chalk from 'chalk';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { banner } from './banner.js';
import { CapMonsterCloudClientFactory, ClientOptions, RecaptchaV2ProxylessRequest } from '@zennolab_com/capmonstercloud-client';
import { publicIpv4 } from 'public-ip';


const clientKey = fs.readFileSync('key.txt', 'utf-8').trim();


const cmcClient = CapMonsterCloudClientFactory.Create(new ClientOptions({ clientKey }));

// wallets.txt ထဲက address တွေကို ဖတ်ပါ
const wallets = fs.readFileSync('wallets.txt', 'utf-8').split('\n').filter(Boolean);

// proxy.txt ထဲက proxy တွေကို ဖတ်ပါ
const proxies = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);

console.log(banner);


function getRandomProxy() {
  return proxies[Math.floor(Math.random() * proxies.length)];
}


function getProxyAgent(proxy) {
  if (proxy.startsWith('http')) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy.startsWith('socks')) {
    return new SocksProxyAgent(proxy);
  }
  return null;
}


async function solveCaptcha() {
  const recaptchaV2ProxylessRequest = new RecaptchaV2ProxylessRequest({
    websiteURL: 'https://faucet.gokite.ai',
    websiteKey: '6LeNaK8qAAAAAHLuyTlCrZD_U1UoFLcCTLoa_69T',
  });

  const taskId = await cmcClient.CreateTask(recaptchaV2ProxylessRequest);
  console.log(chalk.yellow('🔍 Captcha solving... Task ID:', taskId));

  const result = await cmcClient.Solve(recaptchaV2ProxylessRequest);
  return result.solution.gRecaptchaResponse;
}


async function waitForIpChange(previousIp) {
  console.log(chalk.magenta('🔄 Waiting for IP to change...'));

  let newIp;
  do {
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 sec wait
    newIp = await publicIpv4().catch(() => null);
  } while (!newIp || newIp === previousIp);

  console.log(chalk.green(`✅ IP changed! New IP: ${newIp}`));
  return newIp;
}


async function sendRequests() {
  let currentIp = await publicIpv4().catch(() => null);
  console.log(chalk.green(`🌍 Current IP: ${currentIp}`));

  for (const address of wallets) {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        
        const proxy = getRandomProxy();
        const proxyAgent = getProxyAgent(proxy);

        console.log(chalk.cyan(`🌐 Using proxy: ${proxy}`));

    
        const recaptchaToken = await solveCaptcha();

        const data = {
          address: address.trim(),
          token: '',
          v2Token: recaptchaToken,
          chain: 'KITE',
          couponId: '',
        };

    
        const headers = {
          'authority': 'faucet.gokite.ai',
          'accept': 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'origin': 'https://faucet.gokite.ai',
          'referer': 'https://faucet.gokite.ai/?',
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        };

        
        const response = await axios.post(
          'https://faucet.gokite.ai/api/sendToken',
          data,
          {
            headers: headers,
            httpsAgent: proxyAgent,
            httpAgent: proxyAgent,
          }
        );

        console.log(chalk.blue(`📩 Response for address ${address}:`), response.data);

    
        currentIp = await waitForIpChange(currentIp);
        break;
      } catch (error) {
        retryCount++;
        console.error(chalk.red(`❌ Error for address ${address} (Attempt ${retryCount}):`), error.response ? error.response.data : error.message);

        if (retryCount < maxRetries) {
          console.log(chalk.yellow(`🔄 Retrying in 2 minutes...`));
          await new Promise((resolve) => setTimeout(resolve, 2 * 60 * 1000)); // 2 minutes wait
        } else {
          console.error(chalk.red(`🚫 Max retries reached for address ${address}. Moving to the next address.`));
        }
      }
    }
  }
}


sendRequests();
