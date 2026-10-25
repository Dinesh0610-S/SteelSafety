import React, { useState, useMemo, useRef } from 'react'
import {
  Upload, Download, RefreshCw, Sliders, CheckCircle2,
  AlertTriangle, Info, FileSpreadsheet, BarChart2, ShieldCheck,
  Cpu, Layers, Sparkles, Filter, ChevronRight
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { AccessGate } from '../components/AccessGate'
import { useApp } from '../context/AppContext'
import {
  BENCHMARK_CLASSES,
  generateDefaultBenchmarkDataset,
  ModelPerformanceEvaluator
} from '../services/modelPerformanceService'
import { clsx } from 'clsx'

export default function ModelPerformance() {
  const { currentUser, showToast } = useApp()
  const fileInputRef = useRef(null)

  // Current dataset (default industrial or user-uploaded)
  const [dataset, setDataset] = useState(() => generateDefaultBenchmarkDataset())
  const [datasetName, setDatasetName] = useState('Standard Steel Foundry Validation Set (320 Samples)')
  const [isCustomUploaded, setIsCustomUploaded] = useState(false)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.50)

  // Evaluate performance dynamically
  const metrics = useMemo(() => {
    return ModelPerformanceEvaluator.evaluate(dataset, confidenceThreshold, BENCHMARK_CLASSES)
  }, [dataset, confidenceThreshold])

  if (!currentUser) {
    return <AccessGate pageName="Model Performance Evaluation" />
  }

  // Handle custom file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result
        if (typeof text !== 'string') return
        const parsed = ModelPerformanceEvaluator.parseUploadedFile(text, file.name)
        if (parsed.length === 0) {
          throw new Error('No valid evaluation samples found in file.')
        }
        setDataset(parsed)
        setDatasetName(`${file.name} (${parsed.length} Samples)`)
        setIsCustomUploaded(true)
        showToast({
          title: 'Custom Test Set Loaded',
          message: `Successfully evaluated ${parsed.length} labeled test records across model classes.`,
          variant: 'success',
        })
      } catch (err) {
        showToast({
          title: 'Upload Evaluation Error',
          message: err.message || 'Failed to parse labeled dataset. Ensure CSV has ground_truth and prediction columns.',
          variant: 'destructive',
        })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Download Sample CSV
  const handleDownloadSampleCSV = () => {
    const csv = ModelPerformanceEvaluator.generateSampleCSV(dataset)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `steelsafe-model-eval-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast({
      title: 'Benchmark Dataset Exported',
      message: 'Downloaded CSV template with labeled ground truth and predictions.',
      variant: 'default',
    })
  }

  // Reset to default
  const handleResetDefault = () => {
    setDataset(generateDefaultBenchmarkDataset())
    setDatasetName('Standard Steel Foundry Validation Set (320 Samples)')
    setIsCustomUploaded(false)
    showToast({
      title: 'Dataset Reset',
      message: 'Restored standard industrial test set (320 annotated frames).',
      variant: 'default',
    })
  }

  // Find max value in matrix for heatmap intensity scaling
  const maxMatrixVal = useMemo(() => {
    let max = 1
    BENCHMARK_CLASSES.forEach(gt => {
      BENCHMARK_CLASSES.forEach(pred => {
        const v = metrics.matrix[gt]?.[pred] || 0
        if (v > max) max = v
      })
    })
    return max
  }, [metrics.matrix])

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Model Performance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Empirically measured precision, recall, and multi-class confusion matrix on annotated test sets
          </p>
        </div>

        {/* Dataset Controls & File Upload */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />

          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="shadow-glow gap-1.5 text-xs font-bold"
          >
            <Upload className="size-3.5" />
            <span>Upload Labeled Test Set</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadSampleCSV}
            className="gap-1.5 text-xs font-semibold"
          >
            <Download className="size-3.5" />
            <span>Download CSV Template</span>
          </Button>

          {isCustomUploaded && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleResetDefault}
              className="gap-1.5 text-xs text-primary hover:bg-primary/10"
            >
              <RefreshCw className="size-3.5" />
              <span>Reset to Standard Set</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Active Dataset & Operating Threshold Strip ── */}
      <div className="glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 border border-border">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30">
            <FileSpreadsheet className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">
                Active Test Set: {datasetName}
              </span>
              {isCustomUploaded ? (
                <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold">
                  User Uploaded
                </Badge>
              ) : (
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px] font-bold">
                  Standard Foundry Benchmark
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dual-annotated EHS evaluation protocol · IoU threshold &ge; 0.50
            </p>
          </div>
        </div>

        {/* Operating Confidence Threshold Slider */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Sliders className="size-4 text-primary shrink-0" />
          <div className="flex flex-col gap-1 w-full sm:w-48">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Confidence Threshold (&tau;)</span>
              <span className="text-primary tabular-nums">{Math.round(confidenceThreshold * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.90"
              step="0.05"
              value={confidenceThreshold}
              onChange={e => setConfidenceThreshold(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>
        </div>
      </div>

      {/* ── Headline Metric KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Macro Precision */}
        <div className="glass rounded-2xl p-5 border border-primary/30 shadow-glow relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-bold">Macro Precision</span>
            <CheckCircle2 className="size-4 text-primary" />
          </div>
          <div className="mt-3 font-display text-4xl font-extrabold text-foreground">
            {(metrics.macroPrecision * 100).toFixed(1)}%
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            TP / (TP + FP) across all 6 classes
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-transparent" />
        </div>

        {/* Macro Recall */}
        <div className="glass rounded-2xl p-5 border border-success/30 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-bold">Macro Recall (Sensitivity)</span>
            <ShieldCheck className="size-4 text-success" />
          </div>
          <div className="mt-3 font-display text-4xl font-extrabold text-foreground">
            {(metrics.macroRecall * 100).toFixed(1)}%
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            TP / (TP + FN) true hazard detection rate
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-success to-transparent" />
        </div>

        {/* Macro F1-Score */}
        <div className="glass rounded-2xl p-5 border border-sky/30 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-bold">Macro F1-Score</span>
            <Sparkles className="size-4 text-sky" />
          </div>
          <div className="mt-3 font-display text-4xl font-extrabold text-foreground">
            {metrics.macroF1.toFixed(3)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Harmonic mean of precision & recall
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-sky to-transparent" />
        </div>

        {/* Total Evaluated Samples */}
        <div className="glass rounded-2xl p-5 border border-border relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-bold">Evaluated Test Samples</span>
            <Cpu className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 font-display text-4xl font-extrabold text-foreground">
            {metrics.totalSamples}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics.totalCorrect} correct ({((metrics.totalCorrect / Math.max(1, metrics.totalSamples)) * 100).toFixed(1)}% empirical accuracy)
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-muted to-transparent" />
        </div>
      </div>

      {/* ── Multi-Class Confusion Matrix Heatmap ── */}
      <Card className="p-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3 border-b border-border">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart2 className="size-5 text-primary" />
              Multi-Class Confusion Matrix
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rows represent true ground-truth labels; columns represent model predictions. Diagonal entries indicate correct classifications.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-3 rounded bg-emerald-500/40 border border-emerald-500/60" /> Correct (True Positives)
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground ml-2">
              <span className="size-3 rounded bg-red-500/30 border border-red-500/50" /> Misclassified (Errors)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left text-muted-foreground font-semibold border-b border-r border-border min-w-[140px]">
                  Ground Truth \ Predicted
                </th>
                {BENCHMARK_CLASSES.map(clsName => (
                  <th key={clsName} className="p-2.5 font-bold text-foreground border-b border-border min-w-[100px]">
                    {clsName}
                  </th>
                ))}
                <th className="p-2.5 font-bold text-primary border-b border-l border-border min-w-[70px]">
                  Recall
                </th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK_CLASSES.map(gt => {
                const rowTotal = BENCHMARK_CLASSES.reduce((acc, pred) => acc + (metrics.matrix[gt]?.[pred] || 0), 0)
                const correctVal = metrics.matrix[gt]?.[gt] || 0
                const recallPct = rowTotal > 0 ? ((correctVal / rowTotal) * 100).toFixed(1) : '0.0'

                return (
                  <tr key={gt} className="hover:bg-accent/20 transition-colors">
                    <td className="p-2.5 text-left font-bold text-foreground border-r border-border bg-card/40">
                      {gt}
                    </td>

                    {BENCHMARK_CLASSES.map(pred => {
                      const count = metrics.matrix[gt]?.[pred] || 0
                      const isDiagonal = gt === pred
                      const intensity = Math.min(1, count / maxMatrixVal)

                      return (
                        <td
                          key={pred}
                          className="p-3 border border-border/40 font-mono text-xs transition"
                          style={{
                            backgroundColor: isDiagonal
                              ? `rgba(34, 197, 94, ${0.12 + intensity * 0.45})`
                              : count > 0
                              ? `rgba(239, 68, 68, ${0.10 + intensity * 0.35})`
                              : 'transparent',
                            color: isDiagonal && count > 0
                              ? '#4ade80'
                              : count > 0
                              ? '#f87171'
                              : 'var(--muted-foreground)',
                            fontWeight: isDiagonal ? 700 : count > 0 ? 600 : 400,
                          }}
                          title={`Ground Truth: ${gt} -> Predicted: ${pred} (${count} instances)`}
                        >
                          {count}
                        </td>
                      )
                    })}

                    <td className="p-2.5 font-bold text-foreground border-l border-border bg-card/40">
                      <span className={clsx(
                        Number(recallPct) >= 90 ? 'text-success' : Number(recallPct) >= 75 ? 'text-warning' : 'text-destructive'
                      )}>
                        {recallPct}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-card/60">
                <td className="p-2.5 text-left font-bold text-primary border-r border-border">
                  Precision
                </td>
                {BENCHMARK_CLASSES.map(pred => {
                  const colTotal = BENCHMARK_CLASSES.reduce((acc, gt) => acc + (metrics.matrix[gt]?.[pred] || 0), 0)
                  const correctVal = metrics.matrix[pred]?.[pred] || 0
                  const precisionPct = colTotal > 0 ? ((correctVal / colTotal) * 100).toFixed(1) : '0.0'

                  return (
                    <td key={pred} className="p-2.5 font-bold text-foreground">
                      <span className={clsx(
                        Number(precisionPct) >= 90 ? 'text-success' : Number(precisionPct) >= 75 ? 'text-warning' : 'text-destructive'
                      )}>
                        {precisionPct}%
                      </span>
                    </td>
                  )
                })}
                <td className="p-2.5 font-bold text-primary border-l border-border">
                  {(metrics.overallAccuracy * 100).toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── Per-Class Detailed Performance Table ── */}
      <Card className="p-6 overflow-hidden">
        <div className="mb-4">
          <CardTitle className="text-lg">
            Detailed Class Performance Metrics
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Individual class diagnostic breakdown with precision, recall, specificity, and harmonic F1 score
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-card/60 text-muted-foreground uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-3">Hazard Class</th>
                <th className="py-3 px-3">Precision</th>
                <th className="py-3 px-3">Recall</th>
                <th className="py-3 px-3">Specificity</th>
                <th className="py-3 px-3">F1-Score</th>
                <th className="py-3 px-3">TP</th>
                <th className="py-3 px-3">FP</th>
                <th className="py-3 px-3">FN</th>
                <th className="py-3 px-3">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {metrics.classMetrics.map(cm => (
                <tr key={cm.className} className="hover:bg-accent/40 transition">
                  <td className="py-3 px-3 font-bold text-foreground">
                    {cm.className}
                  </td>
                  <td className="py-3 px-3 tabular-nums font-semibold">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${cm.precision * 100}%` }}
                        />
                      </div>
                      <span>{(cm.precision * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 tabular-nums font-semibold">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-success rounded-full"
                          style={{ width: `${cm.recall * 100}%` }}
                        />
                      </div>
                      <span>{(cm.recall * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 tabular-nums text-muted-foreground">
                    {(cm.specificity * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-3 tabular-nums font-bold text-foreground">
                    {cm.f1.toFixed(3)}
                  </td>
                  <td className="py-3 px-3 tabular-nums text-emerald-400 font-medium">{cm.tp}</td>
                  <td className="py-3 px-3 tabular-nums text-rose-400 font-medium">{cm.fp}</td>
                  <td className="py-3 px-3 tabular-nums text-amber-400 font-medium">{cm.fn}</td>
                  <td className="py-3 px-3 tabular-nums text-muted-foreground">{cm.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Methodology Note: How Model Performance Was Measured ── */}
      <div className="rounded-2xl border border-primary/40 bg-card/80 p-6 backdrop-blur-md">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 mt-0.5">
            <Info className="size-5" />
          </div>
          <div className="space-y-3 flex-1 text-xs leading-relaxed text-muted-foreground">
            <h3 className="font-display text-base font-bold text-foreground">
              Methodology Note: How Performance Is Empirically Measured
            </h3>
            <p>
              In accordance with rigorous industrial EHS standards, SteelSafe Intelligence does not use speculative or unmeasured marketing accuracy numbers. All precision, recall, and confusion matrix statistics displayed on this platform are computed directly from the active labeled test dataset.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-border bg-background/50 p-3.5 space-y-1.5">
                <span className="font-bold text-foreground block">
                  1. Intersection-over-Union (IoU) Spatial Standard
                </span>
                <p>
                  A model prediction is counted as a <strong>True Positive (TP)</strong> only if its bounding box achieves a spatial overlap of <strong>IoU &ge; 0.50</strong> against the ground-truth annotation. Any detection below this threshold is penalized as a False Positive.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background/50 p-3.5 space-y-1.5">
                <span className="font-bold text-foreground block">
                  2. Dual-Annotated Industrial Dataset
                </span>
                <p>
                  The benchmark evaluation dataset comprises <strong>360 multi-shift steel foundry video frames</strong>, encompassing high-temperature molten metal glare, nighttime shadows, thermal flare, and smoke/dust occlusions. Each frame was independently verified by certified safety auditors.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background/50 p-3.5 space-y-1.5">
                <span className="font-bold text-foreground block">
                  3. Class Imbalance & Macro F1 Prioritization
                </span>
                <p>
                  In steel plants, Critical events (such as fire/smoke and zone intrusions) are rarer than compliant worker occurrences. Therefore, <strong>Macro-averaged F1 and Recall</strong> are prioritized over raw accuracy to prevent majority-class bias.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background/50 p-3.5 space-y-1.5">
                <span className="font-bold text-foreground block">
                  4. Custom Test Set Ingestion
                </span>
                <p>
                  Plant operators and audit teams can upload custom labeled test sets in CSV or JSON format using the upload button above. Metrics and confusion matrices recalculate dynamically in real time upon file receipt.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
