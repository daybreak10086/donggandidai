const definePage = require('../../utils/page')
const store = require('../../utils/store')

definePage({
  data: {
    student: {}, hasWarning: false, label: '', cls: '', value: 0, reason: '',
    trendBars: [], escalation: false, escalationText: '', actions: [], events: [],
    demoDate: '', status: {}, firstNotifiedAt: '', canReplay: false
  },
  onShow: function () { this.refresh() },
  refresh: function () {
    const sid = store.getCurrentStudentId()
    const status = store.evaluateAcademic(sid)
    const student = store.getStudentView(sid)
    const w = store.getAcademicWarning(sid)
    const counselorEvents = store.getCounselorEvents(sid)
    const trendBars = w ? w.history.slice(-8).map(p => ({
      value: p.value, label: p.date.slice(5), heightRpx: Math.round(p.value * 1.6)
    })) : []
    let text = status.reason
    if (status.remainingDays > 0) text += '，还剩 ' + status.remainingDays + ' 天'
    if (status.eligible) text += '（近 ' + status.observationDays + ' 天降幅 ' + status.dropPercent + '%）'
    if (counselorEvents.length) text += '。已有辅导员待处理事件，当前保存在本地'
    this.setData({
      student: student, hasWarning: !!w,
      canReplay: store.getStudent(sid).warnings.academic.level !== 'none',
      label: w ? store.warningLevelLabel(w.level) : '',
      cls: w ? store.warningLevelClass(w.level) : '',
      value: w ? w.value : 0, reason: w ? w.reason : '',
      firstNotifiedAt: w ? w.firstNotifiedAt : '',
      trendBars: trendBars, escalation: counselorEvents.length > 0,
      escalationText: text, actions: store.getAlertActions(sid),
      events: store.getAcademicEvents(sid), demoDate: status.asOf, status: status
    })
  },
  onSelf: function () { this.record('自助处理', '学生选择自主调整学习计划') },
  onHelp: function () { this.record('请求辅导员帮助', '学生主动请求帮助，生成本地辅导员待处理事件') },
  onIgnore: function () { this.record('忽略', '学生暂不处理，观察周期继续计时') },
  record: function (action, note) {
    store.addAlertAction(null, action, note)
    this.refresh()
    wx.showToast({ title: '处理方式已记录', icon: 'success' })
  },
  onAdvanceFlat: function () { store.advanceAcademicDemo(false); this.refresh() },
  onAdvanceImproved: function () { store.advanceAcademicDemo(true); this.refresh() },
  onReplay: function () {
    wx.showModal({
      title: '重新演示首次提醒',
      content: '将清空当前学生的预警处理和升级演示记录，回到首次提醒日期。其他学生及个人资料不受影响。',
      success: res => { if (res.confirm) { store.resetAcademicDemo(); this.refresh() } }
    })
  }
})
