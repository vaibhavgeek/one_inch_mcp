# 1inch Cross-Chain Swap Tool

A tool for executing cross-chain token swaps using 1inch Fusion+ and Model Context Protocol (MCP).

## Demo Video 
[![Video Title](https://img.youtube.com/vi/6_0x3pWLBhw/maxresdefault.jpg)](https://www.youtube.com/watch?v=6_0x3pWLBhw)

## Overview

This tool facilitates cross-chain token swaps between different blockchains (Arbitrum, Base, Polygon, etc.) using the 1inch Fusion+ API. It handles the entire swap process, from initiating orders to monitoring their execution status through a background worker system.

## Installation

Dependencies must be installed using `pnpm` or `yarn` and *not* `npm`:

```bash
pnpm install
# or
yarn install
```

## Configuration

The project must be setup as a CommonJS project. The design of the library does not work in its current form if you import it as ESM.

1. Create a `.env` file in the root directory and populate it with the following variables:

```
DEV_PORTAL_KEY=replace_with_developer_portal_api_key
WALLET_ADDRESS=replace_with_wallet_address
WALLET_KEY=replace_with_wallet_private_key
RPC_URL_ETHEREUM=replace_with_ethereum_rpc_url
RPC_URL_BASE=replace_with_base_rpc_url
INCH_API_KEY=replace_with_1inch_api_key
```

## Usage

### Start the MCP Server

```bash
npm start
```

This starts the Model Context Protocol server which exposes tools for cross-chain swapping and portfolio management.

### Available MCP Tools

The tool provides the following MCP functions that can be used with Claude or other MCP-compatible assistants:

#### Cross-Chain Swap
- **swap**: Initiates a cross-chain token swap
  ```
  Parameters:
  - srcChainId: Source chain ID (default: 8453/Base)
  - dstChainId: Destination chain ID (default: 42161/Arbitrum)
  - srcTokenAddress: Source token address
  - dstTokenAddress: Destination token address
  - amount: Amount to swap (in base units or human-readable format)
  - invert: Swap direction toggle (default: false)
  ```

#### Order Management
- **swap-status**: Checks the status of swap orders
  ```
  Parameters:
  - orderHash: (Optional) Specific order hash to check
  ```

#### Portfolio Management
- **portfolio-protocols-value**: Gets the value of protocols in your portfolio
  ```
  Parameters:
  - chainId: Blockchain ID (default: 1/Ethereum)
  ```

- **portfolio-tokens-details**: Gets detailed information about tokens in your portfolio
  ```
  Parameters:
  - chainId: Blockchain ID (default: 1/Ethereum)
  - closed: Include closed positions (default: true)
  - closedThreshold: Threshold for considering positions closed (default: 1)
  ```

- **portfolio-general-value**: Gets the general value of your portfolio
  ```
  Parameters:
  - chainId: Blockchain ID (default: 1/Ethereum)
  ```

- **portfolio-value-chart**: Gets chart data for portfolio value over time
  ```
  Parameters:
  - chainId: Blockchain ID (default: 1/Ethereum)
  ```

## Monitoring System

The application includes a background worker system that monitors and processes swap orders:

### Monitor Commands

```bash
# Start the monitor daemon
npm run monitor:start

# Check status of all orders
npm run status

# Check status of monitor daemon
npm run monitor:status

# Stop the monitor daemon
npm run monitor:stop
```

### How the Worker System Functions

1. When a swap is initiated, the order information is saved to `order-status.json`
2. The monitor daemon continuously checks for new orders that need monitoring
3. For each new order, a dedicated worker process is spawned
4. The worker monitors the order status and submits secrets when needed to complete the swap
5. Once an order is executed, the worker is terminated and the status is updated

## Technical Notes

- Built with the 1inch Cross-Chain SDK for secure cross-chain swaps
- Uses Model Context Protocol for AI-assistant integration
- [PrivateKeyProviderConnector](https://github.com/1inch/fusion-sdk/blob/bd6bbffffc632602e304ace33dc69c40256d7efa/src/connector/blockchain/private-key-provider.connector.ts#L7-L7) in the Fusion SDK supports BlockchainProviderConnector
- The tool handles secret management for cross-chain swap verification
