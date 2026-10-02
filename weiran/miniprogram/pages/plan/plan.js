const definePage = require('../../utils/page')
const growth = require('../../utils/growth-store')
const dates = require('../../utils/academic-rules')

function message(error) { wx.showToast({ title: error.message || '操作未完成，请重试', icon: 'none' }) }
function isCurrentStudent(id) {
  try { if (growth.getContext().student.id === id) return true } catch (_) {}
  wx.showToast({ title: '账号已变化，请重新操作', icon: 'none' })
  return false
}
function percent(value) { return value === null || value === undefined ? '—' : String(value) + '%' }
function viewPlans(plans) {
  const labels = { complete: '已完成', postpone: '调整期限', cancel: '已取消' }
  return plans.map(function (plan) {
    return Object.assign({}, plan, {
      completionText: percent(plan.stats.completionPercent),
      onTimeText: percent(plan.stats.onTimePercent),
      pendingCount: plan.stats.active - plan.stats.completed,
      tasks: plan.tasks.map(function (task) {
        return Object.assign({}, task, {
          logs: (task.changeLog || []).map(function (log, i) {
            return {
              key: task.id + '-' + i,
              label: labels[log.action] || '更新',
              date: log.date || '',
              detail: log.toDueDate ? log.fromDueDate + ' → ' + log.toDueDate : '',
              reason: log.reason || ''
            }
          })
        })
      })
    })
  })
}

definePage({
  data: {
    studentId: '', studentName: '', today: '', earliestDate: '', initialPlanEndDate: '', latestPlanDate: '',
    plans: [], draftVisible: false, draftTitle: '', draftReason: '', sourceWarningId: null,
    draftTasks: [], postpone: null, saving: false
  },
  onLoad: function (options) { this.fromWarning = !!(options && options.from === 'warning') },
  onShow: function () { this.refresh() },
  refresh: function () {
    const context = growth.getContext()
    const switched = this.data.studentId !== context.student.id
    const moved = this.data.today && this.data.today !== context.today
    const plans = viewPlans(growth.getPlans())
    this.setData({
      studentId: context.student.id, studentName: context.student.nickname || context.student.name,
      today: context.today, earliestDate: context.earliestDate,
      initialPlanEndDate: context.initialPlanEndDate || dates.addDays(context.today, 6),
      latestPlanDate: context.latestPlanDate, plans: plans,
      postpone: switched || moved ? null : this.data.postpone
    })
    if (switched || moved) this.setData({ draftVisible: false, draftTasks: [] })
    if (plans.length === 0 && !this.data.draftVisible) this.openDraft()
  },
  openDraft: function () {
    const suggestion = growth.getPlanSuggestion()
    const weekday = ((dates.dayNumber(this.data.today) + 3) % 7 + 7) % 7
    const weekStart = dates.addDays(this.data.today, -weekday)
    const weekEnd = dates.addDays(weekStart, 6)
    const existing = this.data.plans.find(function (plan) {
      if (suggestion.sourceWarningId) return plan.sourceWarningId === suggestion.sourceWarningId
      return !plan.sourceWarningId && (plan.weekKey === weekStart || plan.createdDate >= weekStart && plan.createdDate <= weekEnd)
    })
    if (existing) {
      wx.showToast({ title: suggestion.sourceWarningId ? '这次提醒已有计划，请继续执行' : '本周已有计划，请继续执行', icon: 'none' })
      return
    }
    this.setData({
      draftVisible: true, draftTitle: suggestion.title, draftReason: suggestion.reason,
      sourceWarningId: suggestion.sourceWarningId || null,
      draftTasks: suggestion.tasks.map(function (task, i) {
        return { key: 'draft-' + i, title: task.title, dueDate: task.dueDate }
      }), postpone: null
    })
  },
  closeDraft: function () { this.setData({ draftVisible: false }) },
  onTitleInput: function (event) { this.setData({ draftTitle: event.detail.value }) },
  onTaskTitleInput: function (event) {
    const i = Number(event.currentTarget.dataset.index)
    const tasks = this.data.draftTasks.map(function (task) { return Object.assign({}, task) })
    if (!tasks[i]) return
    tasks[i].title = event.detail.value
    this.setData({ draftTasks: tasks })
  },
  onTaskDueChange: function (event) {
    const i = Number(event.currentTarget.dataset.index)
    const tasks = this.data.draftTasks.map(function (task) { return Object.assign({}, task) })
    if (!tasks[i]) return
    tasks[i].dueDate = event.detail.value
    this.setData({ draftTasks: tasks })
  },
  addDraftTask: function () {
    if (this.data.draftTasks.length >= 8) return
    const tasks = this.data.draftTasks.concat({ key: 'draft-' + Date.now(), title: '', dueDate: this.data.initialPlanEndDate })
    this.setData({ draftTasks: tasks })
  },
  removeDraftTask: function (event) {
    if (this.data.draftTasks.length <= 1) return
    const i = Number(event.currentTarget.dataset.index)
    this.setData({ draftTasks: this.data.draftTasks.filter(function (_, index) { return index !== i }) })
  },
  createPlan: function () {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const result = growth.createPlan({
        title: this.data.draftTitle,
        sourceWarningId: this.data.sourceWarningId,
        tasks: this.data.draftTasks.map(function (task) { return { title: task.title, dueDate: task.dueDate } })
      })
      this.setData({ draftVisible: false })
      this.refresh()
      wx.showToast({ title: result.reused ? '已有对应计划' : '计划已开始', icon: result.reused ? 'none' : 'success' })
    } catch (error) { message(error) }
    this.setData({ saving: false })
  },
  completeTask: function (event) {
    const data = event.currentTarget.dataset
    try {
      growth.updateTask(data.plan, data.task, 'complete')
      this.setData({ postpone: null })
      this.refresh()
      wx.showToast({ title: '已记录完成', icon: 'success' })
    } catch (error) { message(error) }
  },
  cancelTask: function (event) {
    const data = event.currentTarget.dataset
    const studentId = this.data.studentId
    wx.showModal({
      title: '取消这项任务？', content: '取消后不再计入完成率，任务与操作记录仍会保留。', confirmText: '取消任务', cancelText: '保留任务',
      success: (result) => {
        if (!result.confirm || !isCurrentStudent(studentId)) return
        try { growth.updateTask(data.plan, data.task, 'cancel'); this.setData({ postpone: null }); this.refresh() } catch (error) { message(error) }
      }
    })
  },
  openPostpone: function (event) {
    const data = event.currentTarget.dataset
    const plan = this.data.plans.find(function (item) { return item.id === data.plan })
    const task = plan && plan.tasks.find(function (item) { return item.id === data.task })
    if (!task || task.status !== 'pending') return
    const earliest = task.dueDate < this.data.today ? this.data.today : dates.addDays(task.dueDate, 1)
    if (earliest > this.data.latestPlanDate) { wx.showToast({ title: '当前期限已到可调整上限', icon: 'none' }); return }
    this.setData({ postpone: { planId: plan.id, taskId: task.id, title: task.title, earliestDate: earliest, dueDate: earliest, reason: '' } })
  },
  onPostponeDateChange: function (event) {
    this.setData({ postpone: Object.assign({}, this.data.postpone, { dueDate: event.detail.value }) })
  },
  onPostponeReasonInput: function (event) {
    this.setData({ postpone: Object.assign({}, this.data.postpone, { reason: event.detail.value }) })
  },
  closePostpone: function () { this.setData({ postpone: null }) },
  savePostpone: function () {
    const form = this.data.postpone
    if (!form) return
    try {
      growth.updateTask(form.planId, form.taskId, 'postpone', { dueDate: form.dueDate, reason: form.reason })
      this.setData({ postpone: null }); this.refresh()
      wx.showToast({ title: '期限已调整', icon: 'success' })
    } catch (error) { message(error) }
  },
  advanceDay: function () {
    const studentId = this.data.studentId
    const advance = () => {
      if (!isCurrentStudent(studentId)) return
      try { growth.advanceDay(); this.refresh(); wx.showToast({ title: '模拟日期已推进', icon: 'none' }) } catch (error) { message(error) }
    }
    if (this.data.draftVisible || this.data.postpone) {
      wx.showModal({ title: '推进模拟日期？', content: '推进一天会重新生成建议，并放弃未确认的计划或延期内容。', confirmText: '推进一天', cancelText: '继续编辑', success: function (result) { if (result.confirm) advance() } })
    } else advance()
  },
  goCheckIn: function () { wx.navigateTo({ url: '/pages/check-in/check-in' }) },
  goReport: function () { wx.navigateTo({ url: '/pages/weekly-report/weekly-report' }) }
})
