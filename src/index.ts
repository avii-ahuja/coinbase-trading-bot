import Bot from "./Bot";
import 'dotenv/config'

const productId = process.env.PRODUCT || "BTC-USD";
const depth = parseInt(`${process.env.DEPTH}`) || 30;
const updateInterval = parseInt(`${process.env.UPDATE_INTERVAL}`) || 1000;  //1000 ms = 1s
const wsUrl = process.env.WS_URL || "wss://advanced-trade-ws.coinbase.com";
const apiUrl = process.env.API_URL || "api.coinbase.com";

try{
    const b = new Bot({productId, depth, updateInterval, wsUrl, apiUrl});

    // Stop the bot on a SIGINT (Ctrl-C)
    process.on("SIGINT", async () => {
        console.log("\nStopping gracefully...")
        await b.stop();
    })

    // start the bot
    b.start().then(_ => {}).catch((e) => {
        console.error(e);
    });
}
catch (e){
    console.error(e);
    process.exit(0);
}

