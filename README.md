# Installation
Dependencies must be installed `pnpm` or `yarn` and *not* `npm`

# Usage
The project must be setup like a commonjs project. The design of the library does not work in its current form if you import it as ECM

```
node index.js
```

# Integration Notes

[PrivateKeyProviderConnector](https://github.com/1inch/fusion-sdk/blob/bd6bbffffc632602e304ace33dc69c40256d7efa/src/connector/blockchain/private-key-provider.connector.ts#L7-L7) in the Fusion SDK supports BlockchainProviderConnector