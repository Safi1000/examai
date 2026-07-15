/**
 * Completion certificate (Feature 1 stretch). Rendered only for students who
 * passed — the caller gates on `passed` (grade E / 50%+); this component just
 * draws whatever it's handed. Pure render over the released Submission + Test.
 */
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Student, Submission, Test } from "@/types";
import { gradeSubmission, gradeLetter, gradeRole } from "@/lib/grading";
import { pdf, roleColors } from "@/components/pdf/theme";

/** A student passes at grade E and above (>= 50%). */
export const PASS_PERCENT = 50;

const styles = StyleSheet.create({
  page: {
    backgroundColor: pdf.paper,
    color: pdf.ink,
    fontFamily: "Helvetica",
    paddingVertical: 40,
    paddingHorizontal: 48,
  },
  frame: {
    flex: 1,
    borderWidth: 2,
    borderColor: pdf.brand,
    borderRadius: 10,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  brandBar: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  brandDot: { width: 12, height: 12, borderRadius: 3, backgroundColor: pdf.brand, marginRight: 8 },
  brandName: { fontFamily: "Times-Bold", fontSize: 15, color: pdf.brand, letterSpacing: 2 },

  kicker: { fontSize: 10, color: pdf.ink3, textTransform: "uppercase", letterSpacing: 3, marginTop: 18 },
  heading: { fontFamily: "Times-Bold", fontSize: 30, color: pdf.ink, marginTop: 6 },
  rule: { width: 90, height: 2, backgroundColor: pdf.brand, marginVertical: 16 },

  awarded: { fontSize: 11, color: pdf.ink2 },
  name: { fontFamily: "Times-Bold", fontSize: 26, color: pdf.brandStrong, marginTop: 8, marginBottom: 8 },
  body: { fontSize: 11, color: pdf.ink2, textAlign: "center", maxWidth: 380, lineHeight: 1.6 },
  testTitle: { fontFamily: "Helvetica-Bold", color: pdf.ink },

  scoreWrap: { flexDirection: "row", alignItems: "center", marginTop: 22 },
  gradeBox: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 14,
  },
  gradeLetter: { fontFamily: "Times-Bold", fontSize: 28 },
  scoreStat: { alignItems: "center", marginHorizontal: 14 },
  scoreNum: { fontFamily: "Times-Bold", fontSize: 22, color: pdf.ink },
  scoreLabel: { fontSize: 8, color: pdf.ink3, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 30,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: pdf.border,
  },
  footItem: { alignItems: "center", flex: 1 },
  footValue: { fontSize: 10, color: pdf.ink, fontFamily: "Helvetica-Bold" },
  footLabel: { fontSize: 7.5, color: pdf.ink3, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
});

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function Certificate({
  student,
  test,
  submission,
}: {
  student: Student;
  test: Test;
  submission: Submission;
}) {
  const grade = gradeSubmission(test, submission);
  const rc = roleColors(gradeRole(gradeLetter(grade.percent)));

  return (
    <Document title={`Certificate — ${test.title} (${student.username})`} author="Almanac">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.frame}>
          <View style={styles.brandBar}>
            <View style={styles.brandDot} />
            <Text style={styles.brandName}>ALMANAC</Text>
          </View>

          <Text style={styles.kicker}>Certificate of Completion</Text>
          <Text style={styles.heading}>{test.title}</Text>
          <View style={styles.rule} />

          <Text style={styles.awarded}>This certifies that</Text>
          <Text style={styles.name}>{student.username}</Text>
          <Text style={styles.body}>
            has successfully completed the <Text style={styles.testTitle}>{test.subject}</Text> assessment
            {" "}<Text style={styles.testTitle}>{test.title}</Text>, achieving a grade of {grade.letter} ({grade.percent}%).
          </Text>

          <View style={styles.scoreWrap}>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreNum}>{grade.awarded}/{grade.total}</Text>
              <Text style={styles.scoreLabel}>Score</Text>
            </View>
            <View style={[styles.gradeBox, { borderColor: rc.fg, backgroundColor: rc.bg }]}>
              <Text style={[styles.gradeLetter, { color: rc.fg }]}>{grade.letter}</Text>
            </View>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreNum}>{grade.percent}%</Text>
              <Text style={styles.scoreLabel}>Overall</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.footItem}>
              <Text style={styles.footValue}>{test.testCode}</Text>
              <Text style={styles.footLabel}>Test code</Text>
            </View>
            <View style={styles.footItem}>
              <Text style={styles.footValue}>{fmtDate(submission.releasedAt ?? submission.submittedAt)}</Text>
              <Text style={styles.footLabel}>Date awarded</Text>
            </View>
            <View style={styles.footItem}>
              <Text style={styles.footValue}>Almanac</Text>
              <Text style={styles.footLabel}>Issued by</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
