// use this when there is no `"type": "module"` in your package.json, i.e. you're using commonjs

const { SDK, HashLock, PrivateKeyProviderConnector, NetworkEnum, QuoteParams } = require("@1inch/cross-chain-sdk");
const env = require('dotenv');
const process = env.config().parsed;

const { Web3 } = require('web3');
const { InvalidInputError } = require('web3');
const { solidityPackedKeccak256 } = require('ethers');
const { randomBytes } = require('ethers');

function getRandomBytes32() {
    // for some reason the cross-chain-sdk expects a leading 0x and can't handle a 32 byte long hex string
    return '0x' + Buffer.from(randomBytes(32)).toString('hex');
}

const makerPrivateKey = process?.WALLET_KEY;
const makerAddress = process?.WALLET_ADDRESS;
const nodeUrl = process?.RPC_URL_ETHEREUM; // suggested for ethereum https://eth.llamarpc.com

// Validate environment variables
if (!makerPrivateKey || !makerAddress || !nodeUrl) {
    throw new Error("Missing required environment variables. Please check your .env file.");
}

const web3Instance = new Web3(nodeUrl);

const blockchainProvider = new PrivateKeyProviderConnector(makerPrivateKey, web3Instance);

const sdk = new SDK({
    url: 'https://api.1inch.dev/fusion-plus',
    authKey: process?.DEV_PORTAL_KEY,
    blockchainProvider
});

const params = {
    srcChainId: NetworkEnum.ETHEREUM,
    dstChainId: NetworkEnum.GNOSIS,
    srcTokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
    dstTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    amount: '1000000000000000000000',
    enableEstimate: true,
    walletAddress: makerAddress
};

sdk.getQuote(params).then(quote => {
    const secretsCount = quote.getPreset().secretsCount;

    const secrets = Array.from({ length: secretsCount }).map(() => getRandomBytes32());
    const secretHashes = secrets.map(x => HashLock.hashSecret(x));

    const hashLock = secretsCount === 1
        ? HashLock.forSingleFill(secrets[0])
        : HashLock.forMultipleFills(
            secretHashes.map((secretHash, i) =>
                solidityPackedKeccak256(['uint64', 'bytes32'], [i, secretHash.toString()])
            )
        );

    sdk.placeOrder(quote, {
        walletAddress: makerAddress,
        hashLock,
        secretHashes,
        fee: {
            takingFeeBps: 100,
            takingFeeReceiver: '0x0000000000000000000000000000000000000000'
        }
    }).then(console.log).catch(console.error);
}).catch(console.error);

