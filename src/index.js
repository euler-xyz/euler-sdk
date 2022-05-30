import { ethers } from "ethers";
import invariant from "tiny-invariant";
import ERC20Abi from "./ERC20Abi";
import { signPermit } from "./permits";
import { uncapitalize, validateAddress } from "./utils";

import addressesMainnet from "@eulerxyz/euler-interfaces/addresses/addresses-mainnet.json";
import addressesRopsten from "@eulerxyz/euler-interfaces/addresses/addresses-ropsten.json";
import eulerAbis from "./eulerAbis";

const WETH_MAINNET = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_ROPSTEN = "0xc778417e063141139fce010982780140aa0cd5ab";
const MULTI_PROXY_MODULES = ["eToken", "dToken", "pToken"];
const LIQUIDITY_CHECK_ERRORS = [
  "e/collateral-violation",
  "e/borrow-isolation-violation",
];

const DEFAULT_PERMIT_DEADLINE = () =>
  Math.floor((Date.now() + 60 * 60 * 1000) / 1000);

class Euler {
  constructor(signerOrProvider, chainId = 1, networkConfig = null) {
    this.chainId = chainId;
    this.contracts = {};
    this.abis = {};
    this.addresses = {};
    this.eulTokenConfig = {};
    this._tokenCache = {};

    this._loadInterfaces(networkConfig);

    this.connect(signerOrProvider);

    this.addContract("Euler");
    this.addContract("Exec");
    this.addContract("Liquidation");
    this.addContract("Markets");
    this.addContract("Swap");

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
    if (ethers.Signer.isSigner(this._signerOrProvider)) {
      return this._signerOrProvider;
    } else if (
      ethers.providers.BaseProvider.isProvider(this._signerOrProvider)
    ) {
      try {
        return this._signerOrProvider.getSigner();
      } catch {}
    }
    return null;
  }

  getProvider() {
    if (ethers.providers.BaseProvider.isProvider(this._signerOrProvider)) {
      return this._signerOrProvider;
    } else if (
      ethers.Signer.isSigner(this._signerOrProvider) &&
      this._signerOrProvider.provider
    ) {
      return this._signerOrProvider.provider;
    }
    return null;
  }

  addContract(name, abi = null, address = null) {
    invariant(name, "Contract name is required");

    name = uncapitalize(name);

    abi = abi || this.abis[name];
    invariant(Array.isArray(abi), "Missing or invalid abi");

    address = address || this.addresses[name];
    validateAddress(address);

    this.contracts[name] = new ethers.Contract(
      address,
      abi,
      this._signerOrProvider
    );
    this.abis[name] = abi;
    this.addresses[name] = address;
  }

  erc20(address) {
    validateAddress(address);
    return this._getToken(address, ERC20Abi);
  }

  eToken(address) {
    validateAddress(address);
    return this._getToken(address, this.abis.eToken);
  }

  dToken(address) {
    validateAddress(address);
    return this._getToken(address, this.abis.dToken);
  }

  pToken(address) {
    validateAddress(address);
    return this._getToken(address, this.abis.pToken);
  }

  buildBatch(items = []) {
    return items.map((i) => {
      let item = { ...i };
      if (item.staticCall) {
        const scContract = this._batchItemToContract(item.staticCall);
        const scPayload = scContract.interface.encodeFunctionData(
          item.staticCall.method,
          item.staticCall.args
        );

        item = {
          allowError: item.allowError,
          contract: "exec",
          method: "doStaticCall",
          args: [scContract.address, scPayload],
        };
      }

      const contract = this._batchItemToContract(item);

      return {
        allowError: Boolean(item.allowError),
        proxyAddr: contract.address,
        data: contract.interface.encodeFunctionData(item.method, item.args),
      };
    });
  }

  async simulateBatch(deferredLiquidity, items = [], estimateGasItems = null) {
    invariant(Array.isArray(items), "Expecting an array of batch items");

    invariant(
      !estimateGasItems || Array.isArray(estimateGasItems),
      "Expecting an array of batch items for gas estimations"
    );

    const simulate = async () => {
      try {
        await this.contracts.exec.callStatic.batchDispatchSimulate(
          this.buildBatch(items),
          deferredLiquidity
        );
      } catch (e) {
        if (e.errorName !== "BatchDispatchSimulation") throw e;
        return this._decodeBatch(items, e.errorArgs.simulation);
      }
    };

    const estimateGas = async () => {
      try {
        const gas = await this.contracts.exec.estimateGas.batchDispatch(
          this.buildBatch(estimateGasItems || items),
          deferredLiquidity
        );
        return { gas };
      } catch (e) {
        if (e.reason) {
          for (const liquidityCheckError of LIQUIDITY_CHECK_ERRORS) {
            if (e.reason.includes(liquidityCheckError))
              return { liquidityCheckError };
          }
        }
        throw e;
      }
    };

    const [simulation, { gas, liquidityCheckError }] = await Promise.all([
      simulate(),
      estimateGas(),
    ]);

    return {
      simulation,
      gas,
      liquidityCheckError,
    };
  }

  signPermit(
    token,
    {
      spender = this.contracts.euler.address,
      value = ethers.constants.MaxUint256,
      allowed = true,
      deadline = DEFAULT_PERMIT_DEADLINE(),
    },
    signer = this.getSigner()
  ) {
    invariant(
      token && token.extensions && token.extensions.permit,
      "Invalid token or missing permit config"
    );

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
      value = ethers.constants.MaxUint256,
      allowed = true,
      deadline = DEFAULT_PERMIT_DEADLINE(),
    },
    allowError = false,
    signer = this.getSigner()
  ) {
    const { nonce, signature } = await this.signPermit(
      token,
      { spender: this.contracts.euler.address, value, allowed, deadline },
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

  _getToken(address, abi) {
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

    throw new Error(`Unknown contract ${item.contract}`);
  }

  _decodeBatch(items, resp) {
    const decoded = [];

    for (let i = 0; i < resp.length; i++) {
      const item = items[i].staticCall || items[i];
      decoded.push(
        this._batchItemToContract(item).interface.decodeFunctionResult(
          item.method,
          resp[i].result
        )
      );
    }

    return decoded;
  }

  _loadInterfaces(networkConfig = {}) {
    if (this.chainId === 1) {
      this.addresses = addressesMainnet;
      this.referenceAsset = WETH_MAINNET;
    } else if (this.chainId === 3) {
      this.addresses = addressesRopsten;
      this.referenceAsset = WETH_ROPSTEN;
    } else {
      invariant(
        networkConfig.addresses,
        `Missing addresses for chainId ${this.chainId}`
      );
      invariant(
        networkConfig.referenceAsset,
        `Missing reference asset for chainId ${this.chainId}`
      );

      this.addresses = networkConfig.addresses;
      this.referenceAsset = networkConfig.referenceAsset;
    }

    this.abis = eulerAbis;
  }
}

export { Euler };
