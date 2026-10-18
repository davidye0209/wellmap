export interface ParsedDose {
	value: number;
	unit: string;
	displayText: string;
	raw: string;
}

export interface ParsedDilution {
	factor: number;
	direction: "Right" | "Down";
	isInferred: boolean;
	raw: string;
}

export interface ParsedQuickCondition {
	treatment?: string;
	dose?: ParsedDose;
	dilution?: ParsedDilution;
	duration?: string;
	biomarkers: string[];
	biomarker?: string;
	status?: string;
	customLayers: Record<string, string>;
	hasAnyMetadata: boolean;
}

export interface SelectionGeometry {
	minR: number;
	maxR: number;
	minC: number;
	maxC: number;
	rowCount: number;
	colCount: number;
	inferredDirection: "Right" | "Down";
}

/**
 * Calculates bounding box and determines default propagation direction.
 */
export function getSelectionGeometry(selectedWellKeys: string[] | Set<string>): SelectionGeometry | null {
	const keys = Array.isArray(selectedWellKeys) ? selectedWellKeys : Array.from(selectedWellKeys);
	if (keys.length === 0) return null;

	let minR = Infinity, maxR = -Infinity;
	let minC = Infinity, maxC = -Infinity;

	keys.forEach((k) => {
		const r = k.charCodeAt(0) - 65;
		const c = parseInt(k.slice(1), 10) - 1;
		if (r < minR) minR = r;
		if (r > maxR) maxR = r;
		if (c < minC) minC = c;
		if (c > maxC) maxC = c;
	});

	const rowCount = maxR - minR + 1;
	const colCount = maxC - minC + 1;

	// In biology:
	// If height > width (e.g. B2:G2) -> Down
	// If width >= height (e.g. B2:B10 or 2x8) -> Right
	const inferredDirection: "Right" | "Down" = rowCount > colCount ? "Down" : "Right";

	return {
		minR,
		maxR,
		minC,
		maxC,
		rowCount,
		colCount,
		inferredDirection,
	};
}

const COMMON_BIOMARKERS = new Set([
	"gfp", "egfp", "rfp", "mcherry", "yfp", "cfp", "bfp", "mneongreen",
	"dapi", "hoechst", "caspase-3", "caspase3", "parp", "cleaved-parp",
	"celltiter-glo", "ctg", "viability", "ki67", "ki-67", "annexin-v", "annexin",
	"pi", "propidium iodide", "edu", "brdu", "luciferase", "live/dead",
	"perk", "p-erk", "pakt", "p-akt", "phh3", "p-hh3", "calcein", "calcein-am",
	"beta-tubulin", "tubulin", "actin", "gapdh",
]);

/**
 * Normalize units (uM -> µM, etc.)
 */
export function normalizeDoseUnit(unitStr: string): string {
	const clean = (unitStr || "").trim();
	const lower = clean.toLowerCase();
	if (lower === "um" || lower === "µm" || lower === "μm") return "µM";
	if (lower === "nm") return "nM";
	if (lower === "pm") return "pM";
	if (lower === "mm") return "mM";
	if (lower === "m") return "M";
	if (lower === "mg/ml") return "mg/mL";
	if (lower === "ug/ml") return "µg/mL";
	if (lower === "ng/ml") return "ng/mL";
	if (lower === "%") return "%";
	return clean;
}

/**
 * Normalize time units (24 hours -> 24h)
 */
export function normalizeDuration(timeStr: string): string {
	const clean = timeStr.trim();
	const match = clean.match(/^([\d.]+)\s*([a-zA-Z]+)$/);
	if (!match) return clean;
	const val = match[1];
	const u = match[2].toLowerCase();
	if (u.startsWith("h")) return `${val}h`;
	if (u.startsWith("d")) return `${val}d`;
	if (u.startsWith("m") && !u.startsWith("mo")) return `${val}min`;
	if (u.startsWith("w")) return `${val}wk`;
	return clean;
}

interface ParserContext {
	existingLabels?: Record<string, Array<{ id: string; name: string }>>;
	customLayerIds?: string[];
	defaultDirection?: "Right" | "Down";
}

/**
 * Parses user quick input string into structured metadata fields.
 * Handles compound names like ABT-737, MK-2206, flat doses,
 * dilution factors (e.g. /3), durations, and multiple biomarkers.
 * Supports prefixes with obligatory colons:
 *   - Treatment: t:, treatment:, compound:, drug:
 *   - Dose: d:, dose:, conc:
 *   - Duration: dur:, duration:, time:
 *   - Biomarkers: bio:, b:, m:, if:, icc:, stain:, readout:, biomarker:
 *   - Status: s:, status:
 */
export function parseQuickMetadataInput(
	rawInput: string,
	context: ParserContext = {}
): ParsedQuickCondition {
	let input = (rawInput || "").trim();
	const customLayers: Record<string, string> = {};

	if (!input) {
		return {
			biomarkers: [],
			customLayers,
			hasAnyMetadata: false,
		};
	}

	let parsedTreatment: string | undefined;
	let parsedDose: ParsedDose | undefined;
	let parsedDilution: ParsedDilution | undefined;
	let parsedDuration: string | undefined;
	const parsedBiomarkers: string[] = [];
	let parsedStatus: string | undefined;

	// 1. Explicit Prefix extraction:
	// Matches patterns like `t:DrugName`, `treatment:"Drug Name"`, `d:10uM`, `dur:24h`,
	// and multi-biomarkers like `bio:GFP,RFP,DAPI`, `if:Ki67 + Caspase-3`, `m:DAPI`, `icc:beta-tubulin`
	let pendingDoseStr = "";
	const prefixRegex = /\b([a-zA-Z_-]+):(?:"([^"]+)"|'([^']+)'|((?:[^\s:]+(?:\s*[+,]\s*[^\s:]+)*)|[^\s]+))/g;
	input = input.replace(prefixRegex, (_, key, qVal1, qVal2, bareVal) => {
		const val = (qVal1 || qVal2 || bareVal || "").trim();
		const k = key.toLowerCase();

		if (k === "t" || k === "treatment" || k === "compound" || k === "drug") {
			parsedTreatment = val;
		} else if (k === "d" || k === "dose" || k === "conc" || k === "concentration") {
			pendingDoseStr = val;
		} else if (k === "dur" || k === "duration" || k === "time") {
			parsedDuration = normalizeDuration(val);
		} else if (
			k === "bio" ||
			k === "b" ||
			k === "biomarker" ||
			k === "biomarkers" ||
			k === "readout" ||
			k === "stain" ||
			k === "m" ||
			k === "marker" ||
			k === "markers" ||
			k === "if" ||
			k === "icc"
		) {
			// Multi-biomarker splitting by comma or plus sign
			const items = val
				.split(/[,+]/)
				.map((p) => p.trim())
				.filter(Boolean);
			items.forEach((item) => {
				if (!parsedBiomarkers.includes(item)) {
					parsedBiomarkers.push(item);
				}
			});
		} else if (k === "s" || k === "status") {
			parsedStatus = val;
		} else if (context.customLayerIds?.includes(key)) {
			customLayers[key] = val;
		}
		return ""; // strip prefixed token from remaining string
	});

	if (pendingDoseStr) {
		input = `${input} ${pendingDoseStr}`;
	}

	// 2. Extract Dilution Direction if explicitly written in input (e.g. "dir:right", "down", "right", "->", "v")
	let explicitDirection: "Right" | "Down" | undefined;
	const dirRegex = /\b(right|down|downward|across)\b|(?:\s|^)(->|=>|v|↓|→)(?:\s|$)/i;
	const dirMatch = input.match(dirRegex);
	if (dirMatch) {
		const word = (dirMatch[1] || dirMatch[2]).toLowerCase();
		if (word === "down" || word === "downward" || word === "v" || word === "↓") {
			explicitDirection = "Down";
		} else {
			explicitDirection = "Right";
		}
		input = input.replace(dirMatch[0], " ");
	}

	// 3. Extract Dilution Factor: e.g. `/3`, `1:3`, `/ 3`, `/2.5`, `1:2`
	const dilutionRegex = /(?:^|\s)(?:\/|1:)\s*(\d+(?:\.\d+)?)(?:\s|$)/;
	const dilutionMatch = input.match(dilutionRegex);
	if (dilutionMatch) {
		const factor = parseFloat(dilutionMatch[1]);
		if (!isNaN(factor) && factor > 0) {
			parsedDilution = {
				factor,
				direction: explicitDirection || context.defaultDirection || "Right",
				isInferred: !explicitDirection,
				raw: dilutionMatch[0].trim(),
			};
		}
		input = input.replace(dilutionMatch[0], " ");
	}

	// 4. Extract Dose: [Number] + [Concentration Unit]
	// Requires standard biological units so drug codes like "ABT-737" or "BAY-876" are NOT matched!
	const doseRegex = /(?:^|\s|\b)(\d+(?:\.\d+)?)\s*(µM|uM|μM|nM|pM|mM|M|mg\/ml|mg\/mL|ug\/ml|µg\/mL|ng\/ml|ng\/mL|%|v\/v|w\/v)(?:\s|$|[;,])/i;
	const doseMatch = input.match(doseRegex);
	if (doseMatch) {
		const valNum = parseFloat(doseMatch[1]);
		const unit = normalizeDoseUnit(doseMatch[2]);
		parsedDose = {
			value: valNum,
			unit,
			displayText: `${valNum} ${unit}`,
			raw: doseMatch[0].trim(),
		};
		input = input.replace(doseMatch[0], " ");
	}

	// If a dilution was specified without an explicit direction, ensure default direction is attached
	if (parsedDilution && !parsedDilution.direction) {
		parsedDilution.direction = explicitDirection || context.defaultDirection || "Right";
	}

	// 5. Extract Duration: [Number] + [Time Unit]
	// e.g. 24h, 48 hrs, 3d, 30 min, 1 week
	if (!parsedDuration) {
		const durationRegex = /\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|d|day|days|min|mins|minute|minutes|wk|wks|week|weeks)\b/i;
		const durMatch = input.match(durationRegex);
		if (durMatch) {
			parsedDuration = normalizeDuration(durMatch[0]);
			input = input.replace(durMatch[0], " ");
		}
	}

	// 6. Extract Biomarkers from remaining text:
	// Check against known list or existing biomarker labels
	const knownBiomarkerLabels = context.existingLabels?.biomarker?.map((l) => l.name.toLowerCase()) || [];
	const words = input.trim().split(/\s+/).filter(Boolean);
	for (const w of words) {
		const cleanW = w.toLowerCase().replace(/[^\w-]/g, "");
		if (COMMON_BIOMARKERS.has(cleanW) || knownBiomarkerLabels.includes(cleanW)) {
			if (!parsedBiomarkers.includes(w)) {
				parsedBiomarkers.push(w);
			}
			input = input.replace(new RegExp(`\\b${w}\\b`, "i"), " ");
		}
	}

	// 7. Check for Status (e.g. "Live", "Fixed")
	if (!parsedStatus) {
		const statusRegex = /\b(live|fixed)\b/i;
		const statusMatch = input.match(statusRegex);
		if (statusMatch) {
			parsedStatus = statusMatch[1].charAt(0).toUpperCase() + statusMatch[1].slice(1).toLowerCase();
			input = input.replace(statusMatch[0], " ");
		}
	}

	// 8. Remaining entity is Treatment!
	// Clean up any remaining whitespace, quotation marks, or commas
	const cleanRemaining = input
		.replace(/[,;+]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!parsedTreatment && cleanRemaining.length > 0) {
		parsedTreatment = cleanRemaining;
	}

	const hasAnyMetadata = !!(
		parsedTreatment ||
		parsedDose ||
		parsedDilution ||
		parsedDuration ||
		parsedBiomarkers.length > 0 ||
		parsedStatus ||
		Object.keys(customLayers).length > 0
	);

	return {
		treatment: parsedTreatment,
		dose: parsedDose,
		dilution: parsedDilution,
		duration: parsedDuration,
		biomarkers: parsedBiomarkers,
		biomarker: parsedBiomarkers[0],
		status: parsedStatus,
		customLayers,
		hasAnyMetadata,
	};
}
