import Bot from "./Bot";
import 'dotenv/config'

const productId = process.env.PRODUCT;
const depth = process.env.DEPTH;
const updateInterval = process.env.UPDATE_INTERVAL;

const b = new Bot({productId, depth, updateInterval});

process.on("SIGINT", async () => {
    console.log("\nStopping gracefully...")
    await b.stop();
})

b.start().then(_ => {});
