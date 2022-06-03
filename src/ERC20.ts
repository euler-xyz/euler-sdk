import type {
  ContractTransaction,
  Contract,
  BigNumber,
  BigNumberish,
} from "ethers";
import type {
  CheckpointResponse,
  ContractCallOverrides,
  ContractTransactionOverrides,
} from "@eulerxyz/euler-interfaces/types/shared";

export const abi = [
  "event Approval(address indexed owner, address indexed spender, uint value)",
  "event Transfer(address indexed from, address indexed to, uint value)",
  -"function name() external view returns (string memory)",
  -"function symbol() external view returns (string memory)",
  -"function decimals() external view returns (uint8)",
  -"function totalSupply() external view returns (uint)",
  -"function balanceOf(address owner) external view returns (uint)",
  -"function allowance(address owner, address spender) external view returns (uint)",
  -"function approve(address spender, uint value) external returns (bool)",
  "function transfer(address to, uint value) external returns (bool)",
  "function transferFrom(address from, address to, uint value) external returns (bool)",
];

export interface ERC20Contract extends Contract {
  allowance(
    owner: string,
    spender: string,
    overrides?: ContractCallOverrides
  ): Promise<BigNumber>;
  approve(
    spender: string,
    amount: BigNumberish,
    overrides?: ContractTransactionOverrides
  ): Promise<ContractTransaction>;
  balanceOf(
    account: string,
    overrides?: ContractCallOverrides
  ): Promise<BigNumber>;
  decimals(overrides?: ContractCallOverrides): Promise<number>;
  name(overrides?: ContractCallOverrides): Promise<string>;
  symbol(overrides?: ContractCallOverrides): Promise<string>;
  totalSupply(overrides?: ContractCallOverrides): Promise<BigNumber>;
  transfer(
    recipient: string,
    amount: BigNumberish,
    overrides?: ContractTransactionOverrides
  ): Promise<ContractTransaction>;
  transferFrom(
    sender: string,
    recipient: string,
    amount: BigNumberish,
    overrides?: ContractTransactionOverrides
  ): Promise<ContractTransaction>;
}
