const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { executeCrossChainSwap } = require('./index.js');
const https = require('https');

// Create an MCP server
const server = new McpServer({
    name: "1inch-CrossChain-Swap",
    version: "1.0.0"
  });

// Helper function to make API requests to 1inch Portfolio API
const makePortfolioApiRequest = (endpoint, chainId, queryParams = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.1inch.dev/portfolio/portfolio/v4${endpoint}`);
    
    // Add chain_id and any other query parameters
    url.searchParams.append('chain_id', chainId);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.append(key, value);
    }
    
    const options = {
      headers: {
        'Authorization': `Bearer ${process.env.INCH_API_KEY || ''}`,
        'accept': 'application/json',
        'content-type': 'application/json'
      }
    };
    
    const req = https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        } else {
          reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
};
  

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

// Add Portfolio API tools

// 1. Protocols current value
server.tool(
  "portfolio-protocols-value",
  {
    chainId: z.number().default(1)
  },
  async (params) => {
    try {
      const result = await makePortfolioApiRequest('/overview/protocols/current_value', params.chainId);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching protocols value: ${error.message}` }],
        isError: true
      };
    }
  }
);

// 2. Tokens details
server.tool(
  "portfolio-tokens-details",
  {
    chainId: z.number().default(1),
    closed: z.boolean().default(true),
    closedThreshold: z.number().default(1)
  },
  async (params) => {
    try {
      const queryParams = {
        closed: params.closed.toString(),
        closed_threshold: params.closedThreshold.toString()
      };
      const result = await makePortfolioApiRequest('/overview/erc20/details', params.chainId, queryParams);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching tokens details: ${error.message}` }],
        isError: true
      };
    }
  }
);

// 3. General current value
server.tool(
  "portfolio-general-value",
  {
    chainId: z.number().default(1)
  },
  async (params) => {
    try {
      const result = await makePortfolioApiRequest('/general/current_value', params.chainId);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching general value: ${error.message}` }],
        isError: true
      };
    }
  }
);

// 4. General value chart
server.tool(
  "portfolio-value-chart",
  {
    chainId: z.number().default(1)
  },
  async (params) => {
    try {
      const result = await makePortfolioApiRequest('/general/value_chart', params.chainId);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching value chart: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Start the server
const transport = new StdioServerTransport();
(async () => {
  await server.connect(transport);
})();