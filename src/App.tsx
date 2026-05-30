import React, { useState, useMemo, useEffect, useRef } from "react";
import { toPng } from "html-to-image";
import {
	Plus,
	RotateCcw,
	FileText,
	Check,
	Layers,
	Info,
	Sparkles,
	Settings,
	X,
	HelpCircle,
	Undo,
	Trash2,
	Edit2,
	Download,
	CheckSquare,
	Square,
	ChevronDown,
	ChevronUp,
	FlaskConical,
} from "lucide-react";

/**
 * COLOR SELECTION CRITERIA:
 * These colors have been carefully curated to pass accessibility & contrast standards (WCAG AA/AAA)
 * when paired with dark gray (#111827 / slate-900) text overlays on top.
 * This ensures high categorical distinction for multiplexed screening without compromising legibility.
 */
const ACCESSIBLE_PALETTE = [
	// Row 0 (Col 0: Reds, Col 1: Oranges/Yellows, Col 2: Greens/Teals, Col 3: Blues/Cyans, Col 4: Purples/Pinks)
	"#f43f5e",
	"#f99c35",
	"#4ade80",
	"#3b82f6",
	"#c084fc",
	// Row 1
	"#fb7185",
	"#f59e0b",
	"#a3e635",
	"#60a5fa",
	"#e9d5ff",
	// Row 2
	"#f472b6",
	"#facc15",
	"#0d9488",
	"#06b6d4",
	"#7389d8",
	// Row 3
	"#fda4af",
	"#ffe3a8",
	"#4ca1a3",
	"#56b4d3",
	"#bfdbfe",
	// Row 4
	"#fecdd3",
	"#84cc16",
	"#99f6e4",
	"#bae6fd",
	"#fbcfe8",
];

const INITIAL_LAYERS = [
	{ id: "treatment", name: "Treatment" },
	{ id: "dose", name: "Dose" },
	{ id: "duration", name: "Duration" },
	{ id: "biomarker", name: "Biomarker" },
	{ id: "status", name: "Status" },
];

const INITIAL_LABELS = {
	treatment: [{ id: "t-dmso", name: "DMSO", color: "#7389d8" }],
	dose: [
		{
			id: "d-10uM",
			name: "10 µM",
			color: "#ffe3a8",
			value: 10,
			unit: "µM",
		},
		{ id: "d-1uM", name: "1 µM", color: "#ffe3a8", value: 1, unit: "µM" },
		{
			id: "d-100nM",
			name: "100 nM",
			color: "#ffe3a8",
			value: 100,
			unit: "nM",
		},
	],
	duration: [
		{ id: "dur-1", name: "1d", color: "#bfdbfe" },
		{ id: "dur-2", name: "2d", color: "#e9d5ff" },
	],
	biomarker: [],
	status: [
		{ id: "s-live", name: "Live", color: "#4ade80" },
		{ id: "s-fixed", name: "Fixed", color: "#fda4af" },
	],
};

const getAbbreviation = (name) => {
	if (!name) return "";
	const s = name.trim();
	if (s.length <= 4) return s;

	// Pattern matching for hour-based durations (e.g., "24 hours" -> "24h")
	const hourMatch = s.match(/^(\d+)\s*(hours|hour|hrs|hr)$/i);
	if (hourMatch) return `${hourMatch[1]}h`;
	const dayMatch = s.match(/^(\d+)\s*(days|day|dys|dy)$/i);
	if (dayMatch) return `${dayMatch[1]}d`;

	// General cleanups to keep abbreviation text compact
	let cleaned = s
		.replace(/reporter/i, "")
		.replace(/assay/i, "")
		.replace(/compound/i, "Cp")
		.replace(/control/i, "Ctrl")
		.trim();

	if (cleaned.length <= 4) return cleaned;

	const words = cleaned.split(/[\s_-]+/);
	if (words.length > 1) {
		const initials = words.map((w) => w[0].toUpperCase()).join("");
		if (initials.length >= 2) return initials.slice(0, 4);
	}

	return cleaned.slice(0, 4);
};

const parseDoseInput = (input) => {
	const cleanInput = (input || "").trim();
	// Regex to capture the number and the unit (supporting dec, float, sci notation, and unicode symbols)
	const match = cleanInput.match(/^([\d.]+)\s*([a-zA-Zμµ%/]+)?$/);
	if (!match) {
		const val = parseFloat(cleanInput);
		return { value: isNaN(val) ? 0 : val, unit: "µM" };
	}
	const valStr = match[1];
	let unitStr = match[2] || "µM";

	// Normalize units
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

const formatDoseDisplay = (valStr, unit, precision = 4) => {
	let val = parseFloat(valStr);
	if (isNaN(val)) return valStr || "";

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
			(currentUnit === "µM" || currentUnit === "uM")
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

function hexToRgba(hex, alpha) {
	if (!hex) return "transparent";
	const r = parseInt(hex.slice(1, 3), 16) || 0;
	const g = parseInt(hex.slice(3, 5), 16) || 0;
	const b = parseInt(hex.slice(5, 7), 16) || 0;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const buildDefaultWells = () => {
	const defaultWells = {};
	return defaultWells;
};

export default function App() {
	const [plateFormat, setPlateFormat] = useState("96"); // Initialized to 96-well as default
	const [layers, setLayers] = useState(INITIAL_LAYERS);
	const [activeLayerId, setActiveLayerId] = useState("treatment");
	const [isCombinationMode, setIsCombinationMode] = useState(false);

	// Visibility toggle states for well-map overlays
	const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>(
		{
			dose: true,
			duration: false,
			biomarker: false,
			status: false,
		},
	);

	// Track layers manually toggled by the user in the preview section (dose starts visible by default)
	const [manuallyToggledLayers, setManuallyToggledLayers] = useState<
		Set<string>
	>(new Set<string>(["dose"]));

	const toggleLayerVisibility = (layerId: string) => {
		setVisibleLayers((prev) => {
			const nextVisible = !prev[layerId];
			setManuallyToggledLayers((prevManual) => {
				const nextManual = new Set<string>(prevManual);
				if (nextVisible) {
					nextManual.add(layerId);
				} else {
					nextManual.delete(layerId);
				}
				return nextManual;
			});
			return {
				...prev,
				[layerId]: nextVisible,
			};
		});
	};

	const [labels, setLabels] = useState(INITIAL_LABELS);
	const [wells, setWells] =
		useState<Record<string, any>>(buildDefaultWells());

	const [selectedWells, setSelectedWells] = useState<Set<string>>(
		new Set<string>(),
	);
	const [hoveredWell, setHoveredWell] = useState<string | null>(null);
	const [lastClickedWell, setLastClickedWell] = useState<{
		r: number;
		c: number;
	} | null>(null);

	// Auto toggle layer preview on when editing that layer, and off when switching away unless manually toggled
	const prevActiveLayerIdRef = useRef(activeLayerId);
	useEffect(() => {
		const prevActiveLayerId = prevActiveLayerIdRef.current;
		setVisibleLayers((prev) => {
			const next = { ...prev };
			if (activeLayerId && activeLayerId !== "treatment") {
				next[activeLayerId] = true;
			}
			if (
				prevActiveLayerId &&
				prevActiveLayerId !== activeLayerId &&
				prevActiveLayerId !== "treatment" &&
				!manuallyToggledLayers.has(prevActiveLayerId)
			) {
				next[prevActiveLayerId] = false;
			}
			return next;
		});
		prevActiveLayerIdRef.current = activeLayerId;
	}, [activeLayerId, manuallyToggledLayers]);

	// Cancel well selection when clicking any other unclickable area
	useEffect(() => {
		const handleDocumentPointerDown = (e: PointerEvent) => {
			const target = e.target as HTMLElement;
			if (!target) return;

			// Ignore if click is on/in a well (cursor-crosshair)
			if (target.closest('[class*="cursor-crosshair"]')) return;
			// Ignore standard interactive components, inputs, and sidebar/preview buttons
			if (
				target.closest("button") ||
				target.closest("input") ||
				target.closest("select") ||
				target.closest("textarea") ||
				target.closest("aside") ||
				target.closest("label") ||
				target.closest(".interactive")
			) {
				return;
			}

			setSelectedWells(new Set<string>());
		};

		document.addEventListener("pointerdown", handleDocumentPointerDown);
		return () => {
			document.removeEventListener(
				"pointerdown",
				handleDocumentPointerDown,
			);
		};
	}, []);

	// States for checked treatments during combination assignments
	const [selectedCombinationLabels, setSelectedCombinationLabels] = useState<
		Set<string>
	>(new Set<string>(["t-1"]));

	// Export Dashboard Preview modal state & handlers
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const snapshotRef = useRef<HTMLDivElement>(null);

	// Custom Dropdown States & Refs
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);
	const unitDropdownRef = useRef<HTMLDivElement>(null);

	const [isDilutionDirDropdownOpen, setIsDilutionDirDropdownOpen] =
		useState(false);
	const dilutionDirDropdownRef = useRef<HTMLDivElement>(null);

	const [isReplicateDirDropdownOpen, setIsReplicateDirDropdownOpen] =
		useState(false);
	const replicateDirDropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsDropdownOpen(false);
			}
			if (
				unitDropdownRef.current &&
				!unitDropdownRef.current.contains(event.target as Node)
			) {
				setIsUnitDropdownOpen(false);
			}
			if (
				dilutionDirDropdownRef.current &&
				!dilutionDirDropdownRef.current.contains(event.target as Node)
			) {
				setIsDilutionDirDropdownOpen(false);
			}
			if (
				replicateDirDropdownRef.current &&
				!replicateDirDropdownRef.current.contains(event.target as Node)
			) {
				setIsReplicateDirDropdownOpen(false);
			}
			if (
				doseSuggestionsRef.current &&
				!doseSuggestionsRef.current.contains(event.target as Node)
			) {
				setIsDoseSuggestionsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const getUniqueActiveCombinations = () => {
		const combos: Record<
			string,
			{
				treatmentIds: string[];
				doseId?: string;
				durationId?: string;
				biomarkerId?: string;
				statusId?: string;
				customLayers: Record<string, string>;
				wells: string[];
			}
		> = {};

		Object.entries(wells).forEach(([wellKey, wellData]) => {
			if (!isWellInActiveFormat(wellKey)) return;

			let treatmentIds = wellData.treatment || [];
			if (!Array.isArray(treatmentIds)) {
				treatmentIds = treatmentIds ? [treatmentIds] : [];
			}
			const hasTreatment = treatmentIds.length > 0;
			const hasDose = !!wellData.dose;
			const hasDuration = !!wellData.duration;
			const hasBiomarker = !!wellData.biomarker;
			const hasStatus = !!wellData.status;

			const customVals: Record<string, string> = {};
			let hasCustom = false;
			layers.slice(5).forEach((layer) => {
				if (wellData[layer.id]) {
					customVals[layer.id] = wellData[layer.id];
					hasCustom = true;
				}
			});

			if (
				!hasTreatment &&
				!hasDose &&
				!hasDuration &&
				!hasBiomarker &&
				!hasStatus &&
				!hasCustom
			) {
				return; // Empty well, skip
			}

			const comboKey = JSON.stringify({
				t: treatmentIds.slice().sort(),
				d: wellData.dose || "",
				dur: wellData.duration || "",
				b: wellData.biomarker || "",
				s: wellData.status || "",
				c: customVals,
			});

			if (!combos[comboKey]) {
				combos[comboKey] = {
					treatmentIds,
					doseId: wellData.dose,
					durationId: wellData.duration,
					biomarkerId: wellData.biomarker,
					statusId: wellData.status,
					customLayers: customVals,
					wells: [],
				};
			}
			combos[comboKey].wells.push(wellKey);
		});

		return Object.values(combos);
	};

	const downloadSnapshot = async () => {
		if (!snapshotRef.current) return;
		try {
			const dataUrl = await toPng(snapshotRef.current, {
				pixelRatio: 2, // Retina 2x high-resolution snapshot!
				backgroundColor: "#ffffff",
				style: {
					transform: "scale(1)",
					transformOrigin: "top left",
				},
			});
			const link = document.createElement("a");
			link.href = dataUrl;
			link.download = `microplate_${plateFormat}_well_snapshot_${new Date().toISOString().split("T")[0]}.png`;
			link.click();
		} catch (err) {
			console.error("html-to-image capture failure:", err);
			alert(
				`Failed to generate snapshot image: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const renderSnapshotPlateGrid = () => {
		const cols =
			plateFormat === "96"
				? Array.from({ length: 12 }, (_, i) => i + 1)
				: Array.from({ length: 24 }, (_, i) => i + 1);
		const rows =
			plateFormat === "96"
				? ["A", "B", "C", "D", "E", "F", "G", "H"]
				: [
						"A",
						"B",
						"C",
						"D",
						"E",
						"F",
						"G",
						"H",
						"I",
						"J",
						"K",
						"L",
						"M",
						"N",
						"O",
						"P",
					];

		return (
			<div
				className="border-2 border-dashed rounded-3xl p-6 w-full flex flex-col justify-center"
				style={{
					backgroundColor: "#f8fafc",
					borderColor: "#cbd5e1",
				}}
			>
				<div
					className="grid items-center gap-y-1 gap-x-1 w-full"
					style={{
						gridTemplateColumns: `35px repeat(${cols.length}, minmax(0, 1fr))`,
					}}
				>
					<div></div>
					{cols.map((c) => (
						<div
							key={`snapshot-col-${c}`}
							className="text-center text-[9px] font-sans font-bold"
							style={{ color: "#64748b" }}
						>
							{c}
						</div>
					))}

					{rows.map((rowLabel, rIdx) => (
						<React.Fragment key={`snapshot-row-${rowLabel}`}>
							<div
								className="text-center text-[9px] font-sans font-bold h-full flex items-center justify-center"
								style={{ color: "#64748b" }}
							>
								{rowLabel}
							</div>
							{cols.map((colNum, cIdx) => {
								const wellKey = `${rowLabel}${colNum}`;
								const assignedWellMetadata =
									wells[wellKey] || {};
								let treatmentIds =
									assignedWellMetadata.treatment;
								if (
									treatmentIds &&
									!Array.isArray(treatmentIds)
								) {
									treatmentIds = [treatmentIds];
								}
								const doseId = assignedWellMetadata.dose;
								const doseIntensity = getDoseIntensity(doseId);

								// Generate text overlays for active preview layers
								const overlays: {
									layerId: string;
									text: string;
								}[] = [];
								layers.slice(1).forEach((layer) => {
									if (visibleLayers[layer.id]) {
										const assignedLabelId =
											assignedWellMetadata[layer.id];
										const matchedLabel = assignedLabelId
											? (labels[layer.id] || []).find(
													(l: any) =>
														l.id ===
														assignedLabelId,
												)
											: null;
										if (matchedLabel) {
											let displayText = matchedLabel.name;
											if (
												layer.id === "dose" &&
												matchedLabel.value !== undefined
											) {
												displayText = formatDoseDisplay(
													matchedLabel.value,
													matchedLabel.unit || "µM",
													1,
												);
											} else {
												displayText =
													getAbbreviation(
														displayText,
													);
											}
											overlays.push({
												layerId: layer.id,
												text: displayText,
											});
										}
									}
								});

								return (
									<div
										key={`snapshot-well-${wellKey}`}
										className="relative aspect-square flex items-center justify-center"
									>
										<div
											className="rounded-full border w-[92%] h-[92%] flex items-center justify-center overflow-hidden relative"
											style={{
												...getWellBackgroundStyle(
													treatmentIds,
													doseIntensity,
												),
												borderColor: "#cbd5e1",
											}}
										>
											{overlays.length > 0 && (
												<div
													className="flex flex-col items-center justify-center gap-0.5 pointer-events-none select-none w-full bg-transparent"
													style={{ color: "#111827" }}
												>
													{overlays
														.slice(0, 3)
														.map((ov, idx) => (
															<span
																key={idx}
																className="font-normal leading-[1.1] tracking-normal text-center whitespace-normal break-words max-w-[90%] bg-transparent select-none"
																style={{
																	color: "#111827",
																	fontSize:
																		plateFormat ===
																		"96"
																			? "12px"
																			: "9px",
																}}
															>
																{ov.text}
															</span>
														))}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</React.Fragment>
					))}
				</div>
			</div>
		);
	};

	const renderSnapshotTable = () => {
		const activeCombos = getUniqueActiveCombinations();
		const activeLayers = layers.filter((layer) => {
			if (layer.id === "treatment") return true;
			return activeCombos.some((c) => {
				if (layer.id === "dose") return !!c.doseId;
				if (layer.id === "duration") return !!c.durationId;
				if (layer.id === "biomarker") return !!c.biomarkerId;
				if (layer.id === "status") return !!c.statusId;
				return !!c.customLayers[layer.id];
			});
		});

		return (
			<div
				className="w-full"
				style={{
					border: "1px solid #cbd5e1",
					borderRadius: "16px",
					backgroundColor: "#ffffff",
					boxShadow: "0 4px 10px rgba(0,0,0,0.03)",
					overflow: "hidden",
				}}
			>
				<div
					className="w-full overflow-x-auto max-h-[360px] overflow-y-auto"
					style={{ scrollbarWidth: "thin" }}
				>
					<table
						className="w-full border-collapse text-left"
						style={{
							fontFamily: "Roboto Condensed, Arial, sans-serif",
						}}
					>
						<thead>
							<tr
								style={{
									borderBottom: "2px solid #23448E",
									backgroundColor: "#f8fafc",
									color: "#2F2F2F",
									fontSize: "14px",
									textTransform: "uppercase",
									letterSpacing: "0.03em",
									fontWeight: "bold",
								}}
							>
								{activeLayers.map((layer) => {
									const isNumeric =
										layer.id === "dose" ||
										layer.id === "duration";
									return (
										<th
											key={`th-${layer.id}`}
											className="px-3 py-2 font-bold"
											style={{
												textAlign: isNumeric
													? "right"
													: "left",
											}}
										>
											{layer.name}
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody style={{ color: "#4C4C4C", fontSize: "16px" }}>
							{activeCombos.length === 0 ? (
								<tr>
									<td
										colSpan={activeLayers.length}
										className="px-3 py-6 text-center italic"
										style={{ color: "#6D6E70" }}
									>
										No metadata assigned to any wells.
									</td>
								</tr>
							) : (
								activeCombos.map((combo, idx) => (
									<tr
										key={`combo-row-${idx}`}
										style={{
											borderBottom:
												"1px solid rgba(109, 110, 112, 0.15)",
											backgroundColor:
												idx % 2 === 1
													? "#F8F6F4"
													: "#FFFFFF",
										}}
									>
										{activeLayers.map((layer) => {
											const isNumeric =
												layer.id === "dose" ||
												layer.id === "duration";
											if (layer.id === "treatment") {
												const matchedTreatments = (
													combo.treatmentIds || []
												)
													.map((id) =>
														(
															labels.treatment ||
															[]
														).find(
															(l) => l.id === id,
														),
													)
													.filter(Boolean);
												return (
													<td
														key={`cell-${layer.id}`}
														className="px-3 py-2 font-bold"
														style={{
															textAlign: "left",
															color: "#2F2F2F",
														}}
													>
														{matchedTreatments.length ===
														0 ? (
															<span
																className="italic"
																style={{
																	color: "#6D6E70",
																	fontWeight:
																		"normal",
																}}
															>
																Untreated
															</span>
														) : (
															<div className="flex flex-col gap-1">
																{matchedTreatments.map(
																	(
																		t,
																		tIdx,
																	) => (
																		<div
																			key={
																				tIdx
																			}
																			className="flex items-center gap-1.5"
																		>
																			<div
																				className="w-3.5 h-3.5 rounded-full shrink-0"
																				style={{
																					backgroundColor:
																						t.color,
																					border: "1px solid #cbd5e1",
																				}}
																			/>
																			<span className="truncate max-w-[120px]">
																				{
																					t.name
																				}
																			</span>
																		</div>
																	),
																)}
															</div>
														)}
													</td>
												);
											}

											let cellVal = "—";
											if (
												layer.id === "dose" &&
												combo.doseId
											) {
												const match = (
													labels.dose || []
												).find(
													(l) =>
														l.id === combo.doseId,
												);
												if (match) {
													cellVal =
														match.value !==
														undefined
															? `${match.value} ${match.unit || "µM"}`
															: match.name;
												}
											} else if (
												layer.id === "duration" &&
												combo.durationId
											) {
												const match = (
													labels.duration || []
												).find(
													(l) =>
														l.id ===
														combo.durationId,
												);
												if (match) cellVal = match.name;
											} else if (
												layer.id === "biomarker" &&
												combo.biomarkerId
											) {
												const match = (
													labels.biomarker || []
												).find(
													(l) =>
														l.id ===
														combo.biomarkerId,
												);
												if (match) cellVal = match.name;
											} else if (
												layer.id === "status" &&
												combo.statusId
											) {
												const match = (
													labels.status || []
												).find(
													(l) =>
														l.id === combo.statusId,
												);
												if (match) cellVal = match.name;
											} else {
												const customVal =
													combo.customLayers[
														layer.id
													];
												if (customVal) {
													const match = (
														labels[layer.id] || []
													).find(
														(l) =>
															l.id === customVal,
													);
													if (match)
														cellVal = match.name;
												}
											}

											return (
												<td
													key={`cell-${layer.id}`}
													className="px-3 py-2 font-medium"
													style={{
														textAlign: isNumeric
															? "right"
															: "left",
														color: isNumeric
															? "#2F2F2F"
															: "#4C4C4C",
														fontFamily: isNumeric
															? "'Roboto Condensed', sans-serif"
															: "'Roboto Condensed', sans-serif",
														fontSize: isNumeric
															? "16px"
															: "16px",
													}}
												>
													{cellVal}
												</td>
											);
										})}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		);
	};

	// Inline edit states for labels
	const [editingLabelId, setEditingLabelId] = useState(null);
	const [editingName, setEditingName] = useState("");
	const [editingColor, setEditingColor] = useState("");
	const [editingValue, setEditingValue] = useState("");
	const [editingUnit, setEditingUnit] = useState("µM");
	const [editingDoseInput, setEditingDoseInput] = useState("");

	// New label creation states
	const [isAddingLabel, setIsAddingLabel] = useState(false);
	const [newLabelName, setNewLabelName] = useState("");
	const [newLabelColor, setNewLabelColor] = useState("#7389d8");
	const [newLabelValue, setNewLabelValue] = useState("");
	const [newLabelUnit, setNewLabelUnit] = useState("µM");

	const [titrationDoseInput, setTitrationDoseInput] = useState("");
	const [isDoseSuggestionsOpen, setIsDoseSuggestionsOpen] = useState(false);
	const doseSuggestionsRef = useRef<HTMLDivElement>(null);
	const doseSuggestions = ["10uM", "1uM", "100nM", "10nM", "1nM", "100ng/ml"];
	const [isSetDilution, setIsSetDilution] = useState(false);
	const [dilutionFactor, setDilutionFactor] = useState("3");
	const [dilutionDirection, setDilutionDirection] = useState("Down");
	const [replicatesCount, setReplicatesCount] = useState("1");
	const [replicateDirection, setReplicateDirection] = useState("Right");

	const [isAddingLayer, setIsAddingLayer] = useState(false);
	const [newLayerName, setNewLayerName] = useState("");

	const [history, setHistory] = useState([]);

	// Drag selection tracking states
	const [isDrawing, setIsDrawing] = useState(false);
	const [dragStart, setDragStart] = useState(null);
	const [dragCurrent, setDragCurrent] = useState(null);
	const [dragInitialSelection, setDragInitialSelection] = useState<
		Set<string>
	>(new Set<string>());
	const [dragIsShift, setDragIsShift] = useState(false);

	const plateRef = useRef(null);

	// Dynamic rows and columns for 96 vs 384 plate formats
	const rows = useMemo(() => {
		return plateFormat === "96"
			? ["A", "B", "C", "D", "E", "F", "G", "H"]
			: [
					"A",
					"B",
					"C",
					"D",
					"E",
					"F",
					"G",
					"H",
					"I",
					"J",
					"K",
					"L",
					"M",
					"N",
					"O",
					"P",
				];
	}, [plateFormat]);

	const cols = useMemo(() => {
		return Array.from(
			{ length: plateFormat === "96" ? 12 : 24 },
			(_, i) => i + 1,
		);
	}, [plateFormat]);

	const totalWellsCount = useMemo(() => {
		return plateFormat === "96" ? 96 : 384;
	}, [plateFormat]);

	// Helper to determine if a specific well coordinates exist in the active format boundary
	const isWellInActiveFormat = (wellKey) => {
		if (!wellKey) return false;
		const charCode = wellKey.charCodeAt(0);
		const colNum = parseInt(wellKey.slice(1), 10);

		const rowLimit = plateFormat === "96" ? 72 : 80; // 'H' is 72, 'P' is 80
		const colLimit = plateFormat === "96" ? 12 : 24;

		return charCode <= rowLimit && colNum <= colLimit;
	};

	const saveToHistory = (currentWells) => {
		setHistory((prev) => [
			...prev.slice(-19),
			JSON.parse(JSON.stringify(currentWells)),
		]);
	};

	const handleUndo = () => {
		if (history.length === 0) return;
		const previous = history[history.length - 1];
		setWells(previous);
		setHistory((prev) => prev.slice(0, -1));
	};

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === "Escape") {
				setSelectedWells(new Set());
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		if (selectedWells.size === 0) return;

		const selectedRows = new Set();
		const selectedCols = new Set();

		selectedWells.forEach((wellKey) => {
			if (!isWellInActiveFormat(wellKey)) return;
			const r = wellKey.charAt(0);
			const c = parseInt(wellKey.slice(1), 10);
			selectedRows.add(r);
			selectedCols.add(c);
		});

		if (selectedRows.size === 0) return;

		if (replicateDirection === "Right") {
			setReplicatesCount(selectedCols.size.toString());
		} else {
			setReplicatesCount(selectedRows.size.toString());
		}
	}, [selectedWells, replicateDirection]);

	const getWellCoords = (wellKey) => {
		const r = wellKey.charCodeAt(0) - 65;
		const c = parseInt(wellKey.slice(1), 10) - 1;
		return { r, c };
	};

	const getWellKey = (r, c) => {
		return `${String.fromCharCode(65 + r)}${c + 1}`;
	};

	const getWellsInBoundingBox = (start, end) => {
		if (!start || !end) return [];
		const rMin = Math.min(start.r, end.r);
		const rMax = Math.max(start.r, end.r);
		const cMin = Math.min(start.c, end.c);
		const cMax = Math.max(start.c, end.c);

		const keys = [];
		for (let r = rMin; r <= rMax; r++) {
			for (let c = cMin; c <= cMax; c++) {
				keys.push(getWellKey(r, c));
			}
		}
		return keys;
	};

	const handleWellPointerDown = (
		e: React.PointerEvent,
		r: number,
		c: number,
	) => {
		e.preventDefault();
		setIsDrawing(true);
		const startCoord = { r, c };
		setDragStart(startCoord);
		setDragCurrent(startCoord);

		const isShift = e.shiftKey;
		const isCmd = e.metaKey || e.ctrlKey;
		setDragIsShift(isShift);

		const wellKey = getWellKey(r, c);

		// Save current selection for reversible reference matching and drag continuation
		let initial = new Set<string>();
		if (isShift && lastClickedWell) {
			const range = getWellsInBoundingBox(lastClickedWell, { r, c });
			initial = new Set<string>(selectedWells);
			range.forEach((key) => initial.add(key));
		} else if (isCmd) {
			initial = new Set<string>(selectedWells);
			if (initial.has(wellKey)) initial.delete(wellKey);
			else initial.add(wellKey);
		} else {
			initial = new Set<string>([wellKey]);
		}
		setDragInitialSelection(initial);

		if (isShift && lastClickedWell) {
			const range = getWellsInBoundingBox(lastClickedWell, { r, c });
			setSelectedWells((prev) => {
				const next = new Set<string>(prev);
				range.forEach((key) => next.add(key));
				return next;
			});
		} else if (isCmd) {
			setSelectedWells((prev) => {
				const next = new Set<string>(prev);
				if (next.has(wellKey)) next.delete(wellKey);
				else next.add(wellKey);
				return next;
			});
			setLastClickedWell({ r, c });
		} else {
			setSelectedWells(new Set<string>([wellKey]));
			setLastClickedWell({ r, c });
		}
	};

	const handleWellPointerEnter = (r, c) => {
		const wellKey = getWellKey(r, c);
		setHoveredWell(wellKey);
		if (!isDrawing) return;

		const currentCoord = { r, c };
		setDragCurrent(currentCoord);

		// Reversible drag selection mechanism:
		// Dynamically recalculate bounding box selection based on active pointer coordinates
		const boundingWells = getWellsInBoundingBox(dragStart, currentCoord);
		setSelectedWells(() => {
			// Revert to initial state first, then only apply active drag bounds (achieves pure reversibility)
			const next = new Set(dragInitialSelection);
			boundingWells.forEach((key) => next.add(key));
			return next;
		});
	};

	const handlePointerUpGlobal = () => {
		setIsDrawing(false);
		setDragStart(null);
		setDragCurrent(null);
	};

	useEffect(() => {
		window.addEventListener("pointerup", handlePointerUpGlobal);
		return () =>
			window.removeEventListener("pointerup", handlePointerUpGlobal);
	}, [isDrawing, dragStart, dragCurrent, dragInitialSelection]);

	const applyLabelToSelection = (labelId: string) => {
		if (selectedWells.size === 0) return;
		saveToHistory(wells);

		// Check if ALL selected wells (restricted to active format) currently have exactly this label/treatment
		const activeSelectedWells = Array.from(selectedWells).filter(
			(wellKey) => isWellInActiveFormat(wellKey),
		);
		const shouldClear =
			activeSelectedWells.length > 0 &&
			activeSelectedWells.every((wellKey) => {
				const well = wells[wellKey];
				if (activeLayerId === "treatment") {
					const treat = well?.treatment;
					if (Array.isArray(treat)) {
						return treat.length === 1 && treat[0] === labelId;
					}
					return treat === labelId;
				} else {
					return well?.[activeLayerId] === labelId;
				}
			});

		setWells((prev) => {
			const next = { ...prev };
			selectedWells.forEach((wellKey) => {
				if (!isWellInActiveFormat(wellKey)) return; // Guard for format changes
				if (!next[wellKey]) next[wellKey] = {};

				if (activeLayerId === "treatment") {
					if (shouldClear) {
						next[wellKey] = {
							...next[wellKey],
							treatment: [],
						};
					} else {
						let currentTreatments = next[wellKey].treatment;
						if (!Array.isArray(currentTreatments)) {
							currentTreatments = currentTreatments
								? [currentTreatments]
								: [];
						}

						if (isCombinationMode) {
							if (currentTreatments.includes(labelId)) {
								currentTreatments = currentTreatments.filter(
									(t) => t !== labelId,
								);
							} else {
								currentTreatments = [
									...currentTreatments,
									labelId,
								];
							}
						} else {
							currentTreatments = [labelId];
						}

						next[wellKey] = {
							...next[wellKey],
							treatment: currentTreatments,
						};
					}
				} else {
					if (shouldClear) {
						const updatedWell = { ...next[wellKey] };
						delete updatedWell[activeLayerId];
						next[wellKey] = updatedWell;
					} else {
						next[wellKey] = {
							...next[wellKey],
							[activeLayerId]: labelId,
						};
					}
				}
			});
			return next;
		});
	};

	const applySelectedCombination = () => {
		if (selectedWells.size === 0 || selectedCombinationLabels.size === 0)
			return;
		saveToHistory(wells);
		setWells((prev) => {
			const next = { ...prev };
			const comboArray = Array.from(selectedCombinationLabels);
			selectedWells.forEach((wellKey) => {
				if (!isWellInActiveFormat(wellKey)) return;
				if (!next[wellKey]) next[wellKey] = {};
				next[wellKey] = {
					...next[wellKey],
					treatment: comboArray,
				};
			});
			return next;
		});
	};

	const handleClearSelectedWells = () => {
		if (selectedWells.size === 0) return;
		saveToHistory(wells);
		setWells((prev) => {
			const next = { ...prev };
			selectedWells.forEach((wellKey) => {
				if (next[wellKey]) {
					const updatedWell = { ...next[wellKey] };
					if (activeLayerId === "treatment") {
						delete updatedWell.treatment;
						delete updatedWell.dose;
						delete updatedWell.duration;
						delete updatedWell.biomarker;
					} else {
						// Clear the current active layer
						delete updatedWell[activeLayerId];
						// Also clear any other layer that is checked/selected in the top-left toggle panel
						Object.keys(visibleLayers).forEach((layerId) => {
							if (
								visibleLayers[layerId] &&
								layerId !== "treatment"
							) {
								delete updatedWell[layerId];
							}
						});
					}
					next[wellKey] = updatedWell;
				}
			});
			return next;
		});
	};

	const handleClearAllWells = () => {
		saveToHistory(wells);

		// Wipe only active format well keys to allow seamless dual storage
		setWells((prev) => {
			const next = { ...prev };
			Object.keys(next).forEach((k) => {
				if (isWellInActiveFormat(k)) {
					delete next[k];
				}
			});
			return next;
		});
		setSelectedWells(new Set());
	};

	const handleAddNewLabelSubmit = (e) => {
		e.preventDefault();
		if (!newLabelName.trim()) return;

		const newId = `label-${Date.now()}`;
		const newLabel = {
			id: newId,
			name: newLabelName.trim(),
			color: newLabelColor,
			value: newLabelValue ? parseFloat(newLabelValue) : undefined,
			unit: newLabelValue ? newLabelUnit : undefined,
		};

		setLabels((prev) => ({
			...prev,
			[activeLayerId]: [...(prev[activeLayerId] || []), newLabel],
		}));

		setNewLabelName("");
		setNewLabelValue("");
		setIsAddingLabel(false);
	};

	const handleAddNewLayerSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newLayerName.trim()) return;

		const newId = `layer-${Date.now()}`;
		const newLayer = { id: newId, name: newLayerName.trim() };

		setLayers((prev) => [...prev, newLayer]);
		setLabels((prev) => ({ ...prev, [newId]: [] }));
		setVisibleLayers((prev) => ({ ...prev, [newId]: true }));
		setActiveLayerId(newId);
		setNewLayerName("");
		setIsAddingLayer(false);
	};

	const handleDeleteMetadataLayer = (layerId: string) => {
		// Delete from layers list
		setLayers((prev) => prev.filter((l) => l.id !== layerId));
		// Reset active layer to treatment
		setActiveLayerId("treatment");
		// Clean up wells: delete this layer's properties from all wells
		setWells((prev) => {
			const next = { ...prev };
			Object.keys(next).forEach((key) => {
				if (next[key]) {
					const updatedWell = { ...next[key] };
					delete updatedWell[layerId];
					next[key] = updatedWell;
				}
			});
			return next;
		});
	};

	const startEditingLabel = (label) => {
		setEditingLabelId(label.id);
		setEditingName(label.name);
		setEditingColor(label.color);
		setEditingValue(label.value || "");
		setEditingUnit(label.unit || "µM");
		const initialDose =
			label.value !== undefined
				? `${label.value}${label.unit || "µM"}`
				: "";
		setEditingDoseInput(initialDose);
	};

	const handleSaveLabelEdit = (labelId) => {
		if (!editingName.trim()) return;
		setLabels((prev) => ({
			...prev,
			[activeLayerId]: prev[activeLayerId].map((l) => {
				if (l.id === labelId) {
					if (activeLayerId === "dose") {
						const { value: parsedVal, unit: parsedUnit } =
							parseDoseInput(editingDoseInput);
						return {
							...l,
							name: formatDoseDisplay(
								parsedVal.toString(),
								parsedUnit,
							),
							color: editingColor,
							value: parsedVal,
							unit: parsedUnit,
						};
					} else {
						return {
							...l,
							name: editingName.trim(),
							color: editingColor,
							value: editingValue
								? parseFloat(editingValue)
								: undefined,
							unit: editingValue ? editingUnit : undefined,
						};
					}
				}
				return l;
			}),
		}));
		setEditingLabelId(null);
	};

	const handleDeleteLabel = (labelId) => {
		setLabels((prev) => ({
			...prev,
			[activeLayerId]: prev[activeLayerId].filter(
				(l) => l.id !== labelId,
			),
		}));
		setWells((prev) => {
			const next = { ...prev };
			Object.keys(next).forEach((key) => {
				if (next[key]) {
					if (activeLayerId === "treatment") {
						if (Array.isArray(next[key].treatment)) {
							next[key].treatment = next[key].treatment.filter(
								(t) => t !== labelId,
							);
						}
					} else if (next[key][activeLayerId] === labelId) {
						const updated = { ...next[key] };
						delete updated[activeLayerId];
						next[key] = updated;
					}
				}
			});
			return next;
		});
	};

	const selectRow = (rowLabel) => {
		setSelectedWells((prev) => {
			const next = new Set(prev);
			const targets = [];
			if (plateFormat === "96") {
				for (let c = 2; c <= 11; c++) {
					targets.push(`${rowLabel}${c}`);
				}
			} else {
				cols.forEach((c) => targets.push(`${rowLabel}${c}`));
			}

			const anySelected = targets.some((well) => prev.has(well));
			if (anySelected) {
				targets.forEach((well) => next.delete(well));
			} else {
				targets.forEach((well) => next.add(well));
			}
			return next;
		});
	};

	const selectCol = (colNum) => {
		setSelectedWells((prev) => {
			const next = new Set(prev);
			const targets = [];
			if (plateFormat === "96") {
				const targetRows = ["B", "C", "D", "E", "F", "G"];
				targetRows.forEach((r) => targets.push(`${r}${colNum}`));
			} else {
				rows.forEach((r) => targets.push(`${r}${colNum}`));
			}

			const anySelected = targets.some((well) => prev.has(well));
			if (anySelected) {
				targets.forEach((well) => next.delete(well));
			} else {
				targets.forEach((well) => next.add(well));
			}
			return next;
		});
	};

	const handleApplyTitration = (e) => {
		e.preventDefault();
		if (selectedWells.size === 0) return;

		saveToHistory(wells);

		// Filter selection to match active dimensions first
		const validSelection =
			Array.from(selectedWells).filter(isWellInActiveFormat);

		// Sort wells based on propagation direction
		const sortedWells = validSelection.sort((a, b) => {
			const cA = getWellCoords(a);
			const cB = getWellCoords(b);

			if (dilutionDirection === "Right") {
				if (cA.r !== cB.r) return cA.r - cB.r;
				return cA.c - cB.c;
			} else {
				if (cA.c !== cB.c) return cA.c - cB.c;
				return cA.r - cB.r;
			}
		});

		const { value: parsedVal, unit: parsedUnit } =
			parseDoseInput(titrationDoseInput);
		const startVal = parsedVal || 1.0;
		const titrationUnitToUse = parsedUnit || "µM";

		const factor = parseFloat(dilutionFactor) || 3.0;
		const reps = parseInt(replicatesCount) || 1;

		let updatedWells = { ...wells };
		let newLabels = [];

		const wellStepMap = {};
		const stepCount = {};
		let nextStartStepIndex = 0;

		sortedWells.forEach((wellKey) => {
			const coords = getWellCoords(wellKey);
			let predKey = null;

			if (replicateDirection === "Down") {
				if (coords.r > 0) {
					// Predecessor is the well directly above
					predKey = `${String.fromCharCode(65 + coords.r - 1)}${coords.c + 1}`;
				}
			} else {
				if (coords.c > 0) {
					// Predecessor is the well directly to the left
					predKey = `${String.fromCharCode(65 + coords.r)}${coords.c}`;
				}
			}

			let assignedStepIndex = null;
			if (
				predKey &&
				selectedWells.has(predKey) &&
				wellStepMap[predKey] !== undefined
			) {
				const predStep = wellStepMap[predKey];
				const currentGroupSize = stepCount[predStep] || 0;
				if (currentGroupSize < reps) {
					assignedStepIndex = predStep;
					stepCount[predStep] = currentGroupSize + 1;
				}
			}

			if (assignedStepIndex === null) {
				assignedStepIndex = nextStartStepIndex;
				stepCount[assignedStepIndex] = 1;
				nextStartStepIndex += 1;
			}

			wellStepMap[wellKey] = assignedStepIndex;
		});

		sortedWells.forEach((wellKey) => {
			let stepVal = startVal;

			if (isSetDilution) {
				const stepIndex = wellStepMap[wellKey];
				stepVal = startVal / Math.pow(factor, stepIndex);
			}

			const formattedLabelName = formatDoseDisplay(
				stepVal.toString(),
				titrationUnitToUse,
			);
			const labelId = `titr-${Date.now()}-${stepVal.toFixed(6)}`;

			let existingLabel = newLabels.find(
				(l) => l.value === stepVal && l.unit === titrationUnitToUse,
			);
			if (!existingLabel) {
				const colorIndex = newLabels.length % ACCESSIBLE_PALETTE.length;
				existingLabel = {
					id: labelId,
					name: formattedLabelName,
					color: ACCESSIBLE_PALETTE[colorIndex],
					value: stepVal,
					unit: titrationUnitToUse,
				};
				newLabels.push(existingLabel);
			}

			if (!updatedWells[wellKey]) {
				updatedWells[wellKey] = {};
			}
			updatedWells[wellKey] = {
				...updatedWells[wellKey],
				dose: existingLabel.id,
			};
		});

		// Find all active dose IDs currently referenced by any well in updatedWells
		const usedDoseIds = new Set(
			Object.values(updatedWells)
				.map((w) => w.dose)
				.filter(Boolean),
		);

		setLabels((prev) => ({
			...prev,
			dose: [
				...(prev.dose || []).filter(
					(l) => !l.id.startsWith("titr-") || usedDoseIds.has(l.id),
				),
				...newLabels,
			],
		}));
		setWells(updatedWells);
	};

	const activeLabelsList = labels[activeLayerId] || [];

	// Count active wells only if they exist in the current visible plate format
	const activeLabelCountMap = useMemo(() => {
		const counts = {};
		activeLabelsList.forEach((l) => {
			counts[l.id] = 0;
		});
		Object.entries(wells).forEach(([wellKey, wellLayers]) => {
			if (!isWellInActiveFormat(wellKey)) return; // Guard for active dimensions

			if (activeLayerId === "treatment") {
				const assigned = wellLayers.treatment;
				if (Array.isArray(assigned)) {
					assigned.forEach((id) => {
						if (counts[id] !== undefined) counts[id]++;
					});
				} else if (assigned && counts[assigned] !== undefined) {
					counts[assigned]++;
				}
			} else {
				const assignedLabelId = wellLayers[activeLayerId];
				if (assignedLabelId && counts[assignedLabelId] !== undefined) {
					counts[assignedLabelId]++;
				}
			}
		});
		return counts;
	}, [wells, activeLayerId, activeLabelsList, plateFormat]);

	// Bottom Legend generator filters out wells outside current template coordinates
	const treatmentLegendList = useMemo(() => {
		const counts = {};
		const treatmentLabels = labels.treatment || [];
		treatmentLabels.forEach((l) => {
			counts[l.id] = 0;
		});

		Object.entries(wells).forEach(([wellKey, wellLayers]) => {
			if (!isWellInActiveFormat(wellKey)) return; // Guard for active dimensions

			const assigned = wellLayers.treatment;
			if (Array.isArray(assigned)) {
				assigned.forEach((id) => {
					if (counts[id] !== undefined) counts[id]++;
				});
			}
		});

		return treatmentLabels
			.map((l) => ({
				...l,
				count: counts[l.id] || 0,
			}))
			.filter((l) => l.count > 0);
	}, [wells, labels.treatment, plateFormat]);

	const filledWellsCount = useMemo(() => {
		return Object.keys(wells).filter(
			(k) => isWellInActiveFormat(k) && Object.keys(wells[k]).length > 0,
		).length;
	}, [wells, plateFormat]);

	const getDoseIntensity = (doseLabelId) => {
		if (!doseLabelId) return 1.0;
		const doseList = labels.dose || [];
		const index = doseList.findIndex((d) => d.id === doseLabelId);
		if (index === -1) return 1.0;

		const ratio = index / Math.max(1, doseList.length - 1);
		return 1.0 - ratio * 0.55;
	};

	const handleExportData = () => {
		const output = {
			exportedAt: new Date().toISOString(),
			plateFormat: plateFormat,
			layers: layers,
			labels: labels,
			wells: wells,
		};
		const blob = new Blob([JSON.stringify(output, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `microplate_${plateFormat}_well_hts_layout_${new Date().toISOString().split("T")[0]}.json`;
		link.click();
		URL.revokeObjectURL(url);
	};

	const handleLoadLayout = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			try {
				const data = JSON.parse(event.target?.result as string);

				if (
					!data.wells ||
					!data.labels ||
					!data.layers ||
					!data.plateFormat
				) {
					alert(
						"Invalid layout file format. Please upload a valid exported WellMap layout JSON file.",
					);
					return;
				}

				saveToHistory(wells);
				setPlateFormat(data.plateFormat);
				setLayers(data.layers);
				setLabels(data.labels);
				setWells(data.wells);
				setSelectedWells(new Set<string>());
				setLastClickedWell(null);
			} catch (err) {
				alert("Failed to parse JSON file.");
			}
		};
		reader.readAsText(file);
		e.target.value = "";
	};

	const getWellBackgroundStyle = (treatmentIds, doseIntensity = 1) => {
		if (!Array.isArray(treatmentIds) || treatmentIds.length === 0) {
			return { background: "#ffffff" };
		}

		const matchedLabels = treatmentIds
			.map((id) => (labels.treatment || []).find((l) => l.id === id))
			.filter(Boolean);

		if (matchedLabels.length === 0) {
			return { background: "#ffffff" };
		}

		if (matchedLabels.length === 1) {
			const color = matchedLabels[0].color;
			return {
				background: hexToRgba(color, doseIntensity),
			};
		}

		// Creating multi-colored horizontal stripes for drug combinations (image_9edba6.jpg)
		const stripes = [];
		const slicePercentage = 100 / matchedLabels.length;
		matchedLabels.forEach((lbl, i) => {
			const start = (i * slicePercentage).toFixed(1);
			const end = ((i + 1) * slicePercentage).toFixed(1);
			const colorWithDose = hexToRgba(lbl.color, doseIntensity);
			stripes.push(`${colorWithDose} ${start}%`);
			stripes.push(`${colorWithDose} ${end}%`);
		});

		return {
			background: `linear-gradient(to bottom, ${stripes.join(", ")})`,
		};
	};

	const toggleSidebarComboLabel = (id) => {
		setSelectedCombinationLabels((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				if (next.size > 1) next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	return (
		<div className="min-h-screen bg-[#f7f7f9] text-slate-800 flex flex-col font-sans antialiased selection:bg-[#E7ECFF]">
			<header className="border-b border-slate-200 bg-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
				<div className="flex items-center gap-3">
					<div className="bg-[#2E59A7] p-2 rounded-lg text-white shadow-sm">
						<FlaskConical className="h-5 w-5" />
					</div>
					<div>
						<h1 className="text-2xl font-medium tracking-normal text-slate-900 flex items-center gap-2">
							WellMap: An Interactive Plate Layout Designer
						</h1>
					</div>
				</div>

				{/* Dynamic Template Swap tab switches */}
				<div className="flex items-center gap-3">
					<div className="flex items-center border border-black rounded-full p-1 bg-white gap-1">
						<button
							onClick={() => {
								setPlateFormat("96");
								setSelectedWells(new Set());
							}}
							className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
								plateFormat === "96"
									? "text-white"
									: "text-black hover:text-slate-700 bg-transparent"
							}`}
							style={{
								backgroundColor:
									plateFormat === "96"
										? "#2E59A7"
										: "transparent",
							}}
						>
							96w
						</button>
						<button
							onClick={() => {
								setPlateFormat("384");
								setSelectedWells(new Set());
							}}
							className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
								plateFormat === "384"
									? "text-white"
									: "text-black hover:text-slate-700 bg-transparent"
							}`}
							style={{
								backgroundColor:
									plateFormat === "384"
										? "#2E59A7"
										: "transparent",
							}}
						>
							384w
						</button>
					</div>

					<label
						className="flex items-center gap-2 text-sm bg-[#2E59A7] hover:bg-[#1E3F78] text-white transition-all px-5 py-2 rounded-full font-medium cursor-pointer"
						title="Upload an exported layout JSON file"
					>
						<FileText className="h-4 w-4 text-white" />
						Import
						<input
							type="file"
							accept=".json"
							onChange={handleLoadLayout}
							className="hidden"
						/>
					</label>

					<button
						onClick={() => setIsExportModalOpen(true)}
						className="flex items-center gap-2 text-sm bg-[#2E59A7] hover:bg-[#1E3F78] text-white transition-all px-5 py-2 rounded-full font-medium cursor-pointer"
						title="Export plate map snapshot & summary table"
					>
						<Download className="h-4 w-4 text-white" />
						Export
					</button>
				</div>
			</header>

			{/* Main Workspace Frame */}
			<div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full">
				{/* Left Side: Microplate Grid & Dynamic Legend Dashboard */}
				<main className="flex-1 p-6 flex flex-col justify-start overflow-x-auto min-w-0">
					<div className="w-full space-y-6">
						{/* Top plate options toolbar */}
						<div className="flex items-center justify-between flex-wrap gap-3">
							{/* Reference layer visibility toggles */}
							<div className="flex items-center border border-black rounded-full p-1 bg-white gap-1">
								{layers.slice(1).map((layer) => {
									const isVisible = visibleLayers[layer.id];
									return (
										<button
											key={layer.id}
											onClick={() =>
												toggleLayerVisibility(layer.id)
											}
											className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
												isVisible
													? "text-white"
													: "text-black hover:text-slate-700 bg-transparent"
											}`}
											style={{
												backgroundColor: isVisible
													? "#2E59A7"
													: "transparent",
											}}
										>
											{layer.name}
										</button>
									);
								})}
							</div>

							{/* Action Buttons matching image_9deb29.jpg */}
							<div className="flex items-center gap-2">
								<button
									onClick={handleClearSelectedWells}
									disabled={selectedWells.size === 0}
									className={`flex items-center gap-2 text-sm rounded-full font-medium transition-all px-5 py-2 ${
										selectedWells.size > 0
											? "bg-[#2E59A7] hover:bg-[#1E3F78] text-white cursor-pointer"
											: "bg-slate-100 text-slate-400 cursor-not-allowed"
									}`}
								>
									<Trash2
										className={`h-4 w-4 ${selectedWells.size > 0 ? "text-white" : "text-slate-400"}`}
									/>
									Clear
								</button>

								<button
									onClick={handleClearAllWells}
									className="flex items-center gap-2 text-sm bg-[#2E59A7] hover:bg-[#1E3F78] text-white transition-all px-5 py-2 rounded-full font-medium cursor-pointer"
								>
									<X className="h-4 w-4 text-white" />
									Clear All
								</button>

								<button
									onClick={handleUndo}
									disabled={history.length === 0}
									className={`flex items-center gap-2 text-sm rounded-full font-medium transition-all px-5 py-2 ${
										history.length > 0
											? "bg-[#2E59A7] hover:bg-[#1E3F78] text-white cursor-pointer"
											: "bg-slate-100 text-slate-400 cursor-not-allowed"
									}`}
								>
									<Undo
										className={`h-4 w-4 ${history.length > 0 ? "text-white" : "text-slate-400"}`}
									/>
									Undo
								</button>
							</div>
						</div>

						{/* Microplate Dashed Canvas container styled after image_9ee6e3.jpg, image_a0291d.png and hover behaviors of image_9f5425.png */}
						<div
							className={`border-2 border-dashed border-slate-300 rounded-3xl bg-slate-50/50 mx-auto transition-all ${
								plateFormat === "96"
									? "p-6 min-w-[760px] max-w-[960px]"
									: "p-4 min-w-[1150px] max-w-[1450px]"
							}`}
						>
							<div ref={plateRef} className="select-none">
								{/* Dynamically configured Column coordinates grid layout block - gap-1 tighter spacing for 384w */}
								<div
									className={`grid items-center ${
										plateFormat === "96"
											? "gap-y-2 gap-x-2"
											: "gap-y-1 gap-x-1"
									}`}
									style={{
										gridTemplateColumns: `35px repeat(${cols.length}, minmax(0, 1fr))`,
									}}
								>
									{/* Spacer */}
									<div></div>

									{/* Column Headers */}
									{cols.map((c) => (
										<button
											key={`col-${c}`}
											onClick={() => selectCol(c)}
											className="text-center text-sm font-sans font-semibold text-slate-800 hover:text-blue-600 transition-colors py-1 hover:bg-slate-100 rounded"
											title={`Select Column ${c}`}
										>
											{c}
										</button>
									))}

									{/* Rows Mapping A-H or A-P */}
									{rows.map((rowLabel, rIdx) => (
										<React.Fragment key={`row-${rowLabel}`}>
											{/* Row Label Selector */}
											<button
												onClick={() =>
													selectRow(rowLabel)
												}
												className="text-center text-sm font-sans font-semibold text-slate-800 hover:text-blue-600 transition-colors h-full flex items-center justify-center hover:bg-slate-100 rounded"
												title={`Select Row ${rowLabel}`}
											>
												{rowLabel}
											</button>

											{/* Wells - Styled with expanded full-well color fills and transparent text overlay */}
											{cols.map((colNum, cIdx) => {
												const wellKey = `${rowLabel}${colNum}`;
												const assignedWellMetadata =
													wells[wellKey] || {};

												let treatmentIds =
													assignedWellMetadata.treatment;
												if (
													treatmentIds &&
													!Array.isArray(treatmentIds)
												) {
													treatmentIds = [
														treatmentIds,
													];
												}

												const doseId =
													assignedWellMetadata.dose;
												const doseIntensity =
													getDoseIntensity(doseId);

												const hasMetadataOnActiveLayer =
													activeLayerId ===
													"treatment"
														? assignedWellMetadata.treatment &&
															assignedWellMetadata
																.treatment
																.length > 0
														: !!assignedWellMetadata[
																activeLayerId
															];

												const isSelected =
													selectedWells.has(wellKey);
												const isDragSelected =
													isDrawing &&
													dragStart &&
													dragCurrent &&
													getWellsInBoundingBox(
														dragStart,
														dragCurrent,
													).includes(wellKey);
												const isHighlighted =
													isSelected ||
													isDragSelected;
												const isCurrentlyHovered =
													hoveredWell === wellKey;

												const overlays = [];
												layers
													.slice(1)
													.forEach((layer) => {
														if (
															visibleLayers[
																layer.id
															]
														) {
															const assignedLabelId =
																assignedWellMetadata[
																	layer.id
																];
															const matchedLabel =
																assignedLabelId
																	? (
																			labels[
																				layer
																					.id
																			] ||
																			[]
																		).find(
																			(
																				l,
																			) =>
																				l.id ===
																				assignedLabelId,
																		)
																	: null;
															if (matchedLabel) {
																let displayText =
																	matchedLabel.name;
																if (
																	layer.id ===
																		"dose" &&
																	matchedLabel.value !==
																		undefined
																) {
																	displayText =
																		formatDoseDisplay(
																			matchedLabel.value,
																			matchedLabel.unit ||
																				"µM",
																			1,
																		);
																} else {
																	displayText =
																		getAbbreviation(
																			displayText,
																		);
																}
																overlays.push({
																	layerId:
																		layer.id,
																	text: displayText,
																});
															}
														}
													});

												return (
													<div
														key={wellKey}
														className="relative aspect-square flex items-center justify-center cursor-crosshair transition-all duration-100 bg-transparent overflow-visible"
														onPointerDown={(e) =>
															handleWellPointerDown(
																e,
																rIdx,
																cIdx,
															)
														}
														onPointerEnter={() =>
															handleWellPointerEnter(
																rIdx,
																cIdx,
															)
														}
														onPointerLeave={() =>
															setHoveredWell(null)
														}
													>
														{/* Gray background box that expands to connect selections contiguously */}
														{(isCurrentlyHovered ||
															isHighlighted) && (
															<div
																className="absolute bg-[#686A67]/75 z-0 pointer-events-none rounded-none shadow-2xs animate-fadeIn"
																style={{
																	top:
																		plateFormat ===
																		"96"
																			? "-5px"
																			: "-3px",
																	bottom:
																		plateFormat ===
																		"96"
																			? "-5px"
																			: "-3px",
																	left:
																		plateFormat ===
																		"96"
																			? "-5px"
																			: "-3px",
																	right:
																		plateFormat ===
																		"96"
																			? "-5px"
																			: "-3px",
																}}
															/>
														)}

														<div
															className={`rounded-full transition-all flex items-center justify-center overflow-hidden border relative z-10 ${
																plateFormat ===
																"96"
																	? "w-[90%] h-[90%]"
																	: "w-[95%] h-[95%]"
															} border-slate-300`}
															style={getWellBackgroundStyle(
																treatmentIds,
																doseIntensity,
															)}
														>
															{/* Light blue shading tint overlay on hover or select matching uploaded_media_1779948836049.png */}
															{(isCurrentlyHovered ||
																isHighlighted) && (
																<div className="absolute inset-0 bg-[#e8edff]/70 pointer-events-none mix-blend-multiply z-5" />
															)}
															{/* Transparent inner text overlay matching requested larger and regular weight style */}
															{overlays.length >
																0 && (
																<div
																	className="flex flex-col items-center justify-center gap-0.5 pointer-events-none select-none w-full bg-transparent"
																	style={{
																		color: "#111827",
																	}} // High contrast text on top of the accessible colors
																>
																	{overlays
																		.slice(
																			0,
																			3,
																		)
																		.map(
																			(
																				ov,
																				index,
																			) => (
																				<span
																					key={
																						index
																					}
																					/* Clean regular text style without background backplate, shadows or white casks */
																					className={`font-normal leading-[1.1] tracking-normal text-center whitespace-normal break-words max-w-[90%] bg-transparent select-none text-slate-900 ${
																						plateFormat ===
																						"96"
																							? "text-xs md:text-[13px]"
																							: "text-[9px] md:text-[11px]"
																					}`}
																					title={
																						ov.text
																					}
																				>
																					{
																						ov.text
																					}
																				</span>
																			),
																		)}
																</div>
															)}
														</div>

														{/* Inspection Info Tooltip on Hover */}
														{hoveredWell ===
															wellKey &&
															(() => {
																const assignedRows =
																	layers
																		.map(
																			(
																				lay,
																			) => {
																				let dispName =
																					"";
																				if (
																					lay.id ===
																					"treatment"
																				) {
																					const assigned =
																						assignedWellMetadata.treatment;
																					if (
																						Array.isArray(
																							assigned,
																						)
																					) {
																						dispName =
																							assigned
																								.map(
																									(
																										id,
																									) =>
																										(
																											labels.treatment ||
																											[]
																										).find(
																											(
																												l,
																											) =>
																												l.id ===
																												id,
																										)
																											?.name,
																								)
																								.filter(
																									Boolean,
																								)
																								.join(
																									" + ",
																								);
																					} else if (
																						assigned
																					) {
																						dispName =
																							(
																								labels.treatment ||
																								[]
																							).find(
																								(
																									l,
																								) =>
																									l.id ===
																									assigned,
																							)
																								?.name ||
																							"";
																					}
																				} else {
																					const lblId =
																						assignedWellMetadata[
																							lay
																								.id
																						];
																					const lbl =
																						(
																							labels[
																								lay
																									.id
																							] ||
																							[]
																						).find(
																							(
																								l,
																							) =>
																								l.id ===
																								lblId,
																						);
																					if (
																						lbl
																					) {
																						dispName =
																							lay.id ===
																								"dose" &&
																							lbl.value !==
																								undefined
																								? formatDoseDisplay(
																										lbl.value.toString(),
																										lbl.unit ||
																											"µM",
																									)
																								: lbl.name;
																					}
																				}
																				return {
																					layer: lay,
																					name: dispName,
																				};
																			},
																		)
																		.filter(
																			(
																				item,
																			) =>
																				item.name !==
																				"",
																		);

																return (
																	<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2.5 bg-white text-slate-800 text-[11px] rounded-lg shadow-xl border border-slate-200 pointer-events-none z-30 whitespace-nowrap animate-fadeIn">
																		<p className="font-bold text-blue-600 font-mono text-center mb-1.5">
																			{
																				wellKey
																			}
																		</p>
																		{assignedRows.length >
																		0 ? (
																			<div className="space-y-1">
																				{assignedRows.map(
																					(
																						item,
																					) => (
																						<div
																							key={
																								item
																									.layer
																									.id
																							}
																							className="flex justify-between gap-4 text-[10px]"
																						>
																							<span className="text-slate-500 font-medium">
																								{
																									item
																										.layer
																										.name
																								}

																								:
																							</span>
																							<span className="font-bold text-slate-800">
																								{
																									item.name
																								}
																							</span>
																						</div>
																					),
																				)}
																			</div>
																		) : (
																			<p className="text-slate-400 italic text-[10px] text-center font-medium">
																				Unassigned
																			</p>
																		)}
																	</div>
																);
															})()}
													</div>
												);
											})}
										</React.Fragment>
									))}
								</div>
							</div>
						</div>

						{/* Dynamic Legend Preview Panel below the plate matching image_9ee6e3.jpg */}
						<div
							className={`mx-auto pt-1 pb-4 -mt-4 ${
								plateFormat === "96"
									? "min-w-[760px] max-w-[960px]"
									: "min-w-[1150px] max-w-[1450px]"
							}`}
							style={{
								paddingLeft: `calc(35px + (100% - 35px) / (${cols.length} * 2))`,
							}}
						>
							<div className="flex flex-wrap gap-8 items-center justify-start">
								{treatmentLegendList.length === 0 ? (
									<div className="text-slate-400 text-xs italic py-1">
										No active treatments assigned on this
										layout format yet. Map labels from the
										sidebar to populate.
									</div>
								) : (
									treatmentLegendList.map((legendItem) => (
										<div
											key={legendItem.id}
											className="flex items-center gap-3 animate-fadeIn"
										>
											{/* Color Circle preview matching style from image_9ee6e3.jpg */}
											<div
												className="w-7 h-7 rounded-full shrink-0 border border-slate-200/30 shadow-2xs"
												style={{
													backgroundColor:
														legendItem.color,
												}}
											/>
											<div className="text-left">
												<span className="text-sm font-semibold tracking-normal text-slate-800 leading-none">
													{legendItem.name}
												</span>
											</div>
										</div>
									))
								)}
							</div>
						</div>
					</div>
				</main>

				{/* Right Sidebar: Active Layer Controller, Combination options & Labels panel */}
				<aside className="w-full lg:w-[350px] border-t lg:border-t-0 lg:border-l border-slate-200 bg-white p-6 flex flex-col gap-5 overflow-y-auto">
					<div className="space-y-2.5 relative">
						<div className="flex items-center justify-start gap-3 px-2.5">
							<label className="text-base font-bold text-[#151D29] uppercase tracking-wider">
								METADATA
							</label>
							{!isAddingLayer && (
								<button
									onClick={() => setIsAddingLayer(true)}
									className="flex items-center gap-1 text-sm text-[#2E59A7] hover:text-[#1E3F78] font-bold transition-colors cursor-pointer select-none"
									title="Add custom metadata layer"
								>
									<span>+ Layer</span>
								</button>
							)}
						</div>

						{isAddingLayer ? (
							<form
								onSubmit={handleAddNewLayerSubmit}
								className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2 animate-fadeIn w-full"
							>
								<input
									type="text"
									placeholder="Layer name (e.g. Temp)"
									value={newLayerName}
									onChange={(e) =>
										setNewLayerName(e.target.value)
									}
									className="w-full text-sm rounded-xl border border-black p-2.5 px-4 bg-white outline-none focus:border-[#2E59A7] font-medium text-slate-900 transition-colors"
									autoFocus
									required
								/>
								<div className="flex gap-1.5">
									<button
										type="submit"
										className="flex-1 bg-[#2E59A7] hover:bg-[#1E3F78] text-white font-medium text-xs py-2 px-4 rounded-full transition-colors cursor-pointer"
									>
										Add
									</button>
									<button
										type="button"
										onClick={() => setIsAddingLayer(false)}
										className="flex-1 bg-white hover:bg-slate-50 text-black border border-slate-800 font-medium text-xs py-2 px-4 rounded-full transition-colors cursor-pointer"
									>
										Cancel
									</button>
								</div>
							</form>
						) : (
							<div className="flex flex-wrap gap-2 w-full justify-start items-center py-1">
								{layers.map((lay) => {
									const isSelected = lay.id === activeLayerId;
									return (
										<button
											key={lay.id}
											type="button"
											onClick={() => {
												setActiveLayerId(lay.id);
												setEditingLabelId(null);
											}}
											className={`px-4 py-1.5 rounded-3xl text-base font-semibold tracking-wide transition-all duration-150 cursor-pointer shrink-0 ${
												isSelected
													? "text-white shadow-2xs"
													: "text-slate-500 bg-[#f4f4f5] hover:bg-slate-200"
											}`}
											style={{
												backgroundColor: isSelected
													? "#2E59A7"
													: undefined,
											}}
										>
											{lay.name}
										</button>
									);
								})}

								{!INITIAL_LAYERS.some(
									(l) => l.id === activeLayerId,
								) && (
									<button
										onClick={() =>
											handleDeleteMetadataLayer(
												activeLayerId,
											)
										}
										className="p-1.5 text-slate-400 hover:text-red-500 rounded-full bg-[#f4f4f5] hover:bg-red-50 transition-colors cursor-pointer shrink-0"
										title="Delete active custom layer"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								)}
							</div>
						)}
					</div>

					{/* Render dose titration curves panel if Dose layer is chosen */}
					{activeLayerId === "dose" ? (
						<div className="space-y-4">
							{/* Titration curves editor form matching image_9e766a.png layout */}
							<form
								onSubmit={handleApplyTitration}
								className="space-y-3"
							>
								<div>
									<div
										className="relative"
										ref={doseSuggestionsRef}
									>
										<input
											type="text"
											value={titrationDoseInput}
											onFocus={() =>
												setIsDoseSuggestionsOpen(true)
											}
											onChange={(e) => {
												setTitrationDoseInput(
													e.target.value,
												);
												setIsDoseSuggestionsOpen(true);
											}}
											className="w-full text-base rounded-xl border border-black p-2.5 px-4 bg-white outline-none focus:border-[#2E59A7] font-medium text-slate-900 transition-colors"
											placeholder="e.g. 10uM, 100ng/ml"
											required
										/>
										{isDoseSuggestionsOpen && (
											<div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-2 px-1.5 max-h-60 overflow-y-auto animate-fadeIn flex flex-col gap-0.5">
												{doseSuggestions
													.filter((opt) =>
														opt
															.toLowerCase()
															.includes(
																(
																	titrationDoseInput ||
																	""
																).toLowerCase(),
															),
													)
													.map((opt) => (
														<button
															key={opt}
															type="button"
															onClick={() => {
																setTitrationDoseInput(
																	opt,
																);
																setIsDoseSuggestionsOpen(
																	false,
																);
															}}
															className="text-left text-sm py-2 px-4 transition-colors hover:bg-[#2E59A7] hover:text-white rounded-full cursor-pointer w-full bg-transparent border-0 font-medium text-slate-700 block"
														>
															{opt}
														</button>
													))}
												{doseSuggestions.filter((opt) =>
													opt
														.toLowerCase()
														.includes(
															(
																titrationDoseInput ||
																""
															).toLowerCase(),
														),
												).length === 0 && (
													<span className="text-xs text-slate-400 italic px-4 py-2">
														No matching standard
														doses. Type custom dose.
													</span>
												)}
											</div>
										)}
									</div>
								</div>

								{/* Dilution toggle option */}
								<div className="flex items-center justify-between p-1 bg-slate-50 rounded-lg">
									<span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
										Set dilution
									</span>
									<button
										type="button"
										onClick={() =>
											setIsSetDilution(!isSetDilution)
										}
										className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
											isSetDilution
												? "bg-[#2E59A7]"
												: "bg-slate-200"
										}`}
									>
										<span
											className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
												isSetDilution
													? "translate-x-5"
													: "translate-x-0"
											}`}
										/>
									</button>
								</div>

								{isSetDilution && (
									<div className="grid grid-cols-2 gap-3 p-3 bg-slate-50/70 border border-slate-100 rounded-xl animate-fadeIn">
										<div>
											<label className="block text-xs font-bold text-slate-600 uppercase mb-1">
												Dilution factor
												<span className="text-red-500">
													*
												</span>
											</label>
											<input
												type="number"
												step="any"
												value={dilutionFactor}
												onChange={(e) =>
													setDilutionFactor(
														e.target.value,
													)
												}
												className="w-full text-sm rounded-xl border border-black p-2 px-3 bg-white outline-none focus:border-[#2E59A7] font-medium text-slate-900 transition-colors"
												placeholder="3"
												required
											/>
										</div>
										<div>
											<label className="block text-xs font-bold text-slate-600 uppercase mb-1">
												Direction
											</label>
											<div
												className="relative font-sans"
												ref={dilutionDirDropdownRef}
											>
												<button
													type="button"
													onClick={() =>
														setIsDilutionDirDropdownOpen(
															!isDilutionDirDropdownOpen,
														)
													}
													className="w-full bg-white text-sm font-semibold text-slate-900 border border-black py-2 px-3 rounded-xl outline-none cursor-pointer flex items-center justify-between transition-all"
												>
													<span>
														{dilutionDirection ===
														"Down"
															? "↓ Down"
															: "→ Right"}
													</span>
													{isDilutionDirDropdownOpen ? (
														<ChevronUp className="h-3.5 w-3.5 text-black" />
													) : (
														<ChevronDown className="h-3.5 w-3.5 text-black" />
													)}
												</button>

												{isDilutionDirDropdownOpen && (
													<div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-2 px-1.5 max-h-60 overflow-y-auto animate-fadeIn flex flex-col gap-0.5">
														{[
															{
																val: "Down",
																label: "↓ Down",
															},
															{
																val: "Right",
																label: "→ Right",
															},
														].map((opt) => {
															const isSelected =
																dilutionDirection ===
																opt.val;
															return (
																<div
																	key={
																		opt.val
																	}
																	onClick={() => {
																		setDilutionDirection(
																			opt.val,
																		);
																		setIsDilutionDirDropdownOpen(
																			false,
																		);
																	}}
																	className={`text-left text-xs py-2 px-3 transition-colors hover:bg-[#2E59A7] hover:text-white rounded-full cursor-pointer ${
																		isSelected
																			? "font-bold text-black bg-slate-50/40"
																			: "text-slate-700 font-normal"
																	}`}
																>
																	{opt.label}
																</div>
															);
														})}
													</div>
												)}
											</div>
										</div>

										<div>
											<label className="block text-xs font-bold text-slate-600 uppercase mb-1">
												Replicates
												<span className="text-red-500">
													*
												</span>
											</label>
											<input
												type="number"
												min="1"
												value={replicatesCount}
												onChange={(e) =>
													setReplicatesCount(
														e.target.value,
													)
												}
												className="w-full text-sm rounded-xl border border-black p-2 px-3 bg-white outline-none focus:border-[#2E59A7] font-medium text-slate-900 transition-colors"
												placeholder="1"
												required
											/>
										</div>
										<div>
											<label className="block text-xs font-bold text-slate-600 uppercase mb-1">
												Direction
											</label>
											<div
												className="relative font-sans"
												ref={replicateDirDropdownRef}
											>
												<button
													type="button"
													onClick={() =>
														setIsReplicateDirDropdownOpen(
															!isReplicateDirDropdownOpen,
														)
													}
													className="w-full bg-white text-sm font-semibold text-slate-900 border border-black py-2 px-3 rounded-xl outline-none cursor-pointer flex items-center justify-between transition-all"
												>
													<span>
														{replicateDirection ===
														"Down"
															? "↓ Down"
															: "→ Right"}
													</span>
													{isReplicateDirDropdownOpen ? (
														<ChevronUp className="h-3.5 w-3.5 text-black" />
													) : (
														<ChevronDown className="h-3.5 w-3.5 text-black" />
													)}
												</button>

												{isReplicateDirDropdownOpen && (
													<div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-2 px-1.5 max-h-60 overflow-y-auto animate-fadeIn flex flex-col gap-0.5">
														{[
															{
																val: "Down",
																label: "↓ Down",
															},
															{
																val: "Right",
																label: "→ Right",
															},
														].map((opt) => {
															const isSelected =
																replicateDirection ===
																opt.val;
															return (
																<div
																	key={
																		opt.val
																	}
																	onClick={() => {
																		setReplicateDirection(
																			opt.val,
																		);
																		setIsReplicateDirDropdownOpen(
																			false,
																		);
																	}}
																	className={`text-left text-xs py-2 px-3 transition-colors hover:bg-[#2E59A7] hover:text-white rounded-full cursor-pointer ${
																		isSelected
																			? "font-bold text-black bg-slate-50/40"
																			: "text-slate-700 font-normal"
																	}`}
																>
																	{opt.label}
																</div>
															);
														})}
													</div>
												)}
											</div>
										</div>
									</div>
								)}

								<button
									type="submit"
									disabled={selectedWells.size === 0}
									className={`w-full mt-3 font-medium text-sm py-2.5 px-5 rounded-full transition-all flex items-center justify-center gap-1.5 ${
										selectedWells.size > 0
											? "bg-[#2E59A7] hover:bg-[#1E3F78] text-white cursor-pointer"
											: "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
									}`}
								>
									Apply
								</button>
							</form>
						</div>
					) : (
						<>
							{/* Main Metadata List Palette with high-contrast text compliance */}
							<div className="flex-1 space-y-3">
								<div className="flex flex-row flex-wrap gap-2 w-full justify-start py-1">
									{isCombinationMode &&
									activeLayerId === "treatment" ? (
										<div className="flex flex-col gap-2 pt-1.5 w-full">
											<label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
												Select Treatments to Combine
											</label>
											<div className="flex items-center border border-black rounded-xl p-1 bg-white gap-1 flex-wrap w-full justify-start shadow-2xs">
												{activeLabelsList.map(
													(label) => {
														const isChecked =
															selectedCombinationLabels.has(
																label.id,
															);
														return (
															<button
																key={label.id}
																type="button"
																onClick={() =>
																	toggleSidebarComboLabel(
																		label.id,
																	)
																}
																className={`px-2 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
																	isChecked
																		? "text-white"
																		: "text-black hover:text-slate-700 bg-transparent"
																}`}
																style={{
																	backgroundColor:
																		isChecked
																			? "#2E59A7"
																			: "transparent",
																}}
															>
																<div className="flex items-center gap-1.5">
																	<div
																		className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
																		style={{
																			backgroundColor:
																				label.color,
																		}}
																	/>
																	<span>
																		{
																			label.name
																		}
																	</span>
																</div>
															</button>
														);
													},
												)}
											</div>
										</div>
									) : (
										activeLabelsList.map((label) => {
											const isEditing =
												editingLabelId === label.id;

											const isTreatmentLayer =
												activeLayerId === "treatment";
											const isCheckedInCombination =
												isTreatmentLayer &&
												selectedCombinationLabels.has(
													label.id,
												);

											return (
												<div
													key={label.id}
													onDoubleClick={() =>
														startEditingLabel(label)
													}
													className={`group flex items-center justify-between gap-1.5 py-2 px-3.5 rounded-xl border border-slate-800 transition-all select-none w-[140px] shrink-0 ${
														isCheckedInCombination &&
														isCombinationMode
															? "bg-blue-50/50 hover:bg-[#2E59A7]"
															: "bg-slate-50/50 hover:bg-[#2E59A7]"
													}`}
													title="Double-click to edit this label inline"
												>
													{isEditing ? (
														<div
															className="flex items-center gap-2 w-full"
															onKeyDown={(e) => {
																if (
																	e.key ===
																	"Enter"
																)
																	handleSaveLabelEdit(
																		label.id,
																	);
																if (
																	e.key ===
																	"Escape"
																)
																	setEditingLabelId(
																		null,
																	);
															}}
														>
															<div
																className="w-4 h-4 rounded-full shrink-0 shadow-inner border border-slate-200 relative overflow-hidden shrink-0"
																style={{
																	backgroundColor:
																		editingColor,
																}}
															>
																<input
																	type="color"
																	value={
																		editingColor
																	}
																	onChange={(
																		e,
																	) =>
																		setEditingColor(
																			e
																				.target
																				.value,
																		)
																	}
																	className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
																/>
															</div>
															<input
																type="text"
																value={
																	editingName
																}
																onChange={(e) =>
																	setEditingName(
																		e.target
																			.value,
																	)
																}
																className="text-xs bg-white border border-slate-200 px-1.5 py-1 rounded w-full outline-none focus:border-blue-500 font-semibold"
																autoFocus
																onFocus={(e) =>
																	e.target.select()
																}
																required
															/>
															<button
																onClick={() =>
																	handleSaveLabelEdit(
																		label.id,
																	)
																}
																className="p-1 text-green-600 hover:bg-green-50 rounded"
																title="Save Changes"
															>
																<Check className="h-3.5 w-3.5" />
															</button>
															<button
																onClick={() =>
																	setEditingLabelId(
																		null,
																	)
																}
																className="p-1 text-slate-400 hover:bg-slate-100 rounded"
															>
																<X className="h-3.5 w-3.5" />
															</button>
														</div>
													) : (
														<>
															<div className="flex items-center gap-2 flex-1 min-w-0">
																{isTreatmentLayer &&
																	isCombinationMode && (
																		<button
																			type="button"
																			onClick={() =>
																				toggleSidebarComboLabel(
																					label.id,
																				)
																			}
																			className="focus:outline-none cursor-pointer shrink-0"
																		>
																			{isCheckedInCombination ? (
																				<div className="w-5 h-5 rounded-full bg-[#2E59A7] group-hover:bg-white flex items-center justify-center transition-all duration-150 shrink-0">
																					<div className="w-2 h-2 rounded-full bg-white group-hover:bg-[#2E59A7] transition-all duration-150" />
																				</div>
																			) : (
																				<div className="w-5 h-5 rounded-full border-2 border-black group-hover:border-white bg-white group-hover:bg-transparent transition-all duration-150 shrink-0" />
																			)}
																		</button>
																	)}

																<button
																	onClick={() =>
																		applyLabelToSelection(
																			label.id,
																		)
																	}
																	className="flex items-center gap-2 text-left min-w-0 flex-1 hover:opacity-85"
																	title={`Assign "${label.name}" to selection`}
																>
																	<div
																		className="w-4 h-4 rounded-full shrink-0 shadow-inner border border-slate-200"
																		style={{
																			backgroundColor:
																				label.color,
																		}}
																	/>
																	<div className="min-w-0">
																		<span className="text-sm font-semibold text-slate-700 block truncate group-hover:text-white transition-colors">
																			{
																				label.name
																			}
																		</span>
																	</div>
																</button>
															</div>

															<button
																onClick={() =>
																	handleDeleteLabel(
																		label.id,
																	)
																}
																className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 group-hover:text-white hover:text-red-200 rounded transition-opacity shrink-0 ml-0.5"
																title="Delete label"
															>
																<X className="h-3 w-3" />
															</button>
														</>
													)}
												</div>
											);
										})
									)}
								</div>

								{/* Add new Label Form block using the accessible colors grid */}
								{isAddingLabel ? (
									<form
										onSubmit={handleAddNewLabelSubmit}
										className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3 animate-fadeIn"
									>
										<div className="flex gap-2 items-center">
											<div
												className="w-8 h-8 rounded-full border border-slate-200 shadow-inner relative overflow-hidden shrink-0"
												style={{
													backgroundColor:
														newLabelColor,
												}}
											>
												<input
													type="color"
													value={newLabelColor}
													onChange={(e) =>
														setNewLabelColor(
															e.target.value,
														)
													}
													className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
												/>
											</div>
											<input
												type="text"
												placeholder="Label name"
												value={newLabelName}
												onChange={(e) =>
													setNewLabelName(
														e.target.value,
													)
												}
												className="w-full text-sm rounded-xl border border-black p-2.5 px-4 bg-white outline-none focus:border-[#2E59A7] font-medium text-slate-900 transition-colors shadow-2xs"
												autoFocus
												required
											/>
										</div>

										{/* ACCESSIBLE_PALETTE visual selector matching image_9f4802.png grid format */}
										<div className="grid grid-cols-5 gap-1.5 max-h-[140px] overflow-y-auto p-1 bg-white border border-slate-100 rounded-lg">
											{ACCESSIBLE_PALETTE.map((color) => (
												<button
													key={color}
													type="button"
													onClick={() =>
														setNewLabelColor(color)
													}
													className={`w-5 h-5 rounded-full border shadow-3xs transition-transform hover:scale-115 shrink-0 ${
														newLabelColor === color
															? "border-black ring-2 ring-[#2E59A7]/50"
															: "border-slate-200"
													}`}
													style={{
														backgroundColor: color,
													}}
													title={color}
												/>
											))}
										</div>

										<div className="flex gap-1.5 pt-1.5">
											<button
												type="submit"
												className="flex-1 bg-[#2E59A7] hover:bg-[#1E3F78] text-white font-medium text-xs py-2 px-4 rounded-full transition-colors cursor-pointer"
											>
												Save
											</button>
											<button
												type="button"
												onClick={() =>
													setIsAddingLabel(false)
												}
												className="flex-1 bg-white hover:bg-slate-50 text-black border border-black font-medium text-xs py-2 px-4 rounded-full transition-colors cursor-pointer"
											>
												Cancel
											</button>
										</div>
									</form>
								) : (
									<div className="flex items-center justify-start gap-2 pt-2">
										{isCombinationMode &&
										activeLayerId === "treatment" ? (
											<button
												type="button"
												onClick={
													applySelectedCombination
												}
												disabled={
													selectedWells.size === 0 ||
													selectedCombinationLabels.size ===
														0
												}
												className={`font-semibold text-xs py-2 px-4 rounded-full transition-all border flex items-center justify-center gap-1.5 shadow-2xs ${
													selectedWells.size > 0 &&
													selectedCombinationLabels.size >
														0
														? "bg-[#2E59A7] hover:bg-[#1E3F78] text-white border-black cursor-pointer"
														: "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
												}`}
											>
												Apply
											</button>
										) : (
											<button
												type="button"
												onClick={() =>
													setIsAddingLabel(true)
												}
												className="flex items-center gap-1 bg-white hover:bg-slate-50 text-black border border-slate-800 font-semibold text-xs py-2 px-4 rounded-full transition-all cursor-pointer"
											>
												<span>+ Label</span>
											</button>
										)}

										{activeLayerId === "treatment" && (
											<button
												type="button"
												onClick={() =>
													setIsCombinationMode(
														!isCombinationMode,
													)
												}
												className={`flex items-center justify-center gap-1.5 font-semibold text-xs py-2 px-4 rounded-full transition-all cursor-pointer select-none ${
													isCombinationMode
														? "bg-[#2E59A7] text-white border border-slate-800"
														: "bg-white hover:bg-slate-50 text-black border border-slate-800"
												}`}
											>
												Combo
											</button>
										)}
									</div>
								)}
							</div>
						</>
					)}
				</aside>
			</div>

			{/* Export & Snapshot Dashboard Modal */}
			{isExportModalOpen && (
				<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fadeIn">
					<div className="bg-white rounded-3xl shadow-2xl max-w-7xl w-full flex flex-col max-h-[92vh] overflow-hidden border border-slate-100 animate-scaleIn">
						{/* Modal Header */}
						<div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
							<div>
								<h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
									<Download className="h-5 w-5 text-[#2E59A7]" />
									Export Plate Layout and Metadata Table
								</h2>
							</div>
							<button
								onClick={() => setIsExportModalOpen(false)}
								className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						{/* Modal Scrollable Canvas Body */}
						<div className="flex-1 overflow-auto p-6 bg-slate-100/50 flex justify-center">
							{/* The target wrapper that is screen-captured */}
							<div
								ref={snapshotRef}
								className="p-6 rounded-2xl flex flex-col lg:flex-row gap-6 items-stretch w-full max-w-full shrink-0"
								style={{
									border: "none",
									backgroundColor: "#ffffff",
									boxShadow: "none",
								}}
							>
								{/* Left Side: Well Plate Grid */}
								<div className="flex-[1.2] min-w-0 flex flex-col gap-4">
									{renderSnapshotPlateGrid()}
								</div>

								{/* Right Side: Generated Metadata Summary Table */}
								<div className="flex-1 min-w-0 flex flex-col gap-4">
									{renderSnapshotTable()}
								</div>
							</div>
						</div>

						{/* Modal Footer Buttons */}
						<div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
							<button
								onClick={downloadSnapshot}
								className="flex items-center gap-2 text-sm bg-[#2E59A7] hover:bg-[#1E3F78] text-white font-medium px-5 py-2.5 rounded-full transition-all cursor-pointer"
							>
								<Download className="h-4 w-4 text-white" />
								Download Image Snapshot (PNG)
							</button>

							<button
								onClick={handleExportData}
								className="flex items-center gap-2 text-sm bg-[#2E59A7] hover:bg-[#1E3F78] text-white font-medium px-5 py-2.5 rounded-full transition-all cursor-pointer"
							>
								<FileText className="h-4 w-4 text-white" />
								Download JSON Layout
							</button>

							<button
								onClick={() => setIsExportModalOpen(false)}
								className="text-sm bg-white border border-[#2E59A7] hover:bg-slate-50 text-[#2E59A7] font-medium px-5 py-2.5 rounded-full transition-all cursor-pointer"
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
