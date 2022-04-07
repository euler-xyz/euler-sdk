const ethers = require("ethers");
require("dotenv").config();
const Euler = require("./");

const provider = new ethers.providers.JsonRpcProvider(process.env.JSON_RPC_URL);
const e = new Euler(provider);

const run = async () => {
  const b = await e
    .eToken(
      await e.contracts.markets.underlyingToEToken(
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
      )
    )
    .balanceOf("0x75cFE4ef963232ae8313aC33e21fC39241338618");

    console.log(b.toString());
};

run()