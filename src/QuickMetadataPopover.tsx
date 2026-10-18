import React, { useState, useMemo, useEffect, useRef } from "react";
import {
	X,
	Sparkles,
	ArrowRight,
	ArrowDown,
	HelpCircle,
	Edit2,
	Layers,
} from "lucide-react";
import {
	parseQuickMetadataInput,
	getSelectionGeometry,
} from "./quickMetadataParser";
import type { ParsedQuickCondition } from "./quickMetadataParser";

interface LabelItem {
	id: string;
	name: string;
	color?: string;
	value?: number;
	unit?: string;
}

interface WellItem {
	treatment?: string | string[];
	dose?: string;
	treatmentDoses?: Record<string, string>;
	duration?: string;
	biomarker?: string | string[];
	status?: string;
	[key: string]: unknown;
}

export interface ExistingMetadataLayer {
	layerId: string;
	layerName: string;
	items: Array<{ id: string; name: string }>;
}

interface QuickMetadataPopoverProps {
	selectedWells: Set<string>;
	plateFormat: string;
	wells: Record<string, WellItem>;
	layers: Array<{ id: string; name: string }>;
	labels: Record<string, LabelItem[]>;
	onApply: (params: {
		parsed: ParsedQuickCondition;
		mode: "add" | "replace" | "update_treatment_dose";
		effectiveDirection: "Right" | "Down";
		targetTreatmentId?: string;
		keepOpen?: boolean;
	}) => void;
	onRemoveExistingLayer: (layerId: string, itemValueId?: string, targetTreatmentId?: string) => void;
	onClose: () => void;
}

export const QuickMetadataPopover: React.FC<QuickMetadataPopoverProps> = ({
	selectedWells,
	wells,
	layers,
	labels,
	onApply,
	onRemoveExistingLayer,
	onClose,
}) => {
	const [input, setInput] = useState("");
	const [mode, setMode] = useState<"add" | "replace" | "update_treatment_dose">("add");
	const [targetTreatmentId, setTargetTreatmentId] = useState<string | null>(null);
	const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
	const [directionOverride, setDirectionOverride] = useState<"Right" | "Down" | null>(null);
	const [showHelp, setShowHelp] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus input immediately when popover mounts
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, []);

	// Calculate selection geometry for direction inference
	const geometry = useMemo(() => {
		return getSelectionGeometry(selectedWells);
	}, [selectedWells]);

	const inferredDirection = geometry?.inferredDirection || "Right";
	const effectiveDirection = directionOverride || inferredDirection;

	// Custom layer IDs list
	const customLayerIds = useMemo(() => {
		return layers
			.map((l) => l.id)
			.filter(
				(id) =>
					!["treatment", "dose", "duration", "biomarker", "status"].includes(id)
			);
	}, [layers]);

	// Parse input in real-time
	const parsed = useMemo(() => {
		return parseQuickMetadataInput(input, {
			existingLabels: labels,
			customLayerIds,
			defaultDirection: effectiveDirection,
		});
	}, [input, labels, customLayerIds, effectiveDirection]);

	// Inspect all active metadata layers currently present on the selected wells
	const existingMetadata = useMemo(() => {
		const result: ExistingMetadataLayer[] = [];

		layers.forEach((layer) => {
			const itemsMap = new Map<string, string>(); // id -> display name

			selectedWells.forEach((key) => {
				const w = wells[key];
				if (!w) return;

				if (layer.id === "treatment") {
					const val = w.treatment;
					const ids = Array.isArray(val) ? val : val ? [val] : [];
					ids.forEach((id) => {
						const l = (labels.treatment || []).find((x) => x.id === id);
						if (l?.name) itemsMap.set(id, l.name);
					});
				} else if (layer.id === "biomarker") {
					const val = w.biomarker;
					const ids = Array.isArray(val) ? val : val ? [val] : [];
					ids.forEach((id) => {
						const l = (labels.biomarker || []).find((x) => x.id === id);
						if (l?.name) itemsMap.set(id, l.name);
					});
				} else if (layer.id === "dose") {
					const doseId = w.dose;
					if (doseId) {
						const l = (labels.dose || []).find((x) => x.id === doseId);
						if (l) {
							itemsMap.set(doseId, l.name);
						}
					}
				} else {
					const valId = w[layer.id];
					if (typeof valId === "string" && valId) {
						const l = (labels[layer.id] || []).find((x) => x.id === valId);
						if (l?.name) itemsMap.set(valId, l.name);
					}
				}
			});

			if (itemsMap.size > 0) {
				result.push({
					layerId: layer.id,
					layerName: layer.name,
					items: Array.from(itemsMap.entries()).map(([id, name]) => ({ id, name })),
				});
			}
		});

		return result;
	}, [selectedWells, wells, layers, labels]);

	// Current treatments & dose summary
	const treatLayer = existingMetadata.find((m) => m.layerId === "treatment");
	const doseLayer = existingMetadata.find((m) => m.layerId === "dose");
	const existingTreatmentItems = treatLayer ? treatLayer.items : [];

	// Helper to get dose summary for a specific treatment in the selection
	const getTreatmentDoseSummary = (treatmentId: string) => {
		const doseNames: string[] = [];
		selectedWells.forEach((key) => {
			const w = wells[key];
			if (!w) return;
			let doseId = w.treatmentDoses?.[treatmentId];
			if (
				!doseId &&
				Array.isArray(w.treatment) &&
				w.treatment.length === 1 &&
				w.treatment[0] === treatmentId
			) {
				doseId = w.dose;
			}
			if (doseId) {
				const l = (labels.dose || []).find((x) => x.id === doseId);
				if (l && !doseNames.includes(l.name)) {
					doseNames.push(l.name);
				}
			}
		});
		if (doseNames.length === 0) return null;
		if (doseNames.length === 1) return doseNames[0];
		return `Titration (${doseNames[0]} start)`;
	};

	const matchedExistingTreatment = useMemo(() => {
		if (targetTreatmentId) {
			return (
				existingTreatmentItems.find(
					(t) => t.id === targetTreatmentId,
				) || null
			);
		}
		if (!parsed.treatment) return null;
		const clean = parsed.treatment.trim().toLowerCase();
		return (
			existingTreatmentItems.find(
				(item) => item.name.toLowerCase() === clean,
			) || null
		);
	}, [parsed.treatment, targetTreatmentId, existingTreatmentItems]);

	const doseSummary = useMemo(() => {
		if (!doseLayer || doseLayer.items.length === 0) return null;
		if (doseLayer.items.length === 1) return doseLayer.items[0].name;
		return `Titration (${doseLayer.items[0].name} start)`;
	}, [doseLayer]);

	const hasExisting = existingMetadata.length > 0;

	// Populate input field with current condition for fast editing
	const handleLoadCurrentIntoInput = () => {
		const parts: string[] = [];

		// Unified Treatment + Dose loading
		if (treatLayer && treatLayer.items.length > 0) {
			if (treatLayer.items.length === 1 && doseLayer && doseLayer.items.length > 0) {
				const tName = treatLayer.items[0].name;
				if (doseLayer.items.length === 1) {
					const dName = doseLayer.items[0].name.replace(/\s+/g, "");
					parts.push(`${tName} ${dName}`);
				} else {
					const startDose = doseLayer.items[0].name.replace(/\s+/g, "");
					parts.push(`${tName} ${startDose} /3`);
				}
			} else {
				parts.push(treatLayer.items.map((i) => i.name).join(" + "));
				if (doseLayer && doseLayer.items.length === 1) {
					parts.push(doseLayer.items[0].name.replace(/\s+/g, ""));
				}
			}
		} else if (doseLayer && doseLayer.items.length === 1) {
			parts.push(doseLayer.items[0].name.replace(/\s+/g, ""));
		}

		// Duration
		const durLayer = existingMetadata.find((m) => m.layerId === "duration");
		if (durLayer && durLayer.items.length > 0) {
			parts.push(durLayer.items[0].name);
		}

		// Biomarkers
		const bioLayer = existingMetadata.find((m) => m.layerId === "biomarker");
		if (bioLayer && bioLayer.items.length > 0) {
			parts.push(`m:${bioLayer.items.map((i) => i.name).join(",")}`);
		}

		// Status
		const statusLayer = existingMetadata.find((m) => m.layerId === "status");
		if (statusLayer && statusLayer.items.length > 0) {
			parts.push(`status:${statusLayer.items[0].name}`);
		}

		// Custom layers
		existingMetadata.forEach((m) => {
			if (!["treatment", "dose", "duration", "biomarker", "status"].includes(m.layerId)) {
				if (m.items.length > 0) {
					parts.push(`${m.layerId}:"${m.items[0].name}"`);
				}
			}
		});

		setInput(parts.join(" "));
		setMode("replace");
		if (inputRef.current) {
			inputRef.current.focus();
		}
	};

	// Human-readable summary of selected wells (e.g., "12 wells (B2:B13)")
	const selectionSummary = useMemo(() => {
		const count = selectedWells.size;
		if (count === 0) return "";
		if (count === 1) return `Well ${Array.from(selectedWells)[0]}`;
		if (geometry) {
			const rStart = String.fromCharCode(65 + geometry.minR);
			const rEnd = String.fromCharCode(65 + geometry.maxR);
			const cStart = geometry.minC + 1;
			const cEnd = geometry.maxC + 1;
			if (rStart === rEnd) {
				return `${count} wells (${rStart}${cStart}:${rStart}${cEnd})`;
			}
			if (cStart === cEnd) {
				return `${count} wells (${rStart}${cStart}:${rEnd}${cStart})`;
			}
			return `${count} wells (${rStart}${cStart}:${rEnd}${cEnd})`;
		}
		return `${count} wells selected`;
	}, [selectedWells, geometry]);

	const activeTargetTreatment =
		matchedExistingTreatment ||
		(targetTreatmentId
			? existingTreatmentItems.find((t) => t.id === targetTreatmentId) || null
			: null);

	const isTargetingComboTreatment =
		!!activeTargetTreatment &&
		mode !== "replace" &&
		existingTreatmentItems.length > 1;

	const handleFormSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!parsed.hasAnyMetadata) {
			onClose();
			return;
		}

		const isMulti = existingTreatmentItems.length > 1;
		const isUpdatingComboDose = isTargetingComboTreatment && isMulti;

		onApply({
			parsed,
			mode: isTargetingComboTreatment ? "update_treatment_dose" : mode,
			effectiveDirection,
			targetTreatmentId: activeTargetTreatment?.id || undefined,
			keepOpen: isUpdatingComboDose,
		});

		if (isUpdatingComboDose && activeTargetTreatment) {
			const savedName = activeTargetTreatment.name;
			setSaveFeedback(`Saved dose for ${savedName}`);
			setTimeout(() => setSaveFeedback(null), 3500);
			setInput("");
			// Auto-suggest next treatment without dose, if any
			const nextUndosed = existingTreatmentItems.find(
				(t) => t.id !== activeTargetTreatment.id && !getTreatmentDoseSummary(t.id),
			);
			if (nextUndosed) {
				setTargetTreatmentId(nextUndosed.id);
			} else {
				setTargetTreatmentId(null);
			}
			inputRef.current?.focus();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "Enter" && !parsed.hasAnyMetadata) {
			e.preventDefault();
			onClose();
		}
	};

	const toggleDirection = () => {
		setDirectionOverride((prev) => {
			const current = prev || inferredDirection;
			return current === "Right" ? "Down" : "Right";
		});
	};

	// Removal helpers for clicking newly parsed pills
	const removeTreatmentItem = (nameToRemove: string) => {
		const escaped = nameToRemove.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(?:,\\s*)?${escaped}(?:\\s+\\d+(?:\\.\\d+)?\\s*(?:[µuμnp]?[mM]|mg/ml|ug/ml|%))?(?:\\s*(?:/|1:)\\s*\\d+(?:\\.\\d+)?)?(?:\\s*,)?`, "i");
		let updated = input.replace(regex, " ").replace(/\s*,\s*,/g, ", ").trim();
		if (updated.startsWith(",")) updated = updated.slice(1).trim();
		if (updated.endsWith(",")) updated = updated.slice(0, -1).trim();
		setInput(updated);
	};

	const removeTreatment = () => {
		if (!parsed.treatment) return;
		const escaped = parsed.treatment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(?:t|treatment|compound|drug):(?:"${escaped}"|'${escaped}'|${escaped})|\\b${escaped}\\b`, "i");
		setInput((prev) => prev.replace(regex, " ").replace(/\s+/g, " ").trim());
	};

	const removeDose = () => {
		if (!parsed.dose) return;
		const escaped = parsed.dose.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(?:d|dose|conc|concentration):(?:"${escaped}"|'${escaped}'|${escaped})|\\b${escaped}\\b`, "i");
		setInput((prev) => prev.replace(regex, " ").replace(/\s+/g, " ").trim());
	};

	const removeDilution = () => {
		if (!parsed.dilution) return;
		const regex = /(?:^|\s)(?:\/|1:)\s*(\d+(?:\.\d+)?)(?:\s|$)/;
		setInput((prev) => prev.replace(regex, " ").replace(/\s+/g, " ").trim());
	};

	const removeDuration = () => {
		if (!parsed.duration) return;
		const escaped = parsed.duration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(?:dur|duration|time):(?:"[^"]+"|'[^']+'|[^\\s]+)|\\b${escaped}\\b`, "i");
		setInput((prev) => prev.replace(regex, " ").replace(/\s+/g, " ").trim());
	};

	const removeBiomarker = (bioName: string) => {
		const escaped = bioName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		let updated = input.replace(new RegExp(`([,+]?\\s*)${escaped}(\\s*[,+]?)`, "i"), (match, p1, p2) => {
			if (p1 && p2) return ", ";
			return " ";
		});
		updated = updated.replace(/\b(bio|b|biomarker|readout|stain|m|marker|markers|if|icc):\s*(?=[,\s]|$)/gi, " ");
		setInput(updated.replace(/\s+/g, " ").trim());
	};

	const removeStatus = () => {
		if (!parsed.status) return;
		const escaped = parsed.status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(?:s|status):(?:"[^"]+"|'[^']+'|[^\\s]+)|\\b${escaped}\\b`, "i");
		setInput((prev) => prev.replace(regex, " ").replace(/\s+/g, " ").trim());
	};

	const removeCustomLayer = (layerId: string) => {
		const regex = new RegExp(`\\b${layerId}:(?:"[^"]+"|'[^']+'|[^\\s]+)`, "i");
		setInput((prev) => prev.replace(regex, " ").replace(/\s+/g, " ").trim());
	};

	return (
		<div
			data-quick-popover="true"
			onPointerDown={(e) => e.stopPropagation()}
			className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-5 transition-all text-slate-800"
			onKeyDown={handleKeyDown}
		>
			<div className="flex items-center justify-between mb-3.5">
				<div className="flex items-center gap-2.5">
					<div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-[#2E59A7] font-bold shadow-xs">
						<Sparkles className="w-4 h-4" />
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-bold text-slate-800">Quick Apply & Edit</span>
						<span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
							{selectionSummary}
						</span>
					</div>
				</div>

				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => setShowHelp(!showHelp)}
						className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
						title="Quick Syntax Help"
					>
						<HelpCircle className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
						title="Close (Esc)"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Syntax Help Drawer */}
			{showHelp && (
				<div className="mb-3.5 p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-slate-700 space-y-1.5 animate-fadeIn">
					<div className="font-semibold text-blue-900">Natural Shorthand Examples:</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[11px] text-slate-800">
						<div>• <span className="font-bold">ABT-737 10uM</span> (Drug + Dose)</div>
						<div>• <span className="font-bold">BAY-876 10uM /3</span> (1:3 Titration)</div>
						<div>• <span className="font-bold">m:GFP,RFP,DAPI</span> (Multi-marker)</div>
						<div>• <span className="font-bold">if:Ki67 + Caspase-3</span> (IF stains)</div>
						<div>• <span className="font-bold">icc:beta-tubulin</span> (ICC readout)</div>
						<div>• <span className="font-bold">DMSO 0.1% 24h</span> (Vehicle + Time)</div>
					</div>
				</div>
			)}

			{/* Section 1: CURRENT WELL STATE INSPECTOR (All Layers - simplified without label text) */}
			{hasExisting && (
				<div className="mb-3.5 p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 text-xs space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
							<Layers className="w-3.5 h-3.5 text-slate-400" />
							Current on Selection:
						</span>
						<button
							type="button"
							onClick={handleLoadCurrentIntoInput}
							className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-[#2E59A7] hover:bg-blue-100 font-semibold text-xs transition-colors cursor-pointer border border-blue-200 shadow-2xs"
							title="Load current condition into the input bar to edit it"
						>
							<Edit2 className="w-3 h-3" />
							Load to Edit
						</button>
					</div>

					<div className="flex flex-wrap gap-2 items-center">
						{/* Per-Treatment Chips with direct click-to-target editing */}
						{existingTreatmentItems.map((item) => {
							const itemDose = getTreatmentDoseSummary(item.id);
							const isTargeted = targetTreatmentId === item.id;
							return (
								<div
									key={`treatment-${item.id}`}
									onClick={() => {
										if (targetTreatmentId === item.id) {
											setTargetTreatmentId(null);
											setInput("");
										} else {
											setTargetTreatmentId(item.id);
											setInput(itemDose ? `${item.name} ${itemDose} ` : `${item.name} `);
											setMode("update_treatment_dose");
											inputRef.current?.focus();
										}
									}}
									className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shadow-2xs transition-all cursor-pointer select-none ${
										isTargeted
											? "bg-blue-100 text-blue-900 border-[#2E59A7] ring-2 ring-[#2E59A7]/40 shadow-xs"
											: "bg-blue-50 hover:bg-blue-100/70 text-blue-900 border-blue-200"
									}`}
									title={`Click to select ${item.name} and edit dose/condition`}
								>
									<span className="font-bold text-slate-800">{item.name}</span>

									{itemDose && (
										<div className="inline-flex items-center gap-1 font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-xs border border-amber-300/80 shadow-2xs">
											<span
												className="flex items-center gap-1 cursor-pointer hover:underline"
												title={`Dose: ${itemDose}`}
											>
												<span>{itemDose}</span>
												<Edit2 className="w-2.5 h-2.5 opacity-60" />
											</span>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onRemoveExistingLayer("treatment_dose", undefined, item.id);
												}}
												className="p-0.5 rounded-full hover:bg-amber-200 text-amber-600 hover:text-amber-900 transition-colors cursor-pointer ml-0.5"
												title={`Clear dose for ${item.name}`}
											>
												<X className="w-2.5 h-2.5" />
											</button>
										</div>
									)}

									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onRemoveExistingLayer("treatment", item.id);
										}}
										className="p-1 rounded-full hover:bg-black/10 transition-colors cursor-pointer opacity-60 hover:opacity-100 ml-0.5"
										title={`Remove ${item.name} from selection`}
									>
										<X className="w-3 h-3" />
									</button>
								</div>
							);
						})}

						{/* Standalone Dose Chip only if dose exists without any treatment */}
						{existingTreatmentItems.length === 0 && doseSummary && doseLayer && (
							<span
								onClick={() => {
									setInput(`${doseSummary} `);
									inputRef.current?.focus();
								}}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-2xs bg-amber-50 text-amber-900 border-amber-200 cursor-pointer hover:bg-amber-100 transition-all select-none"
								title={`Click to edit dose: ${doseSummary}`}
							>
								<span>{doseSummary}</span>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onRemoveExistingLayer("dose");
									}}
									className="p-0.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer opacity-60 hover:opacity-100 ml-0.5"
									title="Remove dose from selection"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						)}

						{/* All other layers - clickable to edit, with color coded pills */}
						{existingMetadata
							.filter((layer) => layer.layerId !== "treatment" && layer.layerId !== "dose")
							.map((layer) =>
								layer.items.map((item) => (
									<span
										key={`${layer.layerId}-${item.id}`}
										onClick={() => {
											let prefix = "";
											if (layer.layerId === "duration") prefix = "time:";
											else if (layer.layerId === "biomarker") prefix = "m:";
											else if (layer.layerId === "status") prefix = "status:";
											else prefix = `${layer.layerId}:`;
											setInput(`${prefix}${item.name} `);
											inputRef.current?.focus();
										}}
										title={`Click to edit ${layer.layerName}: ${item.name}`}
										className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-2xs cursor-pointer hover:opacity-90 transition-all select-none ${
											layer.layerId === "duration"
												? "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
												: layer.layerId === "biomarker"
													? "bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100"
													: layer.layerId === "status"
														? "bg-teal-50 text-teal-900 border-teal-200 hover:bg-teal-100"
														: "bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200"
										}`}
									>
										<span>{item.name}</span>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onRemoveExistingLayer(layer.layerId, item.id);
											}}
											className="p-0.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer opacity-60 hover:opacity-100 ml-0.5"
											title={`Remove ${item.name} (${layer.layerName}) from selection`}
										>
											<X className="w-3 h-3" />
										</button>
									</span>
								))
							)}
					</div>
				</div>
			)}

			{/* Section 2: EDIT / NEW CONDITION INPUT FORM */}
			<form onSubmit={handleFormSubmit} className="space-y-3">
				<div className="relative">
					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder={
							hasExisting
								? "Type condition (e.g. 5uM 48h, or Paclitaxel 100nM, Cisplatin 10uM)..."
								: "e.g. ABT-737 10uM, Paclitaxel 50nM 24h m:GFP,DAPI"
						}
						className="w-full text-sm font-medium text-slate-800 bg-white border border-slate-300 focus:border-[#2E59A7] focus:ring-2 focus:ring-blue-100 rounded-xl px-4 py-2.5 outline-none transition-all placeholder:text-slate-400"
					/>
				</div>

				{/* Unified Live Preview Badges */}
				{parsed.hasAnyMetadata && (
					<div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/90 text-xs animate-fadeIn">
						{/* Real-time Parsed Category Badges */}
						<div className="flex flex-wrap items-center gap-1.5">
							{/* Multi-Treatment Badges */}
							{parsed.treatments && parsed.treatments.length > 0 ? (
								parsed.treatments.map((tItem, idx) => (
									<span
										key={`parsed-t-${tItem.name}-${idx}`}
										className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#2E59A7] border border-blue-200 text-xs font-semibold shadow-2xs"
									>
										<span>{tItem.name}</span>
										{tItem.dose && (
											<span className="font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[11px] border border-amber-300/80 shadow-2xs">
												{tItem.dose.displayText}
												{tItem.dilution ? ` /${tItem.dilution.factor}` : ""}
											</span>
										)}
										<button
											type="button"
											onClick={() => removeTreatmentItem(tItem.name)}
											className="p-0.5 rounded-full hover:bg-blue-200 text-blue-500 hover:text-blue-800 transition-colors cursor-pointer ml-0.5"
											title={`Remove ${tItem.name}`}
										>
											<X className="w-3 h-3" />
										</button>
									</span>
								))
							) : parsed.treatment && !targetTreatmentId && !matchedExistingTreatment ? (
								<span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 text-[#2E59A7] border border-blue-200 text-xs font-semibold shadow-2xs">
									<span>{parsed.treatment}</span>
									<button
										type="button"
										onClick={removeTreatment}
										className="p-0.5 rounded-full hover:bg-blue-200 text-blue-500 hover:text-blue-800 transition-colors cursor-pointer ml-0.5"
										title="Remove treatment"
									>
										<X className="w-3 h-3" />
									</button>
								</span>
							) : null}

							{/* Global Dose Badge (if not already shown on per-treatment pills) */}
							{parsed.dose && !parsed.treatments?.some((t) => t.dose) && (
								<span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold shadow-2xs">
									<span>{parsed.dose.displayText}</span>
									<button
										type="button"
										onClick={removeDose}
										className="p-0.5 rounded-full hover:bg-amber-200 text-amber-600 hover:text-amber-900 transition-colors cursor-pointer ml-0.5"
										title="Remove dose"
									>
										<X className="w-3 h-3" />
									</button>
								</span>
							)}

							{/* Global Dilution Badge (if not already shown on per-treatment pills) */}
							{parsed.dilution && !parsed.treatments?.some((t) => t.dilution) && (
								<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-900 border border-purple-200 text-xs font-semibold shadow-2xs">
									<span>1:{parsed.dilution.factor}</span>
									<button
										type="button"
										onClick={toggleDirection}
										className="inline-flex items-center gap-0.5 bg-white px-2 py-0.5 rounded-full text-[11px] border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
										title="Click to toggle direction"
									>
										{effectiveDirection === "Right" ? (
											<>
												<ArrowRight className="w-3 h-3 text-purple-600" />
												<span>Right</span>
											</>
										) : (
											<>
												<ArrowDown className="w-3 h-3 text-purple-600" />
												<span>Down</span>
											</>
										)}
										{directionOverride === null && (
											<span className="text-[9px] text-purple-400 font-normal ml-0.5">auto</span>
										)}
									</button>
									<button
										type="button"
										onClick={removeDilution}
										className="p-0.5 rounded-full hover:bg-purple-200 text-purple-400 hover:text-purple-700 transition-colors cursor-pointer ml-0.5"
										title="Remove titration"
									>
										<X className="w-3 h-3" />
									</button>
								</span>
							)}

							{parsed.duration && (
								<span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold shadow-2xs">
									<span>{parsed.duration}</span>
									<button
										type="button"
										onClick={removeDuration}
										className="p-0.5 rounded-full hover:bg-emerald-200 text-emerald-600 hover:text-emerald-900 transition-colors cursor-pointer ml-0.5"
										title="Remove duration"
									>
										<X className="w-3 h-3" />
									</button>
								</span>
							)}

							{parsed.biomarkers.map((bio, idx) => (
								<span
									key={`${bio}-${idx}`}
									className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 text-rose-900 border border-rose-200 text-xs font-semibold shadow-2xs"
								>
									<span>{bio}</span>
									<button
										type="button"
										onClick={() => removeBiomarker(bio)}
										className="p-0.5 rounded-full hover:bg-rose-200 text-rose-500 hover:text-rose-900 transition-colors cursor-pointer ml-0.5"
										title={`Remove ${bio}`}
									>
										<X className="w-3 h-3" />
									</button>
								</span>
							))}

							{parsed.status && (
								<span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal-50 text-teal-900 border border-teal-200 text-xs font-semibold shadow-2xs">
									<span>{parsed.status}</span>
									<button
										type="button"
										onClick={removeStatus}
										className="p-0.5 rounded-full hover:bg-teal-200 text-teal-600 hover:text-teal-900 transition-colors cursor-pointer ml-0.5"
										title="Remove status"
									>
										<X className="w-3 h-3" />
									</button>
								</span>
							)}

							{Object.entries(parsed.customLayers).map(([layerId, val]) => (
								<span
									key={layerId}
									className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold shadow-2xs"
								>
									<span>{val}</span>
									<button
										type="button"
										onClick={() => removeCustomLayer(layerId)}
										className="p-0.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer ml-0.5"
										title={`Remove ${layerId}`}
									>
										<X className="w-3 h-3" />
									</button>
								</span>
							))}
						</div>
					</div>
				)}

				{/* Section 4: SUBMIT & CLOSE FOOTER */}
				<div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
					<div className="flex items-center gap-2 text-xs text-slate-400">
						<span>
							Press <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-300 rounded font-mono">Enter</kbd> to {activeTargetTreatment && parsed.dose ? "save dose" : "apply"}, <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-300 rounded font-mono">Esc</kbd> to close
						</span>
						{saveFeedback && (
							<span className="font-semibold text-emerald-600 animate-fadeIn flex items-center gap-1">
								✓ {saveFeedback}
							</span>
						)}
					</div>

					<div className="flex items-center gap-2 ml-auto">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
						>
							{existingTreatmentItems.length > 1 ? "Done" : "Cancel"}
						</button>
						<button
							type="submit"
							disabled={!parsed.hasAnyMetadata}
							className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
								parsed.hasAnyMetadata
									? "bg-[#2E59A7] hover:bg-[#1E3F78] text-white cursor-pointer"
									: "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
							}`}
						>
							<Sparkles className="w-4 h-4" />
							<span>
								{activeTargetTreatment && parsed.dose
									? `Save Dose for ${activeTargetTreatment.name}`
									: "Apply Changes"}
							</span>
						</button>
					</div>
				</div>
			</form>
		</div>
	);
};
