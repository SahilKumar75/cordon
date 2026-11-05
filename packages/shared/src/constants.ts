export const productName = "Bulkhead"

export const ecosystem = "npm"

export const sealStatusNames = ["None", "Sealed", "Unsealed"] as const

export const detectorIds = ["staticScripts", "sandboxCanary", "advisoryFeed"] as const

export const timelineKinds = ["published", "verdict", "sealed", "guardBlocked", "unsealed", "resealed"] as const

export const failModes = ["open", "closed"] as const

export const guardOutcomes = ["allowed", "blocked", "unavailable"] as const

export const listSources = ["chain", "snapshot", "none"] as const

export const zeroHash = `0x${"0".repeat(64)}` as const
