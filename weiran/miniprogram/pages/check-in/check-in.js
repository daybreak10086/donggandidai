const definePage = require('../../utils/page')
const growth = require('../../utils/growth-store')
const fields = ['learningMinutes', 'exerciseMinutes', 'sleepHours', 'pressureScore']

function blankForm() { return { learningMinutes: '', exerciseMinutes: '', sleepHours: '', pressureScore: '' } }
function asInput(value) { return value === null || value === undefined ? '' : String(value) }
function sourceText(value) {
  if (!value) return ''
  if (value === 'mock') return '模拟记录'
  if (value === 'self') return '自主填写'
  return typeof value === 'string' ? value : ''
}
function itemText(value, unit) { return value === null || value === undefined ? '未填写' : String(value) + unit }
function message(error) { wx.showToast({ title: error.message || '操作未完成，请重试', icon: 'none' }) }
function isCurrentStudent(id) {
  try { if (growth.getContext().student.id === id) return true } catch (_) {}
  wx.showToast({ title: '账号已变化，请重新操作', icon: 'none' })
  return false
}

definePage({
  data: {
    studentId: '', today: '', earliestDate: '', selectedDate: '', showHealth: true, showMental: true,
    form: blankForm(), sources: {}, history: [], hasRecord: false, revision: 0, recordOrigin: '',
    dirty: false, saving: false
  },
  onShow: function () { this.refresh(false, true) },
  refresh: function (selectToday, preserveDraft) {
    const context = growth.getContext()
    const switched = this.data.studentId !== context.student.id
    const previousDate = this.data.selectedDate
    const selected = selectToday || switched || !previousDate || previousDate > context.today || previousDate < context.earliestDate ? context.today : previousDate
    const keepDraft = preserveDraft && this.data.dirty && !switched && selected === previousDate
    const previousForm = Object.assign({}, this.data.form)
    const previouslyVisible = { learningMinutes: true, exerciseMinutes: this.data.showHealth, sleepHours: this.data.showHealth, pressureScore: this.data.showMental }
    this.setData({
      studentId: context.student.id, today: context.today, earliestDate: context.earliestDate,
      showHealth: context.settings.showHealth, showMental: context.settings.showMental
    })
    this.loadDate(selected)
    if (keepDraft) {
      const restored = Object.assign({}, this.data.form)
      const visible = { learningMinutes: true, exerciseMinutes: this.data.showHealth, sleepHours: this.data.showHealth, pressureScore: this.data.showMental }
      fields.forEach(function (key) { if (visible[key] && previouslyVisible[key]) restored[key] = previousForm[key] })
      this.setData({ form: restored, dirty: fields.some(key => restored[key] !== this.data.form[key]) })
    }
    this.setData({ history: growth.getRecordHistory().map(function (item) {
      return Object.assign({}, item, {
        learningText: itemText(item.learningMinutes, ' 分钟'), exerciseText: itemText(item.exerciseMinutes, ' 分钟'),
        sleepText: itemText(item.sleepHours, ' 小时'), pressureText: itemText(item.pressureScore, ' / 20'),
        originText: item.origin === 'mock' ? '模拟记录' : '自主更新'
      })
    }) })
  },
  loadDate: function (date) {
    const record = growth.getDailyRecord(date)
    const form = blankForm()
    const sources = {}
    fields.forEach(function (key) {
      form[key] = asInput(record && record[key])
      sources[key] = sourceText(record && record.sources && record.sources[key])
    })
    if (!this.data.showHealth) { form.exerciseMinutes = ''; form.sleepHours = ''; delete sources.exerciseMinutes; delete sources.sleepHours }
    if (!this.data.showMental) { form.pressureScore = ''; delete sources.pressureScore }
    this.setData({
      selectedDate: date, form: form, sources: sources, hasRecord: !!record,
      revision: record ? record.revision : 0, recordOrigin: record ? (record.origin === 'mock' ? '模拟记录' : '自主更新') : '', dirty: false
    })
  },
  confirmDiscard: function (callback) {
    if (!this.data.dirty) { callback(); return }
    const studentId = this.data.studentId
    wx.showModal({ title: '有尚未保存的修改', content: '继续会放弃这一页尚未保存的修改。', confirmText: '放弃修改', cancelText: '继续填写', success: function (result) { if (result.confirm && isCurrentStudent(studentId)) callback() } })
  },
  onDateChange: function (event) {
    const date = event.detail.value
    this.confirmDiscard(() => { try { this.loadDate(date) } catch (error) { message(error) } })
  },
  selectHistory: function (event) {
    const date = event.currentTarget.dataset.date
    this.confirmDiscard(() => {
      try {
        this.loadDate(date)
        if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 200 })
      } catch (error) { message(error) }
    })
  },
  onFieldInput: function (event) {
    const key = event.currentTarget.dataset.field
    if (fields.indexOf(key) < 0) return
    this.setData({ form: Object.assign({}, this.data.form, { [key]: event.detail.value }), dirty: true })
  },
  saveRecord: function () {
    if (this.data.saving) return
    this.setData({ saving: true })
    const input = { date: this.data.selectedDate, learningMinutes: this.data.form.learningMinutes }
    if (this.data.showHealth) { input.exerciseMinutes = this.data.form.exerciseMinutes; input.sleepHours = this.data.form.sleepHours }
    if (this.data.showMental) input.pressureScore = this.data.form.pressureScore
    try {
      growth.saveDailyRecord(input); this.refresh(false)
      wx.showToast({ title: '记录已保存', icon: 'success' })
    } catch (error) { message(error) }
    this.setData({ saving: false })
  },
  deleteRecord: function () {
    if (!this.data.hasRecord) return
    const date = this.data.selectedDate
    const studentId = this.data.studentId
    wx.showModal({
      title: '删除当天记录？', content: '将删除 ' + date + ' 的整条记录，包含已在设置中隐藏的字段。删除后不参与周报统计。', confirmText: '删除记录', cancelText: '保留记录',
      success: (result) => {
        if (!result.confirm || !isCurrentStudent(studentId)) return
        try { growth.deleteDailyRecord(date); this.refresh(false); wx.showToast({ title: '记录已删除', icon: 'success' }) } catch (error) { message(error) }
      }
    })
  },
  advanceDay: function () {
    this.confirmDiscard(() => {
      try { growth.advanceDay(); this.refresh(true); wx.showToast({ title: '模拟日期已推进', icon: 'none' }) } catch (error) { message(error) }
    })
  },
  goReport: function () { this.confirmDiscard(function () { wx.navigateTo({ url: '/pages/weekly-report/weekly-report' }) }) },
  goPlan: function () { this.confirmDiscard(function () { wx.navigateTo({ url: '/pages/plan/plan' }) }) }
})
