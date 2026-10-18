import React, { useState } from "react";
import { X, CheckSquare, Square, Layers, Sparkles } from "lucide-react";

export interface PlateClipboard {
	sourceWells: string[];
	geometry: {
		minR: number;
		maxR: number;
		minC: number;
		maxC: number;
		rowCount: number;
		colCount: number;
	};
	wellsData: Record<string, any>;
}

interface PasteSpecialModalProps {
	isOpen: boolean;
	onClose: () => void;
	clipboard: PlateClipboard | null;
	selectedWellsCount: number;
	layers: Array<{ id: string; name: string }>;
	onPaste: (options: {
		layersToCopy: string[];
		mode: "merge" | "overwrite";
	}) => void;
}

export const PasteSpecialModal: React.FC<PasteSpecialModalProps> = ({
	isOpen,
	onClose,
	clipboard,
	selectedWellsCount,
	layers,
	onPaste,
}) => {
	const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
		new Set(["treatment", "dose"])
	);
	const [pasteMode, setPasteMode] = useState<"merge" | "overwrite">("merge");

	if (!isOpen || !clipboard) return null;

	const sourceCount = clipboard.sourceWells.length;
	const sourceSummary =
		clipboard.geometry.rowCount === 1
			? `${sourceCount} wells (${String.fromCharCode(65 + clipboard.geometry.minR)}${clipboard.geometry.minC + 1}:${String.fromCharCode(65 + clipboard.geometry.minR)}${clipboard.geometry.maxC + 1})`
			: `${sourceCount} wells`;

	const toggleLayer = (layerId: string) => {
		setSelectedLayers((prev) => {
			const next = new Set(prev);
			if (next.has(layerId)) {
				next.delete(layerId);
			} else {
				next.add(layerId);
			}
			return next;
		});
	};

	const selectPreset = (preset: "treatment_dose" | "all" | "dose_only" | "biomarkers_only") => {
		if (preset === "treatment_dose") {
			setSelectedLayers(new Set(["treatment", "dose"]));
		} else if (preset === "all") {
			setSelectedLayers(new Set(layers.map((l) => l.id)));
		} else if (preset === "dose_only") {
			setSelectedLayers(new Set(["dose"]));
		} else if (preset === "biomarkers_only") {
			setSelectedLayers(new Set(["biomarker"]));
		}
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (selectedLayers.size === 0) return;
		onPaste({
			layersToCopy: Array.from(selectedLayers),
			mode: pasteMode,
		});
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
			<div
				className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scaleIn"
				onKeyDown={(e) => {
					if (e.key === "Escape") onClose();
				}}
			>
				{/* Modal Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
					<div className="flex items-center gap-2.5">
						<div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-[#2E59A7] font-bold shadow-xs">
							<Layers className="w-4 h-4" />
						</div>
						<div>
							<h3 className="text-base font-bold text-slate-900">Paste Special</h3>
							<p className="text-xs text-slate-500">
								Choose which metadata layers to transfer
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-6 space-y-5">
					{/* Source & Destination Badges */}
					<div className="grid grid-cols-2 gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs">
						<div>
							<span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
								Clipboard Source
							</span>
							<span className="font-semibold text-slate-800">{sourceSummary}</span>
						</div>
						<div>
							<span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
								Target Selection
							</span>
							<span className="font-semibold text-slate-800">{selectedWellsCount} wells</span>
						</div>
					</div>

					{/* Quick Presets */}
					<div>
						<label className="block text-xs font-bold text-slate-600 uppercase mb-2">
							Quick Presets
						</label>
						<div className="flex flex-wrap gap-1.5">
							<button
								type="button"
								onClick={() => selectPreset("treatment_dose")}
								className="px-3.5 py-1 text-xs rounded-full font-semibold border border-blue-200 bg-blue-50 text-[#2E59A7] hover:bg-blue-100 transition-colors cursor-pointer"
							>
								Treatment + Dose
							</button>
							<button
								type="button"
								onClick={() => selectPreset("all")}
								className="px-3.5 py-1 text-xs rounded-full font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
							>
								All Layers
							</button>
							<button
								type="button"
								onClick={() => selectPreset("dose_only")}
								className="px-3.5 py-1 text-xs rounded-full font-semibold border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
							>
								Dose Only
							</button>
							<button
								type="button"
								onClick={() => selectPreset("biomarkers_only")}
								className="px-3.5 py-1 text-xs rounded-full font-semibold border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors cursor-pointer"
							>
								Biomarkers Only
							</button>
						</div>
					</div>

					{/* Metadata Layers Checkbox Matrix */}
					<div>
						<label className="block text-xs font-bold text-slate-600 uppercase mb-2">
							Select Layers to Paste
						</label>
						<div className="grid grid-cols-2 gap-2 border border-slate-200 rounded-xl p-3 bg-white max-h-48 overflow-y-auto">
							{layers.map((layer) => {
								const isChecked = selectedLayers.has(layer.id);
								return (
									<button
										key={layer.id}
										type="button"
										onClick={() => toggleLayer(layer.id)}
										className={`flex items-center gap-2 p-2 rounded-xl text-xs font-medium text-left transition-colors cursor-pointer ${
											isChecked
												? "bg-blue-50/80 text-blue-900 border border-blue-200"
												: "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"
										}`}
									>
										{isChecked ? (
											<CheckSquare className="w-4 h-4 text-[#2E59A7] shrink-0" />
										) : (
											<Square className="w-4 h-4 text-slate-400 shrink-0" />
										)}
										<span className="truncate">{layer.name}</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* Paste Mode (Merge vs Overwrite) */}
					<div>
						<label className="block text-xs font-bold text-slate-600 uppercase mb-2">
							Paste Transfer Mode
						</label>
						<div className="grid grid-cols-2 gap-2">
							<button
								type="button"
								onClick={() => setPasteMode("merge")}
								className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
									pasteMode === "merge"
										? "bg-blue-50 border-[#2E59A7] text-[#2E59A7] font-semibold ring-1 ring-[#2E59A7]/30"
										: "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
								}`}
							>
								<div className="font-bold text-xs">Merge / Add</div>
								<div className="text-[11px] font-normal opacity-80 mt-0.5">
									Preserve existing uncopied layers on target
								</div>
							</button>
							<button
								type="button"
								onClick={() => setPasteMode("overwrite")}
								className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
									pasteMode === "overwrite"
										? "bg-slate-100 border-slate-700 text-slate-900 font-semibold ring-1 ring-slate-700/30"
										: "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
								}`}
							>
								<div className="font-bold text-xs">Replace / Overwrite</div>
								<div className="text-[11px] font-normal opacity-80 mt-0.5">
									Clear uncopied layers on target wells
								</div>
							</button>
						</div>
					</div>

					{/* Modal Footer */}
					<div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={selectedLayers.size === 0}
							className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
								selectedLayers.size > 0
									? "bg-[#2E59A7] hover:bg-[#1E3F78] text-white cursor-pointer"
									: "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
							}`}
						>
							<Sparkles className="w-4 h-4" />
							<span>Paste ({selectedLayers.size} Layers)</span>
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
