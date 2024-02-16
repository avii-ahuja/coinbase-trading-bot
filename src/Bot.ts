import CREDENTIALS from "../coinbase_cloud_api_key.json"; // get credentials from json file
import AdvancedTradeAPI from "./AdvancedTradeAPI";
import OrderBook from "./OrderBook";
import BigNumber from "bignumber.js";
import {v4 as uuidv4} from 'uuid';

/**
 * Bot
 */
class Bot {
    private readonly productId;
    private tradingAPI: AdvancedTradeAPI;
    private orderBook: OrderBook;

    private readonly DEPTH: BigNumber;
    private readonly UPDATE_INTERVAL: number;

    private buyOrderId: string | null;
    private sellOrderId: string | null;

    private stopLoop: boolean;


    /**
     *
     * @param {string} productId - Coinbase product.
     * @param {number} depth - depth at which orders need to be placed.
     * @param {number} updateInterval - interval at which we need to cancel and re-place orders (in ms).
     * @param {string} wsUrl - WebSocket URL.
     * @param {string} apiUrl - API URL.
     */
    constructor({productId, depth, updateInterval, wsUrl, apiUrl}: {productId: string, depth: number,
        updateInterval: number, wsUrl: string, apiUrl: string}) {
        this.productId = productId;

        // get methods to access the API
        this.tradingAPI = new AdvancedTradeAPI({
            accessKey: CREDENTIALS.name,
            privateKey: CREDENTIALS.privateKey,
            product_id: productId,
            url: apiUrl
        });

        // create our order book
        this.orderBook = new OrderBook({
            accessKey: CREDENTIALS.name,
            privateKey: CREDENTIALS.privateKey,
            productId: productId,
            url: wsUrl
        })

        // check for invalid depth
        if (BigNumber(depth).lt(0)) {
            throw new Error("Invalid depth: cannot be less than 0")
        }
        this.DEPTH = BigNumber(depth);

        // check for rate limit
        if (updateInterval < 132) {
            throw new Error("Invalid updateInterval: cannot be < 132 ms");
        }
        this.UPDATE_INTERVAL = updateInterval;

        this.buyOrderId = null;
        this.sellOrderId = null;
        this.stopLoop = false;  // to stop loop
    }

    /**
     * Place the buy and sell orders at DEPTH depth by looking at the bid-ask spread
     * @private
     * @returns Promise <boolean> if orders were successfully placed
     */
    private async placeOrders(): Promise<boolean> {
        if(this.stopLoop) return false;

        // get the best bid, offer
        let bid, offer;

        // wait for websocket to populate the local orderbook
        while(!this.orderBook.isConnected() || !bid || !offer){
            if(this.stopLoop) return false;
            console.log("Getting best bids and offers...");
            const bestBidOffer = this.orderBook.getBestBidOffer();
            bid = bestBidOffer.bid;
            offer = bestBidOffer.offer;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if(!bid || !offer) return false;

        // get best prices
        const bidPrice = bid.price;
        const offerPrice = offer.price;

        // order ids to be set after creation of orders
        this.buyOrderId = null;
        this.sellOrderId = null;

        // create limit orders
        try{
            // create a buy order at best ask price - DEPTH
            this.buyOrderId = await this.tradingAPI.createLimitOrderGTC({
                client_order_id: uuidv4(),
                side: "BUY",
                base_size: "1",
                limit_price: offerPrice.minus(this.DEPTH).toString()
            })
        }
        catch (e) {
            console.error("Error: Could not create buy order");
            return false;
        }

        if(this.buyOrderId){
            try{
                // create a sell order at best bid price + DEPTH
                this.sellOrderId = await this.tradingAPI.createLimitOrderGTC({
                    client_order_id: uuidv4(),
                    side: "SELL",
                    base_size: "1",
                    limit_price: bidPrice.plus(this.DEPTH).toString()
                })
            }
            catch(e){
                console.error("Error: Could not create sell order");
                return false;
            }
        }
        return true;
    }


    /**
     * Cancel buy and sell orders that were previously created
     * @private
     * @returns Promise <boolean> if orders were successfully placed
     */
    private async cancelOrders(): Promise<boolean> {
        if(this.buyOrderId && this.sellOrderId){
            try {
                await this.tradingAPI.cancelOrders({order_ids: [this.buyOrderId, this.sellOrderId]});
                return true;
            } catch (e) {
                console.error("Error: could not cancel orders", e);
                return false;
            }
        }
        else if(this.buyOrderId){
            try {
                await this.tradingAPI.cancelOrders({order_ids: [this.buyOrderId]});
                return true;
            } catch (e) {
                console.error("Error: could not cancel buy order", e);
                return false;
            }
        }
        else if(this.sellOrderId){
            try {
                await this.tradingAPI.cancelOrders({order_ids: [this.sellOrderId]});
                return true;
            } catch (e) {
                console.error("Error: could not cancel sell order", e);
                return false;
            }
        }
        return true;
    }

    /**
     * Stop execution of bot
     */
    public async stop(){
        // stop updating the orderbook
        this.orderBook.stopSync();

        this.stopLoop = true;

        // Cancel any remaining orders
        await this.cancelOrders();
    }

    /**
     * Start execution of bot
     */
    public async start() {
        while(!this.stopLoop){

            // place orders
            let placed = await this.placeOrders();
            while(!placed && !this.stopLoop){
                console.log("\nRetrying placing orders...");
                placed = await this.placeOrders();
            }

            // wait for UPDATE_INTERVAL seconds
            let elapsedTime = 0;
            while (elapsedTime < this.UPDATE_INTERVAL && !this.stopLoop) {
                // using this method, we can avoid being stuck in the sync loop
                await new Promise(resolve => setTimeout(resolve, 50));
                elapsedTime += 50;
            }

            // cancel placed orders
            let canceled = await this.cancelOrders();
            while(!canceled && !this.stopLoop){
                console.log("\nRetrying canceling orders...");
                canceled = await this.cancelOrders();
            }
        }
    }

}

export default Bot;