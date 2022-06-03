import { Contract, providers, Signer } from "ethers";
import * as contracts from "./eulerTypes";
import { ERC20Contract } from "./ERC20";

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

type BaseBatchItem = {
  contract: string | Contract;
  address?: string;
  method: string;
  args: any[];
  allowError?: boolean;
};

export type BatchItem = BaseBatchItem | { staticCall: BaseBatchItem };

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
  [contractName: string]: string;
};

export type NetworkConfig = {
  addresses: EulerAddresses;
  referenceAsset: string;
};

export type SignerOrProvider = providers.Provider | Signer;

export type Contracts = {
  euler: contracts.EulerContract;
  exec: contracts.ExecContract;
  liquidation: contracts.LiquidationContract;
  markets: contracts.MarketsContract;
  swap: contracts.SwapContract;
  eulStakes: contracts.EulStakesContract;
  eulDistributor: contracts.EulDistributorContract;
  eulerGeneralView: contracts.EulerGeneralViewContract;
  eul: contracts.EulContract;
  [contractName: string]: Contract;
};

export type TokenCache = {
  [address: string]:
    | Contract
    | contracts.ETokenContract
    | contracts.DTokenContract
    | contracts.PTokenContract
    | ERC20Contract;
}
