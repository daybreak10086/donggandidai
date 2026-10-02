// 第 ④ 部分的独立演示明细。不是由画像中的累计比例反推的数据，
// 不回写成绩、问卷、风险分数或通知；模拟日推进后也不自动补造新记录。
const { DEMO_DATE, students } = require('./mock')
const { addDays } = require('./academic-rules')

const JOINED_ON = '2026-06-01'
const PROFILES = {
  s001: { scenarioLabel: '学习过程持平', attendance: [5, 5], assignments: [4, 4], learning: [80, 85], exercise: [35, 40], sleep: [7.3, 7.4], pressure: [5, 5] },
  s002: { scenarioLabel: '学习过程持平，含自主运动记录', attendance: [4, 4], assignments: [3, 3], learning: [100, 105], exercise: [5, 10], sleep: [6.4, 6.6], pressure: [7, 7] },
  s003: { scenarioLabel: '学习过程下降，含压力自评记录', attendance: [5, 3], assignments: [4, 2], learning: [75, 50], exercise: [15, 10], sleep: [6.9, 6.4], pressure: [11, 14] },
  s004: { scenarioLabel: '学习过程改善', attendance: [4, 5], assignments: [2, 4], learning: [95, 105], exercise: [25, 30], sleep: [7.4, 7.5], pressure: [7, 6] },
  s005: { scenarioLabel: '自助计划与学习过程改善示例', attendance: [3, 4], assignments: [1, 3], learning: [45, 75], exercise: [20, 25], sleep: [6.5, 7], pressure: [10, 8] },
  s006: { scenarioLabel: '记录不足，暂不判断趋势', attendance: [1, 1], assignments: [1, 1], learning: [70, 90], exercise: [30, 30], sleep: [7.2, 7.6], pressure: [5, 4], sparse: true }
}

function getStudentFixtures(studentId) {
  if (!students.some(student => student.id === studentId) || !PROFILES[studentId]) throw new Error('没有该学生的成长演示数据')
  const profile = PROFILES[studentId]
  const records = []
  const learning = { attendance: [], assignments: [] }
  for (let week = 0; week < 2; week += 1) {
    const start = addDays(DEMO_DATE, -13 + week * 7)
    for (let offset = 0; offset < 7; offset += 1) {
      if (profile.sparse && offset !== 1 && offset !== 5) continue
      // 常规模拟也留一个空白日，便于演示“缺失不等于零”。
      if (!profile.sparse && offset === 2) continue
      const date = addDays(start, offset)
      const wobble = [-10, 0, 10, 5, -5, 15, 0][offset]
      records.push({
        date,
        learningMinutes: Math.max(0, profile.learning[week] + wobble),
        exerciseMinutes: offset === 3 ? 0 : profile.exercise[week] + (offset % 2 ? 5 : 0),
        sleepHours: Math.round((profile.sleep[week] + (offset % 2 ? 0.2 : -0.2)) * 10) / 10,
        pressureScore: Math.min(20, Math.max(0, profile.pressure[week] + (offset % 2 ? 1 : -1))),
        scaleVersion: 'stress-self-v1-20', revision: 1, origin: 'mock',
        sources: { learningMinutes: '本地模拟自主记录', exerciseMinutes: '本地模拟自主记录', sleepHours: '本地模拟自主记录', pressureScore: '本地模拟压力自评（0–20）' },
        updatedAt: date + 'T22:00:00+08:00'
      })
    }
    const classCount = profile.sparse ? 1 : 5
    for (let offset = 0; offset < classCount; offset += 1) {
      learning.attendance.push({ id: studentId + '-class-' + week + '-' + offset, date: addDays(start, offset), attended: offset < profile.attendance[week], excused: false })
    }
    if (!profile.sparse) learning.attendance.push({ id: studentId + '-leave-' + week, date: addDays(start, 5), attended: false, excused: true })
    const assignmentCount = profile.sparse ? 1 : 4
    for (let offset = 0; offset < assignmentCount; offset += 1) {
      const dueDate = addDays(start, offset + 1)
      // 非按时项中，第一项为次日补交，余项保留未交状态。
      const submittedAt = offset < profile.assignments[week]
        ? dueDate + 'T18:00:00+08:00'
        : offset === profile.assignments[week] ? addDays(dueDate, 1) + 'T08:00:00+08:00' : null
      learning.assignments.push({ id: studentId + '-assignment-' + week + '-' + offset, dueAt: dueDate + 'T20:00:00+08:00', submittedAt })
    }
  }
  return { records, learning, scenarioLabel: profile.scenarioLabel }
}

module.exports = { JOINED_ON, getStudentFixtures }
