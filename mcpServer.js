const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { executeCrossChainSwap } = require('./index.js');
const https = require('https');
const env = require('dotenv');
const process = env.config().parsed;

// Create an MCP server instance with a name and version.
const server = new McpServer({
    name: "1inch-CrossChain-Swap",
    version: "1.0.0"
});

// Helper function to make API requests to the 1inch Portfolio API.
// It builds the URL with chain_id and any extra query parameters, sends an HTTPS GET request,
// and returns a promise that resolves with the parsed JSON data.
const makePortfolioApiRequest = (endpoint, chainId, queryParams = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.1inch.dev/portfolio/portfolio/v4${endpoint}`);
    
    // Append chain_id and additional query parameters to the URL.
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

/*
 * Tool: swap
 *
 * Description:
 *   Initiates a cross-chain token swap by calling the executeCrossChainSwap function.
 *   Parameters include source and destination chain IDs, token addresses, amount,
 *   and an optional invert flag. The amount is expected in base units.
 *
 *   NOTE: This tool includes a conversion check so that if a user passes a human-readable
 *   amount (e.g., "1" for 1 USDC), it multiplies by 10^6 to ensure the amount is in the
 *   correct 6-decimal base (i.e., 1 USDC becomes 1000000).
 */
server.tool(
  "swap",
  {
    srcChainId: z.number().optional().default(8453),
    dstChainId: z.number().optional().default(42161), // Example: Arbitrum chain ID.
    srcTokenAddress: z.string().optional().default('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
    dstTokenAddress: z.string().optional().default('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
    // Default set to "1000000" so that it represents 1 USDC in 6-decimal format.
    amount: z.string().optional().default('1000000'),
    invert: z.boolean().optional().default(false)
  },
  async (params) => {
    try {
      // Convert the provided amount if it appears to be in human-readable format.
      // For example, if the user enters "1" (which is less than 1e6), convert it to "1000000".
      let amount = params.amount;
      if (!isNaN(Number(amount)) && Number(amount) < 1e6) {
        amount = (Number(amount) * 1e6).toString();
      }
      // Update the params object with the converted amount.
      params.amount = amount;

      const result = await executeCrossChainSwap(params);
      return {
        content: [{ 
          type: "text", 
          text: result  
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

/*
 * Resource: swap-status (via URI)
 *
 * Description:
 *   Reads a JSON file (order-status.json) containing swap order statuses.
 *   If an order hash is specified in the URI, it returns the status for that specific order.
 *   Otherwise, it lists all swap orders.
 */
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
      
      // If no order hash is provided, return all orders.
      if (!orderHash) {
        const ordersText = statusData.orders.map(order => 
          `Order: ${order.orderHash}\nStatus: ${order.status}\nStart Time: ${new Date(order.startTime).toLocaleString()}\nLast Updated: ${new Date(order.lastUpdated).toLocaleString()}`
        ).join('\n\n');
        
        return {
          contents: [{
            uri: uri.href,
            text: ordersText || 'No orders found.'
          }]
        };
      }
      
      // Find specific order by hash.
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

/*
 * Tool: portfolio-protocols-value
 *
 * Description:
 *   Fetches the current value of various protocols from the 1inch Portfolio API.
 *   The only required parameter is the chain ID (default is 1).
 */
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

/*
 * Tool: portfolio-tokens-details
 *
 * Description:
 *   Retrieves detailed information about ERC-20 tokens from the 1inch Portfolio API.
 *   Parameters:
 *     - chainId: The blockchain identifier (default is 1).
 *     - closed: Boolean to indicate if closed positions should be included.
 *     - closedThreshold: Threshold value for considering a position closed.
 */
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

/*
 * Tool: portfolio-general-value
 *
 * Description:
 *   Fetches the general current portfolio value from the 1inch Portfolio API.
 *   Only requires the chain ID as a parameter (default is 1).
 */
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

/*
 * Tool: portfolio-value-chart
 *
 * Description:
 *   Retrieves chart data for the general portfolio value from the 1inch Portfolio API.
 *   The chain ID (default is 1) must be provided as a parameter.
 */
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

/*
 * Tool: swap-status
 *
 * Description:
 *   This tool (different from the URI resource) provides a way to check the status
 *   of swap orders by reading the local 'order-status.json' file. If an order hash is provided,
 *   it returns the details for that specific order. Otherwise, it lists all recorded orders.
 */
server.tool(
  "swap-status",
  {
    orderHash: z.string().optional()
  },
  async (params) => {
    const path = require('path');
    const fs = require('fs');
    
    const statusFile = path.join(__dirname, 'order-status.json');
    if (!fs.existsSync(statusFile)) {
      return {
        content: [{ 
          type: "text", 
          text: `No swap orders found.`
        }]
      };
    }
    
    try {
      const statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      
      // If no order hash is provided, display all orders.
      if (!params.orderHash) {
        if (statusData.orders.length === 0) {
          return {
            content: [{ 
              type: "text", 
              text: `No orders found.`
            }]
          };
        }
        
        const ordersText = statusData.orders.map(order => 
          `Order: ${order.orderHash}\nStatus: ${order.status}\nStart Time: ${new Date(order.startTime).toLocaleString()}\nLast Updated: ${new Date(order.lastUpdated).toLocaleString()}`
        ).join('\n\n');
        
        return {
          content: [{ 
            type: "text", 
            text: ordersText
          }]
        };
      }
      
      // Find specific order by hash.
      const order = statusData.orders.find(o => o.orderHash === params.orderHash);
      
      if (!order) {
        return {
          content: [{ 
            type: "text", 
            text: `Order ${params.orderHash} not found.`
          }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Order: ${params.orderHash}\nStatus: ${order.status}\nStart Time: ${new Date(order.startTime).toLocaleString()}\nLast Updated: ${new Date(order.lastUpdated).toLocaleString()}`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error reading swap status: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Start the MCP server using the standard I/O transport.
const transport = new StdioServerTransport();
(async () => {
  await server.connect(transport);
})();
