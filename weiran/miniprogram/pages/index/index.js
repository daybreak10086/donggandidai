const definePage = require('../../utils/page')
const store = require('../../utils/store')
const growth = require('../../utils/growth-store')

definePage({
  data: {
    student: {},
    growth: {},
    demoStudents: [],
    demoStudentIndex: 0,
    hasAcademic: false,
    academicLabel: '',
    academicClass: '',
    academicValue: 0,
    academicDeltaText: '',
    academicDeltaClass: '',
    healthVisible: true,
    mentalVisible: true,
    healthLabel: '',
    healthClass: '',
    emotionLabel: '',
    emotionClass: '',
    healthSymptoms: '',
    learn: {},
    mbtiOptions: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'],
    mbtiIndex: 0
  },
  onShow: function () { this.refresh() },
  onPullDownRefresh: function () { this.refresh(); wx.stopPullDownRefresh() },
  refresh: function () {
    const sid = store.getCurrentStudentId()
    const student = store.getStudentView(sid)
    const settings = store.getSettings()
    const w = store.getAcademicWarning(sid)

    const learn = {
      attendanceRateText: Math.round(student.learning.attendanceRate * 100) + '%',
      homeworkText: student.learning.homeworkSubmitted + ' / ' + student.learning.homeworkTotal,
      quizScore: student.learning.quizScore + ' 分',
      homeworkGrade: student.learning.homeworkGrade,
      libraryVisitsFinalMonth: student.learning.libraryVisitsFinalMonth
    }

    const healthWarn = student.warnings.health
    const emotionWarn = student.warnings.emotion
    const hasHealthWarn = !!(healthWarn && healthWarn.level && healthWarn.level !== 'none')
    const hasEmotionWarn = !!(emotionWarn && emotionWarn.level && emotionWarn.level !== 'none')

    let academicDeltaText = '持平'
    let academicDeltaClass = 'flat'
    if (w && w.trend && w.trend.length >= 2) {
      const t = w.trend
      const delta = t[t.length - 1] - t[t.length - 2]
      if (delta < 0) { academicDeltaText = '↓ ' + (-delta); academicDeltaClass = 'down' }
      else if (delta > 0) { academicDeltaText = '↑ ' + delta; academicDeltaClass = 'up' }
    }

    const mbtiIndex = Math.max(0, this.data.mbtiOptions.indexOf(student.mbti))

    this.setData({
      student: student,
      growth: growth.getDashboardSummary(),
      demoStudents: store.getStudents().map(s => ({ id: s.id, name: s.name })),
      demoStudentIndex: store.getStudents().findIndex(s => s.id === sid),
      hasAcademic: !!w,
      academicLabel: w ? store.warningLevelLabel(w.level) : '',
      academicClass: w ? store.warningLevelClass(w.level) : 'badge-ok',
      academicValue: w ? w.value : 0,
      academicDeltaText: academicDeltaText,
      academicDeltaClass: academicDeltaClass,
      healthVisible: settings.showHealth,
      mentalVisible: settings.showMental,
      healthLabel: !settings.enableHealthAlert ? '预警已关闭' : hasHealthWarn ? store.warningLevelLabel(healthWarn.level) : '状态良好',
      healthClass: !settings.enableHealthAlert ? 'badge-neutral' : hasHealthWarn ? store.warningLevelClass(healthWarn.level) : 'badge-ok',
      emotionLabel: !settings.enableEmotionAlert ? '预警已关闭' : hasEmotionWarn ? store.warningLevelLabel(emotionWarn.level) : '状态良好',
      emotionClass: !settings.enableEmotionAlert ? 'badge-neutral' : hasEmotionWarn ? store.warningLevelClass(emotionWarn.level) : 'badge-ok',
      healthSymptoms: (student.health.symptoms && student.health.symptoms.length) ? student.health.symptoms.join('、') : '无明显不适',
      learn: learn,
      mbtiIndex: mbtiIndex
    })
  },
  onMbtiChange: function (e) {
    const i = Number(e.detail.value)
    const mbti = this.data.mbtiOptions[i]
    store.updateProfile(null, { mbti: mbti })
    this.refresh()
    wx.showToast({ title: 'MBTI 已更新', icon: 'success' })
  },
  onDemoStudentChange: function (e) {
    const student = this.data.demoStudents[Number(e.detail.value)]
    if (!student) return
    store.setCurrentStudent(student.id, 'local-mock')
    this.refresh()
  },
  goProfile: function () { wx.navigateTo({ url: '/pages/profile/profile' }) },
  goPlan: function () { wx.navigateTo({ url: '/pages/plan/plan' }) },
  goCheckIn: function () { wx.navigateTo({ url: '/pages/check-in/check-in' }) },
  goWeeklyReport: function () { wx.navigateTo({ url: '/pages/weekly-report/weekly-report' }) },
  goAlert: function () { wx.navigateTo({ url: '/pages/alert-detail/alert-detail' }) },
  goIp: function () { wx.navigateTo({ url: '/pages/ip/ip' }) }
})
