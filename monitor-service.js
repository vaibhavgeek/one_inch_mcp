// monitor-service.js
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// The path to store order status data
const STATUS_FILE = path.join(__dirname, 'order-status.json');
const DAEMON_PID_FILE = path.join(__dirname, '.monitor-daemon.pid');

// Commands
const COMMANDS = {
    START: 'start',
    STOP: 'stop',
    STATUS: 'status',
    DAEMON: 'daemon'
};

// Read status file
function getStatus() {
    try {
        if (fs.existsSync(STATUS_FILE)) {
            const data = fs.readFileSync(STATUS_FILE, 'utf8');
            return JSON.parse(data);
        }
        return { orders: [] };
    } catch (error) {
        console.error('Error reading status file:', error);
        return { orders: [] };
    }
}

// Write status to file
function saveStatus(statusData) {
    try {
        fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
    } catch (error) {
        console.error('Error writing status file:', error);
    }
}

// Check if daemon is running
function isDaemonRunning() {
    if (fs.existsSync(DAEMON_PID_FILE)) {
        try {
            const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim());
            
            // Check if process with this PID exists
            try {
                process.kill(pid, 0); // Signal 0 doesn't kill the process, just checks if it exists
                return true;
            } catch (e) {
                // Process doesn't exist
                fs.unlinkSync(DAEMON_PID_FILE);
                return false;
            }
        } catch (error) {
            return false;
        }
    }
    return false;
}

// Start daemon process
function startDaemon() {
    if (isDaemonRunning()) {
        console.log('Monitor daemon is already running.');
        return;
    }

    console.log('Starting monitor daemon...');
    
    // Start the daemon process detached from the parent
    const daemon = spawn(process.execPath, [__filename, 'daemon'], {
        detached: true,
        stdio: 'ignore'
    });
    
    // Don't wait for the child process
    daemon.unref();
    
    // Save the PID
    fs.writeFileSync(DAEMON_PID_FILE, daemon.pid.toString());
    
    console.log(`Monitor daemon started with PID: ${daemon.pid}`);
}

// Stop daemon process
function stopDaemon() {
    if (!isDaemonRunning()) {
        console.log('Monitor daemon is not running.');
        return;
    }
    
    try {
        const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim());
        process.kill(pid);
        fs.unlinkSync(DAEMON_PID_FILE);
        console.log('Monitor daemon stopped.');
    } catch (error) {
        console.error('Error stopping daemon:', error);
        if (fs.existsSync(DAEMON_PID_FILE)) {
            fs.unlinkSync(DAEMON_PID_FILE);
        }
    }
}

// Daemon mode - continuously watch for new orders
function runDaemon() {
    console.log('Monitor daemon running...');
    
    // Save PID file if it doesn't exist
    if (!fs.existsSync(DAEMON_PID_FILE)) {
        fs.writeFileSync(DAEMON_PID_FILE, process.pid.toString());
    }
    
    // Set up polling interval
    const workers = new Map(); // Store active workers by orderHash
    
    const checkForNewOrders = () => {
        const statusData = getStatus();
        
        // Look for new orders that need monitoring
        const newOrders = statusData.orders.filter(order => 
            !order.isMonitoring && 
            order.status !== 'executed' &&
            !workers.has(order.orderHash)
        );
        
        // Start workers for new orders
        for (const order of newOrders) {
            console.log(`Daemon starting monitoring for order: ${order.orderHash}`);
            
            // Spawn worker process
            const worker = fork(path.join(__dirname, 'monitor-worker.js'));
            
            // Send order data to worker
            worker.send({
                type: 'start',
                data: {
                    orderHash: order.orderHash,
                    secrets: order.secrets,
                    secretHashes: order.secretHashes,
                    apiUrl: 'https://api.1inch.dev/fusion-plus',
                    authKey: process.env.DEV_PORTAL_KEY,
                    makerPrivateKey: process.env.WALLET_KEY,
                    nodeUrl: process.env.RPC_URL_BASE
                }
            });
            
            // Handle worker messages
            worker.on('message', (message) => {
                if (message.type === 'status') {
                    updateOrderStatus(order.orderHash, message.data.status);
                } else if (message.type === 'complete') {
                    updateOrderStatus(order.orderHash, 'executed');
                    cleanupWorker(order.orderHash);
                } else if (message.type === 'error') {
                    console.error(`Worker error for order ${order.orderHash}: ${message.data.error}`);
                }
            });
            
            // Handle worker exit
            worker.on('exit', () => {
                cleanupWorker(order.orderHash);
            });
            
            // Save worker in our map
            workers.set(order.orderHash, worker);
            
            // Update order status
            order.isMonitoring = true;
            order.pid = worker.pid;
            saveStatus(statusData);
        }
    };
    
    // Cleanup worker when it's done
    const cleanupWorker = (orderHash) => {
        if (workers.has(orderHash)) {
            const worker = workers.get(orderHash);
            
            try {
                worker.kill();
            } catch (e) {
                // Worker might already be terminated
            }
            
            workers.delete(orderHash);
            
            // Update order status
            const statusData = getStatus();
            const order = statusData.orders.find(o => o.orderHash === orderHash);
            if (order) {
                order.isMonitoring = false;
                order.pid = null;
                saveStatus(statusData);
            }
        }
    };
    
    // Start checking for new orders
    const pollingInterval = setInterval(checkForNewOrders, 5000);
    
    // Clean up on exit
    process.on('SIGINT', () => {
        clearInterval(pollingInterval);
        for (const [orderHash, worker] of workers.entries()) {
            try {
                worker.kill();
            } catch (e) {
                // Worker might already be terminated
            }
        }
        if (fs.existsSync(DAEMON_PID_FILE)) {
            fs.unlinkSync(DAEMON_PID_FILE);
        }
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        clearInterval(pollingInterval);
        for (const [orderHash, worker] of workers.entries()) {
            try {
                worker.kill();
            } catch (e) {
                // Worker might already be terminated
            }
        }
        if (fs.existsSync(DAEMON_PID_FILE)) {
            fs.unlinkSync(DAEMON_PID_FILE);
        }
        process.exit(0);
    });
    
    // Run initial check right away
    checkForNewOrders();
}

// Start monitoring all orders or a specific one
function startMonitoring(orderHash) {
    const statusData = getStatus();
    
    // Filter to find orders that need to be monitored
    const ordersToStart = orderHash 
        ? statusData.orders.filter(o => o.orderHash === orderHash && !o.isMonitoring)
        : statusData.orders.filter(o => !o.isMonitoring && o.status !== 'executed');
    
    if (ordersToStart.length === 0) {
        if (orderHash) {
            console.log(`Order ${orderHash} is either not found, already being monitored, or completed.`);
        } else {
            console.log('No orders need to be monitored.');
        }
        return;
    }
    
    // Start worker processes for each order
    for (const order of ordersToStart) {
        console.log(`Starting monitoring for order: ${order.orderHash}`);
        
        // Spawn worker process
        const worker = fork(path.join(__dirname, 'monitor-worker.js'));
        
        // Send order data to worker
        worker.send({
            type: 'start',
            data: {
                orderHash: order.orderHash,
                secrets: order.secrets,
                secretHashes: order.secretHashes,
                apiUrl: 'https://api.1inch.dev/fusion-plus',
                authKey: process.env.DEV_PORTAL_KEY,
                makerPrivateKey: process.env.WALLET_KEY,
                nodeUrl: process.env.RPC_URL_BASE
            }
        });
        
        // Handle worker messages
        worker.on('message', (message) => {
            if (message.type === 'status') {
                updateOrderStatus(order.orderHash, message.data.status);
            } else if (message.type === 'complete') {
                updateOrderStatus(order.orderHash, 'executed');
                stopMonitoring(order.orderHash);
            } else if (message.type === 'error') {
                console.error(`Worker error for order ${order.orderHash}: ${message.data.error}`);
            }
        });
        
        // Save worker PID
        order.pid = worker.pid;
        order.isMonitoring = true;
        saveStatus(statusData);
    }
}

// Stop monitoring all orders or a specific one
function stopMonitoring(orderHash) {
    const statusData = getStatus();
    
    // Filter to find orders that should be stopped
    const ordersToStop = orderHash 
        ? statusData.orders.filter(o => o.orderHash === orderHash && o.isMonitoring)
        : statusData.orders.filter(o => o.isMonitoring);
    
    if (ordersToStop.length === 0) {
        if (orderHash) {
            console.log(`Order ${orderHash} is not being monitored.`);
        } else {
            console.log('No orders are currently being monitored.');
        }
        return;
    }
    
    // Stop each monitoring process
    for (const order of ordersToStop) {
        console.log(`Stopping monitoring for order: ${order.orderHash}`);
        
        if (order.pid) {
            try {
                process.kill(order.pid);
                console.log(`Stopped process for order ${order.orderHash}`);
            } catch (error) {
                console.log(`Process for order ${order.orderHash} is not running or already terminated.`);
            }
        }
        
        order.isMonitoring = false;
        order.pid = null;
    }
    
    saveStatus(statusData);
}

// Update the status of an order
function updateOrderStatus(orderHash, status) {
    const statusData = getStatus();
    
    const order = statusData.orders.find(o => o.orderHash === orderHash);
    if (order) {
        order.status = status;
        order.lastUpdated = Date.now();
        saveStatus(statusData);
        console.log(`Updated order ${orderHash} status: ${status}`);
    }
}

// Show the status of monitoring processes
function showMonitoringStatus() {
    const statusData = getStatus();
    
    if (statusData.orders.length === 0) {
        console.log('No orders are registered.');
        return;
    }
    
    const daemonRunning = isDaemonRunning();
    
    console.log('\nMonitor Daemon:', daemonRunning ? 'Running' : 'Not Running');
    if (daemonRunning) {
        try {
            const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim());
            console.log(`Daemon PID: ${pid}`);
        } catch (error) {}
    }
    
    console.log('\nMonitoring Status:');
    statusData.orders.forEach(order => {
        console.log(`\nOrder: ${order.orderHash}`);
        console.log(`Status: ${order.status}`);
        console.log(`Monitoring: ${order.isMonitoring ? 'Active' : 'Inactive'}`);
        if (order.pid) {
            console.log(`Process ID: ${order.pid}`);
        }
        console.log(`Started: ${new Date(order.startTime).toLocaleString()}`);
        console.log(`Last Updated: ${new Date(order.lastUpdated).toLocaleString()}`);
    });
}

// Main execution
function main() {
    // Load environment variables
    require('dotenv').config();
    
    // Verify environment variables are loaded
    if (!process.env.WALLET_KEY || !process.env.DEV_PORTAL_KEY || !process.env.RPC_URL_BASE) {
        console.error('Error: Required environment variables not found. Please check your .env file.');
        process.exit(1);
    }
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0] || COMMANDS.STATUS;
    const orderHash = args[1] || null;
    
    switch(command.toLowerCase()) {
        case COMMANDS.START:
            // Start the daemon instead of individual monitoring
            startDaemon();
            break;
        case COMMANDS.STOP:
            // Stop the daemon and any individual monitoring
            stopDaemon();
            stopMonitoring(orderHash);
            break;
        case COMMANDS.STATUS:
            showMonitoringStatus();
            break;
        case COMMANDS.DAEMON:
            // This is the daemon process
            runDaemon();
            break;
        default:
            console.log(`Unknown command: ${command}`);
            console.log(`Available commands: ${Object.values(COMMANDS).join(', ')}`);
    }
}

main();