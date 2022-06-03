import { ethers } from "ethers";
import invariant from "tiny-invariant";

export const uncapitalize = (str: string) =>
  str.charAt(0).toLowerCase() + str.substring(1);

export const validateAddress = (address: string) => {
  invariant(ethers.utils.isAddress(address), "Invalid address");
};

export const secondsFromNow = (seconds: number) =>
  Math.floor((Date.now() + seconds * 1000) / 1000);
