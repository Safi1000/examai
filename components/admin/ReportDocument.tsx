"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Circle,
  Polyline,
  Rect,
} from "@react-pdf/renderer";
import type { GradeLetter, GradeResult } from "@/lib/grading";
import type { TopicMastery } from "@/lib/scoring";
import type { Test } from "@/types";

// A4 = 595pt wide; paddingHorizontal = 44 each side → content = 507
const CONTENT_W = 507;

const GOLD = "#C59A3C";
const DARK = "#1A1D20";
const GRAY = "#6B7280";
const MUTED = "#9CA3AF";
const BORDER = "#E2DBD0";
const CREAM = "#F8F6F1";
const CHART_BG = "#EDEAE3";
const WHITE = "#FFFFFF";
const GREEN = "#16A34A";
const AMBER = "#D97706";
const RED = "#DC2626";
const GRADE_BOX_BG = "#FEF3C7";
const GRADE_BOX_BORDER = "#FCD34D";

const styles = StyleSheet.create({
  page: {
    backgroundColor: CREAM,
    paddingHorizontal: 44,
    paddingVertical: 36,
    fontFamily: "Times-Roman",
    color: DARK,
    fontSize: 11,
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    paddingBottom: 12,
    marginBottom: 18,
  },
  brand: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: GOLD,
    marginBottom: 5,
  },
  reportTitle: {
    fontSize: 22,
    fontFamily: "Times-Bold",
    color: DARK,
  },
  reportMonth: {
    fontSize: 10,
    color: GRAY,
    marginTop: 3,
  },
  studentName: {
    fontSize: 13,
    fontFamily: "Times-Bold",
    textAlign: "right",
  },
  cohortLabel: {
    fontSize: 10,
    color: GRAY,
    textAlign: "right",
    marginTop: 2,
  },

  // ── Section title ────────────────────────────────────────
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    color: GOLD,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 18,
  },

  // ── Stats ────────────────────────────────────────────────
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statBoxGold: {
    flex: 1,
    backgroundColor: GRADE_BOX_BG,
    borderWidth: 1,
    borderColor: GRADE_BOX_BORDER,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    color: MUTED,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  statValue: {
    fontSize: 26,
    fontFamily: "Times-Bold",
    color: DARK,
    lineHeight: 1,
  },
  statSub: {
    fontSize: 8,
    color: MUTED,
    marginTop: 3,
    textAlign: "center",
  },

  // ── Chart ────────────────────────────────────────────────
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
    paddingHorizontal: 10,
  },
  chartLabel: {
    fontSize: 8,
    color: MUTED,
  },

  // ── Table ────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: GOLD,
    paddingBottom: 5,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: "#F2EFE8",
  },
  colHdr: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colTest: { flex: 3 },
  colSubject: { flex: 2 },
  colScore: { flex: 1, alignItems: "flex-end" },
  colGrade: { flex: 1, alignItems: "flex-end" },
  cell: { fontSize: 11, color: DARK },
  cellGray: { fontSize: 11, color: GRAY },
  cellMono: { fontSize: 11, fontFamily: "Courier", color: DARK },

  // ── Mastery ──────────────────────────────────────────────
  masteryRow: { marginBottom: 9 },
  masteryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  masteryTopic: { fontSize: 11, color: DARK },
  masteryPct: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  masteryTrack: {
    height: 5,
    backgroundColor: BORDER,
    borderRadius: 3,
  },

  // ── Note ─────────────────────────────────────────────────
  noteBox: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 5,
    padding: 14,
    minHeight: 54,
  },
  noteText: { fontSize: 11, color: DARK, lineHeight: 1.5 },
  notePlaceholder: { fontSize: 11, color: MUTED, fontFamily: "Times-Italic" },

  // ── Footer ───────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 9,
    marginTop: 22,
  },
  footerText: { fontSize: 8, color: MUTED },
});

const GRADE_COLORS: Partial<Record<GradeLetter, string>> = {
  "A*": GREEN,
  A: GREEN,
  B: DARK,
  C: AMBER,
  D: AMBER,
  E: RED,
  U: RED,
};

function masteryFill(band: TopicMastery["band"]): string {
  return band === "mastery" ? GREEN : band === "weak" ? AMBER : RED;
}

function formatMonthFull(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

function toMonthAbbr(label: string): string {
  const mo = Number(label.split("-")[0]);
  if (!mo || mo < 1 || mo > 12) return label;
  return new Date(2000, mo - 1, 1).toLocaleString("default", { month: "short" });
}

// SVG line chart rendered inside the PDF
function PdfLineChart({ points }: { points: { label: string; value: number }[] }) {
  if (!points.length) return null;

  const W = CONTENT_W;
  const H = 95;
  const px = 14;
  const py = 12;
  const innerW = W - px * 2;
  const innerH = H - py * 2;

  const vals = points.map((p) => p.value);
  const lo = Math.max(0, Math.min(...vals) - 10);
  const hi = Math.min(100, Math.max(...vals) + 10);
  const range = hi - lo || 20;
  const single = points.length === 1;

  const cx = (i: number) =>
    px + (single ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const cy = (v: number) =>
    py + innerH - ((v - lo) / range) * innerH;

  const lineStr = points.map((p, i) => `${cx(i)},${cy(p.value)}`).join(" ");

  return (
    <View>
      <Svg width={W} height={H}>
        <Rect x={0} y={0} width={W} height={H} fill={CHART_BG} rx={5} ry={5} />
        {!single && (
          <Polyline
            points={lineStr}
            stroke={GOLD}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <Circle key={i} cx={cx(i)} cy={cy(p.value)} r={4} fill={GOLD} />
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        {points.map((p, i) => (
          <Text key={i} style={styles.chartLabel}>
            {toMonthAbbr(p.label)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export interface ReportDocumentProps {
  studentName: string;
  cohortName: string | undefined;
  month: string;
  monthAvg: number | null;
  prevAvg: number | null;
  delta: number | null;
  grade: GradeLetter | null;
  trendMonths: Array<{ label: string; value: number }>;
  perTest: Array<{ test: Pick<Test, "title" | "subject">; result: GradeResult }>;
  mastery: TopicMastery[];
  completionPct: number;
  completed: number;
  available: number;
  teacherNote: string;
}

export function ReportDocument({
  studentName,
  cohortName,
  month,
  monthAvg,
  prevAvg,
  delta,
  grade,
  trendMonths,
  perTest,
  mastery,
  completionPct,
  completed,
  available,
  teacherNote,
}: ReportDocumentProps) {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const deltaSign = (delta ?? 0) > 0 ? "+" : "";
  const deltaColor =
    delta == null ? DARK : delta > 0 ? GREEN : delta < 0 ? RED : DARK;
  const gradeColor = grade ? (GRADE_COLORS[grade] ?? DARK) : DARK;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>HAMZA TEACHES</Text>
            <Text style={styles.reportTitle}>Monthly Progress Report</Text>
            <Text style={styles.reportMonth}>{formatMonthFull(month)}</Text>
          </View>
          <View>
            <Text style={styles.studentName}>{studentName}</Text>
            {cohortName && (
              <Text style={styles.cohortLabel}>Cohort: {cohortName}</Text>
            )}
          </View>
        </View>

        {/* ── Summary ── */}
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Average</Text>
            <Text style={styles.statValue}>
              {monthAvg != null ? `${monthAvg}%` : "—"}
            </Text>
          </View>

          <View style={styles.statBoxGold}>
            <Text style={styles.statLabel}>Grade</Text>
            <Text style={[styles.statValue, { color: gradeColor }]}>
              {grade ?? "—"}
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Improvement</Text>
            <Text style={[styles.statValue, { fontSize: 22, color: deltaColor }]}>
              {delta != null ? `${deltaSign}${delta}%` : "—"}
            </Text>
            {prevAvg != null && (
              <Text style={styles.statSub}>vs last month</Text>
            )}
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Completion</Text>
            <Text style={[styles.statValue, { fontSize: 22 }]}>
              {completionPct}%
            </Text>
            <Text style={styles.statSub}>
              {completed} of {available} tests
            </Text>
          </View>
        </View>

        {/* ── Score trend ── */}
        {trendMonths.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Score Trend</Text>
            <PdfLineChart points={trendMonths} />
          </>
        )}

        {/* ── Test breakdown ── */}
        {perTest.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Test Breakdown</Text>
            <View style={styles.tableHeaderRow}>
              <View style={styles.colTest}>
                <Text style={styles.colHdr}>Test</Text>
              </View>
              <View style={styles.colSubject}>
                <Text style={styles.colHdr}>Subject</Text>
              </View>
              <View style={styles.colScore}>
                <Text style={styles.colHdr}>Score</Text>
              </View>
              <View style={styles.colGrade}>
                <Text style={styles.colHdr}>Grade</Text>
              </View>
            </View>
            {perTest.map(({ test, result }, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <View style={styles.colTest}>
                  <Text style={styles.cell}>{test.title}</Text>
                </View>
                <View style={styles.colSubject}>
                  <Text style={styles.cellGray}>{test.subject}</Text>
                </View>
                <View style={styles.colScore}>
                  <Text style={styles.cellMono}>{result.percent}%</Text>
                </View>
                <View style={styles.colGrade}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: "Helvetica-Bold",
                      color: GRADE_COLORS[result.letter] ?? DARK,
                    }}
                  >
                    {result.letter}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Topic mastery ── */}
        {mastery.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Topic Mastery</Text>
            {mastery.map((m) => (
              <View key={m.topic} style={styles.masteryRow}>
                <View style={styles.masteryTop}>
                  <Text style={styles.masteryTopic}>{m.topic}</Text>
                  <Text style={[styles.masteryPct, { color: masteryFill(m.band) }]}>
                    {Math.round(m.percent)}%
                  </Text>
                </View>
                <View style={styles.masteryTrack}>
                  <View
                    style={{
                      height: 5,
                      width: `${Math.round(m.percent)}%`,
                      backgroundColor: masteryFill(m.band),
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Teacher's note ── */}
        <Text style={styles.sectionTitle}>Teacher's Note</Text>
        <View style={styles.noteBox}>
          {teacherNote ? (
            <Text style={styles.noteText}>{teacherNote}</Text>
          ) : (
            <Text style={styles.notePlaceholder}>No note added.</Text>
          )}
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Confidential</Text>
          <Text style={styles.footerText}>Generated {today}</Text>
        </View>

      </Page>
    </Document>
  );
}
