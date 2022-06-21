import { ethers, utils } from "ethers";
import invariant from "tiny-invariant";

export const uncapitalize = (str: string) =>
  str.charAt(0).toLowerCase() + str.substring(1);

export const validateAddress = (address: string) => {
  invariant(ethers.utils.isAddress(address), "Invalid address");
};

export const secondsFromNow = (seconds: number) =>
  Math.floor((Date.now() + seconds * 1000) / 1000);

export const parseError = (e: any) => {
  // contracts don't decode certain external revert reasons correctly (Utils.sol)
  if (e.reason === "invalid codepoint at offset 2; missing continuation byte") {
    try {
      let msg = utils.defaultAbiCoder.decode(["string"], e.value.slice(4))[0];
      e.reason = msg;
      msg = `execution reverted: ${msg}`
      e.message = msg;
      e.msg = msg;
      e.code = msg;
    } catch {}
  }

  return e;
}
