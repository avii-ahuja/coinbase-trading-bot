## Run locally

Clone the project

```bash
  git clone https://github.com/avii-ahuja/coinbase-trading-bot
```

Go to the project directory

```bash
  cd coinbase-trading-bot
```

Install dependencies
```bash
  npm install
```

Need API keys from Coinbase Cloud -
put the downloaded `coinbase_cloud_api_key_json` in the root directory

Place a `.env` file in the root directory to control the hyperparameters. Sample .env file -
```
PRODUCT="BTC-USD"
DEPTH=30
UPDATE_INTERVAL=500
WS_URL="wss://advanced-trade-ws.coinbase.com"
API_URL="api.coinbase.com"
```

Run using
```
npm run start
```

Testing
```
npm run test
```

## Assumptions
- Default lifetime of JWT token taken as 120s
- API key has trading key scopes
- Rate limited to 30 requests per second => can place and cancel a total of 4 orders (in 4 requests) in 1000/7.5 s = 132 ms

## Design decisions
- Stored the level 2 order book locally in self-balancing Red-Black binary trees
- Created these binary trees using the factory-method design pattern
- Comments added using JSDoc
- Added testing for API calls using Jest


A short GIF showcasing the WebSocket connection and attempt to place orders. I didn't have KYC/funds so I could not place orders.
![GIF](https://media.giphy.com/media/sAOLue9XBSNOhYrsy2/giphy.gif)

