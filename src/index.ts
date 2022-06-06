import { ethers, ContractInterface, providers, Contract } from "ethers";
import invariant from "tiny-invariant";
import { abi as ERC20Abi, ERC20Contract } from "./ERC20";
import { signPermit } from "./permits";
import { uncapitalize, validateAddress, secondsFromNow } from "./utils";

import addressesMainnet from "@eulerxyz/euler-interfaces/addresses/addresses-mainnet.json";
import addressesRopsten from "@eulerxyz/euler-interfaces/addresses/addresses-ropsten.json";
import * as eulerAbis from "./eulerAbis";

import {
  BaseBatchItem,
  BatchItem,
  BatchResponse,
  TokenWithPermit,
  EulerAddresses,
  NetworkConfig,
  SignerOrProvider,
  Contracts,
  TokenCache,
} from "./types";
import {
  EulContract,
  EulerContract,
  PTokenContract,
  ETokenContract,
  DTokenContract,
  ExecContract,
  LiquidationContract,
  MarketsContract,
  SwapContract,
  EulStakesContract,
  EulDistributorContract,
  EulerGeneralViewContract,
} from "./eulerTypes";

const WETH_MAINNET = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_ROPSTEN = "0xc778417e063141139fce010982780140aa0cd5ab";
const DEFAULT_PERMIT_DEADLINE_SECONDS = 60 * 60;
const LIQUIDITY_CHECK_ERRORS = [
  "e/collateral-violation",
  "e/borrow-isolation-violation",
];

class Euler {
  readonly chainId: number;
  readonly contracts: Contracts;
  readonly abis: { [contractName: string]: ContractInterface };
  readonly addresses: EulerAddresses;
  readonly eulTokenConfig: TokenWithPermit;
  readonly referenceAsset: string;

  private readonly _tokenCache: TokenCache;
  private _signerOrProvider?: SignerOrProvider;

  constructor(
    signerOrProvider?: SignerOrProvider,
    chainId = 1,
    networkConfig?: NetworkConfig
  ) {
    this.chainId = chainId;
    this._tokenCache = {};
    this._signerOrProvider = signerOrProvider;

    if (this.chainId === 1) {
      const { eul: eulConfig, ...addresses } = addressesMainnet;
      this.eulTokenConfig = eulConfig;
      this.addresses = addresses as any;

      this.referenceAsset = WETH_MAINNET;
    } else if (this.chainId === 3) {
      const { eul: eulConfig, ...addresses } = addressesRopsten;
      this.eulTokenConfig = eulConfig;
      this.addresses = addresses as any;

      this.referenceAsset = WETH_ROPSTEN;
    } else if (networkConfig) {
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
      this.eulTokenConfig = networkConfig.eulTokenConfig;
    } else {
      throw new Error("Unknown configuration");
    }

    this.abis = eulerAbis;

    this.contracts = this._loadEulerContracts();
  }

  connect(signerOrProvider: SignerOrProvider) {
    this._signerOrProvider = signerOrProvider;
    Object.entries(this.contracts).forEach(([key, c]) => {
      this.contracts[key] = c.connect(signerOrProvider);
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
        return (
          this._signerOrProvider as providers.JsonRpcProvider
        ).getSigner();
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

  addContract(name: string, abi?: ContractInterface, address?: string) {
    invariant(name, "Contract name is required");

    name = uncapitalize(name);

    abi = abi || this.abis[name];
    invariant(Array.isArray(abi), "Missing or invalid abi");

    address = address || (this.addresses[name] as string);
    validateAddress(address);

    this.contracts[name] = new ethers.Contract(
      address,
      abi,
      this._signerOrProvider
    );
    this.abis[name] = abi;
    this.addresses[name] = address;
  }

  erc20(address: string) {
    validateAddress(address);
    return this._getToken(address, ERC20Abi) as ERC20Contract;
  }

  eToken(address: string) {
    validateAddress(address);
    return this._getToken(address, this.abis.eToken) as ETokenContract;
  }

  dToken(address: string) {
    validateAddress(address);
    return this._getToken(address, this.abis.dToken) as DTokenContract;
  }

  pToken(address: string) {
    validateAddress(address);
    return this._getToken(address, this.abis.pToken) as PTokenContract;
  }

  buildBatch(items: BatchItem[]) {
    return items.map((currItem) => {
      let item = { ...currItem };
      if ("staticCall" in item) {
        const scContract = this._batchItemToContract(item.staticCall);
        const scPayload = scContract.interface.encodeFunctionData(
          item.staticCall.method,
          item.staticCall.args
        );

        item = {
          allowError: item.staticCall.allowError,
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

  async simulateBatch(
    deferredLiquidity: string[],
    items: BatchItem[],
    estimateGasItems?: BatchItem[]
  ) {
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
    token: TokenWithPermit,
    {
      spender = this.contracts.euler.address,
      value = ethers.constants.MaxUint256,
      allowed = true,
      deadline = secondsFromNow(DEFAULT_PERMIT_DEADLINE_SECONDS),
    },
    signer = this.getSigner()
  ) {
    invariant(
      ethers.Signer.isSigner(this._signerOrProvider),
      "Signer in not provided"
    );
    invariant(
      token && token.extensions && token.extensions.permit,
      "Invalid token or missing permit config"
    );

    const { type, variant, domain } = token.extensions.permit;

    return signPermit(
      token.address,
      { type, variant, domain },
      { spender, value, allowed, deadline },
      signer as ethers.Signer
    );
  }

  async signPermitBatchItem(
    token: TokenWithPermit,
    {
      value = ethers.constants.MaxUint256,
      allowed = true,
      deadline = secondsFromNow(DEFAULT_PERMIT_DEADLINE_SECONDS),
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

  private _getToken(address: string, abi: ContractInterface) {
    if (!this._tokenCache[address]) {
      this._tokenCache[address] = new ethers.Contract(
        address,
        abi,
        this._signerOrProvider
      );
    }

    return this._signerOrProvider
      ? this._tokenCache[address].connect(this._signerOrProvider)
      : this._tokenCache[address];
  }

  private _batchItemToContract(item: BaseBatchItem) {
    if (item.contract instanceof ethers.Contract) return item.contract;
    if (this.contracts[item.contract]) return this.contracts[item.contract];

    if (item.address) {
      if (item.contract === "eToken") return this.eToken(item.address);
      if (item.contract === "dToken") return this.dToken(item.address);
      if (item.contract === "pToken") return this.pToken(item.address);
      if (item.contract === "erc20") return this.erc20(item.address);
    }

    throw new Error(`Unknown contract ${item.contract}`);
  }

  private _decodeBatch(items: BatchItem[], resp: BatchResponse[]) {
    const decoded = [];

    for (let i = 0; i < resp.length; i++) {
      let item = items[i];
      if ("staticCall" in item) item = item.staticCall;

      decoded.push(
        this._batchItemToContract(item).interface.decodeFunctionResult(
          item.method,
          resp[i].result
        )
      );
    }

    return decoded;
  }

  private _loadEulerContracts(): Contracts {
    const createContract = (name: string) =>
      new Contract(
        this.addresses[uncapitalize(name)],
        this.abis[uncapitalize(name)],
        this._signerOrProvider
      );

    return {
      euler: createContract("Euler") as EulerContract,
      exec: createContract("Exec") as ExecContract,
      liquidation: createContract("Liquidation") as LiquidationContract,
      markets: createContract("Markets") as MarketsContract,
      swap: createContract("Swap") as SwapContract,
      eulStakes: createContract("EulStakes") as EulStakesContract,
      eulDistributor: createContract(
        "EulDistributor"
      ) as EulDistributorContract,
      eulerGeneralView: createContract(
        "EulerGeneralView"
      ) as EulerGeneralViewContract,
      eul: new Contract(
        this.eulTokenConfig.address,
        this.abis.eul,
        this._signerOrProvider
      ) as EulContract,
    };
  }
}

export { Euler };
