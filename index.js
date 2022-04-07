const ethers = require("ethers");
const ERC20Abi = require("./ERC20Abi.json");

const EulerAbi = require("@eulerxyz/euler-interfaces/abis/Euler.json").abi;
const PTokenAbi = require("@eulerxyz/euler-interfaces/abis/PToken.json").abi;
const ETokenAbi =
  require("@eulerxyz/euler-interfaces/abis/modules/EToken.json").abi;
const DTokenAbi =
  require("@eulerxyz/euler-interfaces/abis/modules/DToken.json").abi;
const ExecAbi =
  require("@eulerxyz/euler-interfaces/abis/modules/Exec.json").abi;
const Liquidation =
  require("@eulerxyz/euler-interfaces/abis/modules/Liquidation.json").abi;
const MarketsAbi =
  require("@eulerxyz/euler-interfaces/abis/modules/Markets.json").abi;
const SwapAbi =
  require("@eulerxyz/euler-interfaces/abis/modules/Swap.json").abi;
const EulDistributorAbi =
  require("@eulerxyz/euler-interfaces/abis/mining/EulDistributor.json").abi;
const EulStakesAbi =
  require("@eulerxyz/euler-interfaces/abis/mining/EulStakes.json").abi;

// TODO move addresses to euler-interfaces
const chainConfig = {
  1: {
    addresses: require("euler-contracts/addresses/euler-addresses-mainnet.json"),
    referenceAsset: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  },
  3: {
    addresses: require("euler-contracts/addresses/euler-addresses-ropsten.json"),
    referenceAsset: "0xc778417e063141139fce010982780140aa0cd5ab",
  },
};

const MULTI_PROXY_MODULES = ["eToken", "dToken"];

class Euler {
  constructor(signerOrProvider, chainId = 1) {
    this.contracts = {};
    this._tokenCache = {};
    this.addresses = chainConfig[chainId].addresses;
    this.referenceAsset = chainConfig[chainId].referenceAsset;

    this.connect(signerOrProvider);

    this.addContract("Euler", EulerAbi);
    this.addContract("Exec", ExecAbi);
    this.addContract("Liquidation", Liquidation);
    this.addContract("Markets", MarketsAbi);
    this.addContract("Swap", SwapAbi);

    // TODO handle addresses
    // this.addContract("EulDistributor", EulDistributorAbi);
    // this.addContract("EulStakes", EulStakesAbi);
  }

  connect(signerOrProvider) {
    this.signerOrProvider = signerOrProvider;
    Object.values(this.contracts).forEach((c) => {
      c.connect(this.signerOrProvider);
    });

    return this;
  }

  addContract(name, abi, address) {
    const lowerCaseName = name.charAt(0).toLowerCase() + name.substring(1);

    const addr = address || this.addresses[lowerCaseName];
    if (!addr) throw new Error(`addContract: Unknown address for ${name}`);

    this.contracts[lowerCaseName] = new ethers.Contract(
      addr,
      abi,
      this.signerOrProvider
    );
  }

  erc20(address) {
    return this._addToken(address, ERC20Abi);
  }

  eToken(address) {
    return this._addToken(address, ETokenAbi);
  }

  dToken(address) {
    return this._addToken(address, DTokenAbi);
  }

  pToken(address) {
    return this._addToken(address, PTokenAbi);
  }

  buildBatch(items) {
    return items.map((item) => {
      const o = {};

      const contract = this._batchItemToContract(item);

      o.allowError = Boolean(items.allowError);
      o.proxyAddr = contract.address;
      o.data = contract.interface.encodeFunctionData(item.method, item.args);

      return o;
    });
  }

  decodeBatch(items, resp) {
    const o = [];

    for (let i = 0; i < resp.length; i++) {
      o.push(
        this._batchItemToContract(items[i]).interface.decodeFunctionResult(
          items[i].method,
          resp[i].result
        )
      );
    }

    return o;
  }

  async txOpts() {
    let opts = {};

    if (process.env.TX_FEE_MUL !== undefined) {
      let feeMul = parseFloat(process.env.TX_FEE_MUL);

      let feeData = await this.signerOrProvider.getFeeData();
      console.log('feeData: ', feeData);

      opts.maxFeePerGas = ethers.BigNumber.from(
        Math.floor(feeData.maxFeePerGas.toNumber() * feeMul)
      );
      opts.maxPriorityFeePerGas = ethers.BigNumber.from(
        Math.floor(feeData.maxPriorityFeePerGas.toNumber() * feeMul)
      );
    }

    if (process.env.TX_NONCE !== undefined) {
      opts.nonce = parseInt(process.env.TX_NONCE);
    }

    if (process.env.TX_GAS_LIMIT !== undefined) {
      opts.gasLimit = parseInt(process.env.TX_GAS_LIMIT);
    }

    return opts;
  }

  _addToken(address, abi) {
    if (!this._tokenCache[address]) {
      this._tokenCache[address] = new ethers.Contract(
        address,
        abi,
        this.signerOrProvider
      );
    }

    return this._tokenCache[address].connect(this.signerOrProvider);
  }

  _batchItemToContract(item) {
    if (item.contract instanceof ethers.Contract) return item.contract;
    if (this.contracts[item.contract]) return this.contracts[item.contract];

    if (MULTI_PROXY_MODULES.includes(item.contract)) {
      return this[item.contract](item.address);
    }

    throw new Error(`_batchItemToContract: Unknown contract ${item.contract}`);
  }
}

module.exports = Euler;
