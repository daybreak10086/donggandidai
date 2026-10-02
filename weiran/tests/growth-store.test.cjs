const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const store = require('../miniprogram/utils/store')
const growth = require('../miniprogram/utils/growth-store')
const rules = require('../miniprogram/utils/academic-rules')

const clone = value => JSON.parse(JSON.stringify(value))
let memory, navigation

beforeEach(() => {
  memory = new Map()
  navigation = []
  global.wx = {
    getStorageSync: key => memory.has(key) ? clone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, clone(value)),
    removeStorageSync: key => memory.delete(key),
    reLaunch: options => navigation.push(options.url),
    navigateTo: options => navigation.push(options.url),
    showToast() {},
    showModal: options => options.success({ confirm: true })
  }
  store.init()
})

function signIn(id = 's005') {
  store.setCurrentStudent(id)
  return growth.getContext()
}

function createPlan() {
  const suggestion = growth.getPlanSuggestion()
  return growth.createPlan({
    title: suggestion.title,
    sourceWarningId: suggestion.sourceWarningId,
    tasks: suggestion.tasks
  }).plan
}

function currentGrowthData() {
  return wx.getStorageSync('wr_growth_v1')[store.getCurrentStudentId()]
}

function clearToday() {
  const date = growth.getContext().today
  growth.deleteDailyRecord(date)
  return date
}

test('成长模块必须有有效登录会话，退出后读写均不可继续', () => {
  assert.throws(() => growth.getContext())
  assert.throws(() => growth.getPlans())
  assert.throws(() => growth.getReport())
  const { today } = signIn()
  store.logout()
  assert.throws(() => growth.getDailyRecord(today))
  assert.throws(() => growth.saveDailyRecord({ date: today, learningMinutes: 60 }))
  assert.throws(() => growth.advanceDay())
})

test('计划建议仅供编辑；确认创建后同源学业预警幂等且数据持久保存', () => {
  const context = signIn()
  const suggestion = growth.getPlanSuggestion()
  assert.equal(growth.getPlans().length, 0)
  assert.equal(suggestion.sourceWarningId, store.getAcademicWarning().id)
  assert.ok(suggestion.tasks.length >= 1 && suggestion.tasks.length <= 8)
  for (const task of suggestion.tasks) {
    assert.ok(task.dueDate >= context.today)
    assert.ok(task.dueDate <= rules.addDays(context.today, 6))
  }
  const first = growth.createPlan(suggestion)
  const repeated = growth.createPlan(suggestion)
  assert.equal(first.reused, false)
  assert.equal(repeated.reused, true)
  assert.equal(repeated.plan.id, first.plan.id)
  assert.equal(growth.getPlans().length, 1)
  store.init()
  assert.equal(growth.getPlans()[0].id, first.plan.id)
})

test('无预警学生能建立个人计划，同一自然周最多一个', () => {
  signIn('s001')
  const suggestion = growth.getPlanSuggestion()
  assert.equal(suggestion.sourceWarningId, null)
  const first = growth.createPlan(suggestion)
  growth.advanceDay()
  const repeated = growth.createPlan(growth.getPlanSuggestion())
  assert.equal(repeated.reused, true)
  assert.equal(repeated.plan.id, first.plan.id)
  assert.equal(growth.getPlans().length, 1)
})

test('计划拒绝无任务、空标题、非法日期及超出七日计划窗口的任务', () => {
  const { today } = signIn()
  const valid = { title: '本周计划', sourceWarningId: null, tasks: [{ title: '整理本周错题', dueDate: today }] }
  for (const patch of [
    { title: ' ' },
    { tasks: [] },
    { tasks: Array.from({ length: 9 }, () => ({ title: '复习', dueDate: today })) },
    { tasks: [{ title: ' ', dueDate: today }] },
    { tasks: [{ title: '复习', dueDate: '2026-02-30' }] },
    { tasks: [{ title: '复习', dueDate: rules.addDays(today, -1) }] },
    { tasks: [{ title: '复习', dueDate: rules.addDays(today, 7) }] }
  ]) assert.throws(() => growth.createPlan({ ...valid, ...patch }))
  assert.equal(growth.getPlans().length, 0)
})

test('学生之间的计划和任务隔离，不能以其他学生任务 ID 完成任务', () => {
  signIn('s005')
  const plan = createPlan()
  const taskId = plan.tasks[0].id
  store.setCurrentStudent('s001')
  assert.equal(growth.getPlans().length, 0)
  assert.throws(() => growth.updateTask(plan.id, taskId, 'complete'))
  store.setCurrentStudent('s005')
  assert.equal(growth.getPlans()[0].tasks[0].status, 'pending')
  assert.equal(growth.getPlans()[0].studentId, 's005')
})

test('完成、取消计算有效任务分母；完成重复操作不会重写完成日期', () => {
  signIn()
  const plan = createPlan()
  assert.equal(plan.tasks.length, 3)
  growth.updateTask(plan.id, plan.tasks[0].id, 'complete')
  let view = growth.getPlans()[0]
  assert.equal(view.stats.completionPercent, 33.3)
  assert.equal(view.stats.completed, 1)
  const completed = clone(view.tasks[0])
  growth.advanceDay()
  try { growth.updateTask(plan.id, plan.tasks[0].id, 'complete') } catch (_) {}
  view = growth.getPlans()[0]
  assert.equal(view.tasks[0].completedDate, completed.completedDate)
  assert.equal(view.tasks[0].changeLog.length, completed.changeLog.length)
  growth.updateTask(plan.id, plan.tasks[1].id, 'cancel')
  view = growth.getPlans()[0]
  assert.equal(view.stats.completionPercent, 50)
  assert.equal(view.stats.canceled, 1)
  assert.ok(view.tasks[1].canceledDate)
  assert.ok(view.tasks[1].changeLog.length > 0)
})

test('全取消任务没有完成率，已完成及已取消的任务不能延期', () => {
  const { today } = signIn()
  const plan = createPlan()
  for (const task of plan.tasks) growth.updateTask(plan.id, task.id, 'cancel')
  assert.equal(growth.getPlans()[0].stats.completionPercent, null)
  assert.throws(() => growth.updateTask(plan.id, plan.tasks[0].id, 'postpone', {
    dueDate: rules.addDays(today, 10), reason: '调整安排'
  }))
})

test('延期保留原始期限和原因；原期限逾期完成不能靠延期成为按时完成', () => {
  const { today } = signIn()
  const plan = growth.createPlan({ title: '答疑计划', sourceWarningId: null, tasks: [{ title: '联系老师答疑', dueDate: today }] }).plan
  const task = plan.tasks[0]
  const dueDate = rules.addDays(today, 3)
  growth.updateTask(plan.id, task.id, 'postpone', { dueDate, reason: '老师答疑时间调整' })
  let current = growth.getPlans()[0]
  assert.equal(current.tasks[0].originalDueDate, today)
  assert.equal(current.tasks[0].dueDate, dueDate)
  assert.ok(JSON.stringify(current.tasks[0].changeLog).includes('老师答疑时间调整'))
  assert.ok(JSON.stringify(current.tasks[0].changeLog).includes(today))
  assert.ok(JSON.stringify(current.tasks[0].changeLog).includes(dueDate))
  growth.advanceDay()
  growth.updateTask(plan.id, task.id, 'complete')
  current = growth.getPlans()[0]
  assert.equal(current.stats.completionPercent, 100)
  assert.equal(current.stats.onTimePercent, 0)
  assert.equal(current.stats.rescheduled, 1)
  assert.throws(() => growth.updateTask(plan.id, task.id, 'postpone', {
    dueDate: rules.addDays(today, 5), reason: '再次延期'
  }))
})

test('延期必须有原因且期限变晚，不接受非法日期和超过三十日的期限', () => {
  const { today } = signIn()
  const plan = createPlan()
  const task = plan.tasks[0]
  for (const options of [
    { dueDate: task.dueDate, reason: '调整' },
    { dueDate: rules.addDays(task.dueDate, 1), reason: ' ' },
    { dueDate: '2026-02-30', reason: '调整' },
    { dueDate: rules.addDays(today, 31), reason: '调整' }
  ]) assert.throws(() => growth.updateTask(plan.id, task.id, 'postpone', options))
  assert.equal(growth.getPlans()[0].tasks[0].dueDate, task.dueDate)
})

test('到期当天未完成不逾期，推进一天后逾期一天；月底按自然日推进', () => {
  let { today } = signIn()
  while (today !== '2026-06-30') today = growth.advanceDay()
  const plan = growth.createPlan({ title: '月底复习', sourceWarningId: null, tasks: [{ title: '完成复习', dueDate: today }] }).plan
  assert.equal(growth.getPlans()[0].tasks[0].overdueDays, 0)
  assert.equal(growth.advanceDay(), '2026-07-01')
  assert.equal(growth.getPlans().find(item => item.id === plan.id).tasks[0].overdueDays, 1)
})

test('同日记录更新单条当前值，版本递增并保留完整旧版本审计', () => {
  signIn()
  const date = clearToday()
  const first = growth.saveDailyRecord({ date, learningMinutes: 137, exerciseMinutes: 20, sleepHours: 7.5, pressureScore: 6 })
  const second = growth.saveDailyRecord({ date, learningMinutes: 83 })
  assert.ok(first.revision >= 1)
  assert.equal(second.revision, first.revision + 1)
  assert.equal(second.origin, 'self')
  assert.equal(second.learningMinutes, 83)
  assert.equal(second.exerciseMinutes, 20)
  assert.equal(second.sleepHours, 7.5)
  assert.equal(second.pressureScore, 6)
  assert.equal(second.scaleVersion, 'stress-self-v1-20')
  assert.equal(growth.getRecordHistory().filter(record => record.date === date).length, 1)
  const audit = currentGrowthData().recordAudit.findLast(item => item.action === 'update' && item.date === date)
  assert.ok(audit)
  assert.equal(audit.previous.learningMinutes, 137)
  assert.equal(audit.previous.revision, first.revision)
  assert.equal(audit.next.learningMinutes, 83)
  assert.equal(audit.next.revision, second.revision)
})

test('自主记录按学生隔离，页面传入 studentId 不能改变归属', () => {
  const { today } = signIn('s005')
  growth.saveDailyRecord({ date: today, studentId: 's001', learningMinutes: 1379 })
  store.setCurrentStudent('s001')
  const other = growth.getDailyRecord(today)
  assert.ok(!other || other.learningMinutes !== 1379)
  growth.deleteDailyRecord(today)
  store.setCurrentStudent('s005')
  assert.equal(growth.getDailyRecord(today).learningMinutes, 1379)
  store.init()
  assert.equal(growth.getDailyRecord(today).learningMinutes, 1379)
})

test('零是有效记录，空值是缺失；当天只有零值仍能保存并计入记录覆盖', () => {
  signIn()
  const date = clearToday()
  const result = growth.saveDailyRecord({ date, learningMinutes: 0, exerciseMinutes: 0, sleepHours: '', pressureScore: 0 })
  assert.equal(result.learningMinutes, 0)
  assert.equal(result.exerciseMinutes, 0)
  assert.equal(result.sleepHours, null)
  assert.equal(result.pressureScore, 0)
  const bar = growth.getReport().studyBars.find(item => item.date === date)
  assert.equal(bar.value, 0)
  assert.equal(bar.isMissing, false)
  assert.equal(growth.getDashboardSummary().recordedToday, true)
})

test('空表、非法数值、超范围或未来日期不会写入当前记录', () => {
  signIn()
  const date = clearToday()
  assert.throws(() => growth.saveDailyRecord({ date, learningMinutes: '', exerciseMinutes: '', sleepHours: '', pressureScore: '' }))
  for (const patch of [
    { learningMinutes: -1 }, { learningMinutes: 1441 }, { learningMinutes: 1.5 },
    { learningMinutes: 'abc' }, { learningMinutes: Infinity }, { learningMinutes: NaN },
    { exerciseMinutes: -1 }, { exerciseMinutes: 1441 }, { exerciseMinutes: 0.5 },
    { sleepHours: -0.5 }, { sleepHours: 24.1 },
    { pressureScore: -1 }, { pressureScore: 21 }, { pressureScore: 1.5 }
  ]) assert.throws(() => growth.saveDailyRecord({ date, ...patch }))
  assert.throws(() => growth.saveDailyRecord({ date: rules.addDays(date, 1), learningMinutes: 60 }))
  assert.throws(() => growth.saveDailyRecord({ date: '2026-02-30', learningMinutes: 60 }))
  assert.equal(growth.getDailyRecord(date), null)
})

test('删除记录仅删除当前值并留审计，重新加载不复活 Mock 记录', () => {
  const { today } = signIn()
  growth.saveDailyRecord({ date: today, learningMinutes: 137 })
  growth.deleteDailyRecord(today)
  assert.equal(growth.getDailyRecord(today), null)
  assert.equal(growth.getRecordHistory().some(row => row.date === today), false)
  const audit = currentGrowthData().recordAudit.findLast(item => item.action === 'delete' && item.date === today)
  assert.equal(audit.previous.learningMinutes, 137)
  assert.equal(audit.next, null)
  store.init()
  assert.equal(growth.getDailyRecord(today), null)
})

test('删除后重新录入沿用最高修订版本，连续删除重建不重置版本号', () => {
  const { today } = signIn()
  const first = growth.saveDailyRecord({ date: today, learningMinutes: 137 })
  growth.deleteDailyRecord(today)
  const second = growth.saveDailyRecord({ date: today, learningMinutes: 83 })
  assert.equal(second.revision, first.revision + 1)
  growth.deleteDailyRecord(today)
  const third = growth.saveDailyRecord({ date: today, learningMinutes: 0 })
  assert.equal(third.revision, second.revision + 1)
  const recreated = currentGrowthData().recordAudit.filter(item => item.action === 'create' && item.date === today)
  assert.equal(recreated.at(-2).next.revision, second.revision)
  assert.equal(recreated.at(-1).next.revision, third.revision)
})

test('隐藏健康心理后读取不带对应字段，保存学习值保留隐藏值，恢复开关可再查看', () => {
  const { today } = signIn()
  growth.saveDailyRecord({ date: today, learningMinutes: 50, exerciseMinutes: 37, sleepHours: 8.5, pressureScore: 13 })
  store.updateSettings({ showHealth: false, showMental: false })
  const hidden = growth.getDailyRecord(today)
  for (const field of ['exerciseMinutes', 'sleepHours', 'pressureScore']) assert.equal(Object.hasOwn(hidden, field), false)
  const changed = growth.saveDailyRecord({ date: today, learningMinutes: 80, exerciseMinutes: 0, sleepHours: '', pressureScore: 0 })
  for (const field of ['exerciseMinutes', 'sleepHours', 'pressureScore']) assert.equal(Object.hasOwn(changed, field), false)
  for (const record of growth.getRecordHistory()) {
    for (const field of ['exerciseMinutes', 'sleepHours', 'pressureScore']) assert.equal(Object.hasOwn(record, field), false)
  }
  assert.equal(growth.getReport().wellbeing.length, 0)
  store.updateSettings({ showHealth: true, showMental: true })
  const restored = growth.getDailyRecord(today)
  assert.equal(restored.learningMinutes, 80)
  assert.equal(restored.exerciseMinutes, 37)
  assert.equal(restored.sleepHours, 8.5)
  assert.equal(restored.pressureScore, 13)
})

test('只关闭预警功能仍可自主记录，不新增健康情绪通知', () => {
  const { today } = signIn('s002')
  store.updateSettings({ enableHealthAlert: false, enableEmotionAlert: false })
  const notificationsBefore = clone(wx.getStorageSync('wr_notifications_v2'))
  const row = growth.saveDailyRecord({ date: today, exerciseMinutes: 20, sleepHours: 7, pressureScore: 8 })
  assert.equal(row.exerciseMinutes, 20)
  assert.equal(row.pressureScore, 8)
  assert.deepEqual(wx.getStorageSync('wr_notifications_v2'), notificationsBefore)
})

test('完成任务和自主记录不改预警值、教务原数据或辅导员事件', () => {
  const { today } = signIn()
  const before = {
    warning: store.getAcademicWarning(), learning: store.getStudent().learning,
    events: store.getCounselorEvents(), notifications: wx.getStorageSync('wr_notifications_v2')
  }
  const plan = createPlan()
  growth.updateTask(plan.id, plan.tasks[0].id, 'complete')
  growth.saveDailyRecord({ date: today, learningMinutes: 180, exerciseMinutes: 60, sleepHours: 8, pressureScore: 0 })
  growth.getReport()
  assert.deepEqual(store.getAcademicWarning(), before.warning)
  assert.deepEqual(store.getStudent().learning, before.learning)
  assert.deepEqual(store.getCounselorEvents(), before.events)
  assert.deepEqual(wx.getStorageSync('wr_notifications_v2'), before.notifications)
})

test('推进日期与学业演示共用时钟，不制造新的成绩和自主记录', () => {
  const { today } = signIn()
  const warningBefore = store.getAcademicWarning()
  const next = growth.advanceDay()
  assert.equal(next, rules.addDays(today, 1))
  assert.equal(growth.getContext().today, next)
  assert.equal(store.getAcademicStatus().asOf, next)
  assert.equal(growth.getReport().period.to, next)
  assert.equal(growth.getDailyRecord(next), null)
  assert.deepEqual(store.getAcademicWarning(), warningBefore)
})

test('重播预警回退日期后未来创建的计划和记录不进入当前视图', () => {
  const { today } = signIn()
  createPlan()
  growth.saveDailyRecord({ date: today, learningMinutes: 100 })
  store.resetAcademicDemo()
  assert.equal(growth.getContext().today, '2026-06-01')
  assert.equal(growth.getPlans().length, 0)
  assert.equal(growth.getRecordHistory().some(row => row.date > '2026-06-01'), false)
  assert.equal(growth.getReport().period.to, '2026-06-01')
  assert.equal(growth.getDashboardSummary().planCount, 0)
})

test('回播预警后不可重复建立未来已存在的同源计划，推进后复用原计划', () => {
  signIn()
  const plan = createPlan()
  store.resetAcademicDemo()
  assert.throws(() => growth.createPlan(growth.getPlanSuggestion()), /推进|已有计划/)
  assert.equal(currentGrowthData().plans.length, 1)
  // 从首次提醒 6 月 1 日推进四个观察周，回到原计划创建日。
  for (let week = 0; week < 4; week += 1) store.advanceAcademicDemo(false)
  const reused = growth.createPlan(growth.getPlanSuggestion())
  assert.equal(reused.reused, true)
  assert.equal(reused.plan.id, plan.id)
  assert.equal(growth.getPlans().length, 1)
})

test('六名学生周报覆盖持平、下降、改善及数据不足，并明确两段七日窗口', () => {
  const expected = {
    s001: 'stable', s002: 'stable', s003: 'declining',
    s004: 'improving', s005: 'improving', s006: 'insufficient'
  }
  for (const [studentId, status] of Object.entries(expected)) {
    const { today } = signIn(studentId)
    const report = growth.getReport()
    assert.equal(report.status.key, status, studentId)
    assert.equal(report.period.from, rules.addDays(today, -6))
    assert.equal(report.period.to, today)
    assert.equal(report.period.previousFrom, rules.addDays(today, -13))
    assert.equal(report.period.previousTo, rules.addDays(today, -7))
    assert.equal(report.studyBars.length, 7)
    assert.ok(report.sourceLabel)
    assert.ok(report.academic.length > 0)
  }
})
