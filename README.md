# Installation
Dependencies must be installed `pnpm` and *not* `npm`

# Usage
The project must be setup like a commonjs project. The design of the library does not work in its current form if you import it as ECM

```
node index.js
```

# Debugging
- Clone cross-chain-sdk locally
- In cloned repo, install with `pnpm install`, then build with `npm run build`
- Run `npm link` in the root of the cloned project
- In this project, run `npm link @1inch/cross-chain-sdk`
- Now, definition lookups of sdk objects/methods will go to the typescript source. Additionally, this will work with debugging.

# Integration Notes

PrivateKeyProviderConnector in the Fusion SDK supports BlockchainProviderConnector: https://github.com/1inch/fusion-sdk/blob/bd6bbffffc632602e304ace33dc69c40256d7efa/src/connector/blockchain/private-key-provider.connector.ts#L7-L7