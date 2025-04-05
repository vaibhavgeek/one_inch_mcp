// monitor-worker.js
const { SDK, PrivateKeyProviderConnector } = require("@1inch/cross-chain-sdk");
const { Web3 } = require('web3');

let sdk;
let orderData;
let monitoringInterval;
let running = false;

// Handle messages from the parent process
process.on('message', (message) => {
    if (message.type === 'start') {
        startMonitoring(message.data);
    } else if (message.type === 'stop') {
        stopMonitoring();
    }
});

// Initialize SDK with the provided credentials
function initializeSDK(data) {
    const { apiUrl, authKey, makerPrivateKey, nodeUrl } = data;
    
    const web3Instance = new Web3(nodeUrl);
    const blockchainProvider = new PrivateKeyProviderConnector(makerPrivateKey, web3Instance);
    
    return new SDK({
        url: apiUrl,
        authKey: authKey,
        blockchainProvider
    });
}

// Start monitoring the order
function startMonitoring(data) {
    if (running) return;
    
    running = true;
    orderData = data;
    sdk = initializeSDK(data);
    
    const { orderHash, secrets } = data;
    
    // Log the start of monitoring
    console.log(`Worker started monitoring order: ${orderHash}`);
    
    // Start polling for order status and readiness for secret fills
    monitoringInterval = setInterval(() => {
        checkOrderStatus(orderHash);
        checkReadySecretFills(orderHash, secrets);
    }, 5000);
    
    // Send status update to parent
    process.send({ type: 'status', data: { status: 'started' } });
}

// Check the order status
async function checkOrderStatus(orderHash) {
    try {
        const order = await sdk.getOrderStatus(orderHash);
        
        // Update parent about the current status
        process.send({ 
            type: 'status', 
            data: { status: order.status } 
        });
        
        // If order is executed, stop monitoring
        if (order.status === 'executed') {
            process.send({ type: 'complete' });
            stopMonitoring();
        }
    } catch (error) {
        const errorMsg = error.message || JSON.stringify(error);
        process.send({ 
            type: 'error', 
            data: { error: `Error checking order status: ${errorMsg}` } 
        });
    }
}

// Check if there are any fills ready to accept secrets
async function checkReadySecretFills(orderHash, secrets) {
    try {
        const fillsObject = await sdk.getReadyToAcceptSecretFills(orderHash);
        
        if (fillsObject.fills && fillsObject.fills.length > 0) {
            process.send({ 
                type: 'status', 
                data: { status: `Found ${fillsObject.fills.length} fills ready for secret submission` } 
            });
            
            // Submit secrets for each fill
            for (const fill of fillsObject.fills) {
                try {
                    await sdk.submitSecret(orderHash, secrets[fill.idx]);
                    process.send({ 
                        type: 'status', 
                        data: { status: `Secret submitted for fill index ${fill.idx}` } 
                    });
                } catch (error) {
                    const errorMsg = error.message || JSON.stringify(error);
                    process.send({ 
                        type: 'error', 
                        data: { error: `Error submitting secret for fill ${fill.idx}: ${errorMsg}` } 
                    });
                }
            }
        }
    } catch (error) {
        // Handle API error responses
        if (error.response) {
            process.send({ 
                type: 'error', 
                data: { 
                    error: `API error: ${error.response.status} - ${error.response.statusText}`,
                    details: error.response.data 
                } 
            });
        } else if (error.request) {
            process.send({ 
                type: 'error', 
                data: { error: 'No response received from API' } 
            });
        } else {
            process.send({ 
                type: 'error', 
                data: { error: `Error: ${error.message || JSON.stringify(error)}` } 
            });
        }
    }
}

// Stop the monitoring process
function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    running = false;
    console.log(`Worker stopped monitoring order: ${orderData?.orderHash || 'unknown'}`);
}

// Handle process termination
process.on('SIGTERM', () => {
    stopMonitoring();
    process.exit(0);
});

process.on('SIGINT', () => {
    stopMonitoring();
    process.exit(0);
});

// Handle uncaught exceptions to prevent the worker from crashing
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.send({ 
        type: 'error', 
        data: { error: `Worker uncaught exception: ${error.message}` } 
    });
});