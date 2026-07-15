/**
 * Downloadable, branded result report (Feature 1).
 *
 * Pure render over data the student can already see on the results page — it
 * reads the released Submission + its Test and reproduces the on-screen totals
 * and per-question breakdown as a PDF. No new data, no store, no network.
 *
 * Fonts: the built-in Times-Roman (a serif, echoing the app's display face) for
 * headings and Helvetica for body — both ship inside @react-pdf/renderer, so
 * there's no font registration/CORS fragility on mobile Safari or Chrome.
 * Colors come from components/pdf/theme.ts, which mirrors the Almanac tokens.
 */
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Rubric, Student, Submission, Test } from "@/types";
import { gradeSubmission, gradeLetter, gradeRole } from "@/lib/grading";
import { pdf, roleColors } from "@/components/pdf/theme";

const styles = StyleSheet.create({
  page: {
    backgroundColor: pdf.paper,
    color: pdf.ink,
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 44,
    paddingHorizontal: 40,
    lineHeight: 1.5,
  },
  brandBar: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  brandDot: { width: 10, height: 10, borderRadius: 2, backgroundColor: pdf.brand, marginRight: 7 },
  brandName: { fontFamily: "Times-Bold", fontSize: 12, color: pdf.brand, letterSpacing: 1 },
  brandKicker: { marginLeft: "auto", fontSize: 8, color: pdf.ink3, textTransform: "uppercase", letterSpacing: 1 },

  headerCard: {
    backgroundColor: pdf.surface,
    borderWidth: 1,
    borderColor: pdf.border,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: pdf.brand,
    padding: 16,
    marginBottom: 18,
  },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  code: {
    fontFamily: "Courier",
    fontSize: 8,
    color: pdf.brand,
    backgroundColor: pdf.brandSoft,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    marginRight: 8,
  },
  subject: { fontSize: 8, color: pdf.ink3, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontFamily: "Times-Bold", fontSize: 20, color: pdf.ink, marginBottom: 2 },
  student: { fontSize: 10, color: pdf.ink2, marginBottom: 12 },

  scoreRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  scoreBig: { fontFamily: "Times-Bold", fontSize: 30, color: pdf.ink },
  scoreDen: { fontSize: 15, color: pdf.ink3 },
  scoreSub: { fontSize: 9, color: pdf.ink2, marginTop: 1 },
  gradeBox: {
    width: 58,
    height: 58,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeLetter: { fontFamily: "Times-Bold", fontSize: 26 },
  gradeLabel: { fontSize: 6.5, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },

  factsRow: {
    flexDirection: "row",
    gap: 18,
    borderTopWidth: 1,
    borderTopColor: pdf.border,
    marginTop: 14,
    paddingTop: 10,
  },
  fact: { fontSize: 8.5, color: pdf.ink2 },
  factLabel: { color: pdf.ink3 },

  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: pdf.ink2,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },

  qCard: {
    backgroundColor: pdf.surface,
    borderWidth: 1,
    borderColor: pdf.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  qHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  qNum: { fontFamily: "Courier", fontSize: 8, color: pdf.ink3, marginRight: 6 },
  topic: {
    fontSize: 7.5,
    color: pdf.ink2,
    backgroundColor: pdf.surface2,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
  },
  marksPill: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  prompt: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: pdf.ink, marginBottom: 6 },

  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: pdf.border,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  optMark: { fontFamily: "Helvetica-Bold", fontSize: 9, width: 12 },
  optText: { fontSize: 9.5, flex: 1 },
  optTag: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },

  answerBox: {
    borderWidth: 1,
    borderColor: pdf.border,
    backgroundColor: pdf.surface2,
    borderRadius: 4,
    padding: 8,
    fontSize: 9.5,
    color: pdf.ink,
  },
  muted: { fontSize: 9.5, color: pdf.ink3, fontStyle: "italic" },

  rubric: { marginTop: 6, borderWidth: 1, borderColor: pdf.border, borderRadius: 4, padding: 8, backgroundColor: pdf.surface2 },
  rubricHead: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: pdf.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  rubricRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },

  feedback: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: pdf.info,
    backgroundColor: pdf.infoSoft,
    borderRadius: 4,
    padding: 8,
  },
  feedbackHead: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: pdf.info, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: pdf.ink3,
    borderTopWidth: 1,
    borderTopColor: pdf.border,
    paddingTop: 6,
  },
});

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function ResultReport({
  student,
  test,
  submission,
  rubrics = [],
}: {
  student: Student;
  test: Test;
  submission: Submission;
  rubrics?: Rubric[];
}) {
  const grade = gradeSubmission(test, submission);
  const role = gradeRole(gradeLetter(grade.percent));
  const rc = roleColors(role);

  return (
    <Document title={`${test.title} — Result (${student.username})`} author="Almanac">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.brandBar} fixed>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>ALMANAC</Text>
          <Text style={styles.brandKicker}>Result report</Text>
        </View>

        <View style={styles.headerCard}>
          <View style={styles.metaRow}>
            <Text style={styles.code}>{test.testCode}</Text>
            <Text style={styles.subject}>{test.subject}</Text>
          </View>
          <Text style={styles.title}>{test.title}</Text>
          <Text style={styles.student}>{student.username}</Text>

          <View style={styles.scoreRow}>
            <View>
              <Text>
                <Text style={styles.scoreBig}>{grade.awarded}</Text>
                <Text style={styles.scoreDen}> / {grade.total}</Text>
              </Text>
              <Text style={styles.scoreSub}>{grade.percent}% overall</Text>
            </View>
            <View style={[styles.gradeBox, { borderColor: rc.fg, backgroundColor: rc.bg }]}>
              <Text style={[styles.gradeLetter, { color: rc.fg }]}>{grade.letter}</Text>
              <Text style={[styles.gradeLabel, { color: rc.fg }]}>Grade</Text>
            </View>
          </View>

          <View style={styles.factsRow}>
            <Text style={styles.fact}>
              <Text style={styles.factLabel}>Submitted </Text>
              {fmtDate(submission.submittedAt)}
            </Text>
            <Text style={styles.fact}>
              <Text style={styles.factLabel}>Time taken </Text>
              {fmtDuration(submission.durationSeconds ?? 0)}
            </Text>
            <Text style={styles.fact}>
              <Text style={styles.factLabel}>Released </Text>
              {fmtDate(submission.releasedAt)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Question breakdown</Text>

        {test.questions.map((q, i) => {
          const a = submission.answers.find((x) => x.questionId === q.id);
          const awarded = a?.marksAwarded ?? 0;
          const full = awarded >= q.marks;
          const zero = awarded === 0;
          const pill = full ? roleColors("success") : zero ? roleColors("error") : roleColors("warning");
          const rubric = q.type === "text" ? rubrics.find((r) => r.id === q.rubricId) ?? null : null;
          const rubricScores = a?.rubricScores ?? [];

          return (
            <View key={q.id} style={styles.qCard} wrap={false}>
              <View style={styles.qHead}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={styles.qNum}>Q{i + 1}</Text>
                  <Text style={styles.topic}>{q.topic}</Text>
                </View>
                <Text style={[styles.marksPill, { color: pill.fg, backgroundColor: pill.bg }]}>
                  {awarded}/{q.marks} marks
                </Text>
              </View>

              <Text style={styles.prompt}>{q.prompt}</Text>

              {q.type === "mcq" &&
                q.options.map((opt, oi) => {
                  const chosen = a?.selectedIndex === oi;
                  const correct = q.correctIndex === oi;
                  const border = correct ? pdf.success : chosen ? pdf.error : pdf.border;
                  const bg = correct ? pdf.successSoft : chosen ? pdf.errorSoft : pdf.surface;
                  const fg = correct ? pdf.success : chosen ? pdf.error : pdf.ink2;
                  return (
                    <View key={oi} style={[styles.option, { borderColor: border, backgroundColor: bg }]}>
                      <Text style={[styles.optMark, { color: fg }]}>{correct ? "✓" : chosen ? "✗" : ""}</Text>
                      <Text style={[styles.optText, { color: fg }]}>{opt}</Text>
                      {chosen && <Text style={[styles.optTag, { color: fg }]}>Your pick</Text>}
                    </View>
                  );
                })}

              {q.type === "text" &&
                (a?.text ? (
                  <Text style={styles.answerBox}>{a.text}</Text>
                ) : (
                  <Text style={styles.muted}>(blank)</Text>
                ))}

              {q.type === "photo" && (
                <Text style={styles.muted}>
                  {a?.photoDataUrl ? "Photo answer submitted (view online for the image)." : "(no photo)"}
                </Text>
              )}

              {rubric && rubricScores.length > 0 && (
                <View style={styles.rubric}>
                  <Text style={styles.rubricHead}>Rubric breakdown</Text>
                  {rubric.criteria.map((c) => {
                    const s = rubricScores.find((x) => x.criterionId === c.id);
                    if (!s) return null;
                    return (
                      <View key={c.id} style={styles.rubricRow}>
                        <Text style={{ fontSize: 9, color: pdf.ink2 }}>{c.label}</Text>
                        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: pdf.ink }}>
                          {s.points}/{c.maxPoints}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {a?.feedback ? (
                <View style={styles.feedback}>
                  <Text style={styles.feedbackHead}>Teacher feedback</Text>
                  <Text style={{ fontSize: 9.5, color: pdf.ink }}>{a.feedback}</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>Almanac · {test.title}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
