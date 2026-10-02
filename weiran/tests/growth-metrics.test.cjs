const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calculatePlanStats, buildReport } = require('../miniprogram/utils/growth-metrics')
const { JOINED_ON, getStudentFixtures } = require('../miniprogram/utils/growth-mock')

const AS_OF = '2026-06-29'
const clone = value => JSON.parse(JSON.stringify(value))
function report(overrides = {}) {
  return buildReport(Object.assign({ asOf: AS_OF, joinedOn: JOINED_ON, records: [], learning: { attendance: [], assignments: [] }, plans: [], settings: {} }, overrides))
}
function metric(result, key) { return result.academic.concat(result.wellbeing).find(card => card.key === key) }
function row(date, learningMinutes, extra = {}) {
  return Object.assign({ date, learningMinutes, exerciseMinutes: null, sleepHours: null, pressureScore: null, scaleVersion: 'stress-self-v1-20', revision: 1, origin: 'self' }, extra)
}
function task(id, dueDate, extra = {}) {
  return Object.assign({ id, title: id, originalDueDate: dueDate, dueDate, status: 'pending', createdDate: '2026-06-23', completedDate: null, canceledDate: null, changeLog: [] }, extra)
}

test('六名学生的独立演示覆盖持平、改善、下降、样本不足', () => {
  const expected = { s001: 'stable', s002: 'stable', s003: 'declining', s004: 'improving', s005: 'improving', s006: 'insufficient' }
  for (const [studentId, status] of Object.entries(expected)) {
    const fixture = getStudentFixtures(studentId)
    const result = report(fixture)
    assert.equal(result.status.key, status, studentId)
    assert.equal(fixture.records.every(record => record.origin === 'mock'), true)
    assert.equal(fixture.records.every(record => record.date <= AS_OF), true)
    assert.equal(fixture.learning.assignments.every(item => /\+08:00$/.test(item.dueAt)), true)
  }
})

test('Mock 每次读取均独立；无效学生不能回落到默认学生', () => {
  const first = getStudentFixtures('s001')
  first.records[0].learningMinutes = 1400
  first.learning.attendance[0].attended = false
  const second = getStudentFixtures('s001')
  assert.notEqual(second.records[0].learningMinutes, 1400)
  assert.equal(second.learning.attendance[0].attended, true)
  assert.throws(() => getStudentFixtures('fake'), /没有该学生/)
})

test('统计窗口是连续的两个七天；支持月、年、闰日边界', () => {
  assert.deepEqual(report().period, {
    from: '2026-06-23', to: AS_OF, previousFrom: '2026-06-16', previousTo: '2026-06-22',
    label: '2026-06-23 — 2026-06-29', previousLabel: '2026-06-16 — 2026-06-22'
  })
  assert.equal(report({ asOf: '2027-01-02' }).period.from, '2026-12-27')
  assert.equal(report({ asOf: '2024-03-02' }).period.from, '2024-02-25')
  assert.throws(() => report({ asOf: '2026-02-29' }), /统计日期/)
})

test('缺失不等于零；0 参与均值且图表不标为缺失', () => {
  const result = report({ records: [row('2026-06-23', 0), row('2026-06-24', null), row('2026-06-25', 60)] })
  assert.equal(metric(result, 'learningMinutes').valueText, '30 分钟')
  assert.deepEqual(result.studyBars.slice(0, 3).map(bar => ({ value: bar.value, missing: bar.isMissing, height: bar.height })), [
    { value: 0, missing: false, height: 0 }, { value: null, missing: true, height: 0 }, { value: 60, missing: false, height: 100 }
  ])
  assert.equal(result.coverage.days, 2)
  assert.equal(result.coverage.percent, 28.6)
})

test('同日记录只用最新 revision；未来和无效日期不进入报告', () => {
  const records = [
    row('2026-06-23', 20, { revision: 2 }), row('2026-06-23', 500, { revision: 1 }),
    row('2026-06-23', 40, { revision: 3 }), row('2026-06-30', 1440), row('2026-02-30', 100), row('2026-05-31', 100)
  ]
  const result = report({ records })
  assert.equal(metric(result, 'learningMinutes').valueText, '40 分钟')
  assert.equal(result.coverage.days, 1)
  assert.equal(result.studyBars[0].value, 40)
})

test('自报均值须两窗各四天；零基线用绝对差而非除以零', () => {
  const records = ['16', '17', '18', '19'].map(day => row('2026-06-' + day, 0))
    .concat(['23', '24', '25'].map(day => row('2026-06-' + day, 10)))
  assert.match(metric(report({ records }), 'learningMinutes').changeText, /暂不比较/)
  records.push(row('2026-06-26', 10))
  const card = metric(report({ records }), 'learningMinutes')
  assert.equal(card.changeText, '较前 7 天增加 10 分钟')
  assert.equal(card.tone, 'neutral')
})

test('非数字、越界、小数分钟与不同压力量尺均不计有效数据', () => {
  const records = [
    row('2026-06-23', '30', { exerciseMinutes: -1, sleepHours: 25, pressureScore: 21 }),
    row('2026-06-24', NaN, { exerciseMinutes: Infinity, sleepHours: -1, pressureScore: 3, scaleVersion: 'legacy-questionnaire' }),
    row('2026-06-25', 0.5, { exerciseMinutes: 0.2, pressureScore: 2.5 }),
    row('2026-06-26', 1440, { exerciseMinutes: 0, sleepHours: 7.25, pressureScore: 0 })
  ]
  const result = report({ records })
  assert.equal(result.coverage.days, 1)
  assert.equal(metric(result, 'learningMinutes').valueText, '1440 分钟')
  assert.equal(metric(result, 'exerciseMinutes').valueText, '0 分钟')
  assert.equal(metric(result, 'sleepHours').valueText, '7.3 小时')
  assert.equal(metric(result, 'pressureScore').valueText, '0 分')
})

test('隐藏设置过滤卡片、计算方法、覆盖率和来源；通知开关不隐藏记录', () => {
  const onlyPrivate = [row('2026-06-29', null, { exerciseMinutes: 20, sleepHours: 8, pressureScore: 5 })]
  const hidden = report({ records: onlyPrivate, settings: { showHealth: false, showMental: false } })
  assert.deepEqual(hidden.wellbeing, [])
  assert.equal(hidden.coverage.days, 0)
  assert.match(hidden.sourceLabel, /尚无可见记录/)
  assert.doesNotMatch(JSON.stringify(hidden), /运动|睡眠|压力|stress-self|exerciseMinutes|sleepHours|pressureScore/)
  const healthHidden = report({ records: onlyPrivate, settings: { showHealth: false } })
  assert.deepEqual(healthHidden.wellbeing.map(card => card.key), ['pressureScore'])
  const mentalHidden = report({ records: onlyPrivate, settings: { showMental: false } })
  assert.deepEqual(mentalHidden.wellbeing.map(card => card.key), ['exerciseMinutes', 'sleepHours'])
  const alertsDisabled = report({ records: onlyPrivate, settings: { enableHealthAlert: false, enableEmotionAlert: false } })
  assert.equal(alertsDisabled.wellbeing.length, 3)
  assert.equal(alertsDisabled.coverage.days, 1)
})

test('来源按当前可见字段判断，编辑学习不会将未改动的模拟字段标为本人填写', () => {
  const records = [row('2026-06-29', 50, { exerciseMinutes: 30, sleepHours: 8, pressureScore: 5,
    sources: { learningMinutes: 'self', exerciseMinutes: '本地模拟自主记录', sleepHours: 'mock', pressureScore: '本地模拟压力自评（0–20）' }
  })]
  assert.match(report({ records }).sourceLabel, /示例与本人记录/)
  const hidden = report({ records, settings: { showHealth: false, showMental: false } })
  assert.match(hidden.sourceLabel, /每日记录：本人记录/)
  assert.doesNotMatch(hidden.sourceLabel, /示例与本人记录/)
})

test('加入日期决定应记录天数；加入前的数据不进入学校或自主统计', () => {
  const fixture = getStudentFixtures('s001')
  const result = report(Object.assign({}, fixture, { joinedOn: '2026-06-28' }))
  assert.equal(result.coverage.expected, 2)
  assert.equal(result.coverage.days, 2)
  assert.equal(result.coverage.percent, 100)
  assert.equal(metric(result, 'attendanceRate').valueText, '暂无数据')
  const beforeJoin = report({ joinedOn: '2026-07-01' })
  assert.equal(beforeJoin.coverage.expected, 0)
  assert.equal(beforeJoin.coverage.percent, null)
})

test('批准请假从出勤分母排除；重复 ID 不重复统计，未知出勤状态忽略', () => {
  const learning = { attendance: [
    { id: 'yes', date: '2026-06-23', attended: true, excused: false },
    { id: 'yes', date: '2026-06-23', attended: true, excused: false },
    { id: 'no', date: '2026-06-24', attended: false, excused: false },
    { id: 'leave', date: '2026-06-25', attended: false, excused: true },
    { id: 'unknown', date: '2026-06-26', attended: null, excused: false },
    { id: 'future', date: '2026-06-30', attended: false, excused: false }
  ], assignments: [] }
  const card = metric(report({ learning }), 'attendanceRate')
  assert.equal(card.valueText, '50%')
  assert.match(card.detail, /出勤 1 \/ 应到 2 节/)
})

test('作业按上海日期归属，截止日当天计入；未来到期和未来提交不泄漏', () => {
  const learning = { attendance: [], assignments: [
    { id: 'ontime', dueAt: '2026-06-23T20:00:00+08:00', submittedAt: '2026-06-23T20:00:00+08:00' },
    { id: 'late', dueAt: '2026-06-24T20:00:00+08:00', submittedAt: '2026-06-25T20:00:00+08:00' },
    { id: 'future-submit', dueAt: '2026-06-29T23:59:59+08:00', submittedAt: '2026-06-30T00:00:00+08:00' },
    { id: 'future-due', dueAt: '2026-06-30T00:00:00+08:00', submittedAt: '2026-06-29T16:00:00+08:00' },
    { id: 'utc-current', dueAt: '2026-06-22T16:00:00Z', submittedAt: '2026-06-22T15:00:00Z' },
    { id: 'utc-previous', dueAt: '2026-06-22T15:59:59Z', submittedAt: null },
    { id: 'local-ambiguous', dueAt: '2026-06-25T12:00:00', submittedAt: null },
    { id: 'invalid', dueAt: '2026-02-30T12:00:00+08:00', submittedAt: null }
  ] }
  const card = metric(report({ learning }), 'assignmentOnTimeRate')
  assert.equal(card.valueText, '50%')
  assert.match(card.detail, /按时 2 \/ 到期 4 项 · 已提交 3 项/)
  assert.match(card.previousText, /0%（0\/1）/)
})

test('课次或作业一项样本不足时不下总评；自报时长变高不改变学校趋势', () => {
  const fixture = getStudentFixtures('s001')
  fixture.learning.assignments = fixture.learning.assignments.slice(0, 1)
  assert.equal(report(fixture).status.key, 'insufficient')
  const stable = getStudentFixtures('s001')
  stable.records.forEach(record => { record.learningMinutes = record.date >= '2026-06-23' ? 1440 : 0 })
  assert.equal(report(stable).status.key, 'stable')
  assert.equal(metric(report(stable), 'learningMinutes').tone, 'neutral')
})

test('过程趋势按原始比率判断，接近 5 个百分点时不受展示舍入影响', () => {
  const learning = { attendance: [], assignments: [] }
  for (let i = 0; i < 1001; i += 1) {
    learning.attendance.push({ id: 'before-' + i, date: '2026-06-20', attended: i < 800, excused: false })
    learning.attendance.push({ id: 'current-' + i, date: '2026-06-25', attended: i < 900, excused: false })
  }
  for (const day of ['20', '21', '25', '26']) {
    learning.assignments.push({ id: day, dueAt: '2026-06-' + day + 'T20:00:00+08:00', submittedAt: '2026-06-' + day + 'T19:00:00+08:00' })
  }
  const result = report({ learning })
  assert.equal(metric(result, 'attendanceRate').valueText, '89.9%')
  assert.equal(result.status.key, 'stable')
})

test('模拟日推进不会制造新记录，14 天后旧明细不会撑起新报告', () => {
  const result = report(Object.assign({}, getStudentFixtures('s004'), { asOf: '2026-07-13' }))
  assert.equal(result.status.key, 'insufficient')
  assert.equal(result.coverage.days, 0)
  assert.equal(result.studyBars.every(bar => bar.isMissing), true)
  assert.equal(result.academic.every(card => card.tone === 'muted'), true)
})

test('全空报告分母为零时返回空值，不显示虚假的 0% 或 NaN', () => {
  const result = report()
  assert.equal(result.status.key, 'insufficient')
  assert.equal(metric(result, 'attendanceRate').valueText, '暂无数据')
  assert.equal(metric(result, 'assignmentOnTimeRate').valueText, '暂无数据')
  assert.equal(metric(result, 'planOnTimeRate').valueText, '暂无数据')
  assert.doesNotMatch(JSON.stringify(result), /NaN|Infinity/)
})

test('计划完成率扣除取消项，按时率按原截止日，延期不会改写成绩', () => {
  const plan = { createdDate: '2026-06-23', tasks: [
    task('on-time', '2026-06-24', { status: 'completed', completedDate: '2026-06-24' }),
    task('postponed-late', '2026-06-25', { dueDate: '2026-06-29', status: 'completed', completedDate: '2026-06-28', changeLog: [{ action: 'postpone', date: '2026-06-24' }] }),
    task('overdue', '2026-06-28'),
    task('today', '2026-06-29'),
    task('canceled', '2026-06-24', { status: 'canceled', canceledDate: '2026-06-25' }),
    task('not-yet-due', '2026-06-30')
  ] }
  assert.deepEqual(calculatePlanStats(plan, AS_OF), {
    total: 6, active: 5, completed: 2, canceled: 1, overdue: 1, dueCount: 4, onTimeCount: 1,
    rescheduled: 1, completionPercent: 40, onTimePercent: 25
  })
})

test('全取消、空计划返回 null；到期日当天尚未完成不视为逾期', () => {
  const plan = { tasks: [task('canceled', '2026-06-24', { status: 'canceled', canceledDate: '2026-06-25' })] }
  assert.equal(calculatePlanStats(plan, AS_OF).completionPercent, null)
  assert.equal(calculatePlanStats(plan, AS_OF).onTimePercent, null)
  assert.equal(calculatePlanStats({ tasks: [] }, AS_OF).completionPercent, null)
  assert.equal(calculatePlanStats({ tasks: [task('today', AS_OF)] }, AS_OF).overdue, 0)
  assert.equal(calculatePlanStats({ tasks: [task('yesterday', '2026-06-28')] }, AS_OF).overdue, 1)
})

test('未来创建任务、未来完成和取消事件不影响当前历史时点', () => {
  const plan = { createdDate: '2026-06-23', tasks: [
    task('future-task', '2026-07-01', { createdDate: '2026-06-30' }),
    task('future-completed', '2026-06-28', { status: 'completed', completedDate: '2026-06-30' }),
    task('future-canceled', '2026-06-28', { status: 'canceled', canceledDate: '2026-06-30' })
  ] }
  const result = calculatePlanStats(plan, AS_OF)
  assert.equal(result.total, 2)
  assert.equal(result.completed, 0)
  assert.equal(result.canceled, 0)
  assert.equal(result.overdue, 2)
  assert.equal(calculatePlanStats(Object.assign({}, plan, { createdDate: '2026-06-30' }), AS_OF).total, 0)
})

test('提前完成但原期限在未来的任务不进入已到期分母，延期项去重计数', () => {
  const stats = calculatePlanStats({ tasks: [task('early', '2026-07-01', {
    status: 'completed', completedDate: '2026-06-29', changeLog: [
      { action: 'postpone', date: '2026-06-24' }, { action: 'postpone', date: '2026-06-25' }, { action: 'postpone', date: '2026-06-30' }
    ]
  })] }, AS_OF)
  assert.equal(stats.completionPercent, 100)
  assert.equal(stats.dueCount, 0)
  assert.equal(stats.onTimePercent, null)
  assert.equal(stats.rescheduled, 1)
})

test('周报计划按时率仅包含本期原定到期项，不被延期移出窗口', () => {
  const plans = [{ createdDate: '2026-06-16', tasks: [
    task('previous', '2026-06-22', { createdDate: '2026-06-16', status: 'completed', completedDate: '2026-06-22' }),
    task('current-postponed', '2026-06-24', { dueDate: '2026-07-01', changeLog: [{ action: 'postpone', date: '2026-06-23' }] }),
    task('current-on-time', '2026-06-25', { status: 'completed', completedDate: '2026-06-25' })
  ] }]
  const card = metric(report({ plans }), 'planOnTimeRate')
  assert.equal(card.valueText, '50%')
  assert.match(card.detail, /按时 1 \/ 原定本期到期 2 项/)
})

test('纯统计不改写传入数据', () => {
  const input = Object.assign({ asOf: AS_OF, joinedOn: JOINED_ON, plans: [{ tasks: [task('test', AS_OF)] }], settings: {} }, getStudentFixtures('s005'))
  const original = clone(input)
  buildReport(input)
  calculatePlanStats(input.plans[0], AS_OF)
  assert.deepEqual(input, original)
})
