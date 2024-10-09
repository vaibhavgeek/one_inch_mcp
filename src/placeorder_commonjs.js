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
    srcChainId: NetworkEnum.ARBITRUM,
    dstChainId: NetworkEnum.COINBASE,
    srcTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    dstTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amount: '10000000',
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
        secretHashes
    }).then(quoteResponse => {

        console.log(`secretHashes: ${JSON.stringify(secretHashes, null, 2)}`);

        const orderHash = quoteResponse.orderHash;

        setInterval(() => {
            sdk.getReadyToAcceptSecretFills(orderHash)
                .then((fillsObject) => {
                    console.log(`fills length: ${fillsObject.fills.length}`);
                    if (fillsObject.fills.length > 0) {
                        // For each secret, call submitSecret
                        fillsObject.fills.forEach(fill => {
                            console.log(`fill content: ${JSON.stringify(fill, null, 2)}`);
                            console.log(`Submitting secret ${secretHashes[fill.idx]} for order ${orderHash}`);
                            sdk.submitSecret(orderHash, secretHashes[fill.idx])
                                .then(() => {
                                    console.log(`Secret submitted: ${JSON.stringify(secretHashes[fill.idx], null, 2)}`);
//                                    clearInterval(intervalId);
                                })
                                .catch((error) => {
                                    console.error(`Error submitting secret: ${JSON.stringify(error, null, 2)}`);
                                });
                        });
                    }
                })
                .catch((error) => {
                    console.error(`Error getting ready to accept secret fills: ${error}`);
                });
        }, 5000);
    }).catch((error) => {
        console.dir(error, { depth: null });
    });
}).catch((error) => {
    console.dir(error, { depth: null });
});

