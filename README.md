# Installation
Dependencies must be installed `pnpm` or `yarn` and *not* `npm`

# Usage
The project must be setup like a commonjs project. The design of the library does not work in its current form if you import it as ECM

1. Create a `.env` file in the same directory as `index.js` and populate it with the following variables:

```
DEV_PORTAL_KEY=replace_with_developer_portal_api_key
WALLET_ADDRESS=replace_with_wallet_address
WALLET_KEY=replace_with_wallet_private_key
RPC_URL_ETHEREUM=replace_with_rpc_url
```
2. Run the project
```
node index.js
```

# Integration Notes

[PrivateKeyProviderConnector](https://github.com/1inch/fusion-sdk/blob/bd6bbffffc632602e304ace33dc69c40256d7efa/src/connector/blockchain/private-key-provider.connector.ts#L7-L7) in the Fusion SDK supports BlockchainProviderConnector
