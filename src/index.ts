import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import CREDENTIALS from "../coinbase_cloud_api_key.json" assert {type: "json"};

export const getApiJwt = (params: {requestMethod: string, url: string, requestPath: string}): string => {
    const {requestMethod, url, requestPath} = params;
    const accessKey = CREDENTIALS["name"];
    const privateKey = CREDENTIALS["privateKey"];

    const service_name = "retail_rest_api_proxy"
    const algorithm = 'ES256';

    return jwt.sign(
        {
            aud: [service_name],
            iss: 'coinbase-cloud',
            nbf: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 120,
            sub: accessKey,
            uri: `${requestMethod} ${url}${requestPath}`,
        },
        privateKey,
        {
            header: {
                kid: accessKey,
                alg: algorithm,
                // @ts-ignore
                nonce: crypto.randomBytes(16).toString('hex')
            },
        } as jwt.SignOptions
    );
}

export const getWsJWT = () : string => {
    const accessKey = CREDENTIALS["name"];
    const privateKey = CREDENTIALS["privateKey"];

    const service_name = "public_websocket_api"
    const algorithm = 'ES256';

    return jwt.sign(
        {
            aud: [service_name],
            iss: 'coinbase-cloud',
            nbf: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 120,
            sub: accessKey,
        },
        privateKey,
        {
            header: {
                kid: accessKey,
                alg: algorithm,
                // @ts-ignore
                nonce: crypto.randomBytes(16).toString('hex')
            },
        } as jwt.SignOptions
    );
}



import axios from "axios";
import WebSocket from "ws";
import fs from "fs";

// let config = {
//     method: 'get',
//     url: 'https://api.coinbase.com/api/v3/brokerage/products',
//     headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${token}`
// }};
//
// axios(config)
//     .then((response) => {
//         console.log(JSON.stringify(response.data));
//     })
//     .catch((error) => {
//         console.log(error);
//     });


const WS_API_URL = 'wss://advanced-trade-ws.coinbase.com';

function timestampAndSign(message: Object, channel: string, products: string[] = []) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const jwt = getWsJWT();

    return { ...message, jwt: jwt, timestamp: timestamp };
}

const CHANNEL_NAMES = {
    level2: 'level2',
    user: 'user',
    tickers: 'ticker',
    ticker_batch: 'ticker_batch',
    status: 'status',
    market_trades: 'market_trades',
    candles: 'candles',
};

function subscribeToProducts(products: string[], channelName: string, ws: WebSocket) {
    const message = {
        type: 'subscribe',
        channel: channelName,
        product_ids: products,
    };
    const subscribeMsg = timestampAndSign(message, channelName, products);
    ws.send(JSON.stringify(subscribeMsg));
}

function unsubscribeToProducts(products: string[], channelName: string, ws: WebSocket) {
    const message = {
        type: 'unsubscribe',
        channel: channelName,
        product_ids: products,
    };
    const unsubscribeMsg = timestampAndSign(message, channelName, products);
    ws.send(JSON.stringify(unsubscribeMsg));
}

function onMessage(data: string) {
    const parsedData = JSON.parse(data);
    fs.appendFile('Output1.txt', data, (err) => {
        // In case of a error throw err.
        if (err) throw err;
    });
}

const connections = [];
let sentUnsub = false;
let ctr = 0;
for (let i = 0; i < 1; i++) {
    const date1 = new Date(new Date().toUTCString());
    const ws = new WebSocket(WS_API_URL);

    ws.on('message', function (data: string) {
        ctr++;
        console.log({ctr})
        const date2 = new Date(new Date().toUTCString());
        const diffTime = Math.abs(date2.valueOf() - date1.valueOf());
        if (diffTime > 5000 && !sentUnsub) {
            console.log("unsubbing");
            unsubscribeToProducts(['USDT-USD'], CHANNEL_NAMES.level2, ws);
            sentUnsub = true;
        }

        const parsedData = JSON.parse(data);
        fs.appendFile('Output1.txt', data, (err) => {
            // In case of an error throw err.
            if (err) throw err;
        });

    });

    ws.on('open', function () {
        console.log("me")
        const products = ['USDT-USD'];
        subscribeToProducts(products, CHANNEL_NAMES.level2, ws);
    });

    connections.push(ws);
}