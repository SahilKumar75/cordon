export const productName = "Cordon"

export const ecosystem = "npm"

export const sealStatusNames = ["None", "Sealed", "Unsealed", "Cleared"] as const

export const entryStatusNames = ["Sealed", "Unsealed", "Cleared", "Suspect"] as const

export const detectorIds = ["staticScripts", "sandboxCanary", "advisoryFeed"] as const

export const timelineKinds = ["published", "verdict", "sealed", "guardBlocked", "unsealed", "resealed", "promoted", "cleared"] as const

export const guardOutcomes = ["allowed", "blocked", "unavailable"] as const

export const listSources = ["chain", "snapshot", "none"] as const

export const zeroHash = `0x${"0".repeat(64)}` as const
