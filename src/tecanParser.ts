/**
 * Tecan D300e / HP D300 Digital Dispenser XML Spreadsheet Parser for WellMap
 */

export const ACCESSIBLE_PALETTE = [
	"#f43f5e",
	"#f99c35",
	"#4ade80",
	"#3b82f6",
	"#c084fc",
	"#fb7185",
	"#f59e0b",
	"#a3e635",
	"#60a5fa",
	"#e9d5ff",
	"#f472b6",
	"#facc15",
	"#0d9488",
	"#06b6d4",
	"#7389d8",
	"#fda4af",
	"#ffe3a8",
	"#4ca1a3",
	"#56b4d3",
	"#bfdbfe",
	"#fecdd3",
	"#84cc16",
	"#99f6e4",
	"#bae6fd",
	"#fbcfe8",
];

export const INITIAL_LAYERS = [
	{ id: "treatment", name: "Treatment" },
	{ id: "dose", name: "Dose" },
	{ id: "duration", name: "Duration" },
	{ id: "biomarker", name: "Biomarker" },
	{ id: "status", name: "Status" },
];

export const formatDoseDisplay = (
	valStr: string | number,
	unit: string,
	precision = 4,
): string => {
	const val = typeof valStr === "number" ? valStr : parseFloat(valStr);
	if (isNaN(val)) return String(valStr || "");

	let currentUnit = unit;
	let currentVal = val;

	// Rule to scale micro-values to higher whole numbers (e.g., 0.1 µM -> 100 nM)
	if (currentVal < 1.0) {
		if (currentUnit === "mM") {
			currentVal = currentVal * 1000;
			currentUnit = "µM";
		}
		if (
			currentVal < 1.0 &&
			(currentUnit === "µM" || currentUnit === "uM" || currentUnit === "μM")
		) {
			currentVal = currentVal * 1000;
			currentUnit = "nM";
		}
		if (currentVal < 1.0 && currentUnit === "nM") {
			currentVal = currentVal * 1000;
			currentUnit = "pM";
		}
	}

	const formattedVal = Number(currentVal.toFixed(precision)).toString();
	return `${formattedVal} ${currentUnit}`;
};

export const parseDoseInput = (
	input: string,
): { value: number; unit: string } => {
	const cleanInput = (input || "").trim();
	const match = cleanInput.match(/^([\d.]+)\s*([a-zA-Zμµ%/]+)?$/);
	if (!match) {
		const val = parseFloat(cleanInput);
		return { value: isNaN(val) ? 0 : val, unit: "µM" };
	}
	const valStr = match[1];
	let unitStr = match[2] || "µM";

	const lower = unitStr.toLowerCase();
	if (lower === "um" || unitStr === "μM" || unitStr === "µM") {
		unitStr = "µM";
	} else if (lower === "nm") {
		unitStr = "nM";
	} else if (lower === "pm") {
		unitStr = "pM";
	} else if (lower === "mm") {
		unitStr = "mM";
	} else if (unitStr === "%") {
		unitStr = "%";
	}

	return {
		value: parseFloat(valStr) || 0,
		unit: unitStr,
	};
};

export const convertDoseToStandardValue = (
	value: number | undefined | null,
	unit: string,
): number => {
	if (value === undefined || value === null || isNaN(value)) return 0;
	const u = (unit || "µM").trim().toLowerCase();

	if (u === "mm") return value * 1000000000;
	if (u === "µm" || u === "μm" || u === "um") return value * 1000000;
	if (u === "nm") return value * 1000;
	if (u === "pm") return value;

	if (u === "g/ml") return value * 1000000000000;
	if (u === "mg/ml") return value * 1000000000;
	if (u === "µg/ml" || u === "ug/ml") return value * 1000000;
	if (u === "ng/ml") return value * 1000;
	if (u === "pg/ml") return value;

	return value;
};

// Node/browser compatible XML DOM element interface
interface SimpleXmlElement {
	localName: string;
	attributes: Record<string, string>;
	children: SimpleXmlElement[];
	textContent: string;
}

function parseXmlFallback(xml: string): SimpleXmlElement {
	// A lightweight, robust parser for XML Spreadsheet 2003 elements
	let pos = 0;

	function skipWhitespace() {
		while (pos < xml.length && /\s/.test(xml[pos])) pos++;
	}

	function parseAttributes(): Record<string, string> {
		const attrs: Record<string, string> = {};
		while (pos < xml.length) {
			skipWhitespace();
			if (xml[pos] === ">" || xml[pos] === "/" || xml[pos] === "?") break;
			const nameMatch = xml.slice(pos).match(/^([a-zA-Z0-9_:-]+)/);
			if (!nameMatch) break;
			const attrName = nameMatch[1];
			pos += attrName.length;
			skipWhitespace();
			if (xml[pos] === "=") {
				pos++;
				skipWhitespace();
				const quote = xml[pos];
				if (quote === '"' || quote === "'") {
					pos++;
					const valStart = pos;
					while (pos < xml.length && xml[pos] !== quote) pos++;
					const val = xml.slice(valStart, pos);
					attrs[attrName] = decodeXmlEntities(val);
					if (pos < xml.length) pos++;
				}
			}
		}
		return attrs;
	}

	function decodeXmlEntities(s: string): string {
		return s
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&#10;/g, "\n")
			.replace(/&#13;/g, "\r");
	}

	function parseNode(): SimpleXmlElement | null {
		skipWhitespace();
		while (pos < xml.length) {
			if (xml[pos] !== "<") {
				pos++;
				continue;
			}
			if (xml.startsWith("<?", pos) || xml.startsWith("<!", pos)) {
				const endIdx = xml.indexOf(">", pos);
				pos = endIdx === -1 ? xml.length : endIdx + 1;
				skipWhitespace();
				continue;
			}
			break;
		}

		if (pos >= xml.length || xml[pos] !== "<") return null;
		pos++; // skip '<'

		const tagMatch = xml.slice(pos).match(/^([a-zA-Z0-9_:-]+)/);
		if (!tagMatch) return null;
		const rawTagName = tagMatch[1];
		pos += rawTagName.length;

		const attrs = parseAttributes();
		skipWhitespace();

		let isSelfClosing = false;
		if (xml[pos] === "/") {
			isSelfClosing = true;
			pos++;
		}
		if (xml[pos] === ">") pos++;

		const localName = rawTagName.includes(":")
			? rawTagName.split(":")[1]
			: rawTagName;

		const elem: SimpleXmlElement = {
			localName,
			attributes: attrs,
			children: [],
			textContent: "",
		};

		if (isSelfClosing) return elem;

		let textAccum = "";
		while (pos < xml.length) {
			if (xml[pos] === "<") {
				if (xml.startsWith("</", pos)) {
					// Closing tag
					const closeEnd = xml.indexOf(">", pos);
					pos = closeEnd === -1 ? xml.length : closeEnd + 1;
					break;
				} else if (xml.startsWith("<![CDATA[", pos)) {
					const cdataEnd = xml.indexOf("]]>", pos);
					if (cdataEnd === -1) {
						textAccum += xml.slice(pos + 9);
						pos = xml.length;
					} else {
						textAccum += xml.slice(pos + 9, cdataEnd);
						pos = cdataEnd + 3;
					}
				} else {
					const child = parseNode();
					if (child) elem.children.push(child);
				}
			} else {
				textAccum += xml[pos];
				pos++;
			}
		}

		elem.textContent = decodeXmlEntities(textAccum.trim());
		return elem;
	}

	const root = parseNode();
	return root || { localName: "", attributes: {}, children: [], textContent: "" };
}

function findElements(node: SimpleXmlElement, localName: string): SimpleXmlElement[] {
	const results: SimpleXmlElement[] = [];
	const target = localName.toLowerCase();
	function traverse(cur: SimpleXmlElement) {
		if (cur.localName.toLowerCase() === target) {
			results.push(cur);
		}
		for (const ch of cur.children) {
			traverse(ch);
		}
	}
	traverse(node);
	return results;
}

function getAttribute(node: SimpleXmlElement, name: string): string | null {
	const target = name.toLowerCase();
	for (const [k, v] of Object.entries(node.attributes)) {
		const raw = k.includes(":") ? k.split(":")[1] : k;
		if (raw.toLowerCase() === target) {
			return v;
		}
	}
	return null;
}

function parseSpreadsheetRows(tableNode: SimpleXmlElement): string[][] {
	const rows: string[][] = [];
	const rowNodes = tableNode.children.filter(
		(ch) => ch.localName.toLowerCase() === "row",
	);
	let curRowIdx = 1;

	for (const rNode of rowNodes) {
		const rowIdxAttr = getAttribute(rNode, "index");
		if (rowIdxAttr) {
			const targetRow = parseInt(rowIdxAttr, 10);
			while (curRowIdx < targetRow) {
				rows.push([]);
				curRowIdx++;
			}
		}

		const rowData: string[] = [];
		const cellNodes = rNode.children.filter(
			(ch) => ch.localName.toLowerCase() === "cell",
		);
		let curColIdx = 1;

		for (const cNode of cellNodes) {
			const colIdxAttr = getAttribute(cNode, "index");
			if (colIdxAttr) {
				const targetCol = parseInt(colIdxAttr, 10);
				while (curColIdx < targetCol) {
					rowData.push("");
					curColIdx++;
				}
			}

			const dataNodes = cNode.children.filter(
				(ch) => ch.localName.toLowerCase() === "data",
			);
			const val = dataNodes.length > 0 ? dataNodes[0].textContent : "";
			rowData.push(val);
			curColIdx++;
		}

		rows.push(rowData);
		curRowIdx++;
	}

	return rows;
}

export interface LabelItem {
	id: string;
	name: string;
	color: string;
	value?: number;
	unit?: string;
}

export interface WellData {
	treatment?: string[];
	dose?: string;
	duration?: string;
	biomarker?: string;
	status?: string;
	[layerId: string]: string | string[] | undefined;
}

export interface WellMapLayout {
	plateFormat: string;
	layers: Array<{ id: string; name: string }>;
	labels: Record<string, LabelItem[]>;
	wells: Record<string, WellData>;
}

export function isTecanOrDispenserXml(content: string): boolean {
	const lower = content.toLowerCase();
	return (
		(lower.includes("<workbook") || lower.includes("<?xml") || lower.includes("<worksheet")) &&
		(lower.includes("urn:schemas-microsoft-com:office:spreadsheet") ||
			lower.includes("tabular detail") ||
			lower.includes("dispensed conc") ||
			lower.includes("tecan") ||
			lower.includes("dispensed well"))
	);
}

export function parseTecanXml(xmlContent: string): WellMapLayout {
	let rootNode: SimpleXmlElement;

	// In browser environments with DOMParser available
	if (typeof DOMParser !== "undefined") {
		try {
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
			const parseErrors = xmlDoc.getElementsByTagName("parsererror");
			if (parseErrors.length === 0) {
				// Convert Document to SimpleXmlElement tree for uniform processing
				function convertDomNode(domNode: Element): SimpleXmlElement {
					const attrs: Record<string, string> = {};
					for (let i = 0; i < domNode.attributes.length; i++) {
						const a = domNode.attributes[i];
						attrs[a.name] = a.value;
					}
					const children: SimpleXmlElement[] = [];
					let textContent = "";
					for (let i = 0; i < domNode.childNodes.length; i++) {
						const child = domNode.childNodes[i];
						if (child.nodeType === 1) {
							// ELEMENT_NODE
							children.push(convertDomNode(child as Element));
						} else if (child.nodeType === 3 || child.nodeType === 4) {
							// TEXT_NODE or CDATA
							textContent += child.nodeValue || "";
						}
					}
					return {
						localName: domNode.localName || domNode.nodeName,
						attributes: attrs,
						children,
						textContent: textContent.trim(),
					};
				}
				rootNode = convertDomNode(xmlDoc.documentElement);
			} else {
				rootNode = parseXmlFallback(xmlContent);
			}
		} catch {
			rootNode = parseXmlFallback(xmlContent);
		}
	} else {
		rootNode = parseXmlFallback(xmlContent);
	}

	// Index worksheets by normalized name
	const worksheetNodes = findElements(rootNode, "worksheet");
	const sheets = new Map<string, SimpleXmlElement>();
	for (const ws of worksheetNodes) {
		const name = getAttribute(ws, "name");
		if (name) {
			sheets.set(name.trim().toLowerCase(), ws);
		}
	}

	// 1. Parse Plates worksheet
	let plateFormat = "96";
	let additionalVolUl = 100.0;
	const platesWs = sheets.get("plates");
	if (platesWs) {
		const tbls = findElements(platesWs, "table");
		if (tbls.length > 0) {
			const pRows = parseSpreadsheetRows(tbls[0]);
			if (pRows.length > 1) {
				const header = pRows[0].map((h) =>
					h.replace(/\s+/g, " ").trim().toLowerCase(),
				);
				const row1 = pRows[1];
				const rowsIdx = header.indexOf("rows");
				const colsIdx = header.indexOf("columns");
				const typeIdx = header.indexOf("type");
				const addVolIdx = header.findIndex((h) =>
					h.includes("additional volume"),
				);

				if (
					rowsIdx !== -1 &&
					colsIdx !== -1 &&
					row1.length > Math.max(rowsIdx, colsIdx)
				) {
					const rCount = parseInt(row1[rowsIdx], 10);
					const cCount = parseInt(row1[colsIdx], 10);
					if (rCount >= 16 || cCount >= 24) {
						plateFormat = "384";
					}
				}
				if (
					typeIdx !== -1 &&
					row1.length > typeIdx &&
					row1[typeIdx].includes("384")
				) {
					plateFormat = "384";
				}
				if (
					addVolIdx !== -1 &&
					row1.length > addVolIdx &&
					row1[addVolIdx]
				) {
					const parsedVol = parseFloat(row1[addVolIdx]);
					if (!isNaN(parsedVol) && parsedVol > 0) {
						additionalVolUl = parsedVol;
					}
				}
			}
		}
	}

	// 2. Parse Fluids worksheet
	const stocks: Record<
		string,
		{ stockConc: number | null; unit: string; fluidClass: string }
	> = {};
	const fluidsWs = sheets.get("fluids");
	if (fluidsWs) {
		const tbls = findElements(fluidsWs, "table");
		if (tbls.length > 0) {
			const fRows = parseSpreadsheetRows(tbls[0]);
			let inStockSection = false;
			let fluidCol = 1;
			let stockCol = 2;
			let unitCol = 3;
			let classCol = 4;

			for (const row of fRows) {
				if (!row.some((c) => c.trim().length > 0)) {
					inStockSection = false;
					continue;
				}
				const rowText = row.join(" ").toLowerCase();
				if (rowText.includes("stock concentration")) {
					inStockSection = true;
					row.forEach((col, idx) => {
						const low = col.replace(/\s+/g, " ").trim().toLowerCase();
						if (low.includes("fluid name")) fluidCol = idx;
						else if (
							low.includes("stock concentration") &&
							!low.includes("unit")
						)
							stockCol = idx;
						else if (
							low.includes("stock concentration unit") ||
							low.includes("concentration unit")
						)
							unitCol = idx;
						else if (low === "class") classCol = idx;
					});
					continue;
				}
				if (inStockSection && row.length > Math.max(fluidCol, stockCol)) {
					const fluidName = row[fluidCol]?.trim();
					if (fluidName) {
						const rawStock = row[stockCol]?.trim();
						const stockVal = rawStock ? parseFloat(rawStock) : null;
						const stockUnit = row[unitCol]?.trim() || "mM";
						const fluidClass = row[classCol]?.trim() || "";
						stocks[fluidName] = {
							stockConc:
								stockVal !== null && !isNaN(stockVal)
									? stockVal
									: null,
							unit: stockUnit,
							fluidClass,
						};
					}
				}
			}
		}
	}

	// 3. Parse dispenses from Tabular detail (or Tabular)
	interface DispenseEvent {
		fluid: string;
		conc: number | null;
		unit: string;
		vol: number | null;
		volUnit: string;
	}

	const dispensesByWell: Record<string, DispenseEvent[]> = {};
	const targetWs = sheets.get("tabular detail") || sheets.get("tabular");
	const isTabularDetail = !!sheets.get("tabular detail");

	if (targetWs) {
		const tbls = findElements(targetWs, "table");
		if (tbls.length > 0) {
			const tRows = parseSpreadsheetRows(tbls[0]);
			if (tRows.length > 1) {
				const header = tRows[0].map((h) =>
					h.replace(/\s+/g, " ").trim().toLowerCase(),
				);
				let wellCol = -1;
				let fluidCol = -1;
				let concCol = -1;
				let concUnitCol = -1;
				let volCol = -1;
				let volUnitCol = -1;

				header.forEach((h, i) => {
					if (h.includes("dispensed well") || h === "well") wellCol = i;
					else if (h.includes("fluid name")) fluidCol = i;
					else if (
						h.includes("dispensed concentration") ||
						h === "concentration"
					)
						concCol = i;
					else if (
						h.includes("dispensed volume") &&
						!h.includes("total")
					)
						volCol = i;
				});

				if (isTabularDetail) {
					if (
						concCol !== -1 &&
						concCol + 1 < header.length &&
						header[concCol + 1].includes("unit")
					) {
						concUnitCol = concCol + 1;
					}
					if (
						volCol !== -1 &&
						volCol + 1 < header.length &&
						header[volCol + 1].includes("unit")
					) {
						volUnitCol = volCol + 1;
					}
				}

				for (let r = 1; r < tRows.length; r++) {
					const row = tRows[r];
					if (wellCol === -1 || row.length <= wellCol) continue;
					const rawWell = row[wellCol]?.trim();
					if (!rawWell) continue;

					const match = rawWell.match(/^([A-Za-z]+)0*(\d+)$/);
					if (!match) continue;
					const wellKey = `${match[1].toUpperCase()}${parseInt(match[2], 10)}`;

					const fluidName =
						fluidCol !== -1 && row.length > fluidCol
							? row[fluidCol].trim()
							: "";
					let concVal: number | null = null;
					if (
						concCol !== -1 &&
						row.length > concCol &&
						row[concCol].trim()
					) {
						const parsed = parseFloat(row[concCol].trim());
						if (!isNaN(parsed)) concVal = parsed;
					}
					const concUnit =
						concUnitCol !== -1 &&
						row.length > concUnitCol &&
						row[concUnitCol].trim()
							? row[concUnitCol].trim()
							: "µM";

					let volVal: number | null = null;
					if (volCol !== -1 && row.length > volCol && row[volCol].trim()) {
						const parsed = parseFloat(row[volCol].trim());
						if (!isNaN(parsed)) volVal = parsed;
					}
					const volUnit =
						volUnitCol !== -1 &&
						row.length > volUnitCol &&
						row[volUnitCol].trim()
							? row[volUnitCol].trim()
							: "nL";

					if (fluidName || concVal !== null || volVal !== null) {
						if (!dispensesByWell[wellKey])
							dispensesByWell[wellKey] = [];
						dispensesByWell[wellKey].push({
							fluid: fluidName,
							conc: concVal,
							unit: concUnit,
							vol: volVal,
							volUnit: volUnit,
						});
					}
				}
			}
		}
	}

	// Check if any wells extend beyond 96-well boundary ('H', 12)
	for (const wellKey of Object.keys(dispensesByWell)) {
		const rowChar = wellKey.charAt(0);
		const colNum = parseInt(wellKey.slice(1), 10);
		if (rowChar > "H" || colNum > 12) {
			plateFormat = "384";
			break;
		}
	}

	// Helper to calculate clean nominal dose
	function cleanDoseValue(
		dispensedConc: number | null,
		volNl: number | null,
		stockMm: number | null,
		addVolUl: number,
	): number | null {
		if (dispensedConc === null && volNl === null) return null;
		if (volNl !== null && stockMm !== null && addVolUl > 0) {
			// Nominal µM = (volNl * stockMm) / addVolUl
			const nominal = (volNl * stockMm) / addVolUl;
			if (dispensedConc !== null && dispensedConc > 0) {
				if (Math.abs(nominal - dispensedConc) / dispensedConc < 0.05) {
					return Number(nominal.toFixed(6));
				}
			} else {
				return Number(nominal.toFixed(6));
			}
		}
		if (dispensedConc !== null) {
			return Number(Number(dispensedConc.toPrecision(4)));
		}
		return null;
	}

	// 4. Build labels and wells
	const treatmentLabels: Array<{ id: string; name: string; color: string }> = [
		{ id: "t-dmso", name: "DMSO", color: "#7389d8" },
	];
	const treatmentMap = new Map<string, string>();
	treatmentMap.set("dmso", "t-dmso");
	let treatmentColorIdx = 0;

	interface DoseLabelEntry {
		id: string;
		name: string;
		color: string;
		value: number;
		unit: string;
		stdVal: number;
	}
	const doseMap = new Map<string, DoseLabelEntry>();
	const wells: Record<string, { treatment?: string[]; dose?: string }> = {};

	for (const [wellKey, items] of Object.entries(dispensesByWell)) {
		const isNormalization = (name: string) =>
			/normalization|vehicle/i.test(name);
		const activeItems = items.filter(
			(it) => it.fluid && !isNormalization(it.fluid),
		);

		if (activeItems.length === 0) {
			// Wells with only DMSO / vehicle normalization backfill
			wells[wellKey] = { treatment: ["t-dmso"] };
			continue;
		}

		const assignedTreatmentIds: string[] = [];
		for (const it of activeItems) {
			const fn = it.fluid.trim();
			const fnLow = fn.toLowerCase();
			let tId = treatmentMap.get(fnLow);
			if (!tId) {
				const slug = fnLow.replace(/[^a-z0-9]/g, "");
				tId = `t-${slug || Date.now()}`;
				const color =
					ACCESSIBLE_PALETTE[
						treatmentColorIdx % ACCESSIBLE_PALETTE.length
					];
				treatmentColorIdx++;
				treatmentLabels.push({ id: tId, name: fn, color });
				treatmentMap.set(fnLow, tId);
			}
			if (!assignedTreatmentIds.includes(tId)) {
				assignedTreatmentIds.push(tId);
			}
		}

		const wellObj: { treatment?: string[]; dose?: string } = {
			treatment: assignedTreatmentIds,
		};

		// Doses for active compounds
		const doseParts: string[] = [];
		for (const it of activeItems) {
			const stockInfo = stocks[it.fluid];
			const stockConc = stockInfo?.stockConc ?? null;
			const cleaned = cleanDoseValue(
				it.conc,
				it.vol,
				stockConc,
				additionalVolUl,
			);
			if (cleaned !== null) {
				const displayStr = formatDoseDisplay(
					cleaned.toString(),
					it.unit,
				);
				if (displayStr) doseParts.push(displayStr);
			}
		}

		if (doseParts.length > 0) {
			const doseStr = doseParts.join(" + ");
			let doseEntry = doseMap.get(doseStr);
			if (!doseEntry) {
				const { value: pVal, unit: pUnit } = parseDoseInput(doseParts[0]);
				const slug = doseStr
					.replace(/µ/g, "u")
					.replace(/μ/g, "u")
					.replace(/[^a-zA-Z0-9]/g, "");
				const dId = `d-${slug || Date.now()}`;
				doseEntry = {
					id: dId,
					name: doseStr,
					color: "#ffe3a8",
					value: pVal,
					unit: pUnit,
					stdVal: convertDoseToStandardValue(pVal, pUnit),
				};
				doseMap.set(doseStr, doseEntry);
			}
			wellObj.dose = doseEntry.id;
		}

		wells[wellKey] = wellObj;
	}

	// Sort doses descending by standard value
	const sortedDoses = Array.from(doseMap.values())
		.sort((a, b) => b.stdVal - a.stdVal)
		.map((d, idx) => ({
			id: d.id,
			name: d.name,
			color: ACCESSIBLE_PALETTE[idx % ACCESSIBLE_PALETTE.length],
			value: d.value,
			unit: d.unit,
		}));

	return {
		plateFormat,
		layers: INITIAL_LAYERS,
		labels: {
			treatment: treatmentLabels,
			dose: sortedDoses,
			duration: [
				{ id: "dur-1", name: "1d", color: "#bfdbfe" },
				{ id: "dur-2", name: "2d", color: "#e9d5ff" },
			],
			biomarker: [],
			status: [
				{ id: "s-live", name: "Live", color: "#4ade80" },
				{ id: "s-fixed", name: "Fixed", color: "#fda4af" },
			],
		},
		wells,
	};
}

export function parseLayoutFile(
	content: string,
	fileName = "",
): WellMapLayout {
	const trimmed = content.trim();

	// Check if file is JSON
	const isJsonFile =
		fileName.toLowerCase().endsWith(".json") ||
		trimmed.startsWith("{");

	if (isJsonFile) {
		try {
			const data = JSON.parse(trimmed);
			if (
				data.wells &&
				data.labels &&
				data.layers &&
				data.plateFormat
			) {
				return {
					plateFormat: data.plateFormat,
					layers: data.layers,
					labels: data.labels,
					wells: data.wells,
				};
			}
		} catch {
			// If not valid JSON, check if it's XML below
		}
	}

	// Check if file is XML / Tecan D300 format
	if (
		isTecanOrDispenserXml(trimmed) ||
		fileName.toLowerCase().endsWith(".xml")
	) {
		return parseTecanXml(trimmed);
	}

	throw new Error(
		"Invalid layout file format. Please upload a valid exported WellMap layout JSON file or a Tecan D300 / digital dispenser XML file.",
	);
}

/**
 * Generates an official Tecan D300e / HP D300 XML Spreadsheet 2003 protocol file.
 * Compatible with Tecan D300e software import.
 */
export function generateTecanXml(
	plateFormat: string,
	wells: Record<string, any>,
	labels: Record<string, any[]>,
	additionalVolumeUl = 100,
): string {
	const is384 = plateFormat === "384";
	const rowCount = is384 ? 16 : 8;
	const colCount = is384 ? 24 : 12;
	const plateType = is384 ? "384 well" : "96 well";

	const treatmentLabels = labels.treatment || [];
	const doseLabels = labels.dose || [];
	const usedFluidNames = new Set<string>();

	const sortedWellKeys = Object.keys(wells).sort((a, b) => {
		const rA = a.charCodeAt(0);
		const rB = b.charCodeAt(0);
		if (rA !== rB) return rA - rB;
		const cA = parseInt(a.slice(1), 10);
		const cB = parseInt(b.slice(1), 10);
		return cA - cB;
	});

	interface ExportDispense {
		wellKey: string;
		paddedWell: string;
		row: number;
		col: number;
		fluidName: string;
		conc: number;
		unit: string;
		volumeNl: number;
	}

	const dispenses: ExportDispense[] = [];

	sortedWellKeys.forEach((wellKey) => {
		const well = wells[wellKey];
		if (!well) return;
		let tIds = well.treatment;
		if (!tIds) return;
		if (!Array.isArray(tIds)) tIds = [tIds];
		if (tIds.length === 0) return;

		const rowChar = wellKey.charAt(0).toUpperCase();
		const rowNum = rowChar.charCodeAt(0) - 64;
		const colNum = parseInt(wellKey.slice(1), 10);
		const paddedWell = `${rowChar}${colNum < 10 ? "0" + colNum : colNum}`;

		tIds.forEach((tId: string) => {
			const tLabel = treatmentLabels.find((l: any) => l.id === tId);
			const fluidName = tLabel ? tLabel.name : tId;
			usedFluidNames.add(fluidName);

			let doseId: string | undefined = well.treatmentDoses?.[tId];
			if (!doseId && tIds.length === 1) {
				doseId = well.dose;
			}

			let conc = 0;
			let unit = "µM";

			if (doseId) {
				const dLabel = doseLabels.find((l: any) => l.id === doseId);
				if (dLabel) {
					unit = dLabel.unit || "µM";
					if (dLabel.value !== undefined && !isNaN(dLabel.value)) {
						conc = dLabel.value;
					} else {
						const parsed = parseFloat(dLabel.name);
						if (!isNaN(parsed)) conc = parsed;
					}
				}
			}

			// Nominal µM stock = 10,000 µM (10 mM)
			let stockInNormUnit = 10000;
			const uLower = unit.toLowerCase();
			if (uLower === "nm") stockInNormUnit = 10000000;
			else if (uLower === "mm") stockInNormUnit = 10;
			else if (uLower === "pm") stockInNormUnit = 10000000000;
			else if (uLower === "%") stockInNormUnit = 100;

			const volumeNl =
				conc > 0
					? Number(((conc / stockInNormUnit) * additionalVolumeUl * 1000).toFixed(3))
					: 0;

			dispenses.push({
				wellKey,
				paddedWell,
				row: rowNum,
				col: colNum,
				fluidName,
				conc,
				unit,
				volumeNl,
			});
		});
	});

	const fluidList = Array.from(usedFluidNames);

	const escapeXml = (str: string) =>
		String(str || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");

	let xml = `<?xml version="1.0" encoding="utf-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40" xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Bottom"/>
      <Borders/>
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="sCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Bottom"/>
    </Style>
    <Style ss:ID="sHeader">
      <Alignment ss:Horizontal="Center" ss:Vertical="Bottom" ss:WrapText="1"/>
      <Font ss:Color="#FFFFFF" ss:Bold="1"/>
      <Interior ss:Color="#000000" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="sHeaderLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Bottom"/>
      <Font ss:Color="#FFFFFF" ss:Bold="1"/>
      <Interior ss:Color="#000000" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Plates">
    <Table>
      <Row>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Plate</Data></Cell>
        <Cell ss:StyleID="sHeaderLeft"><Data ss:Type="String">Plate name</Data></Cell>
        <Cell ss:StyleID="sHeaderLeft"><Data ss:Type="String">Plate ID</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Type</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Rows</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Columns</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Additional volume (µL)</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">1</Data></Cell>
        <Cell><Data ss:Type="String">Plate 1</Data></Cell>
        <Cell><Data ss:Type="String"></Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="String">${escapeXml(plateType)}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${rowCount}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${colCount}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${additionalVolumeUl}</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Fluids">
    <Table>
      <Row>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Fluid</Data></Cell>
        <Cell ss:StyleID="sHeaderLeft"><Data ss:Type="String">Fluid name</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Stock concentration</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Stock concentration units</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Class</Data></Cell>
      </Row>`;

	fluidList.forEach((fluidName, idx) => {
		const isDmso = /dmso|vehicle/i.test(fluidName);
		xml += `
      <Row>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(fluidName)}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${isDmso ? 100 : 10}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="String">${isDmso ? "%" : "mM"}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="String">DMSO</Data></Cell>
      </Row>`;
	});

	xml += `
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Tabular detail">
    <Table>
      <Row>
        <Cell ss:StyleID="sHeaderLeft"><Data ss:Type="String">Plate ID</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Plate</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Dispensed well</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Dispensed row</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Dispensed col</Data></Cell>
        <Cell ss:StyleID="sHeaderLeft"><Data ss:Type="String">Fluid name</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Dispensed concentration</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Units</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Dispensed volume</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Units</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">Total well volume</Data></Cell>
      </Row>`;

	dispenses.forEach((d) => {
		const totalWellVolNl = additionalVolumeUl * 1000 + d.volumeNl;
		xml += `
      <Row>
        <Cell><Data ss:Type="String"></Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">1</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="String">${escapeXml(d.paddedWell)}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${d.row}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${d.col}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(d.fluidName)}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${d.conc}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="String">${escapeXml(d.unit)}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${d.volumeNl}</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="String">nL</Data></Cell>
        <Cell ss:StyleID="sCenter"><Data ss:Type="Number">${totalWellVolNl}</Data></Cell>
      </Row>`;
	});

	xml += `
    </Table>
  </Worksheet>
</Workbook>`;

	return xml;
}

/**
 * Generates a standard Tecan D300e CSV dispense protocol.
 */
export function generateTecanCsv(
	plateFormat: string,
	wells: Record<string, any>,
	labels: Record<string, any[]>,
	additionalVolumeUl = 100,
): string {
	const treatmentLabels = labels.treatment || [];
	const doseLabels = labels.dose || [];

	const sortedWellKeys = Object.keys(wells).sort((a, b) => {
		const rA = a.charCodeAt(0);
		const rB = b.charCodeAt(0);
		if (rA !== rB) return rA - rB;
		const cA = parseInt(a.slice(1), 10);
		const cB = parseInt(b.slice(1), 10);
		return cA - cB;
	});

	const rows: string[] = [
		"Plate,Well,Row,Column,Fluid name,Dispensed concentration,Concentration units,Dispensed volume,Volume units,Total well volume [µL]",
	];

	sortedWellKeys.forEach((wellKey) => {
		const well = wells[wellKey];
		if (!well) return;
		let tIds = well.treatment;
		if (!tIds) return;
		if (!Array.isArray(tIds)) tIds = [tIds];
		if (tIds.length === 0) return;

		const rowChar = wellKey.charAt(0).toUpperCase();
		const rowNum = rowChar.charCodeAt(0) - 64;
		const colNum = parseInt(wellKey.slice(1), 10);
		const paddedWell = `${rowChar}${colNum < 10 ? "0" + colNum : colNum}`;

		tIds.forEach((tId: string) => {
			const tLabel = treatmentLabels.find((l: any) => l.id === tId);
			const fluidName = tLabel ? tLabel.name : tId;

			let doseId: string | undefined = well.treatmentDoses?.[tId];
			if (!doseId && tIds.length === 1) {
				doseId = well.dose;
			}

			let conc = 0;
			let unit = "µM";

			if (doseId) {
				const dLabel = doseLabels.find((l: any) => l.id === doseId);
				if (dLabel) {
					unit = dLabel.unit || "µM";
					if (dLabel.value !== undefined && !isNaN(dLabel.value)) {
						conc = dLabel.value;
					} else {
						const parsed = parseFloat(dLabel.name);
						if (!isNaN(parsed)) conc = parsed;
					}
				}
			}

			let stockInNormUnit = 10000;
			const uLower = unit.toLowerCase();
			if (uLower === "nm") stockInNormUnit = 10000000;
			else if (uLower === "mm") stockInNormUnit = 10;
			else if (uLower === "pm") stockInNormUnit = 10000000000;
			else if (uLower === "%") stockInNormUnit = 100;

			const volumeNl =
				conc > 0
					? Number(((conc / stockInNormUnit) * additionalVolumeUl * 1000).toFixed(3))
					: 0;

			const cleanFluid = fluidName.includes(",") ? `"${fluidName}"` : fluidName;
			rows.push(
				`1,${paddedWell},${rowNum},${colNum},${cleanFluid},${conc},${unit},${volumeNl},nL,${additionalVolumeUl}`,
			);
		});
	});

	return rows.join("\n");
}
