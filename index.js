// use this when there is no `"type": "module"` in your package.json, i.e. you're using commonjs

const { SDK, HashLock, PrivateKeyProviderConnector, NetworkEnum } = require("@1inch/cross-chain-sdk");
const env = require('dotenv');
const process = env.config().parsed;

const { Web3 } = require('web3');
const { solidityPackedKeccak256, randomBytes, Contract, Wallet, JsonRpcProvider } = require('ethers');

// TODO write formal bug for this function being inaccessible
function getRandomBytes32() {
    // for some reason the cross-chain-sdk expects a leading 0x and can't handle a 32 byte long hex string
    return '0x' + Buffer.from(randomBytes(32)).toString('hex');
}

const makerPrivateKey = process?.WALLET_KEY;
const makerAddress = process?.WALLET_ADDRESS;
const nodeUrl = process?.RPC_URL_BASE; // suggested for ethereum https://eth.llamarpc.com
const devPortalApiKey = process?.DEV_PORTAL_KEY;

// Validate environment variables
if (!makerPrivateKey || !makerAddress || !nodeUrl || !devPortalApiKey) {
    throw new Error("Missing required environment variables. Please check your .env file.");
}

const web3Instance = new Web3(nodeUrl);
const blockchainProvider = new PrivateKeyProviderConnector(makerPrivateKey, web3Instance);

const sdk = new SDK({
    url: 'https://api.1inch.dev/fusion-plus',
    authKey: devPortalApiKey,
    blockchainProvider
});

const approveABI = [{
    "constant": false,
    "inputs": [
        { "name": "spender", "type": "address" },
        { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
}];

// Required for order management
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to execute a cross-chain swap
async function executeCrossChainSwap({
    srcChainId = 8453, // Default: Base
    dstChainId = NetworkEnum.ARBITRUM, // Default: Arbitrum
    srcTokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Default: USDC on Base
    dstTokenAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Default: USDC on Arbitrum
    amount = '100000',
    invert = false
}) {
    // Handle token direction swap if needed
    if (invert) {
        const tempChain = srcChainId;
        srcChainId = dstChainId;
        dstChainId = tempChain;

        const tempAddress = srcTokenAddress;
        srcTokenAddress = dstTokenAddress;
        dstTokenAddress = tempAddress;
    }

    const params = {
        srcChainId,
        dstChainId,
        srcTokenAddress,
        dstTokenAddress,
        amount,
        enableEstimate: true,
        walletAddress: makerAddress
    };

    try {
        const quote = await sdk.getQuote(params);
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

        console.log("Received Fusion+ quote from 1inch API");

        const quoteResponse = await sdk.placeOrder(quote, {
            walletAddress: makerAddress,
            hashLock,
            secretHashes
        });

        const orderHash = quoteResponse.orderHash;
        console.log(`Order successfully placed with hash: ${orderHash}`);

        // Save order information to the status file
        const statusFile = path.join(__dirname, 'order-status.json');
        let statusData = { orders: [] };
        
        // Read existing status file if it exists
        if (fs.existsSync(statusFile)) {
            try {
                statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
            } catch (error) {
                console.error('Error reading status file:', error);
            }
        }
        
        // Add the new order to the status data
        statusData.orders.push({
            orderHash,
            secrets,
            secretHashes,
            startTime: Date.now(),
            lastUpdated: Date.now(),
            status: 'pending',
            isMonitoring: false
        });
        
        // Save the updated status data
        fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
        
        // Return immediately with a message
        return {
            success: true,
            orderHash,
            message: "The swap will happen in 2-3 minutes, please wait. Order is being processed in the background. The monitor daemon is already running and will automatically process your order. Run 'npm run status' to check order status."
        };
    } catch (error) {
        console.error("Error in cross-chain swap execution:", error);
        return {
            success: false,
            error: error.message || "Unknown error occurred"
        };
    }
}

// Example usage
(async () => {
    try {
        // Approve tokens for spending if needed.
        // If you need to approve the tokens before posting an order, this code can be uncommented for first run.
        // const provider = new JsonRpcProvider(nodeUrl);
        // const tkn = new Contract(srcTokenAddress, approveABI, new Wallet(makerPrivateKey, provider));
        // await tkn.approve(
        //     '0x111111125421ca6dc452d289314280a0f8842a65', // aggregation router v6
        //     (2n**256n - 1n) // unlimited allowance
        // );

        const result = await executeCrossChainSwap({
            // You can override default parameters here if needed
            // amount: '200000',
            // invert: true,
        });

        console.log(result.message);
    } catch (error) {
        console.error("Error in main execution:", error);
    }
})();