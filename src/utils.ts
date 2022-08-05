import { BigNumber, utils } from "ethers";

export function getSubAccountId(primaryAddress: string, subAccountAddress: string) {
  return BigNumber.from(primaryAddress).xor(subAccountAddress).toNumber();
}

export function isRealSubAccount(primaryAddress: string, subAccountAddress: string) {
  return BigNumber.from(primaryAddress).xor(subAccountAddress).lt(256);
}

export function getSubAccount(primary: string, subAccountId: number | string) {
  if (parseInt(subAccountId as string) !== subAccountId || subAccountId > 256)
    throw `invalid subAccountId: ${subAccountId}`
  return utils.hexZeroPad(
    BigNumber.from(primary).xor(subAccountId).toHexString(),
    20,
  )
}
