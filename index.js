const ethers = require("ethers");
const ERC20Abi = require("./ERC20Abi.json");
const { signPermit } = require("./permits");

const WETH_MAINNET = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_ROPSTEN = "0xc778417e063141139fce010982780140aa0cd5ab";

const MULTI_PROXY_MODULES = ["modules/EToken", "modules/DToken", "PToken"];
const SINGLE_PROXY_MODULES = [
  "Euler",
  "modules/Exec",
  "modules/Liquidation",
  "modules/Markets",
  "modules/Swap",
  "views/EulerGeneralView",
];
const SINGLETON_CONTRACTS = ["mining/EulStakes", "mining/EulDistributor"];

const toLower = (str) => str.charAt(0).toLowerCase() + str.substring(1);

class Euler {
  constructor(signerOrProvider, chainId = 1, networkConfig) {
    this.chainId = chainId;
    this.contracts = {};
    this.abis = {};
    this.addresses = {};
    this.eulTokenConfig = {};
    this._tokenCache = {};

    this._loadInterfaces(networkConfig);

    this.connect(signerOrProvider);

    this.addSingleton("Euler");
    this.addSingleton("Exec");
    this.addSingleton("Liquidation");
    this.addSingleton("Markets");
    this.addSingleton("Swap");

    if (this.addresses.eul) {
      this.contracts.eul = this.erc20(this.addresses.eul.address);
      this.eulTokenConfig = this.addresses.eul;
    }
  }

  connect(signerOrProvider) {
    this._signerOrProvider = signerOrProvider;
    Object.entries(this.contracts).forEach(([key, c]) => {
      this.contracts[key] = c.connect(this._signerOrProvider);
    });

    return this;
  }

  getSigner() {
    return ethers.Signer.isSigner(this._signerOrProvider)
      ? this._signerOrProvider
      : null;
  }

  getProvider() {
    return ethers.Signer.isSigner(this._signerOrProvider)
      ? this._signerOrProvider.provider
      : this._signerOrProvider;
  }

  addSingleton(name, abi, address) {
    const lowerCaseName = toLower(name);

    abi = abi || this.abis[lowerCaseName];
    if (!abi) throw new Error(`addSingleton: Unknown abi for ${name}`);

    address = address || this.addresses[lowerCaseName];
    if (!address) throw new Error(`addSingleton: Unknown address for ${name}`);

    this.contracts[lowerCaseName] = new ethers.Contract(
      address,
      abi,
      this._signerOrProvider
    );
  }

  // TODO validate addresses
  erc20(address) {
    return this._addToken(address, ERC20Abi);
  }

  eToken(address) {
    return this._addToken(address, this.abis.eToken);
  }

  dToken(address) {
    return this._addToken(address, this.abis.dToken);
  }

  pToken(address) {
    return this._addToken(address, this.abis.pToken);
  }

  buildBatch(items) {
    return items.map((item) => {
      // TODO validate
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

  signPermit(
    token,
    {
      spender = this.contracts.euler.address,
      value = ethers.constants.MaxUint256,
      allowed = true,
      deadline = this._defaultPermitDeadline(),
    },
    signer = this.getSigner()
    ) {

    if (!token || !token.extensions || !token.extensions.permit) {
      throw new Error("Invalid token or missing permit config");
    }

    const { type, variant, domain } = token.extensions.permit;

    return signPermit(
      token.address,
      { type, variant, domain },
      { spender, value, allowed, deadline },
      signer
    );
  }

  async signPermitBatchItem(
    token,
    {
      spender = this.contracts.euler.address,
      value = ethers.constants.MaxUint256,
      allowed = true,
      deadline = this._defaultPermitDeadline(),
    },
    signer = this.getSigner(),
    allowError = false
  ) {

    const { nonce, signature } = await this.signPermit(
      token,
      { spender, value, allowed, deadline },
      signer
    );

    const { type, variant } = token.extensions.permit;
    let batchItem;

    if (type === "EIP2612") {
      if (variant === "PACKED") {
        batchItem = {
          allowError,
          contract: "exec",
          method: "usePermitPacked",
          args: [token.address, value, deadline, signature.raw],
        };
      } else {
        batchItem = {
          allowError,
          contract: "exec",
          method: "usePermit",
          args: [
            token.address,
            value,
            deadline,
            signature.v,
            signature.r,
            signature.s,
          ],
        };
      }
    } else {
      batchItem = {
        allowError,
        contract: "exec",
        method: "usePermitAllowed",
        args: [
          token.address,
          nonce,
          deadline,
          allowed,
          signature.v,
          signature.r,
          signature.s,
        ],
      };
    }
    return batchItem;
  }

  async txOpts() {
    let opts = {};

    if (process.env.TX_FEE_MUL !== undefined) {
      let feeMul = parseFloat(process.env.TX_FEE_MUL);

      let feeData = await this.getProvider().getFeeData();

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
        this._signerOrProvider
      );
    }

    return this._tokenCache[address].connect(this._signerOrProvider);
  }

  _batchItemToContract(item) {
    if (item.contract instanceof ethers.Contract) return item.contract;
    if (this.contracts[item.contract]) return this.contracts[item.contract];

    if (MULTI_PROXY_MODULES.includes(item.contract)) {
      return this[item.contract](item.address);
    }

    throw new Error(`_batchItemToContract: Unknown contract ${item.contract}`);
  }

  _loadInterfaces(networkConfig = {}) {
    let abiPath = "@eulerxyz/euler-interfaces/abis";

    if (this.chainId === 1) {
      this.addresses = require("@eulerxyz/euler-interfaces/addresses/addresses-mainnet.json");
      this.referenceAsset = WETH_MAINNET;
    } else if (this.chainId === 3) {
      this.referenceAsset = WETH_ROPSTEN;
      try {
        // special case ropsten for development
        this.addresses = require("euler-interfaces-ropsten/addresses/addresses-ropsten.json");
        abiPath = "euler-interfaces-ropsten/abis";
      } catch {
        this.addresses = require("@eulerxyz/euler-interfaces/addresses/addresses-ropsten.json");
      }
    } else {
      if (!networkConfig.addresses)
        throw new Error(`Missing addresses for chainId ${this.chainId}`);
      if (!networkConfig.referenceAsset)
        throw new Error(`Missing reference asset for chainId ${this.chainId}`);
      this.addresses = networkConfig.addresses;
      this.referenceAsset = networkConfig.referenceAsset;
    }

    [
      ...MULTI_PROXY_MODULES,
      ...SINGLE_PROXY_MODULES,
      ...SINGLETON_CONTRACTS,
    ].forEach((module) => {
      const name = toLower(module.split("/").pop());
      this.abis[name] = require(`${abiPath}/${module}`).abi;
    });
  }

  _defaultPermitDeadline() {
    return Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
  }
}

module.exports = Euler;
