import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import WebSocket from "ws";
import BigNumber from "bignumber.js";
import {RBTree} from "bintrees";

interface IChannelMessage {
    channel: string;
    client_id?: string;
    timestamp: string;
    sequence_num: number;
    events: IChannelEvent[];
}

interface IChannelEvent {
    type: string;
    product_id: string;
    updates?: IOrderUpdate[];
}

export type Side = 'bid' | 'offer';

interface IOrderUpdate {
    side: Side;
    event_time: string;
    price_level: string;
    new_quantity: string;
}

interface IOrder {
    price: BigNumber,
    size: BigNumber,
    side: Side
}

export function PriceTreeFactory<T extends IOrder>() {
    return new RBTree<T>( (a: T, b: T) => a.price.comparedTo(b.price) );
}

class OrderBook{
    private readonly productId;
    private readonly accessKey;
    private readonly privateKey;
    private readonly url;
    public ws: WebSocket;
    private readonly bids: RBTree<IOrder>;
    private readonly offers: RBTree<IOrder>;
    private stopped: boolean;
    private closed: boolean;

    constructor({accessKey, privateKey, productId, url}: {accessKey: string, privateKey: string, productId: string, url: string}) {
        this.url = url;
        this.accessKey = accessKey;
        this.privateKey = privateKey;
        this.productId = productId;

        this.bids = PriceTreeFactory<IOrder>();
        this.offers = PriceTreeFactory<IOrder>();

        this.stopped = false;
        this.closed = true;
        this.ws = new WebSocket(this.url);
        this.startSync();
    }

    public startSync(){
        this.bids.clear();
        this.offers.clear();
        this.ws.on("open", () => {
            this.heartbeatsSubscribe();
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
                setTimeout(() => {
                    console.log("Disconnected. Reattempting in 1 sec...")
                    this.ws = new WebSocket(this.url);
                    this.startSync();
                }, 1000);
            }
        })

        // TODO: do an error
        this.ws.on("error", () => {
            if(this.ws.readyState !== WebSocket.OPEN && !this.stopped){
                console.log("Disconnected. Reattempting in 1 sec...")
                this.ws = new WebSocket(this.url);
                setTimeout(() => this.startSync(), 1000);
            }
        })

    }

    public isConnected(): boolean{
        return !this.closed;
    }

    public stopSync(){
        if(!this.stopped){
            // this.heartbeatsUnsubscribe();
            // this.level2Unsubscribe();
            this.stopped = true;
            this.ws.terminate();
        }
    }

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

    private handleMessage(data: string){
        const message: IChannelMessage = JSON.parse(data);
        if(message.channel === "l2_data"){
            for(const event of message.events){
                this.handleUpdates(event);
            }
        }
    }

    private handleUpdates(updates: IChannelEvent){
        for(const update of updates.updates ?? []){
            const price = BigNumber(update.price_level);
            const size = BigNumber(update.new_quantity);
            const side = update.side;

            const tree = this.getTree(side);
            const order:IOrder = {price, size, side};
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

    private getTree(side: Side){
        if(side === "bid") return this.bids;
        return this.offers;
    }

    private timestampAndSign(message: { type: string, channel: string, product_ids: string[] }){
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const jwt = this.getJWT();

        return { ...message, jwt: jwt, timestamp: timestamp };
    }

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