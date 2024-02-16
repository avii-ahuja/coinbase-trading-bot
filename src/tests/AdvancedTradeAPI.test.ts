import AdvancedTradeAPI from '../AdvancedTradeAPI';
import axios from 'axios';


// Mocking axios to prevent actual network requests
jest.mock('axios');

describe('AdvancedTradeAPI', () => {
    const accessKey = 'accessKey';
    const privateKey = "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIOu7JX2739trJFvPwM5s4CrV+bgy+NLjyKzHT08nikTgoAoGCCqGSM49\nAwEHoUQDQgAEp9HjIcFW7C23hLWPnEvOITzmwDgMNYigf0jU/jeJKjEE+eJcILz/\nwKhCE4/O0cMiFRqRVrmB8u3yuAEY2ozA2Q==\n-----END EC PRIVATE KEY-----\n";
    const product_id = 'product_id';
    const url = 'example.com';


    let api: AdvancedTradeAPI;

    beforeEach(async () => {
        api = new AdvancedTradeAPI({ accessKey, privateKey, product_id, url });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createLimitOrderGTC', () => {
        it('should create a GTC limit order', async () => {
            const client_order_id = 'client_order_id';
            const side = 'BUY';
            const base_size = '10';
            const limit_price = '100';

            const orderId = 'order123';

            // @ts-ignore
            (axios as jest.MockedFunction<typeof axios>).mockResolvedValueOnce({
                data: {
                    order_id: 'order123',
                }
            });


            const result = await api.createLimitOrderGTC({
                client_order_id,
                side,
                base_size,
                limit_price,
            });

            expect(result).toBe(orderId);

            // Ensuring axios is called with correct parameters
            expect(axios).toHaveBeenCalledWith({
                method: 'POST',
                url: `https://${url}/api/v3/brokerage/orders`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': expect.any(String),
                },
                data: JSON.stringify({
                    client_order_id,
                    product_id,
                    side,
                    order_configuration: {
                        limit_limit_gtc: {
                            base_size,
                            limit_price,
                        },
                    },
                }),
            });
        });

        it('should throw an error when order creation fails', async () => {
            const client_order_id = 'client_order_id';
            const side = 'BUY';
            const base_size = '10';
            const limit_price = '100';

            const errorMessage = 'Failed to create order';

            (axios as jest.MockedFunction<typeof axios>).mockRejectedValueOnce(new Error(errorMessage));

            await expect(api.createLimitOrderGTC({
                client_order_id,
                side,
                base_size,
                limit_price,
            })).rejects.toThrow(`Cannot create ${side} order: Reason ${errorMessage}`);
        });
    });

    describe('cancelOrders', () => {
        it('should cancel orders with specified order_ids', async () => {
            const order_ids = ['order1', 'order2'];

            const responseData = { success: true };

            // @ts-ignore
            (axios as jest.MockedFunction<typeof axios>).mockResolvedValueOnce({
                data: responseData,
            });


            const result = await api.cancelOrders({ order_ids });

            expect(result).toEqual(responseData);

            expect(axios).toHaveBeenCalledWith({
                method: 'POST',
                url: `https://${url}/api/v3/brokerage/orders/batch_cancel`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': expect.any(String),
                },
                data: JSON.stringify({
                    order_ids,
                }),
            });
        });
    });
});
