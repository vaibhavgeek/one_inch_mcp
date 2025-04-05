// status.js
const fs = require('fs');
const path = require('path');

// The path to store order status data
const STATUS_FILE = path.join(__dirname, 'order-status.json');

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

// Display status of all orders or a specific order
function displayStatus(orderHash) {
    const statusData = getStatus();
    
    if (statusData.orders.length === 0) {
        console.log('No orders are currently being monitored.');
        return;
    }

    if (orderHash) {
        // Display status for a specific order
        const order = statusData.orders.find(o => o.orderHash === orderHash);
        if (order) {
            console.log(`Order: ${order.orderHash}`);
            console.log(`Status: ${order.status}`);
            console.log(`Started: ${new Date(order.startTime).toLocaleString()}`);
            console.log(`Last Updated: ${new Date(order.lastUpdated).toLocaleString()}`);
        } else {
            console.log(`Order ${orderHash} not found.`);
        }
    } else {
        // Display status for all orders
        console.log('Current Orders:');
        statusData.orders.forEach(order => {
            console.log(`\nOrder: ${order.orderHash}`);
            console.log(`Status: ${order.status}`);
            console.log(`Started: ${new Date(order.startTime).toLocaleString()}`);
            console.log(`Last Updated: ${new Date(order.lastUpdated).toLocaleString()}`);
        });
    }
}

// Read command line arguments
const args = process.argv.slice(2);
let orderHash = null;

if (args.length > 0) {
    orderHash = args[0];
}

displayStatus(orderHash);