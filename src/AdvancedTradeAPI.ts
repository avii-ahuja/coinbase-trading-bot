import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import axios, {AxiosRequestConfig} from "axios";
import {IAPIParams} from "./utils";

/**
 * Provides methods to access the Advanced Trade API
 */
class AdvancedTradeAPI {
    private readonly url;
    private readonly accessKey;
    private readonly privateKey;
    public readonly product_id;

    /**
     *
     * @param accessKey - Advanced Trade API Access Key.
     * @param privateKey - Advanced Trade API Private Key.
     * @param product_id - Coinbase product.
     * @param url - API url.
     */
    constructor({accessKey, privateKey, product_id, url}: {accessKey: string, privateKey: string,
        product_id: string, url: string}) {
        this.url = url;
        this.accessKey = accessKey;
        this.privateKey = privateKey;
        this.product_id = product_id;
    }

    /**
     * Create a GTC limit order
     * @param client_order_id - id to help client keep track of order.
     * @param side - BUY or SELL.
     * @param base_size - size of order
     * @param limit_price - price of order
     */
    public async createLimitOrderGTC({client_order_id, side, base_size, limit_price}: {
        client_order_id: string, side: "BUY" | "SELL", base_size: string, limit_price: string
    }) : Promise<string> {
        const params: IAPIParams = {
            requestMethod: "POST",
            url: this.url,
            requestPath: "/api/v3/brokerage/orders"
        }

        // get the JWT token
        const token = this.getJWT(params);

        const data = JSON.stringify({
            client_order_id,
            product_id: this.product_id,
            side,
            order_configuration: {
                limit_limit_gtc: {
                    base_size,
                    limit_price
                }
            }
        });

        const requestConfig: AxiosRequestConfig = {
            method: params.requestMethod,
            url: `https://${params.url}${params.requestPath}`,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            data: data
        }

        try {
            const response = await axios(requestConfig);
            // return the generated order id
            return response.data.order_id;
        }
        catch(e){
            throw Error(`Cannot create ${side} order: Reason ${(e as Error).message}`);
        }
    }

    /**
     * Cancel orders with specified order_ids
     * @param order_ids - ids of orders that need to be cancelled
     */
    public async cancelOrders({order_ids}: { order_ids: string[]}){
        const params: IAPIParams = {
            requestMethod: "POST",
            url: this.url,
            requestPath: "/api/v3/brokerage/orders/batch_cancel"
        };

        const token = this.getJWT(params);

        const data = JSON.stringify({
            order_ids: order_ids
        });

        const requestConfig: AxiosRequestConfig = {
            method: params.requestMethod,
            url: `https://${params.url}${params.requestPath}`,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            data: data
        };

        const response = await axios(requestConfig);
        return response.data;
    }


    /**
     * Create a JSON Web Token for API requests
     * @param params - Requires a requestMethod, endpoint url, and path
     * @private
     */
    private getJWT(params: IAPIParams): string {
        const {requestMethod, url, requestPath} = params;

        const service_name = "retail_rest_api_proxy"
        const algorithm = "ES256";

        return jwt.sign(
            {
                aud: [service_name],
                iss: 'coinbase-cloud',
                nbf: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 120,
                sub: this.accessKey,
                uri: `${requestMethod} ${url}${requestPath}`,
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

export default AdvancedTradeAPI;