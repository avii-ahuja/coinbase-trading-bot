import Bot from "./Bot";
import BigNumber from "bignumber.js";

const b = new Bot("BTC-USD", 30, 5);

let callAmount = 0;
process.on("SIGINT", async () => {
    if(callAmount < 1){
        console.log("\nStopping gracefully...")
        await b.stop();
        callAmount++;
    }
    else{
        process.exit(1);
    }
})
b.start().then(r => {});
