import { SDK, HashLock, PrivateKeyProviderConnector, NetworkEnum, QuoteParams } from "@1inch/cross-chain-sdk";
import env from 'dotenv';
const process = env.config().parsed;

import { Web3, InvalidInputError } from 'web3';
import { solidityPackedKeccak256 } from 'ethers';
import {randomBytes} from 'ethers'

export function getRandomBytes32(): string {
    // for some reason the cross-chain-sdk expects a leading 0x and can't handle a 32 byte long hex string
    return '0x' + Buffer.from(randomBytes(32)).toString('hex')
}

const makerPrivateKey = process?.WALLET_KEY
const makerAddress = process?.WALLET_ADDRESS

const nodeUrl = process?.RPC_URL_ETHEREUM // suggested for ethereum https://eth.llamarpc.com


// Validate environment variables
if (!makerPrivateKey || !makerAddress || !nodeUrl) {
    throw new Error("Missing required environment variables. Please check your .env file.");
}


const blockchainProvider = new PrivateKeyProviderConnector(
    makerPrivateKey,
    await new Web3(nodeUrl) as any
)

const sdk = new SDK({
    url: 'https://api.1inch.dev/fusion-plus',
    authKey: process?.DEV_PORTAL_KEY,
    blockchainProvider
})

const params: QuoteParams = {
    srcChainId: NetworkEnum.ETHEREUM,
    dstChainId: NetworkEnum.GNOSIS,
    srcTokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
    dstTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    amount: '1000000000000000000000',
    enableEstimate: true,
    walletAddress: makerAddress
}

const quote = await sdk.getQuote(params)

const secretsCount = quote.getPreset().secretsCount

const secrets = Array.from({length: secretsCount}).map(() => getRandomBytes32())
const secretHashes = secrets.map((x) => HashLock.hashSecret(x))

const hashLock =
    secretsCount === 1
        ? HashLock.forSingleFill(secrets[0])
        : HashLock.forMultipleFills(
            secretHashes.map((secretHash, i) =>
                solidityPackedKeccak256(['uint64', 'bytes32'], [i, secretHash.toString()])
            ) as (string & {
    _tag: 'MerkleLeaf'
})[]
)

sdk.placeOrder(quote, {
    walletAddress: makerAddress,
    hashLock,
    secretHashes,
    // fee is an optional field
    fee: {
        takingFeeBps: 100, // 1% as we use bps format, 1% is equal to 100bps
        takingFeeReceiver: '0x0000000000000000000000000000000000000000' //  fee receiver address
    }
}).then(console.log)