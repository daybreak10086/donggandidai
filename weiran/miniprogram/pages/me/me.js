const definePage = require('../../utils/page')
const store = require('../../utils/store')

definePage({
  data: { student: {}, nickname: '', avatarUrl: '' },
  onShow: function () { this.refresh() },
  refresh: function () {
    const student = store.getStudentView()
    this.setData({ student: student, nickname: student.nickname, avatarUrl: student.avatarUrl })
  },
  goSettings: function () { wx.navigateTo({ url: '/pages/settings/settings' }) },
  goFeedback: function () { wx.navigateTo({ url: '/pages/feedback/feedback' }) },
  goIp: function () { wx.navigateTo({ url: '/pages/ip/ip' }) }
})
