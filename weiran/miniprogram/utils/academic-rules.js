// 本模块只决定何时升级提醒；评分与分级由独立的画像算法提供。
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_POLICY = { observationDays: 21, minimumDropRatio: 0.05, maxSampleGapDays: 7 }

function dayNumber(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN
  const ms = Date.parse(date + 'T00:00:00Z')
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? ms / DAY_MS : NaN
}
function addDays(date, days) { return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10) }

function evaluate(warning, asOf, policy) {
  const p = Object.assign({}, DEFAULT_POLICY, policy)
  const result = { escalate: false, eligible: false, observationDays: p.observationDays, minimumDropPercent: p.minimumDropRatio * 100 }
  if (!warning || warning.level === 'none') return Object.assign(result, { reason: '当前无学业预警' })
  const now = dayNumber(asOf)
  const first = dayNumber(warning.firstNotifiedAt)
  if (!Number.isFinite(now) || !Number.isFinite(first) || first > now) return Object.assign(result, { reason: '缺少有效的首次通知日期' })
  result.elapsedDays = now - first
  result.remainingDays = Math.max(0, p.observationDays - result.elapsedDays)
  if (result.remainingDays > 0) return Object.assign(result, { reason: '仍在学生自主处理观察期' })
  const history = (warning.history || []).filter(point => Number.isFinite(dayNumber(point.date)) && dayNumber(point.date) <= now && Number.isFinite(point.value) && point.value >= 0 && point.value <= 100)
    .sort((a, b) => dayNumber(a.date) - dayNumber(b.date))
  const cutoff = now - p.observationDays
  const candidates = history.filter(point => dayNumber(point.date) <= cutoff && dayNumber(point.date) >= first)
  const baseline = candidates[candidates.length - 1]
  const latest = history[history.length - 1]
  if (!baseline || !latest || baseline.date === latest.date || cutoff - dayNumber(baseline.date) > p.maxSampleGapDays || now - dayNumber(latest.date) > p.maxSampleGapDays) {
    return Object.assign(result, { reason: '观察样本不足或已过期，暂不自动升级' })
  }
  if (baseline.value === 0) return Object.assign(result, { reason: '基线预警值为零，需重新建立观察周期' })
  const dropRatio = (baseline.value - latest.value) / baseline.value
  const escalate = latest.value > 0 && dropRatio + 1e-10 < p.minimumDropRatio
  return Object.assign(result, { eligible: true, escalate, baseline, latest, dropRatio, dropPercent: (dropRatio * 100).toFixed(1), reason: escalate ? '观察期内预警值未明显下降' : '预警值已明显下降，继续关注学习进展' })
}

module.exports = { DEFAULT_POLICY, dayNumber, addDays, evaluate }
