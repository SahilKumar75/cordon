export const paperStatus = { Unknown: 0, Clean: 1, Flagged: 2 } as const

export const paperStatusNames = ["Unknown", "Clean", "Flagged"] as const

export const reportVersion = 1

export const evidenceSources = ["crossref", "openalex", "simulation"] as const

export const doiPattern = /10\.\d{4,9}\/[^\s"<>]*[^\s"<>.,;:)\]]/i
