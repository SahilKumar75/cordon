export const integrityOracleAbi = [
  {
    type: "function",
    name: "setStatus",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paperHash", type: "bytes32" },
      { name: "status", type: "uint8" },
      { name: "reportHash", type: "bytes32" },
      { name: "dbVersion", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "onReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getStatus",
    stateMutability: "view",
    inputs: [{ name: "paperHash", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "status", type: "uint8" },
          { name: "reportHash", type: "bytes32" },
          { name: "dbVersion", type: "string" },
          { name: "updatedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isClean",
    stateMutability: "view",
    inputs: [{ name: "paperHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "VERIFIER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "StatusChanged",
    anonymous: false,
    inputs: [
      { name: "paperHash", type: "bytes32", indexed: true },
      { name: "status", type: "uint8", indexed: false },
      { name: "reportHash", type: "bytes32", indexed: false },
      { name: "dbVersion", type: "string", indexed: false },
      { name: "updatedAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      { name: "account", type: "address" },
      { name: "neededRole", type: "bytes32" },
    ],
  },
  { type: "error", name: "InvalidStatus", inputs: [{ name: "status", type: "uint8" }] },
] as const;
