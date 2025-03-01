import axios from 'axios';
import fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { CapMonsterCloudClientFactory, ClientOptions, RecaptchaV2ProxylessRequest } from '@zennolab_com/capmonstercloud-client';


const clientKey = fs.readFileSync('key.txt', 'utf-8').trim();
const cmcClient = CapMonsterCloudClientFactory.Create(new ClientOptions({ clientKey }));



let wallets = fs.readFileSync('wallets.txt', 'utf-8').split('\n').filter(Boolean);



let proxies = fs.readFileSync('proxy.txt', 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(proxy => `http://${proxy}`); // Ensure proxies have the correct protocol



const targetUrl = 'https://faucet.gokite.ai/api/sendToken';

// Headers
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
    if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
        return new HttpsProxyAgent(proxy);
    } else if (proxy.startsWith('socks5://')) {
        return new SocksProxyAgent(proxy);
    } else {
        console.error("Invalid proxy format:", proxy);
        return null;
    }
}


async function solveCaptcha() {
    const recaptchaV2ProxylessRequest = new RecaptchaV2ProxylessRequest({
        websiteURL: 'https://faucet.gokite.ai',
        websiteKey: '6LeNaK8qAAAAAHLuyTlCrZD_U1UoFLcCTLoa_69T',
    });

    const taskId = await cmcClient.CreateTask(recaptchaV2ProxylessRequest);
    console.log('Task created with ID:', taskId);

    const result = await cmcClient.Solve(recaptchaV2ProxylessRequest);
    return result.solution.gRecaptchaResponse;
}



async function sendRequests() {
    for (let i = 0; i < wallets.length; i++) {
        const address = wallets[i];
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                // Select proxy and get agent
                const proxy = proxies[retryCount % proxies.length]; // Rotate proxies
                console.log(`Using proxy: ${proxy}`);
                const proxyAgent = getProxyAgent(proxy);

                if (!proxyAgent) {
                    throw new Error("Proxy agent creation failed.");
                }

                
                
                const recaptchaToken = await solveCaptcha();

                const data = {
                    address: address.trim(),
                    token: '',
                    v2Token: recaptchaToken,
                    chain: 'KITE',
                    couponId: '',
                };

                // Send request
                const response = await axios.post(targetUrl, data, {
                    headers,
                    httpsAgent: proxyAgent,
                    httpAgent: proxyAgent,
                });

                console.log(`✅ Success for address ${address}:`, response.data);

                // Save success address
                fs.appendFileSync('success-address.txt', `${address}\n`, { flag: 'a' });

                
                wallets = wallets.filter((addr) => addr !== address);
                fs.writeFileSync('wallets.txt', wallets.join('\n'));

                break; // Exit retry loop if successful
            } catch (error) {
                retryCount++;
                console.error(`❌ Error for address ${address} (Attempt ${retryCount}):`, error.response ? error.response.data : error.message);

                if (retryCount < maxRetries) {
                    console.log("🔄 Retrying with new proxy in 3 seconds...");
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                } else {
                    console.error(`⚠️ Max retries reached for address ${address}. Moving to the next address.`);
                }
            }
        }
    }
}


sendRequests();
