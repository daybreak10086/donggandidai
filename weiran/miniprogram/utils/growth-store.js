// 第④部分：独立的行动与复盘层。不改写画像、风险评分或教务原始数据。
const store = require('./store')
const dates = require('./academic-rules')
const fixtures = require('./growth-mock')
const metrics = require('./growth-metrics')
const KEY = 'wr_growth_v1'
const FIELDS = ['learningMinutes', 'exerciseMinutes', 'sleepHours', 'pressureScore']
const SCALE = 'stress-self-v1-20'
function copy(value) { return JSON.parse(JSON.stringify(value)) }
function stamp() { return new Date().toISOString() }
function unique(prefix) { return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) }
function context() {
  if (!store.getCurrentStudentId()) throw new Error('请先登录')
  const student = store.getStudentView()
  const today = store.getAcademicStatus().asOf
  return { student: { id: student.id, name: student.name, nickname: student.nickname }, today,
    earliestDate: fixtures.JOINED_ON, initialPlanEndDate: dates.addDays(today, 6),
    latestPlanDate: dates.addDays(today, 30), settings: store.getSettings() }
}
function load(ctx) {
  const all = copy(wx.getStorageSync(KEY) || {})
  const sid = ctx.student.id
  if (!all[sid]) {
    const seed = fixtures.getStudentFixtures(sid)
    const records = {}
    seed.records.forEach(row => { records[row.date] = copy(row) })
    all[sid] = { version: 1, plans: [], records, recordAudit: [] }
    wx.setStorageSync(KEY, all)
  }
  return copy(all[sid])
}
function save(ctx, state) {
  const all = wx.getStorageSync(KEY) || {}
  all[ctx.student.id] = state
  wx.setStorageSync(KEY, all)
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(label + '需为 1–' + max + ' 个字符')
  return value.trim()
}
function validateDate(value, from, to) {
  if (!Number.isFinite(dates.dayNumber(value)) || value < from || value > to) throw new Error('日期需在 ' + from + ' 至 ' + to + ' 之间')
  return value
}
function visibleFields(settings) {
  return FIELDS.filter(key => key === 'learningMinutes' || (key === 'pressureScore' ? settings.showMental : settings.showHealth))
}
function visibleRecord(row, settings) {
  if (!row) return null
  const next = copy(row)
  const visible = visibleFields(settings)
  FIELDS.forEach(key => {
    if (visible.indexOf(key) < 0) { delete next[key]; if (next.sources) delete next.sources[key] }
  })
  if (!settings.showMental) delete next.scaleVersion
  return next
}
function weekKey(date) {
  const n = dates.dayNumber(date)
  return dates.addDays(date, -(((n + 3) % 7 + 7) % 7))
}
// 按模拟日期投影历史；重播预警时未来完成/延期不能提前生效。
function projectPlan(raw, asOf) {
  const plan = copy(raw)
  plan.tasks = plan.tasks.filter(task => task.createdDate <= asOf).map(task => {
    task.status = 'pending'
    task.dueDate = task.originalDueDate
    task.completedDate = null
    task.canceledDate = null
    task.changeLog = (task.changeLog || []).filter(log => log.date <= asOf)
    task.changeLog.forEach(log => {
      if (log.action === 'postpone') task.dueDate = log.toDueDate
      if (log.action === 'complete') { task.status = 'completed'; task.completedDate = log.date }
      if (log.action === 'cancel') { task.status = 'canceled'; task.canceledDate = log.date }
    })
    task.overdueDays = task.status === 'pending' ? Math.max(0, dates.dayNumber(asOf) - dates.dayNumber(task.dueDate)) : 0
    task.statusLabel = task.status === 'completed' ? '已完成' : task.status === 'canceled' ? '已取消' : task.overdueDays ? '逾期 ' + task.overdueDays + ' 天' : '待完成'
    return task
  })
  plan.stats = metrics.calculatePlanStats(plan, asOf)
  return plan
}
function plansAt(state, today) {
  return state.plans.filter(plan => plan.createdDate <= today).map(plan => projectPlan(plan, today))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
function getPlanSuggestion() {
  const ctx = context()
  const warning = store.getAcademicWarning()
  const student = store.getStudent()
  const tasks = warning ? [
    { title: '核对作业要求，完成一项待办练习', dueDate: dates.addDays(ctx.today, 1) },
    { title: '整理一次小测错题，写下两个疑问', dueDate: dates.addDays(ctx.today, 3) },
    { title: student.learning.attendanceRate < 0.9 ? '核对本周课程，完成一次课前准备' : '回顾一周计划，选择下一步重点', dueDate: dates.addDays(ctx.today, 6) }
  ] : [
    { title: '选一门课程，写下本周学习目标', dueDate: dates.addDays(ctx.today, 1) },
    { title: '完成一次课程练习并整理问题', dueDate: dates.addDays(ctx.today, 3) },
    { title: '回顾学习记录，调整下周安排', dueDate: dates.addDays(ctx.today, 6) }
  ]
  return { title: warning ? '我的一周学业改善计划' : '我的一周学习计划',
    reason: warning ? '从一件具体的小事开始。任务完成用于记录行动，预警仍按原有规则观察。' : '把本周想做的事拆成三个可完成的步骤，可按自己的节奏修改。',
    sourceWarningId: warning ? warning.id : null, tasks }
}
function createPlan(input) {
  const ctx = context(); const state = load(ctx)
  const value = input || {}
  const source = value.sourceWarningId || null
  const warning = store.getAcademicWarning()
  if (source && (!warning || source !== warning.id)) throw new Error('预警已变化，请刷新后重新创建计划')
  const existing = state.plans.find(p => source ? p.sourceWarningId === source : !p.sourceWarningId && p.weekKey === weekKey(ctx.today))
  if (existing && existing.createdDate > ctx.today) throw new Error('此周期已有计划，请推进到 ' + existing.createdDate + ' 后查看')
  if (existing) return { plan: projectPlan(existing, ctx.today), reused: true }
  const title = text(value.title, 50, '计划标题')
  if (!Array.isArray(value.tasks) || value.tasks.length < 1 || value.tasks.length > 8) throw new Error('每份计划需有 1–8 项任务')
  const tasks = value.tasks.map(item => ({ id: unique('task'), title: text(item.title, 80, '任务内容'),
    originalDueDate: validateDate(item.dueDate, ctx.today, ctx.initialPlanEndDate), dueDate: item.dueDate,
    status: 'pending', completedDate: null, canceledDate: null, createdDate: ctx.today, changeLog: [] }))
  const plan = { id: unique('plan'), studentId: ctx.student.id, title, sourceWarningId: source,
    weekKey: weekKey(ctx.today), createdDate: ctx.today, startDate: ctx.today, endDate: ctx.initialPlanEndDate, createdAt: stamp(), tasks }
  state.plans.push(plan); save(ctx, state)
  return { plan: projectPlan(plan, ctx.today), reused: false }
}
function getPlans() { const ctx = context(); return plansAt(load(ctx), ctx.today) }
function updateTask(planId, taskId, action, options) {
  const ctx = context(); const state = load(ctx)
  const plan = state.plans.find(p => p.id === planId && p.createdDate <= ctx.today)
  const task = plan && plan.tasks.find(t => t.id === taskId)
  if (!task) throw new Error('找不到当前学生的任务')
  if (['complete', 'postpone', 'cancel'].indexOf(action) < 0) throw new Error('无效的任务操作')
  if (task.changeLog.some(log => log.date > ctx.today)) throw new Error('该任务有之后日期的操作，请推进到原日期后再处理')
  if (task.status !== 'pending') throw new Error('只有待完成任务可以操作')
  const log = { action, date: ctx.today, recordedAt: stamp() }
  if (action === 'postpone') {
    const opts = options || {}
    validateDate(opts.dueDate, ctx.today, ctx.latestPlanDate)
    if (opts.dueDate <= task.dueDate) throw new Error('新期限需晚于当前期限')
    log.reason = text(opts.reason, 200, '延期原因')
    log.fromDueDate = task.dueDate; log.toDueDate = opts.dueDate
    task.dueDate = opts.dueDate
  } else if (action === 'complete') { task.status = 'completed'; task.completedDate = ctx.today }
  else { task.status = 'canceled'; task.canceledDate = ctx.today }
  task.changeLog.push(log); save(ctx, state)
  return projectPlan(plan, ctx.today)
}
function getDailyRecord(date) {
  const ctx = context()
  validateDate(date, ctx.earliestDate, ctx.today)
  return visibleRecord(load(ctx).records[date], ctx.settings)
}
function numeric(value, key) {
  if (value === null || value === '' || typeof value === 'string' && !value.trim()) return null
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('请填写有效数值')
  const n = Number(value)
  const max = key === 'sleepHours' ? 24 : key === 'pressureScore' ? 20 : 1440
  if (!Number.isFinite(n) || n < 0 || n > max || key !== 'sleepHours' && !Number.isInteger(n)) throw new Error(key === 'sleepHours' ? '睡眠时长需在 0–24 小时之间' : key === 'pressureScore' ? '压力自评需为 0–20 的整数' : '学习与运动时长需为 0–1440 的整数分钟')
  return n
}
function saveDailyRecord(input) {
  const ctx = context(); const state = load(ctx)
  const value = input || {}
  const date = validateDate(value.date, ctx.earliestDate, ctx.today)
  const previous = state.records[date] || null
  const row = previous ? copy(previous) : { date, learningMinutes: null, exerciseMinutes: null, sleepHours: null, pressureScore: null, sources: {}, scaleVersion: SCALE, revision: 0 }
  if (!row.sources) row.sources = {}
  visibleFields(ctx.settings).forEach(key => {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const next = numeric(value[key], key)
      if (next !== row[key]) { row[key] = next; row.sources[key] = 'self' }
      if (key === 'pressureScore' && next !== null) row.scaleVersion = SCALE
    }
  })
  if (!visibleFields(ctx.settings).some(key => typeof row[key] === 'number')) throw new Error('请至少填写一项记录；没有记录可直接留空')
  // 同值重复点击不制造修订，不将保留的示例字段误标为学生填写。
  if (previous && FIELDS.every(key => previous[key] === row[key]) && previous.scaleVersion === row.scaleVersion) return visibleRecord(previous, ctx.settings)
  const pastRevision = state.recordAudit.filter(entry => entry.date === date).reduce((max, entry) => Math.max(max,
    entry.previous && entry.previous.revision || 0, entry.next && entry.next.revision || 0), 0)
  row.revision = Math.max(previous && previous.revision || 0, pastRevision) + 1
  row.origin = 'self'; row.updatedAt = stamp()
  state.records[date] = row
  state.recordAudit.push({ action: previous ? 'update' : 'create', date, recordedAt: row.updatedAt, previous: previous ? copy(previous) : null, next: copy(row) })
  save(ctx, state)
  return visibleRecord(row, ctx.settings)
}
function deleteDailyRecord(date) {
  const ctx = context(); const state = load(ctx)
  validateDate(date, ctx.earliestDate, ctx.today)
  const previous = state.records[date]
  if (!previous) return false
  state.recordAudit.push({ action: 'delete', date, recordedAt: stamp(), previous: copy(previous), next: null })
  delete state.records[date]; save(ctx, state)
  return true
}
function getRecordHistory() {
  const ctx = context(); const state = load(ctx)
  const from = dates.addDays(ctx.today, -13)
  return Object.keys(state.records).filter(date => date >= from && date <= ctx.today).sort().reverse()
    .map(date => visibleRecord(state.records[date], ctx.settings))
    .filter(row => visibleFields(ctx.settings).some(key => typeof row[key] === 'number'))
}
function reportFor(ctx, state) {
  return metrics.buildReport({ asOf: ctx.today, joinedOn: ctx.earliestDate,
    records: Object.keys(state.records).map(date => state.records[date]),
    learning: fixtures.getStudentFixtures(ctx.student.id).learning, plans: plansAt(state, ctx.today), settings: ctx.settings })
}
function getReport() { const ctx = context(); return reportFor(ctx, load(ctx)) }
function getDashboardSummary() {
  const ctx = context(); const state = load(ctx); const plans = plansAt(state, ctx.today)
  const active = plans.reduce((sum, p) => sum + p.stats.active, 0)
  const completed = plans.reduce((sum, p) => sum + p.stats.completed, 0)
  const row = state.records[ctx.today]
  const status = reportFor(ctx, state).status
  return { today: ctx.today, planCount: plans.length, activeTasks: active - completed, completedTasks: completed,
    completionPercent: active ? Math.round(completed / active * 1000) / 10 : null,
    recordedToday: !!(row && visibleFields(ctx.settings).some(key => typeof row[key] === 'number')),
    learningMinutes: row && typeof row.learningMinutes === 'number' ? row.learningMinutes : null,
    reportStatusLabel: status.label, reportStatusKey: status.key }
}
function advanceDay() { context(); return store.advanceDemoDate(1) }
module.exports = { getContext: context, getPlanSuggestion, createPlan, getPlans, updateTask,
  getDailyRecord, saveDailyRecord, deleteDailyRecord, getRecordHistory, getReport, getDashboardSummary, advanceDay }
