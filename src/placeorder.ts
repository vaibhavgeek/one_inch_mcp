import {
    SDK,
    HashLock,
    PrivateKeyProviderConnector,
    NetworkEnum,
    QuoteParams
} from "@1inch/cross-chain-sdk";
import Web3 from 'web3';
import { solidityPackedKeccak256 } from 'ethers';
import {randomBytes} from 'ethers'
import {uint8ArrayToHex} from '@1inch/byte-utils'

export function getRandomBytes32(): string {
    return uint8ArrayToHex(randomBytes(32))
}

const makerPrivateKey = process.env.WALLET_KEY
const makerAddress = process.env.WALLET_ADDRESS

const nodeUrl = process.env.RPC_URL_ETHEREUM


// Validate environment variables
if (!makerPrivateKey || !makerAddress || !nodeUrl) {
    throw new Error("Missing required environment variables. Please check your .env file.");
}

const blockchainProvider = new PrivateKeyProviderConnector(
    makerPrivateKey,
    new Web3(nodeUrl) as any,
)

const sdk = new SDK({
    url: 'https://api.1inch.dev/fusion',
    authKey: 'your-auth-key',
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