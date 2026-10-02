const definePage = require('../../utils/page')
const growth = require('../../utils/growth-store')

definePage({
  data: { today: '', studentName: '', report: null, methodsVisible: false },
  onShow: function () { this.refresh() },
  refresh: function () {
    const context = growth.getContext()
    const report = growth.getReport()
    this.setData({ today: context.today, studentName: context.student.nickname || context.student.name, report: report })
  },
  toggleMethods: function () { this.setData({ methodsVisible: !this.data.methodsVisible }) },
  advanceDay: function () {
    try { growth.advanceDay(); this.refresh(); wx.showToast({ title: '模拟日期已推进', icon: 'none' }) }
    catch (error) { wx.showToast({ title: error.message || '操作未完成，请重试', icon: 'none' }) }
  },
  goCheckIn: function () { wx.navigateTo({ url: '/pages/check-in/check-in' }) },
  goPlan: function () { wx.navigateTo({ url: '/pages/plan/plan' }) }
})
