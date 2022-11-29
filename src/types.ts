import { Contract, providers, Signer, BytesLike, ContractInterface } from "ethers";
import * as contracts from "./eulerTypes";
import { ERC20Contract } from "./ERC20";

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export type BatchItem = {
  contract: string | Contract;
  address?: string;
  method: string;
  args: any[];
  allowError?: boolean;
  staticCall?: boolean;
};

export type BatchResponse = {
  success: boolean;
  result: BytesLike;
};

export type Token = {
  name: string;
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
  image?: string;
  extensions?: any;
};

export type TokenWithPermit = Token & {
  extensions: {
    permit: {
      type: string;
      variant?: string;
      domain: RequireAtLeastOne<
        {
          name?: string;
          version?: string;
          chainId?: number;
          verifyingContract?: string;
          salt?: string;
        },
        "name" | "version" | "chainId" | "verifyingContract" | "salt"
      >;
    };
    [key: string]: any;
  };
};

export type EulerAddresses = {
  euler: string;
  exec: string;
  liquidation: string;
  markets: string;
  swap: string;
  swapHub: string;
  swapHandler1Inch: string;
  swapHandlerUniAutoRouter: string;
  swapHandlerUniswapV3: string;
  eulStakes: string;
  eulDistributor: string;
  eulerGeneralView: string;
  eul: string;
  [contractName: string]: string;
};

export type EulerABIs = {
  euler: ContractInterface;
  exec: ContractInterface;
  liquidation: ContractInterface;
  markets: ContractInterface;
  swap: ContractInterface;
  swapHub: ContractInterface;
  eulStakes: ContractInterface;
  eulDistributor: ContractInterface;
  eulerGeneralView: ContractInterface;
  eul: ContractInterface;
  eToken: ContractInterface;
  dToken: ContractInterface;
  pToken: ContractInterface;
  [contractName: string]: ContractInterface;
};

export type NetworkConfig = {
  addresses: EulerAddresses;
  referenceAsset: string;
  eul: TokenWithPermit;
};

export type SignerOrProvider = providers.Provider | Signer | string;

export interface Contracts {
  euler: contracts.EulerContract;
  exec: contracts.ExecContract;
  liquidation: contracts.LiquidationContract;
  markets: contracts.MarketsContract;
  swap: contracts.SwapContract;
  swapHub: contracts.SwapHubContract;
  eulStakes: contracts.EulStakesContract;
  eulDistributor: contracts.EulDistributorContract;
  eulerGeneralView: contracts.EulerGeneralViewContract;
  eul: contracts.EulContract;
  [contractName: string]: Contract;
};

export enum TokenType {
  ERC20 = "erc20",
  EToken = "eToken",
  DToken = "dToken",
  PToken = "pToken"
}

export type TokenCache = {
  [type: string]: {
    [address: string]: 
      Contract
      | ERC20Contract
      | contracts.ETokenContract
      | contracts.DTokenContract
      | contracts.PTokenContract
  }
};

export type UnderlyingToTokenCache = {
  [underlying: string]: {
    [type: string]: string
  }
};

export type SimulateBatchOpts = {
  skipEstimateGas?: boolean;
};
