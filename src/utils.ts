import {RBTree} from "bintrees";
import BigNumber from "bignumber.js";

// messages in a channel
export interface IChannelMessage {
    channel: string;
    client_id?: string;
    timestamp: string;
    sequence_num: number;
    events: IChannelEvent[];
}

// events in a message
export interface IChannelEvent {
    type: string;
    product_id: string;
    updates?: IOrderUpdate[];
}

// bid or offer side
export type Side = 'bid' | 'offer';

// order updates
interface IOrderUpdate {
    side: Side;
    event_time: string;
    price_level: string;
    new_quantity: string;
}

// to store orders locally
export interface IOrder {
    price: BigNumber,
    size: BigNumber,
    side: Side
}

// create a Red-black tree to store orders sorted by their prices (uses Factory method pattern)
export function PriceTreeFactory<T extends IOrder>() {
    return new RBTree<T>((a: T, b: T) => a.price.comparedTo(b.price));
}

// Parameters for API JWT generation
export interface IAPIParams {
    requestMethod: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    requestPath: string
}