import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import axios, {AxiosRequestConfig} from "axios";

interface IAPIParams {
    requestMethod: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    requestPath: string
}

class AdvancedTradeAPI {
    private readonly url;
    private readonly accessKey;
    private readonly privateKey;
    public readonly product_id;

    constructor({accessKey, privateKey, product_id, url}: {accessKey: string, privateKey: string,
        product_id: string, url: string}) {
        this.url = url;
        this.accessKey = accessKey;
        this.privateKey = privateKey;
        this.product_id = product_id;
    }

    public async createLimitOrderGTC({client_order_id, side, base_size, limit_price}: {
        client_order_id: string, side: "BUY" | "SELL", base_size: string, limit_price: string
    }) : Promise<string> {
        const params: IAPIParams = {
            requestMethod: "POST",
            url: this.url,
            requestPath: "/api/v3/brokerage/orders"
        }

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
            return response.data.order_id;
        }
        catch(e){
            throw Error(`Cannot create ${side} order: Reason ${(e as Error).message}`);
        }
    }

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