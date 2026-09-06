/**
 * ERDiagram — Day 6 feature updated to DESIGN (1).md.
 * Renders SVG table boxes with 16px radius (rounded.xl), high-contrast header,
 * foreign key arrows, and floating pill zoom controls.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, Loader2, RefreshCw, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { fetchRelationships, fetchExplorerTree, type ForeignKeyRelationship } from "../../api/explorer";
import { fetchTableSchema } from "../../api/explorer";
import type { ColumnInfo } from "../../types";

interface ERDiagramProps {
  connectionId: string;
  dbType: string;
}

interface TableBox {
  name: string;
  columns: ColumnInfo[];
  x: number;
  y: number;
  width: number;
  height: number;
}

const BOX_WIDTH = 220;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 26;
const COL_GAP = 70;
const ROW_GAP = 60;
const COLS_PER_ROW = 3;
const PAD = 50;

function buildBoxes(
  tables: string[],
  columnMap: Record<string, ColumnInfo[]>,
): TableBox[] {
  return tables.map((name, i) => {
    const cols = columnMap[name] ?? [];
    const height = HEADER_HEIGHT + Math.max(cols.length, 1) * ROW_HEIGHT + 10;
    const col = i % COLS_PER_ROW;
    const row = Math.floor(i / COLS_PER_ROW);
    return {
      name,
      columns: cols,
      x: PAD + col * (BOX_WIDTH + COL_GAP),
      y: PAD + row * (220 + ROW_GAP),
      width: BOX_WIDTH,
      height,
    };
  });
}

function connectionPoint(from: TableBox, side: "left" | "right"): [number, number] {
  const cx = side === "right" ? from.x + from.width : from.x;
  const cy = from.y + HEADER_HEIGHT / 2;
  return [cx, cy];
}

function RelationshipLine({
  from,
  to,
  label,
}: {
  from: TableBox;
  to: TableBox;
  label: string;
}) {
  const fromRight = from.x + from.width < to.x;
  const [x1, y1] = connectionPoint(from, fromRight ? "right" : "left");
  const [x2, y2] = connectionPoint(to, fromRight ? "left" : "right");

  const cx = (x1 + x2) / 2;

  return (
    <g>
      <path
        d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.5"
        strokeOpacity="0.75"
        strokeDasharray="4 3"
        markerEnd="url(#arrow)"
      />
      <rect
        x={cx - 30}
        y={(y1 + y2) / 2 - 12}
        width={60}
        height={16}
        rx={8}
        fill="var(--color-canvas-soft)"
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={(y1 + y2) / 2}
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        fill="var(--color-ink)"
        fontFamily="var(--font-mono)"
        dominantBaseline="middle"
      >
        {label.length > 10 ? label.slice(0, 9) + "…" : label}
      </text>
    </g>
  );
}

function TableBoxSVG({ box }: { box: TableBox }) {
  return (
    <g transform={`translate(${box.x}, ${box.y})`}>
      {/* Outer Card: 16px radius (rounded.xl) */}
      <rect
        x={0}
        y={2}
        width={box.width}
        height={box.height}
        rx={16}
        fill="rgba(0,0,0,0.1)"
      />
      <rect
        width={box.width}
        height={box.height}
        rx={16}
        fill="var(--color-canvas)"
        stroke="var(--color-border)"
        strokeWidth={1.5}
      />

      {/* Header with 16px top corners */}
      <path
        d={`M 0 16 Q 0 0 16 0 L ${box.width - 16} 0 Q ${box.width} 0 ${box.width} 16 L ${box.width} ${HEADER_HEIGHT} L 0 ${HEADER_HEIGHT} Z`}
        fill="var(--color-canvas-soft)"
      />
      <line
        x1={0}
        y1={HEADER_HEIGHT}
        x2={box.width}
        y2={HEADER_HEIGHT}
        stroke="var(--color-border)"
        strokeWidth={1}
      />

      {/* Table Title */}
      <text
        x={box.width / 2}
        y={HEADER_HEIGHT / 2}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="var(--color-ink)"
        fontFamily="var(--font-mono)"
        dominantBaseline="middle"
      >
        {box.name.length > 20 ? box.name.slice(0, 18) + "…" : box.name}
      </text>

      {/* Columns */}
      {box.columns.length === 0 ? (
        <text
          x={16}
          y={HEADER_HEIGHT + 16}
          fontSize="11"
          fill="var(--color-mute)"
          fontFamily="var(--font-mono)"
          fontStyle="italic"
        >
          (no columns)
        </text>
      ) : (
        box.columns.map((col, i) => (
          <g key={col.name} transform={`translate(0, ${HEADER_HEIGHT + i * ROW_HEIGHT})`}>
            {i > 0 && (
              <line
                x1={12}
                y1={0}
                x2={box.width - 12}
                y2={0}
                stroke="var(--color-border-subtle)"
                strokeWidth={0.5}
              />
            )}
            {col.isPrimaryKey && (
              <rect
                x={12}
                y={6}
                width={18}
                height={13}
                rx={6.5}
                fill="var(--color-primary)"
              />
            )}
            {col.isPrimaryKey && (
              <text
                x={21}
                y={13}
                fontSize="8"
                fill="var(--color-on-primary)"
                fontFamily="var(--font-mono)"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                PK
              </text>
            )}
            <text
              x={col.isPrimaryKey ? 36 : 14}
              y={14}
              fontSize="11"
              fontWeight={col.isPrimaryKey ? "600" : "400"}
              fill={col.isPrimaryKey ? "var(--color-ink)" : "var(--color-body)"}
              fontFamily="var(--font-mono)"
              dominantBaseline="middle"
            >
              {col.name.length > 14 ? col.name.slice(0, 12) + "…" : col.name}
            </text>
            <text
              x={box.width - 12}
              y={14}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-mute)"
              fontFamily="var(--font-mono)"
              dominantBaseline="middle"
            >
              {col.type.length > 10 ? col.type.slice(0, 8) + "…" : col.type}
            </text>
          </g>
        ))
      )}
    </g>
  );
}

export function ERDiagram({ connectionId, dbType }: ERDiagramProps) {
  const [boxes, setBoxes] = useState<TableBox[]>([]);
  const [relationships, setRelationships] = useState<ForeignKeyRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tree, rels] = await Promise.all([
        fetchExplorerTree(connectionId),
        fetchRelationships(connectionId),
      ]);

      const tables = tree.tables.slice(0, 30);
      const schemaResults = await Promise.allSettled(
        tables.map((t) => fetchTableSchema(connectionId, t)),
      );
      const columnMap: Record<string, ColumnInfo[]> = {};
      schemaResults.forEach((r, i) => {
        columnMap[tables[i]] = r.status === "fulfilled" ? r.value.columns : [];
      });

      setBoxes(buildBoxes(tables, columnMap));
      setRelationships(rels);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagram");
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas">
        <div className="flex items-center gap-2 text-xs text-body">
          <Loader2 size={16} className="animate-spin text-ink" />
          Loading relationship diagram…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-canvas-soft p-8 text-center">
          <AlertCircle size={24} className="text-danger" />
          <p className="text-xs text-danger">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:opacity-90"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (dbType === "mongodb") {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="max-w-md rounded-2xl border border-border bg-canvas-soft p-8 text-center">
          <p className="text-sm font-semibold text-ink">Foreign keys unavailable</p>
          <p className="mt-1 text-xs text-body">
            MongoDB is document-oriented and does not enforce relational foreign keys.
          </p>
        </div>
      </div>
    );
  }

  if (boxes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="max-w-md rounded-2xl border border-border bg-canvas-soft p-8 text-center">
          <p className="text-sm font-semibold text-ink">No tables found</p>
          <p className="mt-1 text-xs text-body">Create or import tables to render an entity relationship diagram.</p>
        </div>
      </div>
    );
  }

  const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + PAD;
  const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + PAD;
  const boxMap = Object.fromEntries(boxes.map((b) => [b.name, b]));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-canvas px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-base font-bold text-ink tracking-tight">ER diagram</h2>
          <span className="rounded-full bg-canvas-soft px-3 py-0.5 font-mono text-xs font-medium text-body">
            {boxes.length} tables · {relationships.length} foreign keys
          </span>
        </div>

        {/* Floating pill zoom controls */}
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-canvas-soft p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            title="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded-full text-body hover:bg-surface-pressed hover:text-ink transition-colors"
          >
            <ZoomOut size={13} />
          </button>
          <span className="w-12 text-center font-mono text-xs font-medium text-ink">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            title="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded-full text-body hover:bg-surface-pressed hover:text-ink transition-colors"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Reset zoom"
            className="flex h-7 w-7 items-center justify-center rounded-full text-body hover:bg-surface-pressed hover:text-ink transition-colors"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 overflow-auto bg-canvas p-6">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          <svg
            ref={svgRef}
            width={maxX}
            height={maxY}
            className="overflow-visible select-none"
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-ink)" />
              </marker>
            </defs>

            {/* Relationship Lines */}
            {relationships.map((rel) => {
              const fromBox = boxMap[rel.fromTable];
              const toBox = boxMap[rel.toTable];
              if (!fromBox || !toBox) return null;
              return (
                <RelationshipLine
                  key={`${rel.fromTable}.${rel.fromColumn}->${rel.toTable}.${rel.toColumn}`}
                  from={fromBox}
                  to={toBox}
                  label={`${rel.fromColumn} → ${rel.toColumn}`}
                />
              );
            })}

            {/* Table Boxes */}
            {boxes.map((box) => (
              <TableBoxSVG key={box.name} box={box} />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
