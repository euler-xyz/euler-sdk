# Euler-sdk

A basic SDK for interacting with [Euler smart contracts](https://github.com/euler-xyz/euler-contracts) in browsers and Node.js applications.
Currently this is an alpha software, under intensive development.

## Installation
```bash
npm i @eulerxyz/euler-sdk
```

## Euler class
The `Euler` class provides methods for interacting with the Euler protocol.
```js
import { Euler } from "@eulerxyz/euler-sdk"
```

The constructor arguments are all optional:
- `signerOrProvider` Ethers Signer or Provider instance. 
- `chainId` Currently the SDK contains built in configurations for mainnet (chainId = 1), which is also default, and ropsten (chainId = 3) deployments.
- `networkConfig` Required when chainId is not 1 or 3. Object containing euler contract addresses, reference asset address and EUL token config. 

```js
const provider = new ethers.providers.JsonRpcProvider("<JSON_RPC_URL>")
const signer = new ethers.Wallet("<PRV_KEY>", provider)

const e = new Euler(signer);
```

## Interacting with the smart contracts

### Euler contracts
By default, the SDK provides instances of the [ethers.Contract](https://docs.ethers.io/v5/api/contract/contract/) of:
- main Euler modules: `Euler`, `Exec`, `Liquidation`, `Markets` and `Swap`
- mining contracts `EulStakes` and `EulDistributor`
- peripheries `FlashLoan` and `EulerGeneralView`
- native governance token `EUL`

```js
// activate a new market
await e.contracts.markets.activateMarket(tokenAddress)

// check to see if liquidation would be profitable
const liquidationOpportunity = await e.contracts.liquidation.callStatic.checkLiquidation(
  liquidator,
  violator,
  underlying,
  collateral
)

// get EUL balance
const balance = await e.contracts.eul.balanceOf(myAccount)
```

### eTokens, dTokens, pTokens
Supply and debt tokens (eToken and dTokens) as well as protected collateral tokens (pTokens) can be instantiated and accessed by helper methods `eToken(address)`, `dToken(address)`, `pToken(address)`

```js
const eUsdcAddress = await e.contracts.markets.underlyingToEToken(USDC_ADDRESS)
await e.eToken(eUsdcAddress).deposit(0, 1M_USDC)
```

In addition to that there is also `erc20(address)` for constructing standard ERC20 contract instances
```js
const daiBalance = await e.erc20(DAI_ADDRESS).balanceOf(myAccount)
```

Additional helper methods `eTokenOf(address)`, `dTokenOf(address)`, `pTokenOf(address)` take the underlying address and return a promise for the related Euler token instance. The first snippet in this section can be simplified to:

```js
await (await e.eTokenOf(USDC_ADDRESS)).deposit(0, 1M_USDC)
```

### Adding external contracts

The SDK can attach any external contract with the `addContract` method. In this case, both abi and the contract address need to be provided.

```js
e.addContract("weth", WETH_ABI, WETH_ADDRESS)

await e.contracts.weth.deposit({ value: ONE_ETH })
```


### Eul token config

The token configuration like decimals, logo, permit data are provided in `eulTokenConfig` property:

```js
const { logo, extensions: { permit: { domain } } } = e.eulerTokenConfig
```

### Batch transactions

Euler platform supports batching user operations into a single gas efficient transaction. SDK provides a helper method `buildBatch` to make use of this feature.
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

The encoded payload can be used to execute the `batchDispatch` transaction. The results returned by batch functions can be decoded with `decodeBatch`
```js
const rawResults = await e.contracts.exec.callStatic.batchDispatch(e.buildBatch(batchItems), [])
const batchResults = e.decodeBatch(batchItems, rawResults)
```

#### Batch simulations
In Euler it is possible to simulate batch calls in a flexible and powerful way. Internally, the Exec contract exposes a function `batchDispatchSimulate`, which is meant to be static called. It executes all the operations in a batch, but returns the responses before executing liquidity checks on the accounts involved in the tx. In addition it is possible to add a call to an arbitrary address with and arbitrary payload to a batch, as long as the function invoked doesn't change state (it must be a view function).

By combining batch simulation and calls to external contracts, we are able to build powerful UX for the users. For example we can add a call to the lens contract `EulerGeneralView` to a simulated batch to receive all state changes to the accounts involved, which the execution of the transaction would result in. In fact we can check any state changes to the chain, as long as there is a view function available (wallet balances, dex slippage etc.). 

Because the responses from the batch are returned before the liquidity checks are executed (as long as liquidity check deferral is requested), it is also possible to simulate the state of the account the current batch would result in, even when that would mean collateral violation (health score < 1) or borrow isolation violation. Having full information, the user is then able to modify the batch accordingly.

The SDK provides a helper method `simulateBatch`

<b>e.simulateBatch(deferredLiquidity, simulationItems)</b>
```js
const {
  simulation,
  gas,
  error,
} = await e.simulateBatch(
  deferredLiquidity,
  simulationItem,
)
// params:
// `deferredLiquidity` - array of accounts to defer liquidity checks for
// `simulationItems` - array of batch items, in the same format as `buildBatch`

// returns:
// `simulation` - decoded responses from functions called in a batch
// `gas` - gas estimations if tx passes liquidity checks
// `error` - if the batch reverts, contains an object:
//   {
//      isLiquidityCheck: true - the error was thrown by liquidity checks vs execution of batch items
//      value: rawError
//   }
}
```

#### External static calls in batch simulations
Internally the calls to external view functions are executed by `Exec`'s `doStaticCall` function. As long as the contract called is initialized in the SDK (or it is passed in as an instance), it is possible to define the call in a similar way to a regular batch item, setting a `staticCall` flag to `true`. The responses will be unwrapped and decoded automatically.

Note that for gas estimation in batch simulation, all items with `staticCall` flag are removed. Make sure to remove them also when finally submitting the tx to `batchDispatch`. If for any reason, a view function should be a part of the transaction and needs to be included in gas estimation, the item should be encoded as a call to `doStaticCall` directly.

```js
const e = new Euler(signer)
e.addContract("EulerGeneralView")

const items = [
  {
    contract: "eToken",
    address: EUSDC_ADDRESS,
    method: "deposit",
    args: [0, 1M_USDC]
  },
  {
    staticCall: true,
    contract: "eulerGeneralView",
    method: "doQuery"
    args: {
      eulerContract: e.contracts.euler.address,
      account: MY_ACCOUNT
      markets: [USDC_ADDRESS]
    }
  }
]

const { simulation } = await e.simulateBatch([MY_ACCOUNT], items)
// simulation[1] contains results from the lens call after the deposit is processed
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

## Utilities

Some useful utilities are provided in the `utils` export of the package. The list will be extended in the future.
```js
import { utils } from "@eulerxyz/euler-sdk" 
```

### Accounts

`utils.getSubAccountId(primaryAddress: string, subAccountAddress: string)`  
Returns an ID of the sub-account given two addresses.

`utils.isRealSubAccount(primaryAddress: string, subAccountAddress: string)`  
Returns `true` if the second address provided is a sub-account of the first.

`utils.getSubAccount(primary: string, subAccountId: number | string)`  
Returns the sub-account address given primary address and a sub-account ID.



