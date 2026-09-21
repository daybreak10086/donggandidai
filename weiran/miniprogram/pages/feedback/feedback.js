const definePage = require('../../utils/page')
const store = require('../../utils/store')

definePage({
  data: {
    typeOptions: ['错误数据', '缺失数据'],
    typeIndex: 0,
    typeText: '错误数据',
    dimensionOptions: ['学习状态', '身体健康', '心理健康', '性格与兴趣'],
    dimensionIndex: 0,
    dimensionText: '学习状态',
    reason: '',
    feedbacks: []
  },
  onShow: function () { this.refresh() },
  refresh: function () {
    this.setData({ feedbacks: store.getFeedbacks() })
  },
  onTypeChange: function (e) {
    const i = Number(e.detail.value)
    this.setData({ typeIndex: i, typeText: this.data.typeOptions[i] })
  },
  onDimensionChange: function (e) {
    const i = Number(e.detail.value)
    this.setData({ dimensionIndex: i, dimensionText: this.data.dimensionOptions[i] })
  },
  onReasonInput: function (e) { this.setData({ reason: e.detail.value }) },
  onSubmit: function () {
    const reason = this.data.reason.trim()
    if (!reason) {
      wx.showToast({ title: '请填写反馈原因', icon: 'none' })
      return
    }
    try { store.addFeedback({
      type: this.data.typeOptions[this.data.typeIndex],
      dimension: this.data.dimensionOptions[this.data.dimensionIndex],
      reason: reason
    }) } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); return }
    this.setData({ reason: '' })
    this.refresh()
    wx.showToast({ title: '反馈已提交', icon: 'success' })
  }
})
