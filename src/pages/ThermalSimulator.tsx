import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Printer, FileText, FileJson, Binary } from "lucide-react";
import Header from "../components/Header";
import {
  buildSampleDocument,
  THERMAL_DATASETS,
  THERMAL_KINDS,
  type ThermalDatasetId,
  type ThermalKind,
} from "../lib/thermalSamples";

interface ThermalPreviewResult {
  text: string;
  decoded_commands: string[];
  bytes_base64: string;
  line_count: number;
  columns: number;
}

type PaperId = 58 | 80;

const PAPERS: { id: PaperId; label: string }[] = [
  { id: 58, label: "58 mm" },
  { id: 80, label: "80 mm" },
];

function download(filename: string, data: BlobPart, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o.id
              ? "bg-indigo-600 text-white"
              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ThermalSimulator() {
  const [paper, setPaper] = useState<PaperId>(80);
  const [kind, setKind] = useState<ThermalKind>("receipt");
  const [dataset, setDataset] = useState<ThermalDatasetId>("minimal");
  const [tab, setTab] = useState<"text" | "commands">("text");
  const [preview, setPreview] = useState<ThermalPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const runRender = useCallback(async () => {
    setRendering(true);
    setError(null);
    try {
      const result = await invoke<ThermalPreviewResult>("thermal_preview", {
        document: buildSampleDocument(kind, dataset),
        layoutJson: null,
        paperWidthMm: paper,
      });
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setError(String(err));
    } finally {
      setRendering(false);
    }
  }, [kind, dataset, paper]);

  useEffect(() => {
    runRender();
  }, [runRender]);

  const fileBase = `${kind}_${paper}mm_${dataset}`;

  const exportTxt = () =>
    preview && download(`${fileBase}.txt`, preview.text, "text/plain;charset=utf-8");
  const exportBin = () => {
    if (!preview) return;
    download(`${fileBase}.bin`, base64ToBytes(preview.bytes_base64), "application/octet-stream");
  };
  const exportJson = () =>
    preview &&
    download(
      `${fileBase}.json`,
      JSON.stringify(buildSampleDocument(kind, dataset), null, 2),
      "application/json",
    );

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 font-sans overflow-hidden">
      <Header
        title="Thermal Printer Simulator"
        subtitle="Development-only preview of the ESC/POS pipeline — no hardware involved"
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Paper <Segmented options={PAPERS} value={paper} onChange={setPaper} />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Receipt <Segmented options={THERMAL_KINDS} value={kind} onChange={setKind} />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Test Data{" "}
                <Segmented options={THERMAL_DATASETS} value={dataset} onChange={setDataset} />
              </label>

              <button
                onClick={runRender}
                disabled={rendering}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                <Printer size={16} /> {rendering ? "Rendering…" : "Render"}
              </button>
            </div>

            {preview && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Profile: {paper}mm / <span className="font-semibold">{preview.columns}</span>{" "}
                columns &nbsp;·&nbsp; Lines (incl. cut margin):{" "}
                <span className="font-semibold">{preview.line_count}</span> &nbsp;·&nbsp; Bytes:{" "}
                <span className="font-semibold">{atob(preview.bytes_base64).length}</span>
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}

          {preview && (
            <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between">
                <Segmented
                  options={[
                    { id: "text" as const, label: "Text" },
                    { id: "commands" as const, label: "ESC/POS Commands" },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportTxt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <FileText size={14} /> Export TXT
                  </button>
                  <button
                    onClick={exportBin}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Binary size={14} /> Export BIN
                  </button>
                  <button
                    onClick={exportJson}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <FileJson size={14} /> Export JSON
                  </button>
                </div>
              </div>

              <div className="p-4 flex justify-center bg-slate-100 dark:bg-black/30">
                <div
                  className="bg-white text-black shadow-md rounded-sm"
                  style={{ width: paper === 58 ? 300 : 430 }}
                >
                  {tab === "text" ? (
                    <pre className="font-mono text-[12px] leading-[1.4] whitespace-pre-wrap break-all p-3">
                      {preview.text}
                    </pre>
                  ) : (
                    <pre className="font-mono text-[11px] leading-[1.5] whitespace-pre-wrap p-3 max-h-[60vh] overflow-auto custom-scrollbar">
                      {preview.decoded_commands.join("\n")}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
