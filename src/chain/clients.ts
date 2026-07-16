import { toViemChain, createClientFor } from "./fromConfig.js";

export const baseSepolia = toViemChain("baseSepolia");
export const publicClient = createClientFor("baseSepolia");
