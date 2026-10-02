// 成长周报只描述学习过程，不参与预警值或预警等级计算。
const { dayNumber, addDays } = require('./academic-rules')

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const PRESSURE_SCALE = 'stress-self-v1-20'
const MIN_SELF_DAYS = 4
const VALID_FIELDS = {
  learningMinutes: { max: 1440, integer: true },
  exerciseMinutes: { max: 1440, integer: true },
  sleepHours: { max: 24, integer: false },
  pressureScore: { max: 20, integer: true }
}

function validDay(value) { return Number.isFinite(dayNumber(value)) }
function round(value) { return Math.round((value + Number.EPSILON) * 10) / 10 }
function percent(numerator, denominator) { return denominator ? round(numerator / denominator * 100) : null }
function numberText(value) { return String(round(value)) }
function percentText(value) { return value === null ? '暂无数据' : numberText(value) + '%' }
function inWindow(date, from, to) { return validDay(date) && date >= from && date <= to }
function validValue(record, field) {
  const value = record[field]
  const rule = VALID_FIELDS[field]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= rule.max &&
    (!rule.integer || Number.isInteger(value)) && (field !== 'pressureScore' || record.scaleVersion === PRESSURE_SCALE)
}
function visibleFields(settings) {
  const fields = ['learningMinutes']
  if (settings.showHealth !== false) fields.push('exerciseMinutes', 'sleepHours')
  if (settings.showMental !== false) fields.push('pressureScore')
  return fields
}
function assertAsOf(asOf) {
  if (!validDay(asOf)) throw new Error('统计日期必须是有效的 YYYY-MM-DD 日期')
}

function calculatePlanStats(plan, asOf) {
  assertAsOf(asOf)
  const stats = {
    total: 0, active: 0, completed: 0, canceled: 0, overdue: 0,
    dueCount: 0, onTimeCount: 0, rescheduled: 0,
    completionPercent: null, onTimePercent: null
  }
  if (!plan || (validDay(plan.createdDate) && plan.createdDate > asOf)) return stats
  ;(plan.tasks || []).forEach(task => {
    const createdDate = task.createdDate || plan.createdDate
    if (validDay(createdDate) && createdDate > asOf) return
    stats.total += 1
    const canceled = task.status === 'canceled' && validDay(task.canceledDate) && task.canceledDate <= asOf
    const completed = task.status === 'completed' && validDay(task.completedDate) && task.completedDate <= asOf
    if ((task.changeLog || []).some(event => event.action === 'postpone' && validDay(event.date) && event.date <= asOf)) stats.rescheduled += 1
    if (canceled) { stats.canceled += 1; return }
    stats.active += 1
    if (completed) stats.completed += 1
    if (!completed && validDay(task.dueDate) && task.dueDate < asOf) stats.overdue += 1
    const originalDueDate = task.originalDueDate || task.dueDate
    if (validDay(originalDueDate) && originalDueDate <= asOf) {
      stats.dueCount += 1
      if (completed && task.completedDate <= originalDueDate) stats.onTimeCount += 1
    }
  })
  stats.completionPercent = percent(stats.completed, stats.active)
  stats.onTimePercent = percent(stats.onTimeCount, stats.dueCount)
  return stats
}

function latestDailyRows(records, joinedOn, asOf) {
  const byDate = {}
  const rows = Array.isArray(records) ? records : Object.keys(records || {}).map(key => records[key])
  rows.forEach(record => {
    if (!record || !inWindow(record.date, joinedOn, asOf)) return
    const previous = byDate[record.date]
    if (!previous || (Number(record.revision) || 0) >= (Number(previous.revision) || 0)) byDate[record.date] = record
  })
  return Object.keys(byDate).sort().map(date => byDate[date])
}

// 只接收含时区的时间戳；避免不同设备时区改变作业归属日期。
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN
  const ms = Date.parse(value)
  return Number.isFinite(ms) && validDay(value.slice(0, 10)) ? ms : NaN
}
function shanghaiDate(ms) { return new Date(ms + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10) }
function uniqueRows(rows) {
  const seen = Object.create(null)
  return (rows || []).filter(row => {
    if (!row || typeof row !== 'object') return false
    if (row.id === undefined || row.id === null) return true
    if (seen[row.id]) return false
    seen[row.id] = true
    return true
  })
}
function schoolWindow(learning, from, to, joinedOn, asOf) {
  const attendance = uniqueRows(learning.attendance).filter(row => inWindow(row.date, from, to) && row.date >= joinedOn && row.date <= asOf && row.excused !== true && typeof row.attended === 'boolean')
  const attended = attendance.filter(row => row.attended).length
  const cutoff = Date.parse(asOf + 'T23:59:59.999+08:00')
  let due = 0, submitted = 0, onTime = 0
  uniqueRows(learning.assignments).forEach(row => {
    const dueAt = timestamp(row.dueAt)
    if (!Number.isFinite(dueAt) || dueAt > cutoff) return
    const dueDate = shanghaiDate(dueAt)
    if (!inWindow(dueDate, from, to) || dueDate < joinedOn) return
    due += 1
    const submittedAt = timestamp(row.submittedAt)
    if (Number.isFinite(submittedAt) && submittedAt <= cutoff) {
      submitted += 1
      if (submittedAt <= dueAt) onTime += 1
    }
  })
  return {
    // 趋势使用原始比率；仅展示时四舍五入，防止阈值附近发生分类漂移。
    attendance: { count: attendance.length, numerator: attended, value: attendance.length ? attended / attendance.length * 100 : null },
    assignments: { count: due, numerator: onTime, submitted, value: due ? onTime / due * 100 : null }
  }
}
function changeText(current, previous, unit) {
  const delta = round(current - previous)
  if (delta === 0) return '与前 7 天持平'
  return '较前 7 天' + (delta > 0 ? '增加 ' : '减少 ') + numberText(Math.abs(delta)) + ' ' + unit
}
function schoolCard(key, label, current, previous, minimum) {
  const comparable = current.count >= minimum && previous.count >= minimum
  const attendance = key === 'attendanceRate'
  const formula = attendance
    ? '有效出勤课次 ÷ 应到课次 × 100%；已批准请假不计入分子和分母。两窗各至少 3 节才比较。'
    : '按时提交项数 ÷ 窗口内到期作业数 × 100%；截至模拟日期当日末尾，迟交只计已提交，不计按时。两窗各至少 2 项才比较。'
  return {
    key, label, valueText: percentText(current.value),
    detail: attendance ? '出勤 ' + current.numerator + ' / 应到 ' + current.count + ' 节（已扣除请假）' : '按时 ' + current.numerator + ' / 到期 ' + current.count + ' 项 · 已提交 ' + current.submitted + ' 项',
    previousText: '前 7 天 ' + percentText(previous.value) + '（' + previous.numerator + '/' + previous.count + '）',
    changeText: comparable ? changeText(current.value, previous.value, '个百分点') : '两窗各需至少 ' + minimum + (attendance ? ' 节有效课次' : ' 项到期作业') + '，暂不比较',
    tone: !comparable ? 'muted' : current.value > previous.value ? 'good' : current.value < previous.value ? 'warn' : 'neutral',
    source: attendance ? '教务课堂签到 · 本地模拟明细' : '教学平台作业 · 本地模拟明细',
    formula
  }
}
function selfWindow(rows, field, from, to) {
  const values = rows.filter(row => inWindow(row.date, from, to) && validValue(row, field)).map(row => row[field])
  return { count: values.length, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
}
function selfCard(rows, field, label, unit, period) {
  const current = selfWindow(rows, field, period.from, period.to)
  const previous = selfWindow(rows, field, period.previousFrom, period.previousTo)
  const comparable = current.count >= MIN_SELF_DAYS && previous.count >= MIN_SELF_DAYS
  const formula = '有效记录之和 ÷ 有效记录天数；未记录不计零。两窗各至少 4 天才比较均值。' + (field === 'pressureScore' ? '仅使用 stress-self-v1-20（0–20）自评；不与旧问卷混算，不用于诊断。' : field === 'sleepHours' ? '睡眠记在醒来当天。' : '')
  return {
    key: field, label,
    valueText: current.value === null ? '暂无记录' : numberText(current.value) + ' ' + unit,
    detail: '近 7 天有 ' + current.count + ' 天有效记录',
    previousText: '前 7 天 ' + (previous.value === null ? '暂无记录' : numberText(previous.value) + ' ' + unit) + '（' + previous.count + ' 天）',
    changeText: comparable ? changeText(current.value, previous.value, unit) : '两窗各需至少 4 天记录，暂不比较',
    // 自报数值的增加或减少不能单独判断好坏。
    tone: current.value === null || !comparable ? 'muted' : 'neutral',
    source: '每日记录 · 来源见记录详情', formula
  }
}
function planCard(plans, asOf, period) {
  const relevant = (plans || []).filter(plan => !validDay(plan.createdDate) || plan.createdDate <= asOf).map(plan => {
    return Object.assign({}, plan, { tasks: (plan.tasks || []).filter(task => inWindow(task.originalDueDate || task.dueDate, period.from, period.to)) })
  })
  const sum = relevant.map(plan => calculatePlanStats(plan, asOf)).reduce((result, stats) => {
    result.dueCount += stats.dueCount
    result.onTimeCount += stats.onTimeCount
    result.canceled += stats.canceled
    result.rescheduled += stats.rescheduled
    return result
  }, { dueCount: 0, onTimeCount: 0, canceled: 0, rescheduled: 0 })
  return {
    key: 'planOnTimeRate', label: '计划任务按时率', valueText: percentText(percent(sum.onTimeCount, sum.dueCount)),
    detail: '按时 ' + sum.onTimeCount + ' / 原定本期到期 ' + sum.dueCount + ' 项 · 取消 ' + sum.canceled + ' 项 · 延期 ' + sum.rescheduled + ' 项',
    previousText: '以原截止日期归属本期', changeText: '不参与学习过程趋势判断', tone: sum.dueCount ? 'neutral' : 'muted',
    source: '一周改善计划 · 本人操作记录',
    formula: '本期原定到期且按原期限完成的任务 ÷ 本期原定到期的未取消任务 × 100%；延期不改变原期限；零项到期时不计算。'
  }
}

function buildReport(input) {
  const { asOf } = input
  assertAsOf(asOf)
  const joinedOn = validDay(input.joinedOn) ? input.joinedOn : addDays(asOf, -13)
  const settings = input.settings || {}
  const period = {
    from: addDays(asOf, -6), to: asOf,
    previousFrom: addDays(asOf, -13), previousTo: addDays(asOf, -7)
  }
  period.label = period.from + ' — ' + period.to
  period.previousLabel = period.previousFrom + ' — ' + period.previousTo
  const rows = latestDailyRows(input.records, joinedOn, asOf)
  const learning = input.learning || {}
  const current = schoolWindow(learning, period.from, period.to, joinedOn, asOf)
  const previous = schoolWindow(learning, period.previousFrom, period.previousTo, joinedOn, asOf)
  const academic = [
    schoolCard('attendanceRate', '课堂出勤率', current.attendance, previous.attendance, 3),
    schoolCard('assignmentOnTimeRate', '作业按时提交率', current.assignments, previous.assignments, 2),
    selfCard(rows, 'learningMinutes', '日均自主学习', '分钟', period),
    planCard(input.plans, asOf, period)
  ]
  const wellbeing = []
  if (settings.showHealth !== false) {
    wellbeing.push(selfCard(rows, 'exerciseMinutes', '日均运动记录', '分钟', period))
    wellbeing.push(selfCard(rows, 'sleepHours', '日均睡眠记录', '小时', period))
  }
  if (settings.showMental !== false) wellbeing.push(selfCard(rows, 'pressureScore', '平均压力自评', '分', period))

  const comparable = current.attendance.count >= 3 && previous.attendance.count >= 3 && current.assignments.count >= 2 && previous.assignments.count >= 2
  const status = { key: 'insufficient', label: '样本不足', description: '两窗各需至少 3 节有效课次和 2 项到期作业，才能判断学习过程趋势。' }
  if (comparable) {
    const averageChange = ((current.attendance.value - previous.attendance.value) + (current.assignments.value - previous.assignments.value)) / 2
    status.key = averageChange + 1e-10 >= 5 ? 'improving' : averageChange - 1e-10 <= -5 ? 'declining' : 'stable'
    status.label = status.key === 'improving' ? '学习过程改善' : status.key === 'declining' ? '学习过程有所下降' : '学习过程基本持平'
    status.description = '出勤率与作业按时率的平均变化为 ' + (round(averageChange) > 0 ? '+' : '') + numberText(averageChange) + ' 个百分点。此处反映学习过程，不代表预警值变化。'
  }
  const fields = visibleFields(settings)
  const days = rows.filter(row => inWindow(row.date, period.from, asOf) && fields.some(field => validValue(row, field))).length
  const expected = Math.max(0, Math.min(7, dayNumber(asOf) - dayNumber(joinedOn) + 1))
  const coverage = { days, expected, percent: percent(days, expected), label: days + ' / ' + expected + ' 天有可见记录' }
  const studyBars = []
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(period.from, i)
    const row = rows.find(record => record.date === date)
    const value = row && validValue(row, 'learningMinutes') ? row.learningMinutes : null
    studyBars.push({ date, label: date.slice(5).replace('-', '/'), value, height: 0, isMissing: value === null })
  }
  const maximum = Math.max(0, ...studyBars.map(bar => bar.value === null ? 0 : bar.value))
  studyBars.forEach(bar => { bar.height = maximum && bar.value !== null ? round(bar.value / maximum * 100) : 0 })
  const advice = []
  if (status.key === 'insufficient') advice.push('先补充本期的学习记录；教务明细不足时，暂不判断学习过程是否改善。')
  else if (status.key === 'improving') advice.push('回看这 7 天哪些安排帮助了出勤和作业提交，把有效做法加入下一轮计划。')
  else if (status.key === 'declining') advice.push('先检查缺勤课次和未按时提交的作业，选择一个可完成的小任务；需要协助时可从预警详情请求帮助。')
  else advice.push('回看尚未完成的计划任务，确认下一步行动与实际课程安排一致。')
  if (coverage.days < coverage.expected) advice.push('未记录的日期会保留为空；补记时按实际情况填写，不必为了完整度填写零。')
  advice.push('学习时长用于回顾安排，时间变长本身不代表学习效果更好。')
  const methods = [
    { title: '统计日期', formula: '近 7 天含模拟日期当天，前 7 天为紧邻的上一窗口；作业统计截点为模拟日期 23:59:59（北京时间）。' },
    { title: '学习过程趋势', formula: '两窗各至少 3 节有效课次和 2 项到期作业。出勤率变化与作业按时率变化等权平均：≥5 个百分点为改善，≤−5 为下降，其余持平。展示值四舍五入，分类使用原始比率；仅作过程回顾，不用于预警评分。' }
  ].concat(academic.concat(wellbeing).map(card => ({ title: card.label, formula: card.formula })))
  methods.push({ title: '记录覆盖率', formula: '近 7 天中至少一个可见字段有有效值的天数 ÷ 本期应记录天数；应记录天数不超过加入至今的天数。隐藏字段不参与此统计。' })
  const shownRows = rows.filter(row => inWindow(row.date, period.previousFrom, asOf) && fields.some(field => validValue(row, field)))
  // 编辑一个字段不会把同日其他字段的示例数据变为本人填写。
  const sources = []
  shownRows.forEach(row => fields.forEach(field => {
    if (!validValue(row, field)) return
    const source = row.sources && row.sources[field]
    if (typeof source === 'string' && /mock|模拟|示例/i.test(source)) sources.push('mock')
    else if (typeof source === 'string' && /self|本人|自主/i.test(source)) sources.push('self')
    else sources.push(row.origin === 'mock' || row.origin === 'self' ? row.origin : 'unknown')
  }))
  const hasSelf = sources.indexOf('self') >= 0
  const hasMock = sources.indexOf('mock') >= 0
  const recordLabel = hasSelf && hasMock ? '示例与本人记录' : hasSelf ? '本人记录' : hasMock ? '示例记录' : sources.length ? '来源待核对' : '尚无可见记录'
  return {
    period, status, academic, wellbeing, coverage, studyBars, advice, methods,
    sourceLabel: '教务过程明细：本地模拟；每日记录：' + recordLabel + (sources.indexOf('unknown') >= 0 && (hasSelf || hasMock) ? '（部分来源待核对）' : '') + '。周报独立于原画像累计数据。'
  }
}

module.exports = { calculatePlanStats, buildReport }
