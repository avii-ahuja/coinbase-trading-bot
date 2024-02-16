import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import WebSocket from "ws";
import BigNumber from "bignumber.js";
import {RBTree} from "bintrees";
import {IChannelEvent, IChannelMessage, IOrder, PriceTreeFactory, Side} from "./utils";

/**
 * OrderBook - maintains a local copy of the level2 orderbook
 */
class OrderBook{
    private readonly productId;
    private readonly accessKey;
    private readonly privateKey;

    private readonly url;
    public ws: WebSocket;

    // store the bids and offers in a Binary Tree (sorted, to get best bids/offers)
    private readonly bids: RBTree<IOrder>;
    private readonly offers: RBTree<IOrder>;

    private stopped: boolean; // if we need to stop maintaining the order book
    private closed: boolean; // if websocket is closed

    /**
     *
     * @param accessKey - Advanced Trade API Access Key.
     * @param privateKey - Advanced Trade API Private Key.
     * @param productId - Coinbase product.
     * @param url - Websocket url.
     */
    constructor({accessKey, privateKey, productId, url}: {accessKey: string, privateKey: string, productId: string, url: string}) {
        this.url = url;
        this.accessKey = accessKey;
        this.privateKey = privateKey;
        this.productId = productId;

        this.bids = PriceTreeFactory<IOrder>();
        this.offers = PriceTreeFactory<IOrder>();

        this.stopped = false;
        this.closed = true;

        // connect to websocket
        this.ws = new WebSocket(this.url);

        // start receiving messages
        this.startSync();
    }

    public startSync(){
        //clear the orderbooks
        this.bids.clear();
        this.offers.clear();

        // subscribe to the level2 orderbook channel
        this.ws.on("open", () => {
            this.heartbeatsSubscribe(); // this is needed in case of ill-liquid assets to maintain connection
            this.level2Subscribe();
            console.log("Connected...")
            this.closed = false;
        })

        this.ws.on("message", (data: string) => {
            this.handleMessage(data);
        })

        this.ws.on("close", () => {
            this.closed = true;
            if(!this.stopped){
                // re-attempt connection
                setTimeout(() => {
                    console.log("Disconnected. Reattempting in 1 sec...")
                    this.ws = new WebSocket(this.url);
                    this.startSync();
                }, 1000);
            }
        })

        this.ws.on("error", () => {
            if(this.ws.readyState !== WebSocket.OPEN && !this.stopped){
                // re-attempt connection
                setTimeout(() => {
                    console.log("Error. Re-attempting in 1 sec...")
                    this.ws = new WebSocket(this.url);
                    this.startSync();
                }, 1000);
            }
        })

    }

    // check if WebSocket is connected
    public isConnected(): boolean{
        return !this.closed;
    }

    // stop maintaining the orderbook
    public stopSync(){
        if(!this.stopped){
            // Don't need these, kept for readability
            // this.heartbeatsUnsubscribe();
            // this.level2Unsubscribe();
            this.stopped = true;

            // terminate the websocket connection
            this.ws.terminate();
        }
    }

    /**
     * Get the best bid and offer from teh local order book
     */
    public getBestBidOffer(): {bid: IOrder | null, offer: IOrder | null} {
        if(this.closed){
            return {bid: null, offer: null};
        }
        const bestBid = this.bids.max();
        const bestOffer = this.offers.min();

        if(!bestOffer || !bestBid) return {bid: null, offer: null};
        console.log({
            bestBid: bestBid.price.toString(),
            bestOffer: bestOffer.price.toString(),
            midMarket: ((bestBid.price.plus(bestOffer.price)).dividedBy(2)).toString()
        })

        return {bid: bestBid, offer: bestOffer};
    }

    /**
     * Handle incoming websocket level-2 orderbook message
     * @param data - message string
     * @private
     */
    private handleMessage(data: string){
        const message: IChannelMessage = JSON.parse(data);
        if(message.channel === "l2_data"){
            for(const event of message.events){
                this.handleUpdates(event);
            }
        }
    }

    /**
     * Handle each event in the message from the websocket
     * @param updates
     * @private
     */
    private handleUpdates(updates: IChannelEvent){
        for(const update of updates.updates ?? []){
            const price = BigNumber(update.price_level);
            const size = BigNumber(update.new_quantity);
            const side = update.side;

            // get bid tree or offer tree depending on order
            const tree = this.getTree(side);
            const order:IOrder = {price, size, side};

            // check if order at that price exists
            const existing = tree.find(order);

            // it doesn't exist, then insert it
            if(!existing){
                // only insert if size is non-zero
                // missing sequence number bug in Coinbase WebSocket
                if(!order.size.eq(BigNumber(0))){
                    tree.insert(order);
                }
            }
            else{
                // it exists

                // remove if size is 0
                if(order.size.eq(0)){
                    tree.remove(existing);
                }
                // otherwise, update the size at the price level
                else{
                    existing.size = order.size;
                }
            }
        }
    }

    /**
     * Get bid tree or offer tree depending on the side
     * @param side
     * @private
     */
    private getTree(side: Side){
        if(side === "bid") return this.bids;
        return this.offers;
    }

    /**
     * Sign message with token and timestamp to send across websocket
     * @param message
     * @private
     */
    private timestampAndSign(message: { type: string, channel: string, product_ids: string[] }){
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const jwt = this.getJWT();

        return { ...message, jwt: jwt, timestamp: timestamp };
    }

    /**
     * Subscribe to heartbeats channel
     * @private
     */
    private heartbeatsSubscribe(){
        const heartBeatMessage = {
            "type": "subscribe",
            "product_ids": [
                this.productId
            ],
            "channel": "heartbeats"
        }

        const subscribeMsg = this.timestampAndSign(heartBeatMessage);
        this.ws.send(JSON.stringify(subscribeMsg));
    }

    /**
     * Unsubscribe from heartbeats channel
     * @private
     */
    private heartbeatsUnsubscribe(){
        const heartBeatMessage = {
            "type": "unsubscribe",
            "product_ids": [
                this.productId
            ],
            "channel": "heartbeats"
        }

        const unsubscribeMsg = this.timestampAndSign(heartBeatMessage);
        this.ws.send(JSON.stringify(unsubscribeMsg));
    }

    /**
     * Subscribe to level2 order book channel
     * @private
     */
    private level2Subscribe(){
        const l2Message = {
            "type": "subscribe",
            "product_ids": [
                this.productId
            ],
            "channel": "level2",
        }

        const subscribeMsg = this.timestampAndSign(l2Message);
        this.ws.send(JSON.stringify(subscribeMsg));
    }

    /**
     * Unsubscribe to level2 orderbook channel
     * @private
     */
    private level2Unsubscribe(){
        const l2Message = {
            "type": "unsubscribe",
            "product_ids": [
                this.productId
            ],
            "channel": "level2",
        }

        const unsubscribeMsg = this.timestampAndSign(l2Message);
        this.ws.send(JSON.stringify(unsubscribeMsg));
    }

    /**
     * Create token for websocket messages
     * @private
     */
    private getJWT() : string {
        const service_name = "public_websocket_api"
        const algorithm = 'ES256';

        return jwt.sign(
            {
                aud: [service_name],
                iss: 'coinbase-cloud',
                nbf: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 120,
                sub: this.accessKey,
            },
            this.privateKey,
            {
                header: {
                    kid: this.accessKey,
                    alg: algorithm,
                    // @ts-ignore
                    nonce: crypto.randomBytes(16).toString('hex')
                },
            } as jwt.SignOptions
        );
    }
}


export default OrderBook;