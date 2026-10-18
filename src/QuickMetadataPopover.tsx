import React, { useState, useMemo, useEffect, useRef } from "react";
import {
	X,
	Sparkles,
	ArrowRight,
	ArrowDown,
	HelpCircle,
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
	duration?: string;
	biomarker?: string | string[];
	status?: string;
	[key: string]: unknown;
}

interface QuickMetadataPopoverProps {
	selectedWells: Set<string>;
	plateFormat: string;
	wells: Record<string, WellItem>;
	layers: Array<{ id: string; name: string }>;
	labels: Record<string, LabelItem[]>;
	onApply: (params: {
		parsed: ParsedQuickCondition;
		mode: "add" | "replace";
		effectiveDirection: "Right" | "Down";
	}) => void;
	onClose: () => void;
}

export const QuickMetadataPopover: React.FC<QuickMetadataPopoverProps> = ({
	selectedWells,
	wells,
	layers,
	labels,
	onApply,
	onClose,
}) => {
	const [input, setInput] = useState("");
	const [mode, setMode] = useState<"add" | "replace">("add");
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

	// Inspect existing treatments already applied to any of the selected wells
	const existingTreatments = useMemo(() => {
		const names = new Set<string>();
		selectedWells.forEach((key) => {
			const w = wells[key];
			if (!w || !w.treatment) return;
			const tIds = Array.isArray(w.treatment) ? w.treatment : [w.treatment];
			tIds.forEach((id: string) => {
				const found = (labels.treatment || []).find((l: LabelItem) => l.id === id);
				if (found?.name) names.add(found.name);
			});
		});
		return Array.from(names);
	}, [selectedWells, wells, labels.treatment]);

	const hasExisting = existingTreatments.length > 0;

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

	const handleFormSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!parsed.hasAnyMetadata) return;
		onApply({
			parsed,
			mode,
			effectiveDirection,
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
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

	// Removal helpers for clicking pills
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
		// Remove within a delimiter-separated list or standalone token
		let updated = input.replace(new RegExp(`([,+]?\\s*)${escaped}(\\s*[,+]?)`, "i"), (match, p1, p2) => {
			if (p1 && p2) return ", ";
			return " ";
		});
		// Clean up empty biomarker prefixes if no markers left in that prefix
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
			className="w-full max-w-2xl bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 shadow-2xl p-4 transition-all duration-200"
			onKeyDown={handleKeyDown}
		>
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#2E59A7] text-white shadow-xs">
						<Sparkles className="w-4 h-4" />
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-bold text-slate-800">Quick Apply Condition</span>
						<span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
							{selectionSummary}
						</span>
					</div>
				</div>

				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => setShowHelp(!showHelp)}
						className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
						title="Quick Syntax Help"
					>
						<HelpCircle className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={onClose}
						className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
						title="Close (Esc)"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{showHelp && (
				<div className="mb-3 p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-slate-700 space-y-1.5 animate-fadeIn">
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

			<form onSubmit={handleFormSubmit} className="space-y-3">
				{/* Main Omnibox Input */}
				<div className="relative">
					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="e.g. ABT-737 10uM /3 24h m:GFP,DAPI  or  DMSO 0.1%"
						className="w-full text-base font-medium text-slate-900 bg-slate-50/60 focus:bg-white border border-slate-300 focus:border-[#2E59A7] focus:ring-2 focus:ring-blue-100 rounded-xl px-4 py-2.5 outline-none transition-all shadow-inner placeholder:text-slate-400"
					/>
				</div>

				{/* Real-time Parsed Category Badges */}
				{parsed.hasAnyMetadata ? (
					<div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50/80 rounded-xl border border-slate-200/80 min-h-[38px]">
						<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mr-1 select-none">
							Parsed:
						</span>

						{parsed.treatment && (
							<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-[#2E59A7] border border-blue-200 text-xs font-semibold shadow-2xs">
								<span className="text-[10px] uppercase font-bold text-blue-400">Treatment</span>
								<span>{parsed.treatment}</span>
								<button
									type="button"
									onClick={removeTreatment}
									className="p-0.5 rounded-full hover:bg-blue-200 text-blue-400 hover:text-blue-700 transition-colors cursor-pointer ml-0.5"
									title="Remove treatment"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						)}

						{parsed.dose && (
							<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold shadow-2xs">
								<span className="text-[10px] uppercase font-bold text-amber-500">Dose</span>
								<span>{parsed.dose.displayText}</span>
								<button
									type="button"
									onClick={removeDose}
									className="p-0.5 rounded-full hover:bg-amber-200 text-amber-500 hover:text-amber-800 transition-colors cursor-pointer ml-0.5"
									title="Remove dose"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						)}

						{parsed.dilution && (
							<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 text-xs font-semibold shadow-2xs">
								<span className="text-[10px] uppercase font-bold text-purple-400">Titration</span>
								<span>1:{parsed.dilution.factor}</span>
								<button
									type="button"
									onClick={toggleDirection}
									className="inline-flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded text-[11px] border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
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
							<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold shadow-2xs">
								<span className="text-[10px] uppercase font-bold text-emerald-500">Duration</span>
								<span>{parsed.duration}</span>
								<button
									type="button"
									onClick={removeDuration}
									className="p-0.5 rounded-full hover:bg-emerald-200 text-emerald-500 hover:text-emerald-800 transition-colors cursor-pointer ml-0.5"
									title="Remove duration"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						)}

						{parsed.biomarkers.map((bio, idx) => (
							<span
								key={`${bio}-${idx}`}
								className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs font-semibold shadow-2xs"
							>
								<span className="text-[10px] uppercase font-bold text-rose-400">Biomarker</span>
								<span>{bio}</span>
								<button
									type="button"
									onClick={() => removeBiomarker(bio)}
									className="p-0.5 rounded-full hover:bg-rose-200 text-rose-400 hover:text-rose-800 transition-colors cursor-pointer ml-0.5"
									title={`Remove ${bio}`}
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						))}

						{parsed.status && (
							<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-xs font-semibold shadow-2xs">
								<span className="text-[10px] uppercase font-bold text-teal-500">Status</span>
								<span>{parsed.status}</span>
								<button
									type="button"
									onClick={removeStatus}
									className="p-0.5 rounded-full hover:bg-teal-200 text-teal-500 hover:text-teal-800 transition-colors cursor-pointer ml-0.5"
									title="Remove status"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						)}

						{Object.entries(parsed.customLayers).map(([layerId, val]) => (
							<span
								key={layerId}
								className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold shadow-2xs"
							>
								<span className="text-[10px] uppercase font-bold text-slate-400">{layerId}</span>
								<span>{val}</span>
								<button
									type="button"
									onClick={() => removeCustomLayer(layerId)}
									className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer ml-0.5"
									title={`Remove ${layerId}`}
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						))}
					</div>
				) : (
					<div className="text-xs text-slate-400 italic py-1 px-1 flex items-center gap-1.5">
						<span>Type any compound name, concentration, dilution (/3), or readout above...</span>
					</div>
				)}

				{/* Sequential Combo Mode Controls */}
				<div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
					{hasExisting ? (
						<div className="flex items-center gap-2">
							<span className="text-xs text-slate-500">
								Existing: <strong className="text-slate-800">{existingTreatments.join(" + ")}</strong>
							</span>
							<div className="flex items-center border border-slate-300 rounded-lg p-0.5 bg-slate-50 text-xs font-medium">
								<button
									type="button"
									onClick={() => setMode("add")}
									className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
										mode === "add"
											? "bg-[#2E59A7] text-white shadow-2xs"
											: "text-slate-600 hover:text-slate-900"
									}`}
								>
									+ Add as Combo
								</button>
								<button
									type="button"
									onClick={() => setMode("replace")}
									className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
										mode === "replace"
											? "bg-slate-700 text-white shadow-2xs"
											: "text-slate-600 hover:text-slate-900"
									}`}
								>
									↺ Replace
								</button>
							</div>
						</div>
					) : (
						<div className="text-xs text-slate-400">
							Press <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-300 rounded font-mono">Enter</kbd> to apply, <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-300 rounded font-mono">Esc</kbd> to close
						</div>
					)}

					<div className="flex items-center gap-2 ml-auto">
						<button
							type="button"
							onClick={onClose}
							className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!parsed.hasAnyMetadata}
							className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
								parsed.hasAnyMetadata
									? "bg-[#2E59A7] hover:bg-[#1E3F78] text-white cursor-pointer"
									: "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
							}`}
						>
							<Sparkles className="w-3.5 h-3.5" />
							<span>Apply to Selection</span>
						</button>
					</div>
				</div>
			</form>
		</div>
	);
};
