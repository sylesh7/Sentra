import { toViemChain, createClientFor } from "./fromConfig.js";

export const xLayerTestnet = toViemChain("xLayerTestnet");
export const xLayerPublicClient = createClientFor("xLayerTestnet");
