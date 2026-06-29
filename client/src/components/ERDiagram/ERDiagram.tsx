/**
 * ERDiagram — Day 6 feature.
 *
 * Renders one SVG box per table (with columns listed) and draws lines
 * between boxes for each FK relationship.
 *
 * Works for PostgreSQL and SQLite. For MongoDB the empty state is shown.
 *
 * Layout: simple auto-grid (3 cols) — tables are positioned on mount.
 * The SVG viewport auto-sizes to fit all boxes.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, Loader2, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
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

// Layout constants
const BOX_WIDTH = 200;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 22;
const COL_GAP = 60;
const ROW_GAP = 50;
const COLS_PER_ROW = 3;
const PAD = 40;

function buildBoxes(
  tables: string[],
  columnMap: Record<string, ColumnInfo[]>,
): TableBox[] {
  return tables.map((name, i) => {
    const cols = columnMap[name] ?? [];
    const height = HEADER_HEIGHT + Math.max(cols.length, 1) * ROW_HEIGHT + 8;
    const col = i % COLS_PER_ROW;
    const row = Math.floor(i / COLS_PER_ROW);
    return {
      name,
      columns: cols,
      x: PAD + col * (BOX_WIDTH + COL_GAP),
      y: PAD + row * (200 + ROW_GAP),
      width: BOX_WIDTH,
      height,
    };
  });
}

/** Find the midpoint of a box's right or left edge */
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
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeOpacity="0.6"
        strokeDasharray="4 3"
        markerEnd="url(#arrow)"
      />
      {/* Label */}
      <text
        x={cx}
        y={(y1 + y2) / 2 - 4}
        textAnchor="middle"
        fontSize="9"
        fill="var(--color-text-faint)"
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}

function TableBoxSVG({ box }: { box: TableBox }) {
  return (
    <g transform={`translate(${box.x}, ${box.y})`}>
      {/* Shadow */}
      <rect
        x={2}
        y={2}
        width={box.width}
        height={box.height}
        rx={6}
        fill="rgba(0,0,0,0.18)"
      />
      {/* Body */}
      <rect
        width={box.width}
        height={box.height}
        rx={6}
        fill="var(--color-surface)"
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      {/* Header */}
      <rect
        width={box.width}
        height={HEADER_HEIGHT}
        rx={6}
        fill="var(--color-accent)"
        fillOpacity="0.15"
      />
      <rect
        y={HEADER_HEIGHT - 6}
        width={box.width}
        height={6}
        fill="var(--color-accent)"
        fillOpacity="0.15"
      />
      {/* Table name */}
      <text
        x={box.width / 2}
        y={HEADER_HEIGHT / 2 + 4}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="var(--color-text)"
        fontFamily="var(--font-mono)"
      >
        {box.name.length > 22 ? box.name.slice(0, 20) + "…" : box.name}
      </text>

      {/* Columns */}
      {box.columns.length === 0 ? (
        <text
          x={12}
          y={HEADER_HEIGHT + ROW_HEIGHT * 0.7}
          fontSize="10"
          fill="var(--color-text-faint)"
          fontFamily="var(--font-mono)"
          fontStyle="italic"
        >
          (no columns)
        </text>
      ) : (
        box.columns.map((col, i) => (
          <g key={col.name} transform={`translate(0, ${HEADER_HEIGHT + i * ROW_HEIGHT})`}>
            {/* Separator */}
            {i > 0 && (
              <line
                x1={0}
                y1={0}
                x2={box.width}
                y2={0}
                stroke="var(--color-border-subtle)"
                strokeWidth={0.5}
              />
            )}
            {/* PK badge */}
            {col.isPrimaryKey && (
              <text
                x={8}
                y={ROW_HEIGHT * 0.72}
                fontSize="8"
                fill="var(--color-accent)"
                fontFamily="var(--font-mono)"
                fontWeight="700"
              >
                PK
              </text>
            )}
            {/* Column name */}
            <text
              x={col.isPrimaryKey ? 28 : 10}
              y={ROW_HEIGHT * 0.72}
              fontSize="10"
              fill={col.isPrimaryKey ? "var(--color-text)" : "var(--color-text-muted)"}
              fontFamily="var(--font-mono)"
            >
              {col.name.length > 18 ? col.name.slice(0, 16) + "…" : col.name}
            </text>
            {/* Type badge */}
            <text
              x={box.width - 8}
              y={ROW_HEIGHT * 0.72}
              textAnchor="end"
              fontSize="9"
              fill="var(--color-text-faint)"
              fontFamily="var(--font-mono)"
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

      // Fetch schemas for all tables in parallel (capped to avoid flooding)
      const tables = tree.tables.slice(0, 30); // cap for very large DBs
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
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={16} className="animate-spin" />
          Loading ER diagram…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <AlertCircle size={24} className="text-danger" />
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:bg-surface-raised"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (dbType === "mongodb") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-text-faint">
          ER diagrams are not available for MongoDB (no foreign key concept).
        </p>
      </div>
    );
  }

  if (boxes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-text-faint">No tables found in this database.</p>
      </div>
    );
  }

  // Compute SVG size to fit all boxes
  const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + PAD;
  const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + PAD;

  // Build a lookup: tableName → box
  const boxMap = Object.fromEntries(boxes.map((b) => [b.name, b]));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-text">ER Diagram</h2>
          <span className="rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] text-text-faint">
            {boxes.length} tables · {relationships.length} relationships
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            title="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:bg-surface-raised hover:text-text"
          >
            <ZoomOut size={14} />
          </button>
          <span className="w-12 text-center font-mono text-xs text-text-faint">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            title="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:bg-surface-raised hover:text-text"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="ml-1 rounded px-2 py-1 text-xs text-text-faint hover:bg-surface-raised hover:text-text"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={load}
            title="Reload"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded text-text-faint hover:bg-surface-raised hover:text-text"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-canvas">
        <svg
          ref={svgRef}
          width={maxX * zoom}
          height={maxY * zoom}
          viewBox={`0 0 ${maxX} ${maxY}`}
          style={{ display: "block" }}
        >
          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="var(--color-accent)" fillOpacity="0.7" />
            </marker>
          </defs>

          {/* Relationship lines (drawn first so they appear under boxes) */}
          {relationships.map((rel, i) => {
            const fromBox = boxMap[rel.fromTable];
            const toBox = boxMap[rel.toTable];
            if (!fromBox || !toBox || fromBox === toBox) return null;
            return (
              <RelationshipLine
                key={i}
                from={fromBox}
                to={toBox}
                label={`${rel.fromColumn} → ${rel.toColumn}`}
              />
            );
          })}

          {/* Table boxes */}
          {boxes.map((box) => (
            <TableBoxSVG key={box.name} box={box} />
          ))}
        </svg>
      </div>
    </div>
  );
}
