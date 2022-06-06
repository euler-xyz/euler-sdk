import { BigNumberish, ethers } from "ethers";

const ABI_EIP2612 = [
  "function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint)",
  "function _nonces(address owner) view returns (uint)",
];
const ABI_EIP2612_PACKED = [
  "function permit(address owner, address spender, uint value, uint deadline, bytes signature)",
  "function nonces(address owner) view returns (uint)",
];
const ABI_ALLOWED = [
  "function permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint)",
];

const TYPES_PERMIT_EIP2612 = {
  Permit: [
    {
      name: "owner",
      type: "address",
    },
    {
      name: "spender",
      type: "address",
    },
    {
      name: "value",
      type: "uint256",
    },
    {
      name: "nonce",
      type: "uint256",
    },
    {
      name: "deadline",
      type: "uint256",
    },
  ],
};
const TYPES_PERMIT_ALLOWED = {
  Permit: [
    {
      name: "holder",
      type: "address",
    },
    {
      name: "spender",
      type: "address",
    },
    {
      name: "nonce",
      type: "uint256",
    },
    {
      name: "expiry",
      type: "uint256",
    },
    {
      name: "allowed",
      type: "bool",
    },
  ],
};

export const signPermit = async (
  tokenAddress: string,
  { type, variant, domain }: { type: string; variant?: string; domain: any },
  {
    spender,
    value,
    allowed,
    deadline,
  }: {
    spender: string;
    value?: BigNumberish;
    allowed?: boolean;
    deadline: number;
  },
  signer: ethers.Signer
) => {
  if (!ethers.Signer.isSigner(signer)) {
    throw new Error("Invalid signer");
  }

  // future proof experimental feature
  const sign = (signer as any)._signTypedData
    ? (signer as any)._signTypedData.bind(signer)
    : (signer as any).signTypedData.bind(signer);

  const signerAddress = await signer.getAddress();

  if (type === "EIP2612") {
    const token = new ethers.Contract(
      tokenAddress,
      variant === "PACKED" ? ABI_EIP2612_PACKED : ABI_EIP2612,
      signer
    );

    let nonce;

    if (variant === "UNDERSCORE_NONCES") {
      nonce = await token._nonces(signerAddress);
    } else {
      nonce = await token.nonces(signerAddress);
    }

    const rawSignature = await sign(domain, TYPES_PERMIT_EIP2612, {
      owner: signerAddress,
      spender,
      value,
      nonce,
      deadline,
    });

    return {
      signature: {
        raw: rawSignature,
        ...ethers.utils.splitSignature(rawSignature),
      },
      nonce,
    };
  }

  if (type === "ALLOWED") {
    const token = new ethers.Contract(tokenAddress, ABI_ALLOWED, signer);
    const nonce = await token.nonces(signerAddress);

    const rawSignature = await sign(domain, TYPES_PERMIT_ALLOWED, {
      holder: signerAddress,
      spender,
      nonce,
      expiry: deadline,
      allowed,
    });

    return {
      signature: {
        raw: rawSignature,
        ...ethers.utils.splitSignature(rawSignature),
      },
      nonce,
    };
  }

  throw new Error(`Unknown permit type: ${type}`);
};
