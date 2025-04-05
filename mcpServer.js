const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { executeCrossChainSwap } = require('./index.js');


// Create an MCP server
const server = new McpServer({
    name: "1inch-CrossChain-Swap",
    version: "1.0.0"
  });
  

// Add a swap tool
server.tool(
  "swap",
  {
    srcChainId: z.number().optional().default(8453),
    dstChainId: z.number().optional().default(42161), // Arbitrum
    srcTokenAddress: z.string().optional().default('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
    dstTokenAddress: z.string().optional().default('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
    amount: z.string().optional().default('100000'),
    invert: z.boolean().optional().default(false)
  },
  async (params) => {
    try {
      const result = await executeCrossChainSwap(params);
      return {
        content: [{ 
          type: "text", 
          text: result.success 
            ? `Swap initiated successfully! Order hash: ${result.orderHash}\n${result.message}`
            : `Swap failed: ${result.error}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Add a resource to check swap status
server.resource(
  "swap-status",
  "swaps://{orderHash}",
  async (uri) => {
    const orderHash = uri.pathname.replace(/^\//, '');
    const path = require('path');
    const fs = require('fs');
    
    const statusFile = path.join(__dirname, 'order-status.json');
    if (!fs.existsSync(statusFile)) {
      return {
        contents: [{
          uri: uri.href,
          text: `No swap orders found.`
        }]
      };
    }
    
    try {
      const statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      const order = statusData.orders.find(o => o.orderHash === orderHash);
      
      if (!order) {
        return {
          contents: [{
            uri: uri.href,
            text: `Order ${orderHash} not found.`
          }]
        };
      }
      
      return {
        contents: [{
          uri: uri.href,
          text: `Order: ${orderHash}\nStatus: ${order.status}\nStart Time: ${new Date(order.startTime).toLocaleString()}\nLast Updated: ${new Date(order.lastUpdated).toLocaleString()}`
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error reading swap status: ${error.message}`
        }]
      };
    }
  }
);

// Start the server
const transport = new StdioServerTransport();
(async () => {
  await server.connect(transport);
})();