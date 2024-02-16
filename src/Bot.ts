import CREDENTIALS from "../coinbase_cloud_api_key.json";
import AdvancedTradeAPI from "./AdvancedTradeAPI";
import OrderBook from "./OrderBook";
import BigNumber from "bignumber.js";
import {v4 as uuidv4} from 'uuid';

class Bot {
    private readonly productId;
    private tradingAPI: AdvancedTradeAPI;
    private readonly DEPTH: BigNumber;
    private readonly UPDATE_INTERVAL: number;
    private orderBook: OrderBook;
    private buyOrderId: string | null;
    private sellOrderId: string | null;
    private stopLoop: boolean;
    private terminate: boolean;

    constructor(productId: string, depth: number, updateInterval: number) {
        this.productId = productId;
        this.tradingAPI = new AdvancedTradeAPI({
            accessKey: CREDENTIALS.name,
            privateKey: CREDENTIALS.privateKey,
            product_id: productId,
            url: "api.coinbase.com" //TODO: get from ENV
        });
        if (BigNumber(depth).lt(0)) {
            throw new Error("Invalid depth: cannot be less than 0")
        }
        this.DEPTH = BigNumber(depth);

        //TODO: check rate limitations
        if (updateInterval < 0) {
            throw new Error("Invalid updateInterval: cannot be < 0");
        }
        this.UPDATE_INTERVAL = updateInterval;

        this.orderBook = new OrderBook({
            accessKey: CREDENTIALS.name,
            privateKey: CREDENTIALS.privateKey,
            productId: productId,
            url: "wss://advanced-trade-ws.coinbase.com" //TODO: get from ENV
        })

        this.buyOrderId = null;
        this.sellOrderId = null;
        this.stopLoop = false;
        this.terminate = false;
    }

    private async placeOrders(): Promise<boolean> {
        if(this.stopLoop) return false;

        let bid, offer;

        while(!this.orderBook.isConnected() || !bid || !offer){
            if(this.stopLoop) return false;
            console.log("Getting best bids and offers...");
            const bestBidOffer = this.orderBook.getBestBidOffer();
            bid = bestBidOffer.bid;
            offer = bestBidOffer.offer;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if(!bid || !offer) return false;
        const bidPrice = bid.price;
        const offerPrice = offer.price;

        this.buyOrderId = null;
        this.sellOrderId = null;

        try{
            this.buyOrderId = await this.tradingAPI.createLimitOrderGTC({
                client_order_id: uuidv4(),
                side: "BUY",
                base_size: "1",
                limit_price: offerPrice.minus(this.DEPTH).toString()
            })
        }
        catch (e) {
            console.error("Could not create buy order");
            return false;
        }

        if(this.buyOrderId){
            try{
                this.sellOrderId = await this.tradingAPI.createLimitOrderGTC({
                    client_order_id: uuidv4(),
                    side: "SELL",
                    base_size: "1",
                    limit_price: bidPrice.plus(this.DEPTH).toString()
                })
            }
            catch(e){
                console.error("Could not create sell order");
                return false;
            }
        }
        return true;
    }


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

    public async stop(){
        this.orderBook.stopSync();

        this.stopLoop = true;

        // Cancel any remaining orders
        let canceled = await this.cancelOrders();
        while(!canceled && !this.terminate){
            canceled = await this.cancelOrders();
        }
    }

    public async start() {
        while(!this.stopLoop){
            let placed = await this.placeOrders();
            while(!placed && !this.stopLoop){
                console.log("Retrying placing orders...");
                placed = await this.placeOrders();
            }

            let elapsedTime = 0;
            while (elapsedTime < this.UPDATE_INTERVAL && !this.stopLoop) {
                await new Promise(resolve => setTimeout(resolve, 50));
                elapsedTime += 50;
            }

            let canceled = await this.cancelOrders();
            while(!canceled && !this.stopLoop){
                console.log("Retrying canceling orders...");
                canceled = await this.cancelOrders();
            }
        }
    }

}

export default Bot;