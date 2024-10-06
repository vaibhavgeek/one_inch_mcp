const { SDK, NetworkEnum } = require('@1inch/cross-chain-sdk');

const address = "0x50c5df26654b5efbdd0c54a062dfa6012933defe"
const address2 = "0x5A6B842891032d702517a4E52ec38eE561063539"
const address3 = "0x5a6b842891032d702517a4e52ec38ee561063539"

async function main() {

    console.log(`Dev portal key: ${process.env.DEV_PORTAL_KEY}`)
    console.log(`Wallet address: ${process.env.WALLET_ADDRESS}`)

    const sdk = new SDK({
        url: 'https://api.1inch.dev/fusion-plus',
        authKey: process.env.DEV_PORTAL_KEY,
    })

    const orders = await sdk.getOrdersByMaker({
        address: process.env.WALLET_ADDRESS,
    })

    console.log("Orders")
    console.log(orders)

}

main()