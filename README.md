# Euler-sdk

A basic SDK for interacting with [Euler smart contracts](https://github.com/euler-xyz/euler-contracts).
Currently this is an alpha software, under intensive development.

## Installation
```bash
npm i @eulerxyz/euler-sdk
```

## Euler class
The package provides a single named export - the Euler class
```js
import { Euler } from "@eulerxyz/euler-sdk"
```

The constructor takes a single required arguement - `signerOrProvider`, similar to ethers. The second argument is the `chainId`. Currently the SDK contains built in configurations for mainnet (chainId = 1), which is also default, and ropsten (chainId = 3) deployments.

```js
const provider = new ethers.providers.JsonRpcProvider("<JSON_RPC_URL>")
const signer = new ethers.Wallet("<PRV_KEY>", provider)

const e = new Euler(signer);
```

## Interacting with the smart contracts

### Main modules
By default, the SDK provides instances of the [ethers.Contract](https://docs.ethers.io/v5/api/contract/contract/) of the main Euler modules: Euler, Exec, Liquidation, Markets and Swap.

```js
// activate a new market
await e.contracts.markets.activateMarket(tokenAddress)

// check to see if liquidation would be profitable
const liquidationOpportunity = await e.contracts.liquidation.callStatic.checkLiquidation(liquidator, violator, underlying, collateral)
```

### Peripheries

In addition to the main modules, the SDK contains configuration for the mining contracts EulStakes and EulDistributor as well as peripheries FlashLoan and EulerGeneralView. They need to be explicitly initiated:

```js
e.addContract("EulStakes")
e.addContract("FlashLoan")
```

### Eul token

Euler's native governance token Eul is also available:

```js
const balance = await e.contracts.eul.balanceOf(myAccount)
```

Additionally, the token configuration like decimals, logo, permit data are provided in `eulTokenConfig` property:

```js
const { logo, extensions: { permit: { domain } } } = e.eulerTokenConfig
```

### eTokens, dTokens, pTokens
Contracts that exist for every activated market can be instantiated and accessed by helper methods `eToken(address)`, `dToken(address)`, `pToken(address)`

```js
const eUsdcAddress = await e.contracts.markets.underlyingToEToken(USDC_ADDRESS)
await e.eToken(eUsdcAddress).deposit(0, 1000000000)
```

In addition to that there is also `erc20(address)` for constructing standard ERC20 contract instances
```js
const daiBalance = await e.erc20(DAI_ADDRESS).balanceOf(myAccount)
```

### Adding external contracts

The SDK can attach any external contract with the `addContract` method. In this case, both abi and the contract address need to be provided.

```js
e.addContract("weth", WETH_ABI, WETH_ADDRESS)

await e.contracts.weth.deposit({ value: ONE_ETH })
```

### Batch transactions

Euler platform supports batching user operations into a single gas efficient transaction. SDK provides helper methods `buildBatch` and `decodeBatch` to make use of this feature.
`buildBatch` creates encoded payload to the Exec contract's `batchDispatch`. All public functions of Euler modules are available. The function expects an array of operations:
```js
const batchItems = [
  {
    contract: "eToken",
    address: "0x123..",
    method: "deposit",
    args: [0, 1000000]
  },
  {
    contract: "markets",
    method: "enterMarket",
    args: [0, "0xabc.."]
  }
]
```
Note that for singleton contracts, the `address` can be omitted. The `contract` property can also be a contract instance, in which case the `address` can also be skipped.
```js
[
  {
    contract: e.eToken("0x123.."),
    method: "deposit",
    args: [0, 1000000]
  },
  /* ... */
]
```

The encoded payload can be used to execute the `batchDispatch` transaction. If `batchDispatch` is static called, the SDK `decodeBatch` can be used to decode return values from each function called.
```js
const rawResults = await e.contracts.exec.callStatic.batchDispatch(e.buildBatch(batchItems), [])
const [ result1, result2 ] = e.decodeBatch(batchItems, rawResults)
```

### Signing and using permits

To use EIP2612 permits on Euler, SDK provides `signPermit` and `signPermitBatchItem` functions. They both expect a token object with permit extension in [euler-tokenlist](https://github.com/euler-xyz/euler-tokenlist) format. `signPermit` is a low level function, while `signPermitBatchItem` should be used when creating calls to `batchDispatch`.

```js
const batch = [
  await e.signPermitBatchItem(token),
  {
    contract: e.eToken(token.address),
    method: "deposit",
    args: [0, 10000000]
  }
]
```

### Signers and providers

To switch a signer or provider, call the `connect(signerOrProvider)` method. All contract instances will automatically switch to the new value.
To access currently connected signer or provider, use `getSigner()` and `getProvider()` methods.

```js
e.connect(newSigner)

/* ... */

const currentSigner = e.getSigner()
```